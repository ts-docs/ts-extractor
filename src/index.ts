
import ts from "typescript";
import path from "path";
import { findPackageJSON, findTSConfigDown, getReadme, getRepository  } from "./util";
import { ExtractorList } from "./extractor/ExtractorList";

export function extract(rootFiles: Array<string>) : [ExtractorList, ts.CompilerOptions] {
    const tsconfig = findTSConfigDown();
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

export interface ProjectMetadata {
    readme?: string,
    homepage?: string,
    version?: string,
    repository?: string
}

export function extractMetadata(directory: string) : ProjectMetadata {
    const packageJSON = findPackageJSON(directory);
    return {
        readme: getReadme(directory),
        homepage: packageJSON && packageJSON.contents.homepage,
        version: packageJSON && packageJSON.contents.version,
        repository: packageJSON && getRepository(packageJSON)
    };
}

export { TypescriptExtractor } from "./extractor";
export { ExtractorList } from "./extractor/ExtractorList";