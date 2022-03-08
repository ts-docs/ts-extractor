/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from "path";
import ts from "typescript";
import { TypescriptExtractor, TypescriptExtractorSettings, WatchFn } from ".";
import { getLastItemFromPath, normalPath, removePartOfPath } from "../utils";

export type WatchHost = ts.WatchCompilerHostOfFilesAndCompilerOptions<ts.SemanticDiagnosticsBuilderProgram>;

export function createHost(options: ts.CompilerOptions, customModules: Map<string, string>, extractorOptions: TypescriptExtractorSettings, cwd: string) : ts.CompilerHost {
    const defaultHost = extractorOptions.compilerHost ? extractorOptions.compilerHost(options) : ts.createCompilerHost(options, true);
    extendHost(defaultHost, options, customModules, extractorOptions, cwd);
    return defaultHost;
}

export function createWatchHost(extractor: TypescriptExtractor, watch: WatchFn, options: ts.CompilerOptions, customModules: Map<string, string>, extractorOptions: TypescriptExtractorSettings, cwd: string) : WatchHost {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const host = ts.createWatchCompilerHost(extractorOptions.entryPoints, options, ts.sys, ts.createSemanticDiagnosticsBuilderProgram, () => {}, () => {});
    const savedFiles: Record<string, string> = {};
    host.afterProgramCreate = (program) => {
        const prog = program.getProgram();
        extractor.program = prog;
        extractor.checker = prog.getTypeChecker();
        for (const source of program.getSourceFiles()) {
            //@ts-expect-error Internal
            const fileVersion = source.version;
            if (savedFiles[source.fileName] === fileVersion) continue;
            savedFiles[source.fileName] = fileVersion;
            if (!extractor.projects.length) continue;
            const project = extractor.projects.find(p => source.fileName.startsWith(normalPath(p.root)));
            if (!project) continue;
            const module = project.getOrCreateModule(source.fileName);
            const exports = extractor.checker.getSymbolAtLocation(source)?.exports;
            const filename = getLastItemFromPath(source.fileName);
            if (!exports) continue;
            for (let i=Math.max(module.classes.length, module.interfaces.length, module.enums.length, module.functions.length, module.constants.length, module.types.length)|0; i >= 0; i--) {
                if (module.classes.length > i && exports.has(module.classes[i].name as ts.__String) && filename === module.classes[i].loc.filename) {
                    const name = module.classes[i].name;
                    module.classes.splice(i, 1);
                    const ref = project.handleSymbol(exports.get(name as ts.__String)!);
                    if (ref) watch(ref, module, project);
                }
                if (module.interfaces.length > i && exports.has(module.interfaces[i].name as ts.__String) && module.interfaces[i].loc.some(l => l.filename === filename)) {
                    module.interfaces.splice(i, 1);
                    const ref = project.handleSymbol(exports.get(module.interfaces[i].name as ts.__String)!);
                    if (ref) watch(ref, module, project);
                }
                if (module.enums.length > i && exports.has(module.enums[i].name as ts.__String) && module.enums[i].loc.some(l => l.filename === filename)) {
                    module.enums.splice(i, 1); 
                    const ref = project.handleSymbol(exports.get(module.enums[i].name as ts.__String)!);
                    if (ref) watch(ref, module, project);
                }
                if (module.types.length > i && exports.has(module.types[i].name as ts.__String) && filename === module.types[i].loc.filename) {
                    module.types.splice(i, 1); 
                    const ref = project.handleSymbol(exports.get(module.types[i].name as ts.__String)!);
                    if (ref) watch(ref, module, project);
                }
                if (module.functions.length > i && exports.has(module.functions[i].name as ts.__String) && filename === module.functions[i].loc.filename) {
                    module.functions.splice(i, 1); 
                    const ref = project.handleSymbol(exports.get(module.functions[i].name as ts.__String)!);
                    if (ref) watch(ref, module, project);
                }
                if (module.constants.length > i && exports.has(module.constants[i].name as ts.__String) && filename === module.constants[i].loc.filename) {
                    module.constants.splice(i, 1); 
                    const ref = project.handleSymbol(exports.get(module.constants[i].name as ts.__String)!);
                    if (ref) watch(ref, module, project);
                }

            }
        }
    };
    extendHost(host, options, customModules, extractorOptions, cwd);
    return host;
}

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