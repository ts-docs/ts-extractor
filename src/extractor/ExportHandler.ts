/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Module, Project, ReferenceType, TypeReferenceKinds, TypescriptExtractor } from ".";
import path from "path";
import ts from "typescript";
import { getFilenameFromPath } from "../utils";

export interface AliasedReference extends ReferenceType {
    alias?: string
}

export interface ExportedElement {
    /**
     * Which module the element(s) come from
     */
    module: ReferenceType,
    /**
     * If it's a **namespace** export:
     * ```ts
     * export * as Thing from "...";
     * ```
     * 
     * this will be set to the name of the namespace
     */
    namespace?: string,
    /**
     * If the things were exported from a file inside [[ExportedElement.module]] which is not the `index.ts` file. This will be only the name of the file
     * (`file.ts`), not the entire path to it!
     */
    filename?: string,
    /**
     * If only some of the things were exported from that module. If the array is empty, that means everything (`*`) was exported.
     * 
     * ```ts
     * export { A, B, C } from "..."; // Array will be full
     * export * from "..."; // Array will be empty
     * ```
     */
    references: Array<AliasedReference>,
    /**
     * If this is true, then the references are coming from the same module. 
     */
    sameModule: boolean,
    /**
     * If the module re-exports a re-export with an "alias". Confusing, I know.
     */
    reExportsOfReExport?: string
}


export interface FileExports {
    /**
     * This will be only filled with things declared and exported in that file.
     * ```ts
     * export interface ...
     * export class ...
     * ```
     * 
     * or
     * 
     * ```ts
     * class ...
     * interface ...
     * 
     * export { ..., ... };
     * ```
     */
    exports: Array<AliasedReference>,
    /**
     * Direct re-exports:
     * ```ts
     * export * from "..."
     * ```
     * Partial re-exports:
     * ```ts
     * export {A, B, C} from "..."
     * ```
     * Indirect partial re-exports:
     * ```ts
     * import {A, B} from "...";
     * export { A, B };
     * ```
     * Namespace re-exports:
     * ```ts
     * export * as SomeNamespaceName from "...";
     * ```
     */
    reExports: Array<ExportedElement>
}

export function registerDirectReExport(project: Project, currentModule: Module, decl: ts.StringLiteral): void {
    const currentSourceFile = decl.getSourceFile().fileName;
    const sourceFile = resolveSourceFile(project.extractor, currentSourceFile, decl.text);
    if (!sourceFile) return;
    const moduleOfSource = project.getOrCreateModule(sourceFile.fileName);
    if (moduleOfSource !== currentModule) project.visitor(sourceFile, moduleOfSource);
    else project.visitor(sourceFile, currentModule);
    addReExport(currentModule, currentSourceFile, sourceFile.fileName, {
        module: moduleOfSource.ref,
        references: [],
        sameModule: currentModule === moduleOfSource
    });
}

export function registerNamespaceReExport(project: Project, currentModule: Module, val: ts.Symbol): void {
    const namespaceName = (val.declarations![0] as ts.NamespaceExportDeclaration).name.text;
    const aliased = project.resolveAliasedSymbol(val);
    if (!aliased.declarations || !aliased.declarations.length) return;
    const fileNameOfSource = project.resolveSymbolFileName(aliased);
    const mod = project.getOrCreateModule(fileNameOfSource);
    project.visitor(aliased, mod);
    addReExport(currentModule, val.declarations![0].getSourceFile().fileName, fileNameOfSource, {
        namespace: namespaceName,
        module: mod.ref,
        references: [],
        sameModule: currentModule === mod
    });
}

export function registerDirectExport(fileName: string, currentModule: Module, ref: ReferenceType): void {
    if (ref.kind === TypeReferenceKinds.INTERNAL) return;
    addExport(currentModule, fileName, ref);
}

