import ts from "typescript";
import { TypescriptExtractor } from ".";
import { createModule } from "../structure";
import { getLastItemFromPath, getAllButLastItemFromPath, findPackageJSON } from "../util";


export class ExtractorList extends Array<TypescriptExtractor> {

    createExtractor(fullPath: string, typeChecker: ts.TypeChecker) : TypescriptExtractor {
        const packageJSON = findPackageJSON(fullPath);
        if (!packageJSON) throw new Error("Couldn't find package.json");
        const module = createModule(packageJSON.name, true);
        const extractor: TypescriptExtractor = new TypescriptExtractor(module, getLastItemFromPath(getAllButLastItemFromPath(fullPath)), typeChecker, (name) => {
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