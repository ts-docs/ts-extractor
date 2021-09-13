import path from "path";
import ts from "typescript";


export function createHost(options: ts.CompilerOptions, customModules: Map<string, string>) : ts.CompilerHost {
    const defaultHost = ts.createCompilerHost(options, true);
    defaultHost.resolveModuleNames = (mods, file) => {
        const res: Array<ts.ResolvedModuleFull|undefined> = [];
        for (const module of mods) {
            let part = module;
            if (!module.startsWith(".") && module.includes("/")) part = module.slice(0, module.indexOf("/"));
            if (customModules.has(part)) {
                res.push({
                    resolvedFileName: path.join(process.cwd(), customModules.get(part) as string).replace(/\\/g, "/"),
                    isExternalLibraryImport: false,
                    extension: ts.Extension.Ts
                });
            } else {
                const result = ts.resolveModuleName(module, file, options, {fileExists: defaultHost.fileExists, readFile: defaultHost.readFile});
                if (result.resolvedModule) res.push(result.resolvedModule);
                else res.push(undefined);
            }
        }
        return res;
    };
    return defaultHost;
}