export function registerOtherExportOrReExport(project: Project, currentModule: Module, val: ts.Symbol): void {
    const firstDecl = val.declarations![0] as ts.ExportSpecifier;
    const thisSourceFile = firstDecl.getSourceFile().fileName;
    // The actual thing that got exported
    const realObj = project.resolveAliasedSymbol(val);
    let originSourceFile;
    if (firstDecl.parent.parent.moduleSpecifier) {
        originSourceFile = resolveSourceFile(project.extractor, thisSourceFile, (firstDecl.parent.parent.moduleSpecifier! as ts.StringLiteral).text);
        if (!originSourceFile) return;
    }
    else originSourceFile = realObj.declarations![0].getSourceFile();
    const originModule = project.getOrCreateModule(originSourceFile.fileName);

    project.visitor(originSourceFile, originModule);

    // If the first declaration of the symbol is a source file, then the expored symbol is a namespace import
    // import * as B from "..."; export { B };
    if (ts.isSourceFile(realObj.declarations![0])) {
        if (originModule.exports.index?.reExports.some(ex => ex.namespace === val.name)) addReExport(currentModule, thisSourceFile, originSourceFile.fileName, {
            module: originModule.ref,
            references: [],
            sameModule: currentModule === originModule,
            reExportsOfReExport: val.name
        });
        else addReExport(currentModule, thisSourceFile, originSourceFile.fileName, {
            namespace: val.name,
            module: originModule.ref,
            references: [],
            sameModule: currentModule === originModule
        });
        return;
    }

    const reference = project.extractor.refs.get(realObj);
    const alias = (val.name === realObj.name) ? undefined : val.name;

    const thisFileName = getFilenameFromPath(thisSourceFile);
    const originFileName = getFilenameFromPath(originSourceFile.fileName);

    if (!reference) {
        currentModule.exports[thisFileName]?.reExports.push({
            module: originModule.ref,
            filename: originFileName === "index" ? undefined : originFileName,
            references: [],
            sameModule: currentModule === originModule,
            reExportsOfReExport: val.name
        });
        return;
    }

    if (reference.kind === TypeReferenceKinds.INTERNAL) return;

    if (!currentModule.exports[thisFileName]) currentModule.exports[thisFileName] = {
        exports: [], reExports: [
            {
                module: originModule.ref,
                filename: originFileName === "index" ? undefined : originFileName,
                references: [{ ...reference, alias }],
                sameModule: currentModule === originModule
            }
        ]
    };
    else {
        const reExport = currentModule.exports[thisFileName].reExports.find(r => r.module === originModule.ref && r.filename === originFileName);
        if (!reExport) currentModule.exports[thisFileName].reExports.push({
            module: originModule.ref,
            filename: originFileName === "index" ? undefined : originFileName,
            references: [{ ...reference, alias }],
            sameModule: currentModule === originModule
        });
        else reExport?.references.push({ ...reference, alias });
    }
}

export function resolveSourceFile(extractor: TypescriptExtractor, filePath: string, relative: string): ts.SourceFile | undefined {
    let res;
    if (path.isAbsolute(filePath)) {
        const p = path.join(filePath, "../");
        res = extractor.program.getSourceFile(path.join(p, `${relative}.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative}/index.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative.slice(0, -3)}.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative}.tsx`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative}/index.tsx`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative.slice(0, -3)}.tsx`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative}.d.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative}/index.d.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative.slice(0, -3)}.d.ts`));
    } else {
        const p = path.join(process.cwd(), filePath, "../");
        res = extractor.program.getSourceFile(path.join(p, `${relative}.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative}/index.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative.slice(0, -3)}.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative}.tsx`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative}/index.tsx`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative.slice(0, -3)}.tsx`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative}.d.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative}/index.d.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(p, `${relative.slice(0, -3)}.d.ts`));
    }
    return res;
}

export function addExport(module: Module, fileName: string, ex: AliasedReference) : void {
    const last = getFilenameFromPath(fileName);
    if (!module.exports[last]) module.exports[last] = { exports: [ex], reExports: [] };
    else module.exports[last].exports.push(ex);
}

export function addReExport(module: Module, fileName: string, origin: string, ex: ExportedElement) : void {
    const last = getFilenameFromPath(fileName);
    const originLast = getFilenameFromPath(origin);
    if (originLast !== "index") ex.filename = originLast;
    if (!module.exports[last]) module.exports[last] = { exports: [], reExports: [ex] };
    else module.exports[last].reExports.push(ex);
}