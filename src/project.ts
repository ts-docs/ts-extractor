import { ItemPath, Module, ProjectMetadata } from "./structure";
import ts from "typescript";

export interface Shared {
    program: ts.Program,
    checker: ts.TypeChecker
}

/**
 * A `project` in ts-extractor is defined as a **directory** which contains:
 * - A `package.json` file
 * - A directory which contains all of the project's code.
 * 
 * Projects are also [[Module]]s, they collect all the 
 */
export class Project implements Module {
    name: string;
    modules: Map<string, Module>;
    readme?: string;
    homepage?: string;
    version?: string;
    shared: Shared;
    path: ItemPath;
    constructor(info: ProjectMetadata, shared: Shared) {
        this.shared = shared;
        this.modules = new Map();
        this.readme = info.packageJSON.readme;
        this.homepage = info.packageJSON.homepage;
        this.version = info.packageJSON.version;
        this.path = [];

        this.name = info.packageJSON.name;
        if (this.name.includes("/")) this.name.split("/")[1];
    }

    processFile(sourceFile: ts.SourceFile | ts.Symbol, currentModule: Module) : void {
        let symbol: ts.Symbol;
        let fileName: string;
        if ("fileName" in sourceFile) {
            if (this.shared.program.isSourceFileFromExternalLibrary(sourceFile) || this.shared.program.isSourceFileDefaultLibrary(sourceFile)) return;
            fileName = sourceFile.fileName;
            const sym = this.shared.checker.getSymbolAtLocation(sourceFile);
            if (!sym) return;
            symbol = sym;
        } else {
            symbol = sourceFile;
            fileName = (symbol.escapedName as string).slice(1, -1) + ".ts";
        }

        if (!symbol.exports) return;

        for (const [, sym] of (symbol.exports as Map<string, ts.Symbol>)) {
            // Handle exports
        }
    }

}