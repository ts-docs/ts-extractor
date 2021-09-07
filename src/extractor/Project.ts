import ts from "typescript";
import { TypescriptExtractorSettings } from ".";
import { findPackageJSON, getReadme, getRepository } from "../utils";
import { createModule, Module } from "./structure";

export class Project {
    repository?: string
    readme?: string
    homepage?: string
    version?: string
    module: Module
    settings: TypescriptExtractorSettings
    checker: ts.TypeChecker
    constructor(folderPath: Array<string>, settings: TypescriptExtractorSettings, checker: ts.TypeChecker) {
        folderPath.pop(); // Removes the file name
        const packageJSON = findPackageJSON(folderPath.join("/"));
        if (!packageJSON) throw new Error("Couldn't find package.json file.");
        this.repository = getRepository(packageJSON);
        this.homepage = packageJSON.contents.homepage;
        this.version = packageJSON.contents.version;
        //this.name = packageJSON.contents.name;
        this.readme = getReadme(packageJSON.path);
        this.module = createModule(packageJSON.contents.name, true, this.repository && `${this.repository}/${folderPath[folderPath.length - 1]}`, false);
        this.settings = settings;
        this.checker = checker;
    }

    

}