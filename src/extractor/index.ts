
import {ArrowFunction, ConstantDecl, createModule, FunctionParameter, Module, ObjectLiteral, Reference, TypeKinds, TypeOrLiteral, TypeParameter, InterfaceProperty, IndexSignatureDeclaration, ReferenceType, JSDocData, InterfaceDecl, ClassDecl, TypeDecl } from "../structure";
import ts from "typescript";

const EXLUDED_TYPE_REFS = ["Promise", "Array", "Map", "Set", "Function", "unknown", "Record", "Omit"];

export type CrossReferenceGetter = (name: string) => ReferenceType|undefined;

export class TypescriptExtractor {
    module: Module
    references: Map<string, ReferenceType>
    moduleCache: Record<string, Module>
    baseDir: string
    private visitor: (node: ts.Node) => void
    currentModule: Module
    checker: ts.TypeChecker
    private crossReferenceGetter: CrossReferenceGetter
    constructor(globalModule: Module, baseDir: string, checker: ts.TypeChecker, crossReferenceGetter: CrossReferenceGetter) {
        this.module = globalModule;
        this.currentModule = this.module;
        this.references = new Map();
        this.baseDir = baseDir;
        this.visitor = this._visitor.bind(this);
        this.checker = checker;
        this.crossReferenceGetter = crossReferenceGetter;
        this.moduleCache = {};
    }

    runOnFile(file: ts.SourceFile) : void {
        this.currentModule = this.moduleCache[file.fileName];
        for (const stmt of file.statements) {
            this._visitor(stmt);
        }
    }

    runPreparerOnFile(file: ts.SourceFile) : void {
        this.currentModule = this.moduleFromFile(file) as Module;
        this.moduleCache[file.fileName] = this.currentModule;
        for (const stmt of file.statements) {
            this._preparer(stmt);
        }
    } 

    private _visitor(node: ts.Node) : void {
        if (ts.isVariableStatement(node) && node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) return this.handleVariableDeclaration(node);
        else if (ts.isClassDeclaration(node)) return this.handleClassDeclaration(node);
        else if (ts.isInterfaceDeclaration(node)) return this.handleInterfaceDeclaration(node);
        else if (ts.isFunctionDeclaration(node) && node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) return this.handleFunctionDeclaration(node);
        else if (ts.isTypeAliasDeclaration(node)) return this.handleTypeDeclaration(node);
        else if (ts.isModuleDeclaration(node)) return ts.forEachChild(node, (child) => this.visitor(child));
    }

