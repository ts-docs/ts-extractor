
import {ArrowFunction, ConstantDecl, createModule, Module, Reference, ReferenceTypes, TypeOrLiteral, TypeParameter} from "./structure";
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
        for (const stmt of file.statements) {
            this._visitor(stmt, file);
        }
    }

    _visitor(node: ts.Node, file: ts.SourceFile) : void {
        if (ts.isVariableStatement(node) && node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) return this.handleVariableDeclaration(node, file);
        else if (ts.isClassDeclaration(node) && node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) return this.handleClassDeclaration(node, file);
    }

    handleVariableDeclaration(node: ts.VariableStatement, file: ts.SourceFile) : void {
        const module = this.moduleFromFile(file);
        if (!module) return;
        const declarations: Array<ConstantDecl> = [];
        for (const declaration of node.declarationList.declarations) {
            if (!declaration.initializer) continue;
            declarations.push({
                name: declaration.name.getText(file),
                content: declaration.initializer.getText(file),
                start: node.pos,
                end: node.end,
                type: declaration.type ? this.resolveType(declaration.type, file) : undefined
            });
        }
        module.constants.push(...declarations);
    }

    handleClassDeclaration(node: ts.ClassDeclaration, file: ts.SourceFile) : void {
        const module = this.moduleFromFile(file);
        if (!module) return;
        module.classes.push({
            name: node.name?.text || "empty",
            typeParameters: node.typeParameters && node.typeParameters.map(p => this.resolveGenerics(p, file)),
            start: node.pos,
            end: node.end
        });
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
                lastModule.modules.set(path, mod);
                lastModule = mod;
            } else lastModule = newLastMod;
        }
        return lastModule;
    }

    forEachModule<R>(module: Module, cb: (module: Module) => R) : R|undefined {
        for (const [, mod] of module.modules) {
            const res = cb(mod) || this.forEachModule(mod, cb);
            if (res) return res;
        }
        return undefined;
    } 

    resolveType(type: ts.Node, file: ts.SourceFile) : TypeOrLiteral|undefined {
        if (ts.isTypeReferenceNode(type)) {
            const name = type.typeName.getText(file);
            if (this.references.has(name)) return this.references.get(name) as Reference;
            const path: Array<string> = [];
            return this.forEachModule<TypeOrLiteral|undefined>(this.module, (module) => {
                if (module.classes.some(cl => cl.name === name)) {
                    path.push(module.name);
                    return {
                        name,
                        path,
                        type: ReferenceTypes.CLASS,
                        typeParameters: type.typeArguments ? type.typeArguments.map(arg => this.resolveType(arg, file)) : undefined
                    } as TypeOrLiteral;
                }
                else if (module.interfaces.some(inter => inter.name === name)) {
                    path.push(module.name);
                    return {
                        name,
                        path,
                        type: ReferenceTypes.INTERFACE,
                        typeParameters: type.typeArguments ? type.typeArguments.map(arg => this.resolveType(arg, file)) : undefined
                    } as TypeOrLiteral;
                }
                else if (module.enums.some(en => en.name === name)) {
                    path.push(module.name);
                    return {
                        name,
                        path,
                        type: ReferenceTypes.ENUM,
                        typeParameters: type.typeArguments ? type.typeArguments.map(arg => this.resolveType(arg, file)) : undefined
                    } as TypeOrLiteral;
                }
                else return {
                    name,
                    type: ReferenceTypes.UNKNOWN,
                    typeParameters: type.typeArguments ? type.typeArguments.map(arg => this.resolveType(arg, file)) : undefined
                } as TypeOrLiteral;
            });
        }
        else if (ts.isFunctionTypeNode(type)) {
            return {
                typeParameters: type.typeParameters ? type.typeParameters.map(p => this.resolveGenerics(p, file)) : undefined,
                returnType: this.resolveType(type.type, file),
                parameters: type.parameters.map(p => this.resolveType(p, file))
            } as ArrowFunction;
        }
        else switch (type.kind) {
        case ts.SyntaxKind.NumberKeyword: return {name: "number", type: ReferenceTypes.NUMBER};
        case ts.SyntaxKind.StringKeyword: return {name: "string", type: ReferenceTypes.STRING};
        case ts.SyntaxKind.BooleanKeyword: return {name: "boolean", type: ReferenceTypes.BOOLEAN};
        case ts.SyntaxKind.TrueKeyword: return { name: "true", type: ReferenceTypes.TRUE};
        case ts.SyntaxKind.FalseKeyword: return { name: "false", type: ReferenceTypes.FALSE};
        case ts.SyntaxKind.UndefinedKeyword: return { name: "undefined", type: ReferenceTypes.UNDEFINED};
        case ts.SyntaxKind.NullKeyword: return { name: "null", type: ReferenceTypes.NULL};
        case ts.SyntaxKind.VoidKeyword: return { name: "void", type: ReferenceTypes.VOID };
        case ts.SyntaxKind.AnyKeyword: return { name: "any", type: ReferenceTypes.ANY };
        default: return {name: "unknown", type: ReferenceTypes.UNKNOWN};
        }
    }

    resolveGenerics(generic: ts.TypeParameterDeclaration, file: ts.SourceFile) : TypeParameter {
        return {
            name: generic.name.text,
            default: generic.default ? this.resolveType(generic.default, file) : undefined,
            constraint: generic.constraint ? this.resolveType(generic.constraint, file) : undefined
        } as TypeParameter;
    }

} 