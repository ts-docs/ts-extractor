/* eslint-disable no-case-declarations */
import { Declaration, Module, Project, ReferenceType, TypeReferenceKinds } from ".";


export function forEachModule<RESULT>(module: Module, cb: (mod: Module) => RESULT|undefined) : RESULT | undefined {
    const firstCb = cb(module);
    if (firstCb) return firstCb;
    for (const [, mod] of module.modules) {
        const res = forEachModule(mod, cb);
        if (res) return res;
    }
    return undefined;
}

export function findDeclWithModule(name: string, module: Module) : Declaration|undefined {
    return forEachModule(module, (module) => {
        const maxLoops = Math.max(module.classes.length, module.interfaces.length, module.enums.length, module.types.length, module.functions.length, module.constants.length);
        for (let i=0|0; i < maxLoops; i++) {
            if (module.classes.length > i && module.classes[i].name === name) return module.classes[i];
            else if (module.interfaces.length > i && module.interfaces[i].name === name) return module.interfaces[i];
            else if (module.enums.length > i && module.enums[i].name === name) return module.enums[i];
            else if (module.types.length > i && module.types[i].name === name) return module.types[i];
            else if (module.functions.length > i && module.functions[i].name === name) return module.types[i];
            else if (module.constants.length > i && module.constants[i].name === name) return module.constants[i];
        }
        return;
    });
}

export function findDeclOfType(name: string, module: Module, kind: string) : Declaration|undefined {
    switch (kind) {
    case "class": 
        const classDecl = module.classes.find(c => c.name === name);
        if (classDecl) return classDecl;
        break;
    case "interface":
        const interfaceDecl = module.interfaces.find(intf => intf.name === name);
        if (interfaceDecl) return interfaceDecl;
        break;
    case "enum":
        const enumDecl = module.enums.find(e => e.name === name);
        if (enumDecl) return enumDecl;
        break;
    case "function":
        const fnDecl = module.functions.find(f => f.name === name);
        if (fnDecl) return fnDecl;
        break;
    case "type":
        const typeDecl = module.types.find(t => t.name === name);
        if (typeDecl) return typeDecl;
        break;
    case "constant":
        const constDecl = module.constants.find(c => c.name === name);
        if (constDecl) return constDecl;
        break;
    default:
        return;
    }
    return;
}

export function findOfKindInModule(name: string, module: Module, kind: "class" | "interface" | "enum" | "function" | "type" | "constant" | "module" | string) : ReferenceType | undefined {
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

export function findByNameWithModule(name: string, module: Module) : ReferenceType|undefined {
    return forEachModule<ReferenceType>(module, (module) => {
        const path = module.path;
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
    });
}

export function findByPath(name: string, path: Array<string>, project: Project) : ReferenceType|undefined {
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