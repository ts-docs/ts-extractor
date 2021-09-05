
import * as ts from "typescript";
import { ReferenceType, TypeReferenceKinds } from "../structure";

/**
 * An external library. The [[ExternalLib.resolver() as resolver]] function is used to create the link for
 * the reference.
 * 
 * If the `requestTypes` bool is set to true, the `resolver` function is going to receive actual reference
 * types (class, interface, enum, etc). If it's disabled, it's always going to receive [[TypeReferenceKinds.EXTERNAL]].
 * If you don't need the type of reference, do **NOT** enable this, because it parses all declaration files
 * for the library, and therefore takes more time.
 */
export interface ExternalLib {
    name: string,
    requestTypes?: boolean,
    resolver: (name: string, path: Array<string>, symbol: ts.Symbol, type: TypeReferenceKinds) => string
}

export interface ExternalModule {
    classes: Set<string>,
    interfaces: Set<string>,
    enums: Set<string>,
    types: Set<string>,
    functions: Set<string>,
    constants: Set<string>,
    namespaces: Set<string>
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

    resolveSymbol(symbol: ts.Symbol, path: Array<string>) : ReferenceType|undefined {
        const decl = symbol.declarations?.[0] as ts.ImportSpecifier;
        const name = decl.propertyName ? decl.propertyName.text : decl.name.text;
        const lib = this.libs.get(path[0]);
        if (!lib) return;
        let kind = TypeReferenceKinds.EXTERNAL;
        if (lib.requestTypes) {
            const mod = this.modules.get(path[0]);
            if (!mod) return;
            if (mod.classes.has(name)) kind = TypeReferenceKinds.CLASS;
            else if (mod.interfaces.has(name)) kind = TypeReferenceKinds.INTERFACE;
            else if (mod.enums.has(name)) kind = TypeReferenceKinds.ENUM;
            else if (mod.functions.has(name)) kind = TypeReferenceKinds.FUNCTION;
            else if (mod.types.has(name)) kind = TypeReferenceKinds.TYPE_ALIAS;
            else if (mod.constants.has(name)) kind = TypeReferenceKinds.CONSTANT;
            else if (mod.namespaces.has(name)) kind = TypeReferenceKinds.NAMESPACE_OR_MODULE;
        }
        return {
            name,
            link: lib.resolver(name, path, symbol, kind),
            kind
        };
    }

    attemptToAddSource(source: ts.SourceFile) : void {
        let lib;
        for (const [, library] of this.libs) {
            if (source.fileName.includes(library.name)) lib = library;
        }
        if (!lib || !lib.requestTypes) return;
        let mod = this.modules.get(lib.name);
        if (!mod) {
            mod = {
                classes: new Set(),
                interfaces: new Set(),
                enums: new Set(),
                types: new Set(),
                functions: new Set(),
                constants: new Set(),
                namespaces: new Set()
            };
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
        else if (ts.isModuleDeclaration(node) && node.body && ts.isModuleBlock(node.body)) module.namespaces.add(node.name.text);
    }

}