    _preparer(node: ts.Node) : void {
        const sourceFile = node.getSourceFile().fileName;
        if (ts.isClassDeclaration(node)) {
            this.currentModule.classes.set(node.name?.text || "export default", {
                name: node.name?.text,
                typeParameters: node.typeParameters && node.typeParameters.map(p => this.resolveGenerics(p)),
                properties: [],
                methods: [],
                constructor: undefined,
                start: node.pos,
                end: node.end,
                isAbstract: node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.AbstractKeyword),
                sourceFile,
                jsDoc: this.getJSDocData(node),
                isExported: node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
            });
        } else if (ts.isInterfaceDeclaration(node)) {
            this.currentModule.interfaces.set(node.name.text, {
                name: node.name.text,
                start: node.pos,
                end: node.end,
                sourceFile,
                properties: [],
                jsDoc: this.getJSDocData(node),
                isExported: node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
            });
        } else if (ts.isEnumDeclaration(node)) {
            this.currentModule.enums.set(node.name.text, {
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
                sourceFile,
                jsDoc: this.getJSDocData(node),
                isExported: node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
            });
        } else if (ts.isTypeAliasDeclaration(node)) {
            this.currentModule.types.set(node.name.text, {
                name: node.name.text,
                start: node.pos,
                end: node.end,
                sourceFile,
                jsDoc: this.getJSDocData(node),
                isExported: node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
            });
        }
    }

    handleTypeDeclaration(node: ts.TypeAliasDeclaration) : void {
        const decl = this.currentModule.types.get(node.name.text) as TypeDecl;
        decl.value = this.resolveType(node.type);
    }

    handleFunctionDeclaration(node: ts.FunctionDeclaration) : void {
        this.currentModule.functions.push({
            name: node.name?.text,
            parameters: node.parameters.map(p => this.resolveParameter(p)),
            typeParameters: node.typeParameters && node.typeParameters.map(p => this.resolveGenerics(p)),
            returnType: node.type && this.resolveType(node.type),
            start: node.pos,
            end: node.end,
            sourceFile: node.getSourceFile().fileName,
            jsDoc: this.getJSDocData(node)
        });
    }

    handleVariableDeclaration(node: ts.VariableStatement) : void {
        const declarations: Array<ConstantDecl> = [];
        for (const declaration of node.declarationList.declarations) {
            if (!declaration.initializer) continue;
            declarations.push({
                name: declaration.name.getText(),
                start: node.pos,
                end: node.end,
                type: declaration.type ? this.resolveType(declaration.type) : undefined,
                sourceFile: node.getSourceFile().fileName,
                jsDoc: this.getJSDocData(node)
            });
        }
        this.currentModule.constants.push(...declarations);
    }

    handleClassDeclaration(node: ts.ClassDeclaration) : void {
        const res = this.currentModule.classes.get(node.name?.text || "export default") as ClassDecl;
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
                    type: member.type && this.resolveType(member.type),
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
                    returnType: member.type && this.resolveType(member.type),
                    typeParameters: member.typeParameters && member.typeParameters.map(p => this.resolveGenerics(p)),
                    parameters: member.parameters.map(p => this.resolveParameter(p)),
                    start: member.pos,
                    end: member.end,
                    isPrivate, isProtected, isStatic, isAbstract,
                    jsDoc: this.getJSDocData(member)
                });
            }
            else if (ts.isConstructorDeclaration(member)) {
                res.constructor = {
                    parameters: member.parameters.map(p => this.resolveParameter(p)),
                    start: member.pos,
                    end: member.pos
                };
            }
        }
        if (node.heritageClauses) {
            const extendsClause = node.heritageClauses.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword);
            res.extends = extendsClause && this.resolveHeritage(extendsClause.types[0]) as Reference;
            const implementsClauses = node.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ImplementsKeyword);
            res.implements = implementsClauses && implementsClauses.types.map(clause => this.resolveHeritage(clause));
        }
    }

    handleInterfaceDeclaration(node: ts.InterfaceDeclaration) : void {
        const res = this.currentModule.interfaces.get(node.name.text) as InterfaceDecl;
        res.properties = node.members.map(m => this.resolveProperty(m as ts.PropertySignature));
        if (node.heritageClauses) {
            const extendsClause = node.heritageClauses.find(c => c.token === ts.SyntaxKind.ExtendsKeyword);
            res.extends = extendsClause && this.resolveHeritage(extendsClause.types[0]);
            const implementsClause = node.heritageClauses.find(c => c.token === ts.SyntaxKind.ImplementsKeyword);
            res.implements = implementsClause && implementsClause.types.map(impl => this.resolveType(impl));
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

    forEachModule<R>(module: Module, cb: (module: Module) => R|undefined) : R|undefined {
        const firstCb = cb(module);
        if (firstCb) return firstCb;
        for (const [, mod] of module.modules) {
            const res = this.forEachModule(mod, cb);
            if (res) return res;
        }
        return undefined;
    } 

    getModuleFromPath(path: Array<string>) : Module|undefined {
        const pathLen = path.length;
        if (!pathLen) return this.module;
        let module: Module|undefined = this.module;
        for (let i=0; i < pathLen; i++) {
            if (!module) return undefined;
            module = module.modules.get(path[i]);
        }
        return module;
    }

    getReferenceTypeFromName(name: string) : ReferenceType|undefined {
        if (EXLUDED_TYPE_REFS.includes(name)) return {name, kind: TypeKinds.UNKNOWN};
        const path: Array<string> = [];
        return this.forEachModule<ReferenceType>(this.module, (module) => {
            if (module.classes.has(name)) {
                if (!module.isGlobal) path.push(module.name);
                return {
                    name,
                    path,
                    kind: TypeKinds.CLASS,
                };
            }
            else if (module.interfaces.has(name)) {
                if (!module.isGlobal) path.push(module.name);
                return {
                    name,
                    path,
                    kind: TypeKinds.INTERFACE
                };
            }
            else if (module.enums.has(name)) {
                if (!module.isGlobal) path.push(module.name);
                return {
                    name,
                    path,
                    kind: TypeKinds.ENUM
                };
            }
            else if (module.types.has(name)) {
                if (!module.isGlobal) path.push(module.name);
                return {
                    name,
                    path,
                    kind: TypeKinds.TYPE_ALIAS
                };
            }
            else return this.crossReferenceGetter(name);
        });
    }

    resolveType(type: ts.Node) : TypeOrLiteral {
        if (ts.isTypeReferenceNode(type)) {
            const symbol = this.checker.getSymbolAtLocation(type.typeName);
            const typeParameters = type.typeArguments && type.typeArguments.map(arg => this.resolveType(arg));
            if (!symbol) return {
                type: { name: type.getText(), kind: TypeKinds.STRINGIFIED_UNKNOWN},
                typeParameters,
            };
            if (EXLUDED_TYPE_REFS.includes(symbol.name)) return {
                type: { name: symbol.name, kind: TypeKinds.UNKNOWN},
                typeParameters
            };
            if ((symbol.flags & ts.SymbolFlags.TypeParameter) === ts.SymbolFlags.TypeParameter) return {
                type: { name: symbol.name, kind: TypeKinds.TYPE_PARAMETER},
                typeParameters
            };
            const symbolRef = this.references.get(symbol.name);
            if (symbolRef) return { type: symbolRef, typeParameters};
        
            const ref = this.getReferenceTypeFromName(symbol.name) || { name: symbol.name, kind: TypeKinds.UNKNOWN };
            this.references.set(symbol.name, ref);
            return {type: ref, typeParameters};
        }
        else if (ts.isIdentifier(type)) {
            const name = type.text;
            const symbolRef = this.references.get(name);
            if (symbolRef) return {type: symbolRef};
            const ref = this.getReferenceTypeFromName(name) || { name, kind: TypeKinds.UNKNOWN };
            this.references.set(name, ref);
            return { type: ref };
        }
        else if (ts.isFunctionTypeNode(type)) {
            return {
                typeParameters: type.typeParameters && type.typeParameters.map(p => this.resolveGenerics(p)),
                returnType: this.resolveType(type.type),
                parameters: type.parameters.map(p => this.resolveParameter(p)),
                kind: TypeKinds.ARROW_FUNCTION
            } as ArrowFunction;
        }
        else if (ts.isTypeLiteralNode(type)) {
            return {
                properties: type.members.map(p => this.resolveProperty(p as ts.PropertySignature)),
                kind: TypeKinds.OBJECT_LITERAL
            } as ObjectLiteral;
        }
        else if (ts.isUnionTypeNode(type)) {
            return {
                types: type.types.map(t => this.resolveType(t)),
                kind: TypeKinds.UNION,
                start: type.pos,
                end: type.end
            };
        }
        else if (ts.isIntersectionTypeNode(type)) {
            return {
                types: type.types.map(t => this.resolveType(t)),
                kind: TypeKinds.INTERSECTION,
                start: type.pos,
                end: type.end
            };
        }
        else if (ts.isTupleTypeNode(type)) {
            return {
                types: type.elements.map(el => this.resolveType(el)),
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
        default: return {name: type.getText(), kind: TypeKinds.STRINGIFIED_UNKNOWN };
        }
    }

    resolveGenerics(generic: ts.TypeParameterDeclaration) : TypeParameter {
        return {
            name: generic.name.text,
            default: generic.default ? this.resolveType(generic.default) : undefined,
            constraint: generic.constraint ? this.resolveType(generic.constraint) : undefined
        } as TypeParameter;
    }

    resolveParameter(param: ts.ParameterDeclaration) : FunctionParameter {
        return {
            name: param.name.getText(),
            isOptional: Boolean(param.questionToken),
            rest: Boolean(param.dotDotDotToken),
            type: param.type && this.resolveType(param.type),
            start: param.pos,
            end: param.end,
            jsDoc: { comment: this.getJSDocCommentOfParam(param) }
        };
    }

    resolveHeritage(param: ts.ExpressionWithTypeArguments) : TypeOrLiteral {
        if (!ts.isIdentifier(param.expression)) return {
            type: {
                name: param.expression.getText(),
                kind: TypeKinds.STRINGIFIED_UNKNOWN
            },
            typeParameters: param.typeArguments?.map(arg => this.resolveType(arg))
        };
        return {
            type: this.resolveType(param.expression),
            typeParameters: param.typeArguments?.map(arg => this.resolveType(arg))
        } as Reference;
    }
    

    resolveProperty(prop: ts.TypeElement) : InterfaceProperty|IndexSignatureDeclaration {
        if (ts.isPropertySignature(prop)) return {
            name: prop.name.getText(),
            type: prop.type && this.resolveType(prop.type),
            isOptional: Boolean(prop.questionToken),
            isReadonly: prop.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ReadonlyKeyword),
            start: prop.pos,
            end: prop.end
        };
        else {
            const param = (prop as ts.IndexSignatureDeclaration).parameters[0];
            return {
                key: param.type && this.resolveType(param.type),
                type: this.resolveType((prop as ts.IndexSignatureDeclaration).type),
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
    
    moduleToJSON(module = this.module) : Record<string, unknown> {
        const clone: Record<string, unknown> = {...module};
        clone.modules = [];
        clone.classes = [...module.classes.values()];
        clone.interfaces = [...module.interfaces.values()];
        clone.types = [...module.types.values()];
        clone.enums = [...module.enums.values()];
        for (const [, mod] of module.modules) {
            (clone.modules as Array<Record<string, unknown>>).push(this.moduleToJSON(mod));
        }
        return clone;
    }

    toJSON() : Record<string, unknown> {
        return this.moduleToJSON();
    }

} 