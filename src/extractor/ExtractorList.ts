import ts from "typescript";
import { TypescriptExtractor } from ".";
import { createModule } from "../structure";
import { getLastItemFromPath, getAllButLastItemFromPath, findPackageJSON, getRepository } from "../util";


export class ExtractorList extends Array<TypescriptExtractor> {

    createExtractor(fullPath: string, typeChecker: ts.TypeChecker) : TypescriptExtractor {
        const packageJSONData = findPackageJSON(fullPath);
        if (!packageJSONData) throw new Error("Couldn't find package.json");
        const lastItem = getLastItemFromPath(getAllButLastItemFromPath(fullPath));
        const repo = getRepository(packageJSONData);
        const module = createModule(packageJSONData.contents.name, true, repo && `${repo}/${lastItem}`);
        const extractor: TypescriptExtractor = new TypescriptExtractor(module, lastItem, repo, typeChecker, (name) => {
            if (!this.length) return undefined;
            for (const mod of this) {
                if (mod === extractor) return undefined;
                const ref = mod.getReferenceTypeFromName(name);
                if (ref) return {...ref, external: mod.module.name};
            }
            return undefined;
        });
        this.push(extractor);
        return extractor;
    }

}