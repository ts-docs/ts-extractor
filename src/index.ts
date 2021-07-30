
import ts from "typescript";
import path from "path";
import { findTSConfig  } from "./util";
import { ExtractorList } from "./extractor/ExtractorList";


export function extract(rootFiles: Array<string>) : [ExtractorList, ts.CompilerOptions] {
    const tsconfig = findTSConfig();
    if (!tsconfig) throw new Error("Couldn't find tsconfig.json");

    const extractors = new ExtractorList();
    const sourceFiles: Array<readonly ts.SourceFile[]> = [];

    for (const rootFile of rootFiles) {
        const fullPath = path.join(process.cwd(), rootFile);
        const program = ts.createProgram([fullPath], tsconfig);
        const extractor = extractors.createExtractor(fullPath, program.getTypeChecker());

        const arr = [];

        for (const file of program.getSourceFiles()) {
            if (file.isDeclarationFile) continue;
            extractor.runPreparerOnFile(file);
            arr.push(file);
        }

        sourceFiles.push(arr);

    }

    for (let i=0; i < extractors.length; i++) {
        const extractor = extractors[i];
        for (const file of sourceFiles[i]) {
            extractor.runOnFile(file);
        }
    }

    return [extractors, tsconfig];
}