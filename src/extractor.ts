
import {createModule, Module, Reference} from "./structure";
import * as ts from "typescript";

export class TypescriptExtractor {
    module: Module
    references: Map<string, Reference>
    baseDir: string
    visitor: (node: ts.Node, file: ts.SourceFile) => void
    constructor(globalModule: Module, baseDir: string) {
        this.module = globalModule;
        this.references = new Map();
        this.baseDir = baseDir;
        this.visitor = this._visitor.bind(this);
    }

    runOnFile(file: ts.SourceFile) : void {
        console.log(this.moduleFromFile(file));
        for (const stmt of file.statements) {
            this._visitor(stmt, file);
        }
    }

    _visitor(node: ts.Node, file: ts.SourceFile) : void {
        if (ts.isVariableStatement(node) && node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) return this.handleVariableDeclaration(node, file);
    }

    handleVariableDeclaration(node: ts.VariableStatement, file: ts.SourceFile) : void {
        console.log(node, file);
    }

    moduleFromFile(file: ts.SourceFile) : Module|undefined {
        let paths = file.fileName.split("/");
        paths.pop(); // Remove the filename
        paths = paths.slice(paths.indexOf(this.baseDir) + 1);
        if (paths.length === 0) return this.module;
        let lastModule = this.module;        
        for (const path of paths) {
            const newLastMod = lastModule.modules.get(path);
            if (!newLastMod) {
                const mod = createModule(path, file.fileName);
                lastModule.modules.set(path, createModule(path, file.fileName));
                lastModule = mod;
            } else lastModule = newLastMod;
        }
        return lastModule;
    }

} 