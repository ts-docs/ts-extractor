
import ts from "typescript";
import { Project } from "./Project";
import { ReferenceType, TypeReferenceKinds } from "./structure";

/**
 * The symbol parameter is usually a string when the reference is global, or when the import is aliased (`import {A as B} from "..."`)
 * 
 * The source is undefined only when the thing is not imported, which means it's a global object. (Array, Promise, etc.)
 */
export interface ExternalReference {
    run: (symbol: ts.Symbol|string, source?: string) => {link: string, displayName?: string, name?: string}|undefined,
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

    findUnnamedExternal(symbol: ts.Symbol|string, source?: string) : ReferenceType|undefined {
        for (const external of this.unnamedExternals) {
            const res = external.run(symbol, source);
            if (res) return { name: typeof symbol === "string" ? symbol:symbol.name, kind: TypeReferenceKinds.EXTERNAL, ...res };
        }
        return;
    }

    findExternal(symbol: ts.Symbol|string, source?: string) : ReferenceType|undefined {
        if (source) {
            const path = source.split("/");
            const first = path.shift();
            if (!first) return;
            if (this.namedExternals.has(first)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const res = this.namedExternals.get(first)!.run(symbol, source);
                return { name: typeof symbol === "string" ? symbol:symbol.name, kind: TypeReferenceKinds.EXTERNAL, ...res };
            }
        }
        return this.findUnnamedExternal(symbol, source);
    }

    findByName(name: string) : ReferenceType|undefined {
        for (const [, ref] of this) {
            if (ref.name === name) return ref;
        }
        return;
    } 

    findByNameWithModule(name: string, project: Project) : ReferenceType|undefined {
        return project.forEachModule<ReferenceType>(project.module, (module, path) => {
            if (module.classes.some(cl => cl.name === name)) return { kind: TypeReferenceKinds.CLASS, name, path, moduleName: project.module.name };
            if (module.interfaces.some(int => int.name === name)) return { kind: TypeReferenceKinds.INTERFACE, name, path, moduleName: project.module.name };
            if (module.enums.some(en => en.name === name)) return { kind: TypeReferenceKinds.ENUM, name, path, moduleName: project.module.name };
            if (module.types.some(ty => ty.name === name)) return { kind: TypeReferenceKinds.TYPE_ALIAS, name, path, moduleName: project.module.name };
            if (module.functions.some(fn => fn.name === name)) return { kind: TypeReferenceKinds.FUNCTION, name, path, moduleName: project.module.name };
            if (module.constants.some(c => c.name === name)) return { kind: TypeReferenceKinds.FUNCTION, name, path, moduleName: project.module.name };
            if (module.modules.has(name)) return { kind: TypeReferenceKinds.NAMESPACE_OR_MODULE, name, path, moduleName: project.module.name };
            return;
        });
    }

}