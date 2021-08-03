import ts from "typescript";
import { TypescriptExtractor } from ".";
import { createModule } from "../structure";
import { getLastItemFromPath, getAllButLastItemFromPath, findPackageJSON, getRepository, getReadme } from "../util";


export class ExtractorList extends Array<TypescriptExtractor> {

    createExtractor(fullPath: string, typeChecker: ts.TypeChecker) : TypescriptExtractor {
        const lastDir = getAllButLastItemFromPath(fullPath);
        const packageJSONData = findPackageJSON(lastDir);
        if (!packageJSONData) throw new Error("Couldn't find package.json");
        const lastItem = getLastItemFromPath(lastDir);
        const repo = getRepository(packageJSONData);
        const module = createModule(packageJSONData.contents.name, true, repo && `${repo}/${lastItem}`);
        const extractor: TypescriptExtractor = new TypescriptExtractor({
            module,
            basedir: lastItem,
            repository: repo,
            checker: typeChecker,
            readme: getReadme(lastDir),
            homepage: packageJSONData.contents.homepage,
            hooks: {
                resolveSymbol: (symbol) => {
                    for (const mod of this) {
                        if (mod === extractor) return undefined;
                        const ref = mod.getReferenceTypeFromSymbol(symbol);
                        if (ref) return {...ref, external: mod.module.name};
                    }
                    return undefined;
                },
                getReference: (symbol) => {
                    for (const mod of this) {
                        if (mod === extractor) return undefined;
                        const ref = mod.references.get(symbol.name);
                        if (ref) return { ...ref, external: mod.module.name };
                    }
                    return undefined;
                }
            }
        });
        this.push(extractor);
        return extractor;
    }

    toJSON() : Array<Record<string, unknown>> {
        return this.map(ext => ext.toJSON());
    }

}