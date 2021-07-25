
import * as path from "path";
import * as fs from "fs";
import * as ts from "typescript";
import { TypescriptExtractor } from "./extractor";
import { createModule, Module } from "./structure";

export const TransformerFactory = (module: Module): ts.TransformerFactory<ts.SourceFile> => ctx => {
    return firstNode => {
        return new TypescriptExtractor(ctx, module).run(firstNode) as ts.SourceFile;
    };
};

export function extract(projectPath: string) : Module {
    const pathToOptions = path.join(__dirname, projectPath, "tsconfig.json");
    if (!fs.existsSync(pathToOptions)) throw new Error("Couldn't find tsconfig.json.");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const options = require(pathToOptions);
    const checked = ts.convertCompilerOptionsFromJson(options.compilerOptions, projectPath, "tsconfig.json");
    if (checked.errors[0]) throw new Error(checked.errors[0].messageText.toString());

    let rootFilePath: string|undefined;
    if (checked.options.rootDir && fs.existsSync(path.join(__dirname, projectPath, checked.options.rootDir, "index.ts"))) {
        rootFilePath = path.join(__dirname, projectPath, checked.options.rootDir, "index.ts");
    } else if (options.tsDocs && options.tsDocs.rootFile) {
        const p = path.join(__dirname, projectPath, options.tsDocs.rootFile, "index.ts");
        if (!fs.existsSync(p)) throw new Error("Couldn't find project entry file.");
        rootFilePath = p;
    }

    if (!rootFilePath) throw new Error("Couldn't find project entry file.");

    const globalModule = createModule("Global", rootFilePath);

    ts.transpileModule(fs.readFileSync(rootFilePath, "utf-8"), {
        compilerOptions: options,
        transformers: {before: [TransformerFactory(globalModule)]}
    });
    return globalModule;
}

console.log(extract("../test"));