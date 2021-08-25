/* eslint-disable @typescript-eslint/no-non-null-assertion */
import ts from "typescript";
import { TypescriptExtractor } from ".";
import { ReferenceType, TypeReferenceKinds } from "../structure";
import { hasBit } from "../util";
import { ExtractorList } from "./ExtractorList";

const EXCLUDED_TYPE_REFS = ["Promise", "ReadonlyArray", "Array", "Map", "Iterable", "IterableIterator", "Set", "Function", "Record", "Omit", "Pick", "Symbol", "Error", "URL", "EventTarget", "URLSearchParams", "Buffer", "Event", "EventTarget", "WebAssembly", "Date", "RegExp"];

export class ReferenceManager {
    basePath: string
    extractors: ExtractorList
    constructor(extractors: ExtractorList, basePath = process.cwd()) {
        this.basePath = basePath;
        this.extractors = extractors;
    }

    resolveSymbol(symbol: ts.Symbol, currentExt: TypescriptExtractor, moduleName?: string) : ReferenceType|undefined {
        const name = symbol.name;
        if (EXCLUDED_TYPE_REFS.includes(name)) return { kind: TypeReferenceKinds.DEFAULT_API, name };
        if (hasBit(symbol.flags, ts.SymbolFlags.Class)) return currentExt.forEachModule<ReferenceType>(currentExt.module, (mod, path) => {
            if ((moduleName && mod.name !== moduleName) || !mod.classes.has(name)) return;
            return { name, path, kind: TypeReferenceKinds.CLASS };
        });
        else if (hasBit(symbol.flags, ts.SymbolFlags.Interface)) return currentExt.forEachModule<ReferenceType>(currentExt.module, (mod, path) => {
            if ((moduleName && mod.name !== moduleName) || !mod.interfaces.has(name)) return;
            return { name, path, kind: TypeReferenceKinds.INTERFACE };
        });
        else if (hasBit(symbol.flags, ts.SymbolFlags.Enum)) return currentExt.forEachModule<ReferenceType>(currentExt.module, (mod, path) => {
            if ((moduleName && mod.name !== moduleName) || !mod.enums.has(name)) return;
            return { name, path, kind: TypeReferenceKinds.ENUM };
        });
        else if (hasBit(symbol.flags, ts.SymbolFlags.TypeAlias)) return currentExt.forEachModule<ReferenceType>(currentExt.module, (mod, path) => {
            if ((moduleName && mod.name !== moduleName) || !mod.types.has(name)) return;
            return { name, path, kind: TypeReferenceKinds.TYPE_ALIAS };
        });
        else if (hasBit(symbol.flags, ts.SymbolFlags.Function)) return currentExt.forEachModule<ReferenceType>(currentExt.module, (mod, path) => {
            if ((moduleName && mod.name !== moduleName) || !mod.functions.has(name)) return;
            return { name, path, kind: TypeReferenceKinds.FUNCTION };
        });
        else if (hasBit(symbol.flags, ts.SymbolFlags.Variable)) return currentExt.forEachModule<ReferenceType>(currentExt.module, (mod, path) => {
            if ((moduleName && mod.name !== moduleName) || !mod.constants.has(name)) return;
            return { name, path, kind: TypeReferenceKinds.CONSTANT };
        });
        else if (hasBit(symbol.flags, ts.SymbolFlags.Namespace)) return currentExt.forEachModule<ReferenceType>(currentExt.module, (mod, path) => {
            if (mod.name === name && mod.isNamespace) return { name, path, kind: TypeReferenceKinds.NAMESPACE_OR_MODULE };
            return;
        });
        return this.resolveString(name, currentExt, moduleName);
    }

    resolveString(name: string, currentExt: TypescriptExtractor, moduleName?: string) : ReferenceType|undefined {
        const modules = [currentExt, ...this.extractors.filter(ext => ext !== currentExt)];
        if (EXCLUDED_TYPE_REFS.includes(name)) return { kind: TypeReferenceKinds.DEFAULT_API, name };
        for (const mod of modules) {
            const external = mod === currentExt ?  undefined:mod.module.name;
            const val = mod.forEachModule(mod.module, (module, path) => {
                if (moduleName && moduleName !== module.name) return;
                if (module.classes.has(name)) return { name, path, external, kind: TypeReferenceKinds.CLASS };
                else if (module.interfaces.has(name)) return { name, path, external, kind: TypeReferenceKinds.INTERFACE };
                else if (module.enums.has(name)) return { name, path, external, kind: TypeReferenceKinds.ENUM };
                else if (module.types.has(name)) return { name, path, external, kind: TypeReferenceKinds.TYPE_ALIAS };
                else if (module.functions.has(name)) return { name, path, external, kind: TypeReferenceKinds.FUNCTION };
                else if (module.constants.has(name)) return { name, path, external, kind: TypeReferenceKinds.CONSTANT };
                else if (module.isNamespace && module.name === name) return { name, path, external, kind: TypeReferenceKinds.NAMESPACE_OR_MODULE };
                return;
            });
            if (val) return val;
        }
        return;
    }

    resolveExternalString(name: string, modules: Array<TypescriptExtractor>, moduleName?: string) : ReferenceType|undefined {
        if (EXCLUDED_TYPE_REFS.includes(name)) return { kind: TypeReferenceKinds.DEFAULT_API, name };
        for (const mod of modules) {
            const val = mod.forEachModule(mod.module, (module, path) => {
                if (moduleName && moduleName !== module.name) return;
                if (module.classes.has(name)) return { name, path, external: mod.module.name, kind: TypeReferenceKinds.CLASS };
                else if (module.interfaces.has(name)) return { name, path, external: mod.module.name, kind: TypeReferenceKinds.INTERFACE };
                else if (module.enums.has(name)) return { name, path, external: mod.module.name, kind: TypeReferenceKinds.ENUM };
                else if (module.types.has(name)) return { name, path, external: mod.module.name, kind: TypeReferenceKinds.TYPE_ALIAS };
                else if (module.functions.has(name)) return { name, path, external: mod.module.name, kind: TypeReferenceKinds.FUNCTION };
                else if (module.constants.has(name)) return { name, path, external: mod.module.name, kind: TypeReferenceKinds.CONSTANT };
                else if (module.isNamespace && module.name === name) return { name, path, external: mod.module.name, kind: TypeReferenceKinds.NAMESPACE_OR_MODULE };
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