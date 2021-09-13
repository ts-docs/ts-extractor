/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from "path";
import ts from "typescript";
import { TypescriptExtractorSettings } from ".";
import { getReadme, getRepository, hasBit, PackageJSON } from "../utils";
import { createModule, Module } from "./structure";

/**
 * Here's how the module structure works:
 * 
 * Every folder is considered a **module**, every defined thing in that folder is part of that module.
 * Inner-folders are inner-modules of that module, same with namespaces.
 */

export class Project {
    repository?: string
    readme?: string
    homepage?: string
    version?: string
    module: Module
    settings: TypescriptExtractorSettings
    checker: ts.TypeChecker
    program: ts.Program
    baseDir: string
    private moduleCache: Record<string, Module>
    constructor({folderPath, settings, checker, program, packageJSON}: {
        folderPath: Array<string>, 
        settings: TypescriptExtractorSettings, 
        checker: ts.TypeChecker,
        program: ts.Program,
        packageJSON: PackageJSON,
    }) {
        folderPath.pop(); // Removes the file name
        this.baseDir = folderPath[folderPath.length - 1];
        this.repository = getRepository(packageJSON);
        this.homepage = packageJSON.contents.homepage;
        this.version = packageJSON.contents.version;
        this.readme = getReadme(packageJSON.path);
        this.module = createModule(packageJSON.contents.name, true, this.repository && `${this.repository}/${this.baseDir}`, false);
        this.settings = settings;
        this.checker = checker;
        this.program = program;
        this.moduleCache = {};
    }

    visitor(sourceFile: ts.SourceFile | ts.Symbol, currentModule = this.module) : void {
        const sym = "kind" in sourceFile ? this.checker.getSymbolAtLocation(sourceFile) : sourceFile;
        if (!sym || !sym.exports) return;
        //@ts-expect-error You should be able to iterate through symbol.exports
        for (const [, val] of sym.exports) {
            // export * from "..."
            if (val.name === "__export") {
                for (const decl of val.declarations!) {
                    if (ts.isExportDeclaration(decl) && decl.moduleSpecifier && ts.isStringLiteral(decl.moduleSpecifier)) {
                        const reExportedFile = this.program.getSourceFile(path.join(process.cwd(), decl.getSourceFile().fileName, "../", `${decl.moduleSpecifier.text}.ts`));
                        if (!reExportedFile) return;
                        this.visitor(reExportedFile, this.getOrCreateModule(reExportedFile));
                    }
                } 
            } else {
                let type;
                if (!val.declarations || !val.declarations.length) return;
                if (hasBit(val.flags, ts.SymbolFlags.Class)) type = "class";
                else if (hasBit(val.flags, ts.SymbolFlags.Interface)) type = "interface";
                else if (hasBit(val.flags, ts.SymbolFlags.Enum)) type = "enum";
                else if (hasBit(val.flags, ts.SymbolFlags.TypeAlias)) type = "type alias";
                else if (hasBit(val.flags, ts.SymbolFlags.Namespace)) type = "namespace";
                else if (hasBit(val.flags, ts.SymbolFlags.Variable)) type = "variable";
                else if (hasBit(val.flags, ts.SymbolFlags.Function)) type = "function";
                // export { ... } from "...";
                // export { ... };
                else {
                    const aliased = this.resolveAliasedSymbol(val);       
                    const mod = createModule(val.name, false, undefined, true);
                    currentModule.modules.set(val.name, mod);
                    this.visitor(aliased, mod);
                    continue;
                }
                console.log(type, val.name, currentModule.name);
            }
        }
    }

    getOrCreateModule(source: ts.SourceFile) : Module {
        const {dir} = path.parse(source.fileName);
        if (this.moduleCache[dir]) return this.moduleCache[dir];
        let paths = dir.split("/");
        paths = paths.slice(paths.indexOf(this.baseDir) + 1);
        if (!paths.length) return this.module;
        let lastModule = this.module;
        for (const pathPart of paths) {
            const newMod = lastModule.modules.get(pathPart);
            if (!newMod) {
                const mod = createModule(pathPart, false, `${lastModule.repository}/${pathPart}`);
                lastModule.modules.set(pathPart, mod);
                lastModule = mod;
            } 
            else lastModule = newMod;
        }
        return lastModule;
    }

    forEachModule<R>(module = this.module, cb: (module: Module, path: Array<string>) => R|undefined, pathToMod: Array<string> = []) : R|undefined {
        const firstCb = cb(module, pathToMod);
        if (firstCb) return firstCb;
        for (const [, mod] of module.modules) {
            const res = this.forEachModule(mod, cb, [...pathToMod, mod.name]);
            if (res) return res;
        }
        return undefined;
    }

    handleClassDecl(_classDecl: ts.ClassDeclaration, currentModule: Module) : void {
        console.log("IN MODULE: ", currentModule.name);
    }

    resolveAliasedSymbol(symbol: ts.Symbol) : ts.Symbol {
        while (hasBit(symbol.flags, ts.SymbolFlags.Alias)) symbol = this.checker.getAliasedSymbol(symbol);
        return symbol;
    }

}