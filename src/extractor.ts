
import {ArrowFunction, ConstantDecl, createModule, FunctionParameter, Module, ObjectLiteral, Reference, TypeKinds, TypeOrLiteral, TypeParameter, InterfaceProperty, IndexSignatureDeclaration, ReferenceType, JSDocData, InterfaceDecl, ClassDecl } from "./structure";
import * as ts from "typescript";

export class TypescriptExtractor {
    module: Module
    referencesNames: Map<string, ReferenceType>
    referencesSymbols: Map<ts.Symbol, ReferenceType>
    baseDir: string
    visitor: (node: ts.Node, file: ts.SourceFile) => void
    currentModule: Module
    checker: ts.TypeChecker
    constructor(globalModule: Module, baseDir: string, checker: ts.TypeChecker) {
        this.module = globalModule;
        this.currentModule = this.module;
        this.referencesNames = new Map();
        this.referencesSymbols = new Map();
        this.baseDir = baseDir;
        this.checker = checker;
        this.visitor = this._visitor.bind(this);
    }

    runOnFile(file: ts.SourceFile) : void {
        this.currentModule = this.moduleFromFile(file) as unknown as Module;
        for (const stmt of file.statements) {
            this._visitor(stmt, file);
        }
    }

    _visitor(node: ts.Node, file: ts.SourceFile) : void {
        if (!(node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword))) return;
        if (ts.isVariableStatement(node)) return this.handleVariableDeclaration(node, file);
        else if (ts.isClassDeclaration(node)) return this.handleClassDeclaration(node, file);
        else if (ts.isInterfaceDeclaration(node)) return this.handleInterfaceDeclaration(node, file);
        else if (ts.isEnumDeclaration(node)) return this.handleEnumDeclaration(node, file);
        else if (ts.isFunctionDeclaration(node)) return this.handleFunctionDeclaration(node, file);
        else if (ts.isTypeAliasDeclaration(node)) return this.handleTypeDeclaration(node, file);
        else if (ts.isModuleDeclaration(node)) return ts.forEachChild(node, (child) => this.visitor(child, file));
    }

    handleTypeDeclaration(node: ts.TypeAliasDeclaration, file: ts.SourceFile) : void {
        this.currentModule.types.push({
            name: node.name.text,
            value: this.resolveType(node.type, file),
            start: node.pos,
            end: node.end,
            sourceFile: file.fileName,
            jsDoc: this.getJSDocData(node)
        });
    }

    handleFunctionDeclaration(node: ts.FunctionDeclaration, file: ts.SourceFile) : void {
        this.currentModule.functions.push({
            name: node.name?.text,
            parameters: node.parameters.map(p => this.resolveParameter(p, file)),
            typeParameters: node.typeParameters && node.typeParameters.map(p => this.resolveGenerics(p, file)),
            returnType: node.type && this.resolveType(node.type, file),
            start: node.pos,
            end: node.end,
            sourceFile: file.fileName,
            jsDoc: this.getJSDocData(node)
        });
    }

    handleVariableDeclaration(node: ts.VariableStatement, file: ts.SourceFile) : void {
        const declarations: Array<ConstantDecl> = [];
        for (const declaration of node.declarationList.declarations) {
            if (!declaration.initializer) continue;
            declarations.push({
                name: declaration.name.getText(),
                //content: declaration.initializer.getText(file),
                start: node.pos,
                end: node.end,
                type: declaration.type ? this.resolveType(declaration.type, file) : undefined,
                sourceFile: file.fileName,
                jsDoc: this.getJSDocData(node)
            });
        }
        this.currentModule.constants.push(...declarations);
    }

    handleEnumDeclaration(node: ts.EnumDeclaration, file: ts.SourceFile) : void {
        this.currentModule.enums.push({
            name: node.name.text,
            const: Boolean(node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ConstKeyword)),
            members: node.members.map(m => ({
                name: m.name.getText(),
                initializer: m.initializer && m.initializer.getText(),
                start: m.pos,
                end: m.end,
            })),
            start: node.pos,
            end: node.end,
            sourceFile: file.fileName,
            jsDoc: this.getJSDocData(node)
        });
    }

    handleClassDeclaration(node: ts.ClassDeclaration, file: ts.SourceFile) : void {
        const res: ClassDecl = {
            name: node.name?.text,
            typeParameters: node.typeParameters && node.typeParameters.map(p => this.resolveGenerics(p, file)),
            properties: [],
            methods: [],
            constructor: undefined,
            start: node.pos,
            end: node.end,
            isAbstract: node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.AbstractKeyword),
            sourceFile: file.fileName,
            jsDoc: this.getJSDocData(node)
        };
        this.currentModule.classes.push(res);
        for (const member of node.members) {
            let isStatic, isPrivate, isProtected, isReadonly, isAbstract;
            if (member.modifiers) {
                for (const modifier of member.modifiers) {
                    if (modifier.kind === ts.SyntaxKind.StaticKeyword) isStatic = true;
                    else if (modifier.kind === ts.SyntaxKind.ProtectedKeyword) isProtected = true;
                    else if (modifier.kind === ts.SyntaxKind.PrivateKeyword) isPrivate = true;
                    else if (modifier.kind === ts.SyntaxKind.ReadonlyKeyword) isReadonly = true;
                    else if (modifier.kind === ts.SyntaxKind.AbstractKeyword) isAbstract = true;
                }
            }
            if (ts.isPropertyDeclaration(member)) {
                res.properties.push({
                    name: member.name.getText(),
                    type: member.type && this.resolveType(member.type, file),
                    start: member.pos,
                    isOptional: Boolean(member.questionToken),
                    end: member.end,
                    isPrivate, isProtected, isStatic, isReadonly, isAbstract, 
                    jsDoc: this.getJSDocData(member)
                });
            }
            else if (ts.isMethodDeclaration(member)) {
                res.methods.push({
                    name: member.name.getText(),
                    returnType: member.type && this.resolveType(member.type, file),
                    typeParameters: member.typeParameters && member.typeParameters.map(p => this.resolveGenerics(p, file)),
                    parameters: member.parameters.map(p => this.resolveParameter(p, file)),
                    start: member.pos,
                    end: member.end,
                    isPrivate, isProtected, isStatic, isAbstract,
                    jsDoc: this.getJSDocData(member)
                });
            }
            else if (ts.isConstructorDeclaration(member)) {
                res.constructor = {
                    parameters: member.parameters.map(p => this.resolveParameter(p, file)),
                    start: member.pos,
                    end: member.pos
                };
            }
        }
        if (node.heritageClauses) {
            const extendsClause = node.heritageClauses.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword);
            res.extends = extendsClause && this.resolveHeritage(extendsClause.types[0], file) as Reference;
            const implementsClauses = node.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ImplementsKeyword);
            res.implements = implementsClauses && implementsClauses.types.map(clause => this.resolveHeritage(clause, file));
        }
    }

    handleInterfaceDeclaration(node: ts.InterfaceDeclaration, file: ts.SourceFile) : void {
        const res: InterfaceDecl = {
            name: node.name.text,
            start: node.pos,
            end: node.end,
            sourceFile: file.fileName,
            properties: [],
            jsDoc: this.getJSDocData(node)
        };
        this.currentModule.interfaces.push(res);
        res.properties = node.members.map(m => this.resolveProperty(m as ts.PropertySignature, file));
        if (node.heritageClauses) {
            const extendsClause = node.heritageClauses.find(c => c.token === ts.SyntaxKind.ExtendsKeyword);
            res.extends = extendsClause && this.resolveHeritage(extendsClause.types[0], file);
            const implementsClause = node.heritageClauses.find(c => c.token === ts.SyntaxKind.ImplementsKeyword);
            res.implements = implementsClause && implementsClause.types.map(impl => this.resolveType(impl, file));
        }
    }

    moduleFromFile(file: ts.SourceFile) : Module|undefined {
        let paths = file.fileName.split("/");
        paths.pop(); // Remove the filename
        paths = paths.slice(paths.indexOf(this.baseDir) + 1);
        if (paths.length === 0) return this.module;
        let lastModule = this.module;        
        for (const pathPart of paths) {
            const newLastMod = lastModule.modules.get(pathPart);
            if (!newLastMod) {
                const mod = createModule(pathPart);
                lastModule.modules.set(pathPart, mod);
                lastModule = mod;
            } else lastModule = newLastMod;
        }
        return lastModule;
    }

    forEachModule<R>(module: Module, cb: (module: Module) => R|undefined, final: R) : R {
        const firstCb = cb(module);
        if (firstCb) return firstCb;
        for (const [, mod] of module.modules) {
            const res = this.forEachModule(mod, cb, final);
            if (res) return res;
        }
        return final;
    } 

    getReferenceTypeFromName(name: string) : ReferenceType {
        const path: Array<string> = [];
        return this.forEachModule<ReferenceType>(this.module, (module) => {
            if (module.classes.some(cl => cl.name === name)) {
                if (!module.isGlobal) path.push(module.name);
                return {
                    name,
                    path,
                    kind: TypeKinds.CLASS,
                };
            }
            else if (module.interfaces.some(inter => inter.name === name)) {
                if (!module.isGlobal) path.push(module.name);
                return {
                    name,
                    path,
                    kind: TypeKinds.INTERFACE
                };
            }
            else if (module.enums.some(en => en.name === name)) {
                if (!module.isGlobal) path.push(module.name);
                return {
                    name,
                    path,
                    kind: TypeKinds.ENUM
                };
            }
            else if (module.types.some(en => en.name === name)) {
                if (!module.isGlobal) path.push(module.name);
                return {
                    name,
                    path,
                    kind: TypeKinds.TYPE_ALIAS
                };
            }
            else return undefined;
        }, {
            name,
            kind: TypeKinds.UNKNOWN
        });
    }

    resolveType(type: ts.Node, file: ts.SourceFile) : TypeOrLiteral {
        if (ts.isTypeReferenceNode(type)) {
            const name = type.typeName.getText();
            const symbol = this.checker.getSymbolAtLocation(type.typeName);
            const typeParameters = type.typeArguments && type.typeArguments.map(arg => this.resolveType(arg, file));
            if (!symbol) return {
                type: { name: "Unknown", kind: TypeKinds.UNKNOWN},
                typeParameters
            };
            if (this.referencesSymbols.has(symbol)) return {type: this.referencesSymbols.get(symbol) as ReferenceType, typeParameters};
            if (this.referencesNames.has(name)) return {type: this.referencesNames.get(name) as ReferenceType, typeParameters};
            const ref = this.getReferenceTypeFromName(name);
            this.referencesNames.set(name, ref);
            this.referencesSymbols.set(symbol, ref);
            return {type: ref, typeParameters};
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
        else if (ts.isUnionTypeNode(type)) {
            return {
                types: type.types.map(t => this.resolveType(t, file)),
                kind: TypeKinds.UNION,
                start: type.pos,
                end: type.end
            };
        }
        else if (ts.isTupleTypeNode(type)) {
            return {
                types: type.elements.map(el => this.resolveType(el, file)),
                kind: TypeKinds.TUPLE,
                start: type.pos,
                end: type.end
            };
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
            name: param.name.getText(),
            isOptional: Boolean(param.questionToken),
            rest: Boolean(param.dotDotDotToken),
            type: param.type && this.resolveType(param.type, file),
            start: param.pos,
            end: param.end,
            jsDoc: { comment: this.getJSDocCommentOfParam(param) }
        };
    }

    resolveHeritage(param: ts.ExpressionWithTypeArguments, file: ts.SourceFile) : TypeOrLiteral {
        if (ts.isIdentifier(param.expression)) {
            const name = param.expression.text;
            if (this.referencesNames.has(name)) return this.referencesNames.get(name) as TypeOrLiteral;
            return {
                type: this.getReferenceTypeFromName(name),
                typeParameters: param.typeArguments?.map(arg => this.resolveType(arg, file))
            };
        }
        return {
            type: {
                name: param.expression.getText(),
                kind: TypeKinds.STRINGIFIED
            },
            typeParameters: param.typeArguments?.map(arg => this.resolveType(arg, file))
        };
    }
    

    resolveProperty(prop: ts.TypeElement, file: ts.SourceFile) : InterfaceProperty|IndexSignatureDeclaration {
        if (ts.isPropertySignature(prop)) return {
            name: prop.name.getText(),
            type: prop.type && this.resolveType(prop.type, file),
            isOptional: Boolean(prop.questionToken),
            isReadonly: prop.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ReadonlyKeyword),
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

    getJSDocCommentOfParam(node: ts.ParameterDeclaration) : string|undefined {
        const tag = ts.getJSDocParameterTags(node)[0];
        if (!tag) return;
        return ts.getTextOfJSDocComment(tag.comment);
    }

    getJSDocData(node: ts.Node) : JSDocData|undefined {
        //@ts-expect-error Internal access - Why is this internal??
        const jsDoc = node.jsDoc as Array<ts.JSDoc>;
        if (!jsDoc || !jsDoc.length) return undefined;
        const tagsLoc = jsDoc[0];
        let tags;
        if (tagsLoc.tags) {
            tags = [];
            for (const tag of tagsLoc.tags) {
                tags.push(tag.tagName.text);
            }
        }
        return {
            comment: jsDoc.map(doc => ts.getTextOfJSDocComment(doc.comment)).join("\n"),
            tags
        };
    }

} 