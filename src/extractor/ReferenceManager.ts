
import ts from "typescript";
import { Project } from "./Project";
import { Module, ReferenceType, TypeReferenceKinds } from "./structure";

export interface ExternalReference {
    /**
     * The source is undefined only when the thing is not imported, which means it's a global object. (Array, Promise, etc.)
     */
    run: (symbol: string, source?: string) => {link: string, displayName?: string, name?: string}|undefined,
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

    findUnnamedExternal(symbol: string, source?: string) : ReferenceType|undefined {
        for (const external of this.unnamedExternals) {
            const res = external.run(symbol, source);
            if (res) return { name: symbol, kind: TypeReferenceKinds.EXTERNAL, ...res };
        }
        return;
    }

    findExternal(symbol: ts.Symbol, source?: string) : ReferenceType|undefined {
        if (this.has(symbol)) return this.get(symbol);
        let name = symbol.name;
        if (!source && symbol.declarations && symbol.declarations.length && !symbol.declarations[0].getSourceFile().isDeclarationFile) {
            const decl = symbol.declarations[0];
            if (ts.isImportClause(decl)) source = (decl.parent.moduleSpecifier as ts.StringLiteral).text;
            else if (ts.isImportSpecifier(decl)) {
                source = (decl.parent.parent.parent.moduleSpecifier as ts.StringLiteral).text;
                if (decl.propertyName) name = decl.propertyName.text;
            }
        }
        if (source) {
            const path = source.split("/");
            const first = path.shift();
            if (first && this.namedExternals.has(first)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const res = { name, kind: TypeReferenceKinds.EXTERNAL, ...this.namedExternals.get(first)!.run(name, source) };
                this.set(symbol, res);
                return res;
            }
        }
        const unnamed = this.findUnnamedExternal(name, source);
        if (unnamed) this.set(symbol, unnamed);
        return unnamed;
    }

    findByName(name: string) : ReferenceType|undefined {
        for (const [, ref] of this) {
            if (ref.name === name) return ref;
        }
        return;
    } 

    findByNameWithModule(name: string, project: Project) : ReferenceType|undefined {
        return project.forEachModule<ReferenceType>(project.module, (module, path) => {
            if (module.name === name) return { kind: TypeReferenceKinds.NAMESPACE_OR_MODULE, name, path };
            if (module.classes.some(cl => cl.name === name)) return { kind: TypeReferenceKinds.CLASS, name, path };
            if (module.interfaces.some(int => int.name === name)) return { kind: TypeReferenceKinds.INTERFACE, name, path };
            if (module.enums.some(en => en.name === name)) return { kind: TypeReferenceKinds.ENUM, name, path };
            if (module.types.some(ty => ty.name === name)) return { kind: TypeReferenceKinds.TYPE_ALIAS, name, path };
            if (module.functions.some(fn => fn.name === name)) return { kind: TypeReferenceKinds.FUNCTION, name, path };
            if (module.constants.some(c => c.name === name)) return { kind: TypeReferenceKinds.CONSTANT, name, path };
            if (module.modules.has(name)) return { kind: TypeReferenceKinds.NAMESPACE_OR_MODULE, name, path };
            return;
        }, project.extractor.settings.entryPoints.length === 1 ? [] : [project.module.name]);
    }

    findByPath(name: string, path: Array<string>, project: Project) : ReferenceType|undefined {
        let mod: Module|undefined = project.module;
        for (const pathPart of path) {
            mod = mod.modules.get(pathPart);
            if (!mod) return;
        }
        if (mod.classes.some(cl => cl.name === name)) return { kind: TypeReferenceKinds.CLASS, name, path };
        if (mod.interfaces.some(int => int.name === name)) return { kind: TypeReferenceKinds.INTERFACE, name, path };
        if (mod.enums.some(en => en.name === name)) return { kind: TypeReferenceKinds.ENUM, name, path };
        if (mod.types.some(ty => ty.name === name)) return { kind: TypeReferenceKinds.TYPE_ALIAS, name, path };
        if (mod.functions.some(fn => fn.name === name)) return { kind: TypeReferenceKinds.FUNCTION, name, path };
        if (mod.constants.some(c => c.name === name)) return { kind: TypeReferenceKinds.CONSTANT, name, path };
        if (mod.modules.has(name)) return { kind: TypeReferenceKinds.NAMESPACE_OR_MODULE, name, path };
        return;
    }

}