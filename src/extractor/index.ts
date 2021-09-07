
import fs from "fs";
import path from "path";
import ts from "typescript";
import { removePartOfPath } from "../utils";
import { Project } from "./Project";


export interface TypescriptExtractorSettings {
    entryPoints: Array<string>,
    ignoreModuleNames?: Array<string>
}

export class TypescriptExtractor {
    settings: TypescriptExtractorSettings
    constructor(settings: TypescriptExtractorSettings) {
        this.settings = settings;
    }

    run() : Array<Project> {
        const tsconfigPath = ts.findConfigFile(process.cwd(), (file) => fs.existsSync(file), "tsconfig.json");
        if (!tsconfigPath) throw new Error("Couldn't find tsconfig.json");
        const tsconfig = ts.parseConfigFileTextToJson("tsconfig.json", fs.readFileSync(tsconfigPath, "utf-8"));
        if (tsconfig.error) throw new Error(ts.flattenDiagnosticMessageText(tsconfig.error.messageText, "\n"));
        
        const program = ts.createProgram({
            rootNames: this.settings.entryPoints,
            options: tsconfig.config.compilerOptions || ts.getDefaultCompilerOptions()
        });

        const checker = program.getTypeChecker();
        const projects = new Map<string, Project>()
        const base = process.cwd().split(path.sep);
        for (const sourceFile of program.getSourceFiles()) {
            if (sourceFile.isDeclarationFile) continue;
            const newPath = removePartOfPath(sourceFile.fileName, base);
            if (!projects.has(newPath[0])) {
                projects.set(newPath[0], new Project(newPath, this.settings, checker));
            }
        }
        return [...projects.values()];
    }
}