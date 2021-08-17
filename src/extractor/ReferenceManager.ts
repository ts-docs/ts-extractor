/* eslint-disable @typescript-eslint/no-non-null-assertion */
import ts from "typescript";
import { TypescriptExtractor } from ".";
import { ReferenceType, TypeReferenceKinds } from "../structure";
import { ExtractorList } from "./ExtractorList";

const EXCLUDED_TYPE_REFS = ["Promise", "Array", "Map", "IterableIterator", "Set", "Function", "Record", "Omit", "Symbol", "Error", "URL", "EventTarget", "URLSearchParams", "RegExp"];

export class ReferenceManager {
    basePath: string
    extractors: ExtractorList
    constructor(extractors: ExtractorList, basePath = process.cwd()) {
        this.basePath = basePath;
        this.extractors = extractors;
    }


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
    }
    
    isDefault(thing: ts.Identifier) : boolean {
        return EXCLUDED_TYPE_REFS.includes(thing.text);
    }

}