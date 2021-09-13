
import fs from "fs";
import path from "path";
import ts from "typescript";
import { findPackageJSON, PackageJSON, removePartOfPath } from "../utils";
import { createHost } from "./Host";
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
        const packagesMap = new Map<string, string>(); // package name - package path
        const packageJSONs = new Map<string, PackageJSON>();
        for (const entryPoint of this.settings.entryPoints) {
            const packageJSON = findPackageJSON(entryPoint);
            if (!packageJSON) throw new Error("Couldn't find package.json file.");
            packagesMap.set(packageJSON.contents.name, entryPoint);
            packageJSONs.set(entryPoint, packageJSON);
        }

        const host = createHost(options, packagesMap);
        const program = ts.createProgram(this.settings.entryPoints, options, host);

        const checker = program.getTypeChecker();
        const projects = [];
        const base = process.cwd().split(path.sep);
        for (const entryPoint of this.settings.entryPoints) {
            const sourceFile = program.getSourceFile(path.join(process.cwd(), entryPoint));
            if (!sourceFile) continue;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const project = new Project({folderPath: removePartOfPath(sourceFile.fileName, base), program, checker, settings: this.settings, packageJSON: packageJSONs.get(entryPoint)! });
            projects.push(project);
            project.visitor(sourceFile);
        }
        return projects;
    }
}