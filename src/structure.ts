
export interface Module {
    name: string,
    modules: Array<Module>,
    classes: Array<unknown>,
    functions: Array<unknown>,
    interfaces: Array<unknown>,
    types: Array<unknown>,
    enums: Array<unknown>,
    constants: Array<unknown>,
    sourceFile: string
}

export function createModule(name: string, sourceFile: string) : Module {
    return {
        name,
        sourceFile,
        modules: [],
        classes: [],
        functions: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: []
    };
}