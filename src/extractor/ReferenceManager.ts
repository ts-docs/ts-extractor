/* eslint-disable @typescript-eslint/no-non-null-assertion */
import ts from "typescript";
import { TypescriptExtractor } from ".";
import { ExternalLibManager } from "../external/ExternalManager";
import { Module, ReferenceType, TypeReferenceKinds } from "../structure";
import { hasBit, resolveLinkAndNameOfImport, resolvePathOfQualified } from "../util";
import { ExtractorList } from "./ExtractorList";

const EXCLUDED_TYPE_REFS = ["Promise", "ReadonlyArray", "Array", "Map", "Iterable", "IterableIterator", "Set", "Function", "Record", "Omit", "Pick", "Symbol", "Error", "URL", "EventTarget", "URLSearchParams", "Buffer", "Event", "EventTarget", "WebAssembly", "Date", "RegExp", "Partial", "ArrayBuffer"];

export class ReferenceManager {
    extractors: ExtractorList
    externals: ExternalLibManager
    constructor(extractors: ExtractorList, externals: ExternalLibManager) {
        this.extractors = extractors;
        this.externals = externals;
    }

    resolveSymbol(symbol: ts.Symbol, currentExt: TypescriptExtractor, moduleName?: string) : ReferenceType|undefined {
        const importDecl = resolveLinkAndNameOfImport(symbol);
        if (importDecl) {
            const path = importDecl.link.split("/");
            if (this.externals.libs.has(path[0])) return this.externals.resolve(importDecl.name.text, path, symbol);
            else {
                const res = this.resolveFirstAt(importDecl.name.text, path[0], moduleName);
                if (res) return res;
            }
        }
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

    resolveExternalString(name: string, moduleName?: string) : ReferenceType|undefined {
        if (EXCLUDED_TYPE_REFS.includes(name)) return { kind: TypeReferenceKinds.DEFAULT_API, name };
        for (const mod of this.extractors) {
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

    resolveFirstAt(name: string, globalModuleName: string, moduleName?: string) : ReferenceType|undefined {
        const mod = this.extractors.find(ext => ext.module.name === globalModuleName);
        if (!mod) return;
        const res = this.resolveString(name, mod, moduleName);
        if (!res) return;
        res.external = globalModuleName;
        return res;
    }

    resolveQualified(node: ts.QualifiedName, currentExtractor: TypescriptExtractor) : ReferenceType|undefined {
        const path = resolvePathOfQualified(node);
        const textMap = path.map(p => p.text);
        const firstSym = currentExtractor.checker.getSymbolAtLocation(path[0]);
        for (const [, lib] of this.externals.libs) {
            if (textMap[0] === lib.namespace) return this.externals.resolveLib(lib, textMap, firstSym);
        }
        if (!firstSym) return;
        const importInfo = resolveLinkAndNameOfImport(firstSym);
        if (importInfo) {
            const linkPath = importInfo?.link.split("/");
            if (this.externals.libs.has(linkPath[0])) return this.externals.resolve(textMap, linkPath, firstSym);
        }
        if (path.length === 2) return this.resolveString(path[1].text, currentExtractor);
        for (const mod of this.extractors) {
            // eslint-disable-next-line prefer-const
            const res = mod.forEachModule(mod.module, (module, path) => {
                if (module.isNamespace && module.name === path[0]) {
                    const finalPath = [...path, ...textMap];
                    finalPath.pop();
                    const finalPathLen = path.length - 1;
                    const lastItem = textMap[finalPathLen];
                    for (let i=0; i < finalPathLen; i++) {
                        const newMod: Module|undefined = module!.modules.get(textMap[i]);
                        if (newMod) module = newMod;
                    }
                    const external = mod !== currentExtractor ? mod.module.name:undefined;
                    if (module.classes.has(lastItem)) return { name: lastItem, path: finalPath, external: mod.module.name, kind: TypeReferenceKinds.CLASS };
                    else if (module.interfaces.has(lastItem)) return {  name: lastItem, path: finalPath, external, kind: TypeReferenceKinds.INTERFACE };
                    else if (module.enums.has(lastItem)) return {  name: lastItem , path: finalPath, external, kind: TypeReferenceKinds.ENUM };
                    else if (module.types.has(lastItem)) return {  name: lastItem, path: finalPath, external, kind: TypeReferenceKinds.TYPE_ALIAS };
                    else if (module.functions.has(lastItem)) return {  name: lastItem, path: finalPath, external, kind: TypeReferenceKinds.FUNCTION };
                    else if (module.constants.has(lastItem)) return {  name: lastItem, path: finalPath, external, kind: TypeReferenceKinds.CONSTANT };
                    else if (module.isNamespace && module.name === lastItem) return {  name: lastItem, path, external, kind: TypeReferenceKinds.NAMESPACE_OR_MODULE };
                }
                return;
            });
            if (res) return res;
        }
        return;
    }
    
    isDefault(thing: ts.Identifier) : boolean {
        return EXCLUDED_TYPE_REFS.includes(thing.text);
    }

}