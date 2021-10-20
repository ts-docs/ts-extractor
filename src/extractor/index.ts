/* eslint-disable @typescript-eslint/no-non-null-assertion */

import fs from "fs";
import path from "path";
import ts from "typescript";
import { findPackageJSON, PackageJSON, removePartOfEndOfPath } from "../utils";
import { createHost } from "./Host";
import { Project } from "./Project";
import { ExternalReference, ReferenceManager } from "./ReferenceManager";
import { Module } from "./structure";

export abstract class FileObjectCache {
    /**
     * @param absolute The absolute path to the file.
     * 
     * @returns Return true if the file is cached, false otherwise.
     */
    abstract has(absolute: string) : boolean;
}

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
    passthroughModules?: Array<string>,
    /**
     * Change the cwd (current working directory)
     */
    cwd?: string,
    /**
     * A class which implements the abstract class [[FileObjectCache]]. If the [[FileObjectCache.has() as has]] function returns `true`, then all items 
     * in that file will be marked with "isCached" set to true.
     */
    fileCache?: FileObjectCache,
    /**
     * A custom reference manager instance, must extend [[ReferenceManager]]
     */
    refs?: ReferenceManager,
    /**
     * Path to which tsconfig.json file to use
     */
    tsconfig?: string
}

export class TypescriptExtractor {
    settings: TypescriptExtractorSettings
    checker!: ts.TypeChecker
    program!: ts.Program
    refs: ReferenceManager
    moduleCache: Record<string, Module>
    fileCache: Map<string, boolean|undefined>
    splitCwd!: Array<string>
    constructor(settings: TypescriptExtractorSettings) {
        this.settings = settings;
        this.refs = settings.refs || new ReferenceManager(settings.externals);
        this.moduleCache = {};
        this.fileCache = new Map();
    }

    isCachedFile(fileName: string) : boolean|undefined {
        if (this.fileCache.has(fileName)) return this.fileCache.get(fileName)!;
        const res = this.settings.fileCache?.has(fileName);
        this.fileCache.set(fileName, res);
        return res;
    }

    run() : Array<Project> {
        const cwd = this.settings.cwd || process.cwd();
        this.splitCwd = cwd.split(path.sep);
        let tsconfig: ts.CompilerOptions = {};
        if (this.settings.tsconfig) {
            if (this.settings.tsconfig !== "none") {
                const info = ts.parseConfigFileTextToJson("tsconfig.json", fs.readFileSync(path.join(cwd, this.settings.tsconfig), "utf-8"));
                if (info.error) throw new Error(ts.flattenDiagnosticMessageText(info.error.messageText, "\n"));
                tsconfig = ts.convertCompilerOptionsFromJson(info.config.compilerOptions, cwd).options;
            }
        } else {
            const tsconfigPath = ts.findConfigFile(cwd, (file) => fs.existsSync(file), "tsconfig.json");
            if (tsconfigPath) {
                const configRes = ts.parseConfigFileTextToJson("tsconfig.json", fs.readFileSync(tsconfigPath, "utf-8"));
                if (configRes.error) throw new Error(ts.flattenDiagnosticMessageText(configRes.error.messageText, "\n"));
                if (configRes.config) tsconfig = ts.convertCompilerOptionsFromJson(configRes.config.compilerOptions, cwd).options;
            }
        }
        if (!tsconfig || Object.keys(tsconfig).length === 0) {
            tsconfig = {
                skipLibCheck: true,
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2016
            };
        }
        tsconfig.types = [];
        const packagesMap = new Map<string, string>(); // package name - package path
        const packageJSONs = new Map<string, PackageJSON>();
        for (let i=0; i < this.settings.entryPoints.length; i++) {
            let entryPoint = this.settings.entryPoints[i];
            if (!entryPoint.endsWith("ts")) entryPoint += ".ts";
            if (!path.isAbsolute(entryPoint)) entryPoint = path.join(cwd, entryPoint);
            if (!fs.existsSync(entryPoint)) throw new Error(`Couldn't find file '${entryPoint}'`);
            const packageJSON = findPackageJSON(entryPoint);
            if (!packageJSON) throw new Error("Couldn't find package.json file for one of the entry points");
            if (!packageJSON.contents.name) throw new Error("One of the entry points' package.json is missing a name");
            packagesMap.set(packageJSON.contents.name, entryPoint);
            packageJSONs.set(entryPoint, packageJSON);
            this.settings.entryPoints[i] = entryPoint;
        }

        const host = createHost(tsconfig, packagesMap, this.settings, cwd);
        this.program = ts.createProgram(this.settings.entryPoints, tsconfig, host);

        this.checker = this.program.getTypeChecker();
        const projects = [];
        for (const entryPoint of this.settings.entryPoints) {
            const sourceFile = this.program.getSourceFile(entryPoint);
            if (!sourceFile) continue;
            const project = new Project({ folderPath: removePartOfEndOfPath(sourceFile.fileName, this.splitCwd), extractor: this, packageJSON: packageJSONs.get(entryPoint)! });
            projects.push(project);
            project.visitor(sourceFile, project.module);
        }
        return projects;
    }
}

export * from "./Host";
export * from "./Project";
export * from "./ReferenceManager";
export * from "./structure";