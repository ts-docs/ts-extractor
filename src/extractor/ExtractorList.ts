import ts from "typescript";
import { TypescriptExtractor } from ".";
import { createModule } from "../structure";
import { getLastItemFromPath, getAllButLastItemFromPath, findPackageJSON, getRepository, getReadme } from "../util";
import { ReferenceManager } from "./ReferenceManager";


export class ExtractorList extends Array<TypescriptExtractor> {

    createExtractor(fullPath: string, typeChecker: ts.TypeChecker, references: ReferenceManager) : TypescriptExtractor {
        const lastDir = getAllButLastItemFromPath(fullPath);
        const packageJSONData = findPackageJSON(lastDir);
        if (!packageJSONData) throw new Error("Couldn't find package.json");
        const lastItem = getLastItemFromPath(lastDir);
        const repo = getRepository(packageJSONData);
        const module = createModule(packageJSONData.contents.name, true, repo && `${repo}/${lastItem}`, undefined);
        const extractor: TypescriptExtractor = new TypescriptExtractor({
            module,
            basedir: lastItem,
            repository: repo,
            checker: typeChecker,
            readme: getReadme(lastDir),
            homepage: packageJSONData.contents.homepage,
            references
        });
        this.push(extractor);
        return extractor;
    }

    toJSON() : Array<Record<string, unknown>> {
        return this.map(ext => ext.toJSON());
    }

}