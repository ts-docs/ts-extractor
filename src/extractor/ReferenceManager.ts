
import ts from "typescript";
import { Project } from "./Project";
import { Module, ReferenceType, TypeReferenceKinds } from "./structure";

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

    findOfKindInModule(name: string, module: Module, kind: "class" | "interface" | "enum" | "function" | "type" | "constant" | "module" | string) : ReferenceType | undefined {
        switch (kind) {
        case "class":
            if (module.classes.some(c => c.name === name)) return { kind: TypeReferenceKinds.CLASS, name, path: module.path };
            break;
        case "interface":
            if (module.interfaces.some(i => i.name === name)) return { kind: TypeReferenceKinds.INTERFACE, name, path: module.path };
            break;
        case "enum":
            if (module.enums.some(e => e.name === name)) return { kind: TypeReferenceKinds.ENUM, name, path: module.path };
            break;
        case "function":
            if (module.functions.some(f => f.name === name)) return { kind: TypeReferenceKinds.FUNCTION, name, path: module.path };
            break;
        case "type":
            if (module.types.some(t => t.name === name)) return { kind: TypeReferenceKinds.TYPE_ALIAS, name, path: module.path };
            break;
        case "constant":
            if (module.constants.some(c => c.name === name)) return { kind: TypeReferenceKinds.CONSTANT, name, path: module.path };
            break;
        case "module":
            if (module.modules.has(name)) return { kind: TypeReferenceKinds.NAMESPACE_OR_MODULE, name, path: module.path };
            break;
        default:
            return;
        }
        return;
    }

    findByNameWithModule(name: string, project: Project, module?: Module) : ReferenceType|undefined {
        return project.forEachModule<ReferenceType>(module || project.module, (module, path) => {
            if (module.name === name) return { kind: TypeReferenceKinds.NAMESPACE_OR_MODULE, name, path };
            if (module.modules.has(name)) return { kind: TypeReferenceKinds.NAMESPACE_OR_MODULE, name, path };
            const maxLoops = Math.max(module.classes.length, module.interfaces.length, module.enums.length, module.types.length, module.functions.length, module.constants.length);
            for (let i=0|0; i < maxLoops; i++) {
                if (module.classes.length > i && module.classes[i].name === name) return { kind: TypeReferenceKinds.CLASS, name, path };
                else if (module.interfaces.length > i && module.interfaces[i].name === name) return { kind: TypeReferenceKinds.INTERFACE, name, path };
                else if (module.enums.length > i && module.enums[i].name === name) return { kind: TypeReferenceKinds.ENUM, name, path };
                else if (module.types.length > i && module.types[i].name === name) return { kind: TypeReferenceKinds.TYPE_ALIAS, name, path };
                else if (module.functions.length > i && module.functions[i].name === name) return { kind: TypeReferenceKinds.FUNCTION, name, path };
                else if (module.constants.length > i && module.constants[i].name === name) return { kind: TypeReferenceKinds.CONSTANT, name, path };
            }
            return;
        }, project.extractor.settings.entryPoints.length === 1 ? [] : [project.module.name]);
    }

    findByPath(name: string, path: Array<string>, project: Project) : ReferenceType|undefined {
        let mod: Module|undefined = project.module;
        for (const pathPart of path) {
            mod = mod.modules.get(pathPart);
            if (!mod) return;
        }
        if (mod.modules.has(name)) return { kind: TypeReferenceKinds.NAMESPACE_OR_MODULE, name, path };
        const maxLoops = Math.max(mod.classes.length, mod.interfaces.length, mod.enums.length, mod.types.length, mod.functions.length, mod.constants.length);
        for (let i=0|0; i < maxLoops; i++) {
            if (mod.classes.length > i && mod.classes[i].name === name) return { kind: TypeReferenceKinds.CLASS, name, path };
            else if (mod.interfaces.length > i && mod.interfaces[i].name === name) return { kind: TypeReferenceKinds.INTERFACE, name, path };
            else if (mod.enums.length > i && mod.enums[i].name === name) return { kind: TypeReferenceKinds.ENUM, name, path };
            else if (mod.types.length > i && mod.types[i].name === name) return { kind: TypeReferenceKinds.TYPE_ALIAS, name, path };
            else if (mod.functions.length > i && mod.functions[i].name === name) return { kind: TypeReferenceKinds.FUNCTION, name, path };
            else if (mod.constants.length > i && mod.constants[i].name === name) return { kind: TypeReferenceKinds.CONSTANT, name, path };
        }
        return;
    }

}