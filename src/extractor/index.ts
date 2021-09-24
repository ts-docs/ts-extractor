
import fs from "fs";
import path from "path";
import ts from "typescript";
import { findPackageJSON, PackageJSON, removePartOfEndOfPath } from "../utils";
import { createHost } from "./Host";
import { Project } from "./Project";
import { ExternalReference, ReferenceManager } from "./ReferenceManager";
import { Module } from "./structure";


export interface TypescriptExtractorSettings {
    /**
     * The entry points to all projects. Every project should have only one entry point.
     */
    entryPoints: Array<string>,
    /**
     * Ignored folder names for module resolution
     */
    ignoreFolderNames?: Array<string>,
    /**
     * The max textlength of the value of a variable. Default is `256`
     */
    maxConstantTextLength?: number,
    /**
     * Array of external reference resolvers.
     */
    externals?: Array<ExternalReference>,
    /**
     * Any folder names in the provided array will be ignored - they won't become modules, items inside them will be inside the parent module.
     */
    passthroughModules?: Array<string>
}

export class TypescriptExtractor {
    settings: TypescriptExtractorSettings
    checker!: ts.TypeChecker
    program!: ts.Program
    refs: ReferenceManager
    moduleCache: Record<string, Module>
    constructor(settings: TypescriptExtractorSettings) {
        this.settings = settings;
        this.refs = new ReferenceManager(settings.externals);
        this.moduleCache = {};
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
            project.visitor(sourceFile, project.module, true);
        }
        return projects;
    }
}

export * from "./Host";
export * from "./Project";
export * from "./ReferenceManager";
export * from "./structure";