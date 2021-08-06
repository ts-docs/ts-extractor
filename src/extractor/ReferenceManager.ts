/* eslint-disable @typescript-eslint/no-non-null-assertion */
import ts from "typescript";
import { TypescriptExtractor } from ".";
import { ReferenceType, TypeReferenceKinds } from "../structure";
import { ExtractorList } from "./ExtractorList";

const EXCLUDED_TYPE_REFS = ["Promise", "Array", "Map", "IterableIterator", "Set", "Function", "Record", "Omit", "Symbol", "Buffer", "Error", "URL", "EventTarget", "URLSearchParams"];
//const IGNORE_PATHS = ["src", "lib", "code"];

export class ReferenceManager {
    basePath: string
    extractors: ExtractorList
    constructor(extractors: ExtractorList, basePath = process.cwd()) {
        this.basePath = basePath;
        this.extractors = extractors;
    }

    /**

    resolvePath(path: string) : Array<string> {
        const pathParts = path.replace(this.basePath.replace(/\\/g, "/"), "").split("/");
        pathParts.shift();
        pathParts.pop(); // Remove the filename
        return pathParts.filter(p => IGNORE_PATHS.includes(p));
    }

    resolveNamespaces(symbol: ts.Symbol) : Array<string> {
        let lastDecl: ts.Node = symbol.declarations![0].parent;
        if (!ts.isModuleBlock(lastDecl)) return [];
        const res: Array<string> = [];
        while (lastDecl && ts.isModuleBlock(lastDecl)) {
            res.push(lastDecl.parent.name.text);
            lastDecl = lastDecl.parent.parent;
        }
        return res;
    }

    */

    resolveSymbol(symbol: ts.Symbol|string, currentExt: TypescriptExtractor, moduleName?: string) : ReferenceType|undefined {
        const name = typeof symbol === "string" ? symbol:symbol.name;
        if (EXCLUDED_TYPE_REFS.includes(name)) return { kind: TypeReferenceKinds.DEFAULT_API, name };
        const modules = [currentExt, ...this.extractors.filter(ext => ext !== currentExt)];

        for (const mod of modules) {
            const external = mod === currentExt ?  undefined:mod.module.name;
            const val = mod.forEachModule(mod.module, (module, path) => {
                if (moduleName && moduleName !== module.name) return;
                if (module.classes.has(name)) return { name, path, external, kind: TypeReferenceKinds.CLASS };
                else if (module.interfaces.has(name)) return { name, path, external, kind: TypeReferenceKinds.INTERFACE };
                else if (module.enums.has(name)) return { name, path, external, kind: TypeReferenceKinds.ENUM };
                else if (module.types.has(name)) return { name, path, external, kind: TypeReferenceKinds.TYPE_ALIAS };
                return;
            });
            if (val) return val;
        }
        return;
        /** 
        if (!symbol.declarations || symbol.declarations.length === 0) return;
        const sourceFile = symbol.declarations[0].getSourceFile();
        if (sourceFile.isDeclarationFile) return;
        const path = [...this.resolvePath(sourceFile.fileName), ...this.resolveNamespaces(symbol)];
        let pathLen = path.length;
        if (!pathLen) return;
        const realPath = [];
        const firstModule = this.modules.get(path.shift()!);
        pathLen--;
        let module = firstModule;
        for (let i=0; i < pathLen; i++) {
            if (!module) return;
            const pathName = path[i];
            if (IGNORE_PATHS.includes(pathName)) continue;
            module = module.modules.get(pathName);
            realPath.push(pathName);
        }
        if (!module) return;
        const external = firstModule === currentModule ? undefined:firstModule!.name;
        if (!external) path.shift();
        if (module.classes.has(name)) return { name, path: realPath, external, kind: TypeReferenceKinds.CLASS };
        else if (module.interfaces.has(name)) return { name, path: realPath, external, kind: TypeReferenceKinds.INTERFACE };
        else if (module.enums.has(name)) return { name, path: realPath, external, kind: TypeReferenceKinds.ENUM };
        else if (module.types.has(name)) return { name, path: realPath, external, kind: TypeReferenceKinds.TYPE_ALIAS };
        return;
        */
    } 
}