import path from "path";
import ts from "typescript";
import { TypescriptExtractorSettings } from ".";
import { removePartOfPath } from "../utils";


export function createHost(options: ts.CompilerOptions, customModules: Map<string, string>, extractorOptions: TypescriptExtractorSettings) : ts.CompilerHost {
    const defaultHost = ts.createCompilerHost(options, true);
    defaultHost.resolveModuleNames = (mods, file) => {
        const res: Array<ts.ResolvedModuleFull|undefined> = [];
        for (const module of mods) {
            let part = module;
            let rest = "";
            if (!module.startsWith(".") && module.includes("/")) {
                const firstSlash = module.indexOf("/");
                part = module.slice(0, firstSlash);
                if (extractorOptions.ignoreFolderNames) rest = removePartOfPath(module.slice(firstSlash).split("/"), extractorOptions.ignoreFolderNames) + ".ts"; 
                else rest = module.slice(firstSlash) + ".ts";   
            }
            if (customModules.has(part)) {
                let resolvedFileName;
                if (rest) resolvedFileName = path.join(process.cwd(), path.parse(customModules.get(part) as string).dir, rest).replace(/\\/g, "/");
                else resolvedFileName = path.join(process.cwd(), customModules.get(part) as string).replace(/\\/g, "/");
                res.push({
                    resolvedFileName,
                    isExternalLibraryImport: false,
                    extension: ts.Extension.Ts
                });
            } else {
                const result = ts.resolveModuleName(module, file, options, {fileExists: defaultHost.fileExists, readFile: defaultHost.readFile});
                if (result.resolvedModule && result.resolvedModule.extension === ts.Extension.Ts) res.push(result.resolvedModule);
                else res.push(undefined);
            }
        }
        return res;
    };
    return defaultHost;
}