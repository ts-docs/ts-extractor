
import ts from "typescript";
import { ReferenceType, TypeReferenceKinds } from "./structure";

export interface ExternalReference {
    /**
     * The source is undefined only when the thing is not imported, which means it's a global object. (Array, Promise, etc.)
     */
    run: (symbol: string, source?: string, other?: string) => {link: string, displayName?: string, name?: string}|undefined,
    /**
     * If this property is provided to the reference manager, it's going to parse the import module name and if the first part of it matches the baseName, the 
     * run function will be called.
     */
    baseName?: string
}


export class ReferenceManager extends Map<ts.Symbol, ReferenceType> {
    namedExternals: Map<string, ExternalReference>
    unnamedExternals: Array<ExternalReference>
    constructor(externals?: Array<ExternalReference>) {
        super();
        this.namedExternals = new Map();
        this.unnamedExternals = [];
        if (externals) {
            for (const external of externals) {
                if (external.baseName) this.namedExternals.set(external.baseName, external);
                else this.unnamedExternals.push(external);
            }
        }
    }

    findUnnamedExternal(symbol: string, source?: string, other?: string) : ReferenceType|undefined {
        for (const external of this.unnamedExternals) {
            const res = external.run(symbol, source, other);
            if (res) return { name: symbol, kind: TypeReferenceKinds.EXTERNAL, ...res };
        }
        return;
    }

    /**
     * @param source Where the symbol was imported from
     * @param realName If the real name is provided, it's assumed that the symbol is unknown and it won't be saved in the cache
     */
    findExternal(symbol: ts.Symbol, source?: string, realName?: string) : ReferenceType|undefined {
        if (this.has(symbol)) return this.get(symbol);
        let name = realName || symbol.name;
        // The last condition makes sure the object is not global
        if (!source && symbol.declarations && symbol.declarations.length && !symbol.declarations[0].getSourceFile().isDeclarationFile) {
            const decl = symbol.declarations[0];
            if (ts.isImportClause(decl)) source = (decl.parent.moduleSpecifier as ts.StringLiteral).text;
            else if (ts.isImportSpecifier(decl)) {
                source = (decl.parent.parent.parent.moduleSpecifier as ts.StringLiteral).text;
                if (decl.propertyName) name = decl.propertyName.text;
            }
            else if (ts.isNamespaceImport(decl)) source = (decl.parent.parent.moduleSpecifier as ts.StringLiteral).text;
        }
        if (source) {
            const path = source.split("/");
            const first = path.shift();
            if (first && this.namedExternals.has(first)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const res = { name, kind: TypeReferenceKinds.EXTERNAL, ...this.namedExternals.get(first)!.run(name, source) };
                if (!realName) this.set(symbol, res);
                return res;
            }
        }
        const unnamed = this.findUnnamedExternal(name, source, symbol.name);
        if (unnamed && !realName) this.set(symbol, unnamed);
        return unnamed;
    }

    findByName(name: string) : ReferenceType|undefined {
        for (const [, ref] of this) {
            if (ref.name === name) return ref;
        }
        return;
    }

}