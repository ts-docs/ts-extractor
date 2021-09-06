
import * as ts from "typescript";
import { ReferenceType, TypeReferenceKinds } from "../structure";

/**
 * An external library. The [[ExternalLib.resolver() as resolver]] function is used to create the link for
 * the reference.
 * 
 * If the [[ExternalLib.requestTypes as requestTypes]] bool is set to true, the [[ExternalLib.resolver as resolver]] function is going to receive actual reference
 * types (class, interface, enum, etc). If it's disabled, it's always going to receive [[TypeReferenceKinds.EXTERNAL]].
 * If you don't need the type of reference, do **NOT** enable this, because it parses all declaration files
 * for the library, and therefore takes more time.
 * 
 * If [[ExternalLib.namespace]] is set, The resolver fucntion will be called for global namespaces that match the field. (like `NodeJS`, for example)
 */
export interface ExternalLib {
    name: string,
    requestTypes?: boolean,
    namespace?: string,
    resolver: (context: {
        name: string|Array<string>,
        pathOfImport?: Array<string>,
        symbol?: ts.Symbol,
        kind: TypeReferenceKinds
    }) => string
}

export interface ExternalModule {
    classes: Set<string>,
    interfaces: Set<string>,
    enums: Set<string>,
    types: Set<string>,
    functions: Set<string>,
    constants: Set<string>,
    namespaces: Map<string, ExternalModule>
}

/**
 * Manages external modules. You can pass external library resolvers when calling the [[extract]] method.
 */
export class ExternalLibManager {
    modules: Map<string, ExternalModule>
    libs: Map<string, ExternalLib>
    constructor(libs: Array<ExternalLib>) {
        this.libs = new Map(libs.map(lib => [lib.name, lib]));
        this.modules = new Map();
    }

    resolveLib(lib: ExternalLib, name: string|Array<string>, symbol?: ts.Symbol, pathOfImport?: Array<string>) : ReferenceType|undefined {
        let kind = TypeReferenceKinds.EXTERNAL;
        if (lib.requestTypes) {
            const mod = this.modules.get(lib.name);
            if (!mod) return;
            if (typeof name === "string") kind = this.getTypeOfThing(mod, name) || TypeReferenceKinds.EXTERNAL;
            else {
                let module = mod;
                const allButLast = name.length - 1;
                const last = name[allButLast];
                for (let i=0; i < allButLast; i++) {
                    const nmsp = module.namespaces.get(name[i]);
                    if (nmsp) module = nmsp;
                }
                kind = this.getTypeOfThing(module, last) || TypeReferenceKinds.EXTERNAL;
            }
        }
        const link = lib.resolver({
            name,
            pathOfImport,
            symbol,
            kind
        });
        if (!link) return;
        return {
            name: typeof name === "string" ? name : name[0],
            link,
            external: lib.name,
            kind
        };
    }

    resolve(name: string|Array<string>, path: Array<string>, symbol: ts.Symbol) : ReferenceType|undefined {
        const lib = this.libs.get(path[0]);
        if (!lib) return;
        return this.resolveLib(lib, name, symbol, path);
    }

    attemptToAddSource(source: ts.SourceFile) : void {
        let lib;
        for (const [, library] of this.libs) {
            if (source.fileName.includes(library.name)) lib = library;
        }
        if (!lib || !lib.requestTypes) return;
        let mod = this.modules.get(lib.name);
        if (!mod) {
            mod = this.createExternalModule();
            this.modules.set(lib.name, mod);
        }
        for (const node of source.statements) {
            this._visitor(mod, node);
        }
    }

    private _visitor(module: ExternalModule, node: ts.Node) : void {
        if (ts.isClassDeclaration(node)) module.classes.add(node.name ? node.name.text : "export default");
        else if (ts.isInterfaceDeclaration(node)) module.interfaces.add(node.name.text);
        else if (ts.isEnumDeclaration(node)) module.enums.add(node.name.text);
        else if (ts.isTypeAliasDeclaration(node)) module.types.add(node.name.text);
        else if (ts.isFunctionDeclaration(node) && node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) module.functions.add(node.name ? node.name.text:"export default");
        else if (ts.isVariableDeclaration(node) && node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) module.constants.add(node.name.getText());
        else if (ts.isModuleDeclaration(node) && node.body && ts.isModuleBlock(node.body)) {
            const newMod = this.createExternalModule();
            module.namespaces.set(node.name.text, newMod);
            for (const stmt of node.body.statements) {
                this._visitor(newMod, stmt);
            }
        }
    }

    private createExternalModule() : ExternalModule {
        return {
            classes: new Set(),
            interfaces: new Set(),
            enums: new Set(),
            types: new Set(),
            functions: new Set(),
            constants: new Set(),
            namespaces: new Map()
        };
    }

    private getTypeOfThing(mod: ExternalModule, name: string) : TypeReferenceKinds|undefined {
        if (mod.classes.has(name)) return TypeReferenceKinds.CLASS;
        else if (mod.interfaces.has(name)) return TypeReferenceKinds.INTERFACE;
        else if (mod.enums.has(name)) return TypeReferenceKinds.ENUM;
        else if (mod.functions.has(name)) return TypeReferenceKinds.FUNCTION;
        else if (mod.types.has(name)) return TypeReferenceKinds.TYPE_ALIAS;
        else if (mod.constants.has(name)) return TypeReferenceKinds.CONSTANT;
        else if (mod.namespaces.has(name)) return TypeReferenceKinds.NAMESPACE_OR_MODULE;
        return;
    }
}