
import {ArrowFunction, ClassMethod, ClassProperty, ConstantDecl, Constructor, createModule, FunctionParameter, Module, ObjectLiteral, Reference, TypeKinds, TypeOrLiteral, TypeParameter, InterfaceProperty, IndexSignatureDeclaration } from "./structure";
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
        const isInExport = node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword);
        if (ts.isVariableStatement(node) && isInExport) return this.handleVariableDeclaration(node, file);
        else if (ts.isClassDeclaration(node) && isInExport) return this.handleClassDeclaration(node, file);
        else if (ts.isInterfaceDeclaration(node) && isInExport) return this.handleInterface(node, file);
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
        const methods: Array<ClassMethod> = [];
        const properties: Array<ClassProperty> = [];
        let constructor: Constructor|undefined;
        for (const member of node.members) {
            let isStatic, isPrivate, isProtected;
            if (member.modifiers) {
                for (const modifier of member.modifiers) {
                    if (modifier.kind === ts.SyntaxKind.StaticKeyword) isStatic = true;
                    if (modifier.kind === ts.SyntaxKind.ProtectedKeyword) isProtected = true;
                    if (modifier.kind === ts.SyntaxKind.PrivateKeyword) isPrivate = true;
                }
            }
            if (ts.isPropertyDeclaration(member)) {
                properties.push({
                    name: member.name.getText(file),
                    type: member.type && this.resolveType(member.type, file),
                    start: member.pos,
                    optional: Boolean(member.questionToken),
                    end: member.end,
                    isPrivate, isProtected, isStatic
                });
            }
            else if (ts.isMethodDeclaration(member)) {
                methods.push({
                    name: member.name.getText(file),
                    returnType: member.type && this.resolveType(member.type, file),
                    typeParameters: member.typeParameters && member.typeParameters.map(p => this.resolveGenerics(p, file)),
                    parameters: member.parameters.map(p => this.resolveParameter(p, file)),
                    start: member.pos,
                    end: member.end,
                    isPrivate, isProtected, isStatic
                });
            }
            else if (ts.isConstructorDeclaration(member)) {
                constructor = {
                    parameters: member.parameters.map(p => this.resolveParameter(p, file)),
                    start: member.pos,
                    end: member.pos
                };
            }
        }
        module.classes.push({
            name: node.name?.text || "empty",
            typeParameters: node.typeParameters && node.typeParameters.map(p => this.resolveGenerics(p, file)),
            properties,
            methods,
            constructor,
            start: node.pos,
            end: node.end,
            isAbstract: node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.AbstractKeyword),
            extends: node.heritageClauses && this.resolveType(node.heritageClauses[0].types[0], file) as Reference
        });
    }

    handleInterface(node: ts.InterfaceDeclaration, file: ts.SourceFile) : void {
        const module = this.moduleFromFile(file);
        if (!module) return;
        module.interfaces.push({
            name: node.name.text,
            properties: node.members.map(m => this.resolveProperty(m as ts.PropertySignature, file)),
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

    forEachModule<R>(module: Module, cb: (module: Module) => R, final?: R) : R|undefined {
        const firstCb = cb(module);
        if (firstCb) return firstCb;
        for (const [, mod] of module.modules) {
            const res = this.forEachModule(mod, cb);
            if (res) return res;
        }
        return final;
    } 

    resolveType(type: ts.Node, file: ts.SourceFile) : TypeOrLiteral|undefined {
        if (ts.isTypeReferenceNode(type) || ts.isExpressionWithTypeArguments(type)) {
            let name: string;
            if (ts.isTypeReferenceNode(type)) name = type.typeName.getText(file);
            else {
                if (ts.isIdentifier(type.expression)) name = type.expression.text;
                else return {
                    name: type.getText(file),
                    kind: TypeKinds.STRINGIFIED
                };
            }
            if (this.references.has(name)) return this.references.get(name) as Reference;
            const path: Array<string> = [];
            return this.forEachModule<TypeOrLiteral|undefined>(this.module, (module) => {
                if (module.classes.some(cl => cl.name === name)) {
                    if (!module.isGlobal) path.push(module.name);
                    return {
                        name,
                        path,
                        kind: TypeKinds.CLASS,
                        typeParameters: type.typeArguments && type.typeArguments.map(arg => this.resolveType(arg, file))
                    } as TypeOrLiteral;
                }
                else if (module.interfaces.some(inter => inter.name === name)) {
                    if (!module.isGlobal) path.push(module.name);
                    return {
                        name,
                        path,
                        kind: TypeKinds.INTERFACE,
                        typeParameters: type.typeArguments && type.typeArguments.map(arg => this.resolveType(arg, file))
                    } as TypeOrLiteral;
                }
                else if (module.enums.some(en => en.name === name)) {
                    if (!module.isGlobal) path.push(module.name);
                    return {
                        name,
                        path,
                        kind: TypeKinds.ENUM,
                        typeParameters: type.typeArguments && type.typeArguments.map(arg => this.resolveType(arg, file))
                    } as TypeOrLiteral;
                }
                else return undefined;
            }, {
                name,
                kind: TypeKinds.UNKNOWN,
                typeParameters: type.typeArguments && type.typeArguments.map(arg => this.resolveType(arg, file))
            } as TypeOrLiteral);
        }
        else if (ts.isFunctionTypeNode(type)) {
            return {
                typeParameters: type.typeParameters && type.typeParameters.map(p => this.resolveGenerics(p, file)),
                returnType: this.resolveType(type.type, file),
                parameters: type.parameters.map(p => this.resolveParameter(p, file)),
                kind: TypeKinds.ARROW_FUNCTION
            } as ArrowFunction;
        }
        else if (ts.isTypeLiteralNode(type)) {
            return {
                properties: type.members.map(p => this.resolveProperty(p as ts.PropertySignature, file)),
                kind: TypeKinds.OBJECT_LITERAL
            } as ObjectLiteral;
        }
        else switch (type.kind) {
        case ts.SyntaxKind.NumberKeyword: return {name: "number", kind: TypeKinds.NUMBER};
        case ts.SyntaxKind.StringKeyword: return {name: "string", kind: TypeKinds.STRING};
        case ts.SyntaxKind.BooleanKeyword: return {name: "boolean", kind: TypeKinds.BOOLEAN};
        case ts.SyntaxKind.TrueKeyword: return { name: "true", kind: TypeKinds.TRUE};
        case ts.SyntaxKind.FalseKeyword: return { name: "false", kind: TypeKinds.FALSE};
        case ts.SyntaxKind.UndefinedKeyword: return { name: "undefined", kind: TypeKinds.UNDEFINED};
        case ts.SyntaxKind.NullKeyword: return { name: "null", kind: TypeKinds.NULL};
        case ts.SyntaxKind.VoidKeyword: return { name: "void", kind: TypeKinds.VOID };
        case ts.SyntaxKind.AnyKeyword: return { name: "any", kind: TypeKinds.ANY };
        default: return {name: "unknown", kind: TypeKinds.UNKNOWN};
        }
    }

    resolveGenerics(generic: ts.TypeParameterDeclaration, file: ts.SourceFile) : TypeParameter {
        return {
            name: generic.name.text,
            default: generic.default ? this.resolveType(generic.default, file) : undefined,
            constraint: generic.constraint ? this.resolveType(generic.constraint, file) : undefined
        } as TypeParameter;
    }

    resolveParameter(param: ts.ParameterDeclaration, file: ts.SourceFile) : FunctionParameter {
        return {
            name: param.name.getText(file),
            optional: Boolean(param.questionToken),
            rest: Boolean(param.dotDotDotToken),
            type: param.type && this.resolveType(param.type, file),
            start: param.pos,
            end: param.end
        };
    }

    resolveProperty(prop: ts.TypeElement, file: ts.SourceFile) : InterfaceProperty|IndexSignatureDeclaration {
        if (ts.isPropertySignature(prop)) return {
            name: prop.name.getText(file),
            type: prop.type && this.resolveType(prop.type, file),
            optional: Boolean(prop.questionToken),
            start: prop.pos,
            end: prop.end
        };
        else {
            const param = (prop as ts.IndexSignatureDeclaration).parameters[0];
            return {
                key: param.type && this.resolveType(param.type, file),
                type: this.resolveType((prop as ts.IndexSignatureDeclaration).type, file),
                start: prop.pos,
                end: prop.end
            } as IndexSignatureDeclaration;
        }
    }

} 