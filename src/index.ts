
import * as path from "path";
import * as fs from "fs";
import * as ts from "typescript";
import { TypescriptExtractor } from "./extractor";
import { createModule, Module } from "./structure";
import { getLastItemFromPath } from "./util";


export function extract(projectPath: string, rootDir?: string) : Module {
    const __dirname = process.cwd();
    const pathToOptions = path.join(__dirname, projectPath, "tsconfig.json");
    if (!fs.existsSync(pathToOptions)) throw new Error("Couldn't find tsconfig.json.");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const options = require(pathToOptions);
    const checked = ts.convertCompilerOptionsFromJson(options.compilerOptions, projectPath, "tsconfig.json");
    if (checked.errors[0]) throw new Error(checked.errors[0].messageText.toString());

    let rootDirPath = rootDir ? path.join(__dirname, projectPath, rootDir):undefined;

    if (options.compilerOptions.rootDir && fs.existsSync(path.join(__dirname, projectPath, options.compilerOptions.rootDir, "index.ts"))) {
        rootDirPath = path.join(__dirname, projectPath, options.compilerOptions.rootDir);
    }

    if (!rootDirPath) throw new Error("Couldn't find entry file.");

    const globalModule = createModule("Global", rootDirPath, true);
    const host = ts.createCompilerHost(checked.options, true);
    const program = ts.createProgram([path.join(rootDirPath, "index.ts")], checked.options, host);
    const extractor = new TypescriptExtractor(globalModule, getLastItemFromPath(rootDirPath), program.getTypeChecker());

    for (const file of program.getSourceFiles()) {
        if (file.isDeclarationFile) continue;
        extractor.runOnFile(file);
    }

    return globalModule;
}

console.dir(extract("./test"), {depth: 100});