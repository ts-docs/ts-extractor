
import fs from "fs";
import path from "path";
import ts from "typescript";
import { findPackageJSON, PackageJSON, removePartOfPath } from "../utils";
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
        
        const options = tsconfig.config.compilerOptions || ts.getDefaultCompilerOptions();

        const packages = new Map<string, PackageJSON>();
        for (const entryPoint of this.settings.entryPoints) {
            const json = findPackageJSON(entryPoint);
            if (!json) throw new Error("Couldn't find package.json file.");
            packages.set(entryPoint, json);
            if (options.paths) options.paths[json.contents.name] = [entryPoint.split("/")[0]];
            else options.paths = { [json.contents.name]: [entryPoint.split("/")[0]] };
        }

        options.baseUrl = ".";

        console.log(options);

        const program = ts.createProgram({  rootNames: this.settings.entryPoints, options });

        const checker = program.getTypeChecker();
        const projects = new Map<string, Project>();
        const base = process.cwd().split(path.sep);
        for (const entryPoint of this.settings.entryPoints) {
            const sourceFile = program.getSourceFile(path.join(process.cwd(), `${entryPoint}.ts`));
            if (!sourceFile) continue;
            const newPath = removePartOfPath(sourceFile.fileName, base);
            const project = new Project({folderPath: newPath, program, checker, settings: this.settings, packageJSON: packages.get(entryPoint) as PackageJSON});
            projects.set(newPath[0], project);
            project.visitor(sourceFile);
        }
        return [...projects.values()];
    }
}