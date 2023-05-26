import ts from "typescript";

/**
 * An item path is the module path to which an item definition
 * can be found.
 * 
 * The path array does **not** include the name of the item the path
 * belongs to, only the names of the modules it takes to get to the
 * item, with the last module being the module the item's in.
 */
export type ItemPath = Array<string>;

export interface ProjectMetadata {
    packageJSON: Record<string, string>,
    tsconfig: ts.CompilerOptions
}

/**
 * A `module` in ts-extractor is defined as a **directory** which
 * contains code. This code could be isolated from the rest of the
 * modules or have dependencies from other modules.
 * 
 * A module exposes all **exported** items defined in it's files, which include
 * classes, interfaces, enums, functions and constants.
 * 
 * If there are more directories inside of the module, they become **sub-modules**.
 * Sub-modules are treated as normal modules, just nested. If a module exports items
 * which are part of a sub-module, they do **not** become part of the module, instead
 * the references they get put in the [[exports]] object.
 * 
 * Namespaces are also modules. If that's the case, the [[namespace]] property
 * will be filled with details about the namespace (file name(s), locations)
 */
export interface Module {
    name: string,
    modules: Map<string, Module>,
    path: ItemPath,
    namespace?: boolean
}