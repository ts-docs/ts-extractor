
import * as path from "path";
import * as fs from "fs";
import * as ts from "typescript";
import { TypescriptExtractor } from "./extractor";
import { createModule, Module } from "./structure";
import { getLastItemFromPath } from "./util";


export function extract(projectPath: string) : Module {
    const pathToOptions = path.join(__dirname, projectPath, "tsconfig.json");
    if (!fs.existsSync(pathToOptions)) throw new Error("Couldn't find tsconfig.json.");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const options = require(pathToOptions);
    const checked = ts.convertCompilerOptionsFromJson(options.compilerOptions, projectPath, "tsconfig.json");
    if (checked.errors[0]) throw new Error(checked.errors[0].messageText.toString());

    let rootDirPath = "";
    if (checked.options.rootDir && fs.existsSync(path.join(__dirname, projectPath, checked.options.rootDir, "index.ts"))) {
        rootDirPath = path.join(__dirname, projectPath, checked.options.rootDir);
    } else if (options.tsDocs && options.tsDocs.rootFile) {
        const p = path.join(__dirname, projectPath, options.tsDocs.rootDir);
        if (!fs.existsSync(p)) throw new Error("Couldn't find project entry file.");
        rootDirPath = p;
    }

    const globalModule = createModule("Global", rootDirPath, true);
    const extractor = new TypescriptExtractor(globalModule, getLastItemFromPath(rootDirPath));

    const host = ts.createCompilerHost(checked.options);

    const program = ts.createProgram([path.join(rootDirPath, "index.ts")], checked.options, host);

    for (const file of program.getSourceFiles()) {
        if (file.isDeclarationFile) continue;
        extractor.runOnFile(file);
    }

    return globalModule;
}


console.dir(extract("../test"), {depth: 544});