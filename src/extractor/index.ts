
import fs from "fs";
import path from "path";
import ts from "typescript";
import { findPackageJSON, PackageJSON, removePartOfEndOfPath } from "../utils";
import { createHost } from "./Host";
import { Project } from "./Project";
import { ReferenceManager } from "./ReferenceManager";


export interface TypescriptExtractorSettings {
    entryPoints: Array<string>,
    ignoreModuleNames?: Array<string>,
    ignoreFolderNames?: Array<string>,
    maxConstantTextLength?: number
}

export class TypescriptExtractor {
    settings: TypescriptExtractorSettings
    checker!: ts.TypeChecker
    program!: ts.Program
    refs: ReferenceManager
    constructor(settings: TypescriptExtractorSettings) {
        this.settings = settings;
        this.refs = new ReferenceManager();
    }

    run() : Array<Project> {
        const tsconfigPath = ts.findConfigFile(process.cwd(), (file) => fs.existsSync(file), "tsconfig.json");
        if (!tsconfigPath) throw new Error("Couldn't find tsconfig.json");
        const tsconfig = ts.parseConfigFileTextToJson("tsconfig.json", fs.readFileSync(tsconfigPath, "utf-8"));
        if (tsconfig.error) throw new Error(ts.flattenDiagnosticMessageText(tsconfig.error.messageText, "\n"));
        
        const options = tsconfig.config.compilerOptions || ts.getDefaultCompilerOptions();
        options.types = [];
        options.noLib = true;
        const packagesMap = new Map<string, string>(); // package name - package path
        const packageJSONs = new Map<string, PackageJSON>();
        for (let i=0; i < this.settings.entryPoints.length; i++) {
            let entryPoint = this.settings.entryPoints[i];
            if (!entryPoint.endsWith("ts")) {
                entryPoint = `${entryPoint}.ts`;
                this.settings.entryPoints[i] = entryPoint;
            }
            const packageJSON = findPackageJSON(entryPoint);
            if (!packageJSON) throw new Error("Couldn't find package.json file.");
            packagesMap.set(packageJSON.contents.name, entryPoint);
            packageJSONs.set(entryPoint, packageJSON);
        }

        const host = createHost(options, packagesMap, this.settings);
        this.program = ts.createProgram(this.settings.entryPoints, options, host);

        this.checker = this.program.getTypeChecker();
        const projects = [];
        const base = process.cwd().split(path.sep);
        for (const entryPoint of this.settings.entryPoints) {
            const sourceFile = this.program.getSourceFile(path.join(process.cwd(), entryPoint));
            if (!sourceFile) continue;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const project = new Project({folderPath: removePartOfEndOfPath(sourceFile.fileName, base), extractor: this, packageJSON: packageJSONs.get(entryPoint)! });
            projects.push(project);
            project.visitor(sourceFile);
        }
        return projects;
    }
}