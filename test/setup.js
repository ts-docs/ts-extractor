
const ts = require("typescript");
const { TypescriptExtractor } = require("../dist");

module.exports.createSingleFileExtractor = (content, extractorOptions = {}) => {
    const sourceFile = ts.createSourceFile("module.ts", content, ts.ScriptTarget.Latest, true);
    
    const extractor = new TypescriptExtractor({
        ...extractorOptions,
        entryPoints: ["module.ts"],
        compilerHost: (options) => {
            const host = ts.createCompilerHost(options, true);
            host.getSourceFile = () => sourceFile;
            host.directoryExists = () => true;
            host.getDirectories = () => [];
            host.fileExists = () => true;
            return host;
        }
    });

    return extractor.run()[0];
}