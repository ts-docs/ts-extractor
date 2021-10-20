import { Module, Project, ReferenceType, TypescriptExtractor } from ".";
import path from "path";
import ts from "typescript";
import { getFilenameFromPath } from "../utils";

export interface AliasedReference extends ReferenceType {
    alias?: string,
    preview?: string
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
    sameModule: boolean
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
        addReExport(currentModule, thisSourceFile, originSourceFile.fileName, {
            namespace: val.name,
            module: originModule.ref,
            references: [],
            sameModule: currentModule === originModule
        });
        return;
    }
    const alias = (val.name === realObj.name) ? undefined : val.name;
    const reference = project.extractor.refs.get(realObj);
    if (!reference) return;
    const thisFileName = getFilenameFromPath(thisSourceFile);
    const originFileName = getFilenameFromPath(originSourceFile.fileName);

    if (!currentModule.exports[thisFileName]) currentModule.exports[thisFileName] = {
        exports: [], reExports: [
            {
                module: originModule.ref,
                filename: originFileName === "index" ? undefined : originFileName,
                references: [{ ...reference, alias }],
                sameModule: currentModule === originModule
            }
        ]
    }
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
        res = extractor.program.getSourceFile(path.join(filePath, "../", `${relative}.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(filePath, "../", `${relative}/index.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(filePath, "../", `${relative.slice(0, -3)}.ts`));
    } else {
        res = extractor.program.getSourceFile(path.join(process.cwd(), filePath, "../", `${relative}.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(process.cwd(), filePath, "../", `${relative}/index.ts`));
        if (!res) res = extractor.program.getSourceFile(path.join(process.cwd(), filePath, "../", `${relative.slice(0, -3)}.ts`));
    }
    return res;
}

export function getExportsOfReExports(re: ExportedElement, projects: Array<Project>): FileExports | undefined {
    let project, path;
    if (projects.length === 1) {
        project = projects[0];
        path = re.module.path!;
    } else {
        project = projects.find(pr => pr.module.name === re.module.path![0]);
        if (!project) return;
        path = re.module.path!.slice(1);
    }
    let mod = project.module;
    for (let i = 0; i < path.length; i++) {
        mod = mod.modules.get(path[i])!;
    }
    if (re.filename) return mod.exports[re.filename];
    return mod.exports.index;
}

export function addExport(module: Module, fileName: string, ex: AliasedReference) {
    const last = getFilenameFromPath(fileName);
    if (!module.exports[last]) module.exports[last] = { exports: [ex], reExports: [] };
    else module.exports[last].exports.push(ex);
}

export function addReExport(module: Module, fileName: string, origin: string, ex: ExportedElement) {
    const last = getFilenameFromPath(fileName);
    const originLast = getFilenameFromPath(origin);
    if (originLast !== "index") ex.filename = originLast;

    if (!module.exports[last]) module.exports[last] = { exports: [], reExports: [ex] };
    else module.exports[last].reExports.push(ex);
}