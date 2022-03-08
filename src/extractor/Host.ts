/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from "path";
import ts from "typescript";
import { TypescriptExtractor, TypescriptExtractorSettings, WatchFn } from ".";
import { getLastItemFromPath, normalPath, removePartOfPath } from "../utils";

export type WatchHost = ts.WatchCompilerHostOfFilesAndCompilerOptions<ts.SemanticDiagnosticsBuilderProgram>;

function extendHost(host: ts.CompilerHost|WatchHost, options: ts.CompilerOptions, customModules: Map<string, string>, extractorOptions: TypescriptExtractorSettings, cwd: string) : void {
    host.resolveModuleNames = (mods, file) => {
        const res: Array<ts.ResolvedModuleFull|undefined> = [];
        for (const module of mods) {
            let part = module;
            let rest = "";
            // Handles paths like @thing/a
            if (module.startsWith("@")) {
                const secondSlash = module.indexOf("/", module.indexOf("/") + 1);
                if (secondSlash !== -1) {
                    part = module.slice(0, secondSlash);
                    if (extractorOptions.ignoreFolderNames) rest = removePartOfPath(module.slice(secondSlash).split("/"), extractorOptions.ignoreFolderNames) + ".ts"; 
                    else rest = module.slice(secondSlash) + ".ts";
                }
            }
            else if (!part.startsWith(".") && part.includes("/")) {
                const firstSlash = part.indexOf("/");
                part = part.slice(0, firstSlash);
                if (extractorOptions.ignoreFolderNames) rest = removePartOfPath(module.slice(firstSlash).split("/"), extractorOptions.ignoreFolderNames) + ".ts"; 
                else rest = module.slice(firstSlash) + ".ts";   
            }
            if (customModules.has(part)) {
                let resolvedFileName;
                const customModulePart = customModules.get(part) as string;
                if (rest) resolvedFileName = normalPath(path.isAbsolute(customModulePart) ? path.join(path.parse(customModulePart).dir, rest) : path.join(cwd, path.parse(customModulePart).dir, rest));
                else resolvedFileName = normalPath(path.isAbsolute(customModulePart) ? customModulePart : path.join(cwd, customModulePart));
                res.push({
                    resolvedFileName,
                    isExternalLibraryImport: false,
                    extension: ts.Extension.Ts
                });
            } else {
                const result = ts.resolveModuleName(module, file, options, {fileExists: host.fileExists, readFile: host.readFile });
                if (result.resolvedModule && !result.resolvedModule.isExternalLibraryImport && (result.resolvedModule.extension === ts.Extension.Ts 
                    || result.resolvedModule.extension === ts.Extension.Tsx
                    || result.resolvedModule.extension === ts.Extension.Dts)) res.push(result.resolvedModule);
                else res.push(undefined);
            }
        }
        return res;
    };
}

export function createHost(options: ts.CompilerOptions, customModules: Map<string, string>, extractorOptions: TypescriptExtractorSettings, cwd: string) : ts.CompilerHost {
    const defaultHost = extractorOptions.compilerHost ? extractorOptions.compilerHost(options) : ts.createCompilerHost(options, true);
    extendHost(defaultHost, options, customModules, extractorOptions, cwd);
    return defaultHost;
}

/**
 * Known issues with the watch host:
 * - Includes all items in the edited file, not just the modified ones. I feel like it's cheaper to do it like this and not compare objects.
 * - Always adds new symbols to the [[TypescriptExtractor.refs]] cache. This can become problematic if there are a lot of symbols inside of 
 * the file that got changed. 
 */
export function createWatchHost(extractor: TypescriptExtractor, watch: WatchFn, options: ts.CompilerOptions, customModules: Map<string, string>, extractorOptions: TypescriptExtractorSettings, cwd: string) : WatchHost {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const host = ts.createWatchCompilerHost(extractorOptions.entryPoints, options, ts.sys, ts.createSemanticDiagnosticsBuilderProgram, () => {}, () => {});
    // Each SourceFile has a "version" property. If, the old saved versions
    // don't match the new ones, that means the file's been changed.
    const savedFiles: Record<string, string> = {};
    host.afterProgramCreate = (program) => {
        const prog = program.getProgram();
        extractor.program = prog;
        extractor.checker = prog.getTypeChecker();
        const start = Date.now();
        for (const source of program.getSourceFiles()) {
            //@ts-expect-error Internal
            const fileVersion = source.version;
            if (savedFiles[source.fileName] === fileVersion) continue;
            // Save the new version of the file
            savedFiles[source.fileName] = fileVersion;
            if (!extractor.projects.length) return;
            const project = extractor.projects.find(p => source.fileName.startsWith(normalPath(p.root)));
            if (!project) continue;
            const module = project.getOrCreateModule(source.fileName);
            const exports = extractor.checker.getSymbolAtLocation(source)?.exports;
            const filename = getLastItemFromPath(source.fileName);
            if (!exports) continue;
            // Remove the file from the cache - forcing the "visitor" method to
            // get everything from it again
            extractor.fileCache.delete(source.fileName);
            // The exports will be added back via the "visitor" method
            delete module.exports[filename.split(".")[0]];
            // Deletes all declarations inside of the filename
            for (let i=Math.max(module.classes.length, module.interfaces.length, module.enums.length, module.functions.length, module.constants.length, module.types.length)|0; i >= 0; i--) {
                if (module.classes.length > i && filename === module.classes[i].loc.filename) module.classes.splice(i, 1);
                if (module.interfaces.length > i && module.interfaces[i].loc.some(l => l.filename === filename)) module.interfaces.splice(i, 1);
                if (module.enums.length > i && module.enums[i].loc.some(l => l.filename === filename)) module.enums.splice(i, 1); 
                if (module.types.length > i && filename === module.types[i].loc.filename) module.types.splice(i, 1); 
                if (module.functions.length > i && filename === module.functions[i].loc.filename) module.functions.splice(i, 1);
                if (module.constants.length > i && filename === module.constants[i].loc.filename) module.constants.splice(i, 1);
            }
            const refs = [];
            project.visitor(source, module);
            // We are using this to only get the changed declarations as references.
            // And then we'll have to loop through to get the actual declaration... sigh
            for (const [, val] of exports as Map<string, ts.Symbol>) {
                if (val.name === "__export") continue;
                const ref = project.handleSymbol(val, module, false);
                if (ref && ref.path === module.path) refs.push(ref);
            }
            watch(refs, module, project, start);
        }
    };
    extendHost(host, options, customModules, extractorOptions, cwd);
    return host;
}