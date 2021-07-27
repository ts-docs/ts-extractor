
import ts from "typescript";
import path from "path";
import { TypescriptExtractor } from "./extractor";
import { createModule } from "./structure";
import { findTSConfig, getAllButLastItemFromPath, getLastItemFromPath } from "./util";


export function extract(rootFiles: Array<string>) : [Array<TypescriptExtractor>, ts.CompilerOptions] {
    const tsconfig = findTSConfig();
    if (!tsconfig) throw new Error("Couldn't find tsconfig.json");

    const modules = [];

    for (const rootFile of rootFiles) {
        const globalModule = createModule("Global", true);
        const fullPath = path.join(process.cwd(), rootFile);
        const program = ts.createProgram([fullPath], tsconfig);
        const extractor = new TypescriptExtractor(globalModule, getLastItemFromPath(getAllButLastItemFromPath(fullPath)), program.getTypeChecker());

        for (const file of program.getSourceFiles()) {
            if (file.isDeclarationFile) continue;
            extractor.runOnFile(file);
        }

        modules.push(extractor);
    }

    return [modules, tsconfig];
}