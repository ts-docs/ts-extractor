/* eslint-disable @typescript-eslint/no-unused-vars */
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

    visitor(sourceFile: ts.SourceFile|ts.Symbol) : void {
        let sym;
        if ("fileName" in sourceFile) sym = this.checker.getSymbolAtLocation(sourceFile);
        else sym = sourceFile;
        if (!sym || !sym.exports) return;
        for (const val of this.checker.getExportsOfModule(sym)) this.handleSymbol(val);

        // @ts-expect-error You should be able to do that
        for (const [, val] of sym.exports) {
            // export * from "..."
            if (val.name === "__export") {
                for (const decl of val.declarations!) {
                    if (ts.isExportDeclaration(decl) && decl.moduleSpecifier && ts.isStringLiteral(decl.moduleSpecifier)) {
                        const reExportedFile = this.resolveSourceFile(decl.getSourceFile().fileName, decl.moduleSpecifier.text);
                        if (!reExportedFile) return;
                        this.visitor(reExportedFile);
                    }
                } 
            } else this.handleSymbol(val);
        }

    }

    getOrCreateModule(source: string) : Module {
        const {dir} = path.parse(source);
        if (this.moduleCache[dir]) return this.moduleCache[dir];
        let paths = dir.split("/");
        paths = paths.slice(paths.indexOf(this.baseDir) + 1);
        if (!paths.length) {
            this.moduleCache[dir] = this.module;
            return this.module;
        }
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
        this.moduleCache[dir] = lastModule;
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

    handleSymbol(val: ts.Symbol, ogName?: string) : void {
        if (!val.declarations || !val.declarations.length) return;
        if (hasBit(val.flags, ts.SymbolFlags.Class)) this.handleClassDecl(val.declarations[0] as ts.ClassDeclaration);
        else if (hasBit(val.flags, ts.SymbolFlags.Interface)) this.handleInterfaceDecl(val.declarations as Array<ts.InterfaceDeclaration>);
        else if (hasBit(val.flags, ts.SymbolFlags.Enum)) this.handleEnumDecl(val.declarations as Array<ts.EnumDeclaration>);
        else if (hasBit(val.flags, ts.SymbolFlags.TypeAlias)) this.handleTypeAliasDecl(val.declarations[0] as ts.TypeAliasDeclaration);
        else if (hasBit(val.flags, ts.SymbolFlags.Module)) this.handleNamespaceDecl(val.declarations as Array<ts.ModuleDeclaration>);
        else if (hasBit(val.flags, ts.SymbolFlags.Variable)) this.handleVariableDecl(val.declarations[0] as ts.VariableDeclaration);
        else if (hasBit(val.flags, ts.SymbolFlags.Function)) this.handleFunctionDecl(val.declarations[0] as ts.FunctionDeclaration);
        else {
            const aliased = this.resolveAliasedSymbol(val);
            if (aliased.name.includes("/")) return this.visitor(aliased);
            else this.handleSymbol(aliased);
        }
    }

    handleClassDecl(_classDecl: ts.ClassDeclaration, _currentModule = this.getOrCreateModule(_classDecl.getSourceFile().fileName)) : void {
        //console.log("Class: ", _classDecl.name?.text, " In module: ", _currentModule.name);
    }

    handleInterfaceDecl(_decls: Array<ts.InterfaceDeclaration>, _currentModule = this.getOrCreateModule(_decls[0].getSourceFile().fileName)) : void {
        //console.log("Interface in module: ", currentModule.name);
    }

    handleEnumDecl(_decls: Array<ts.EnumDeclaration>, _currentModule = this.getOrCreateModule(_decls[0].getSourceFile().fileName)) : void {
        //console.log("Enum in module: ", currentModule.name);
    }

    handleTypeAliasDecl(_decl: ts.TypeAliasDeclaration, _currentModule = this.getOrCreateModule(_decl.getSourceFile().fileName)) : void {
        //console.log("Type alias in module: ", currentModule.name);
    }

    handleNamespaceDecl(_decls: Array<ts.ModuleDeclaration>, _currentModule = this.getOrCreateModule(_decls[0].getSourceFile().fileName)) : void {
        //console.log("Type alias in module: ", currentModule.name);
    }

    handleVariableDecl(_decl: ts.VariableDeclaration, _currentModule = this.getOrCreateModule(_decl.getSourceFile().fileName)) : void {
        //console.log("Type alias in module: ", currentModule.name);
    }

    handleFunctionDecl(_decl: ts.FunctionDeclaration, _currentModule = this.getOrCreateModule(_decl.getSourceFile().fileName)) : void {
        //console.log("Type alias in module: ", currentModule.name);
    }

    resolveAliasedSymbol(symbol: ts.Symbol) : ts.Symbol {
        while (hasBit(symbol.flags, ts.SymbolFlags.Alias)) symbol = this.checker.getAliasedSymbol(symbol);
        return symbol;
    }

    resolveSourceFile(filePath: string, relative: string) : ts.SourceFile|undefined {
        let res;
        if (path.isAbsolute(filePath)) {
            res = this.program.getSourceFile(path.join(filePath, "../", `${relative}.ts`));
            if (!res) res = this.program.getSourceFile(path.join(filePath, "../", `${relative}/index.ts`));
        } else {
            res = this.program.getSourceFile(path.join(process.cwd(), filePath, "../", `${relative}.ts`));
            if (!res) res = this.program.getSourceFile(path.join(process.cwd(), filePath, "../", `${relative}/index.ts`));
        }
        return res;
    }

}