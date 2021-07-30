
import {ArrowFunction, ConstantDecl, createModule, FunctionParameter, Module, ObjectLiteral, Reference, TypeKinds, TypeOrLiteral, TypeParameter, InterfaceProperty, IndexSignatureDeclaration, ReferenceType, JSDocData, InterfaceDecl, ClassDecl, TypeDecl, Loc, JSDocTag } from "../structure";
import ts from "typescript";
import { getLastItemFromPath, hasBit } from "../util";

const EXCLUDED_TYPE_REFS = ["Promise", "Array", "Map", "IterableIterator", "Set", "Function", "unknown", "Record", "Omit", "Symbol", "Buffer", "Error", "URL", "EventTarget", "URLSearchParams", ""];

export interface TypescriptExtractorHooks {
    getReference: (symbol: ts.Symbol) => ReferenceType|undefined,
    resolveSymbol: (symbol: ts.Symbol) => ReferenceType|undefined
}

export class TypescriptExtractor {
    module: Module
    references: Map<string, ReferenceType>
    baseDir: string
    currentModule: Module
    checker: ts.TypeChecker
    repository?: string
    private moduleCache: Record<string, Module>
    private hooks: TypescriptExtractorHooks
    private namespaceCache: Record<string, Module>
    constructor(globalModule: Module, baseDir: string, reposiotry: string|undefined, checker: ts.TypeChecker, hooks: TypescriptExtractorHooks) {
        this.module = globalModule;
        this.currentModule = this.module;
        this.references = new Map();
        this.baseDir = baseDir;
        this.checker = checker;
        this.hooks = hooks;
        this.repository = reposiotry;
        this.moduleCache = {};
        this.namespaceCache = {};
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
        else if (ts.isModuleDeclaration(node) && node.body && ts.isModuleBlock(node.body)) {
            const currModule = this.currentModule;
            this.currentModule = this.namespaceCache[node.name.text]
            for (const stmt of node.body.statements) this._visitor(stmt);
            this.currentModule = currModule;
        }
    }

    _preparer(node: ts.Node) : void {
        const sourceFile = node.getSourceFile();
        if (ts.isClassDeclaration(node)) {
            this.currentModule.classes.set(node.name?.text || "export default", {
                name: node.name?.text,
                typeParameters: node.typeParameters && node.typeParameters.map(p => this.resolveGenerics(p)),
                properties: [],
                methods: [],
                loc: this.getLOC(node, sourceFile),
                constructor: undefined,
                isAbstract: node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.AbstractKeyword),
                jsDoc: this.getJSDocData(node),
                isExported: node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
            });
        } else if (ts.isInterfaceDeclaration(node)) {
            const existing = this.currentModule.interfaces.get(node.name.text);
            if (existing) {
                existing.loc.push(this.getLOC(node, sourceFile));
                return;
            }
            this.currentModule.interfaces.set(node.name.text, {
                name: node.name.text,
                loc: [this.getLOC(node, sourceFile)],
                properties: [],
                jsDoc: this.getJSDocData(node),
                isExported: node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
            });
        } else if (ts.isEnumDeclaration(node)) {
            const existing = this.currentModule.enums.get(node.name.text);
            if (existing) {
                existing.loc.push(this.getLOC(node, sourceFile));
                existing.members.push(...node.members.map(m => ({
                    name: m.name.getText(),
                    initializer: m.initializer && m.initializer.getText(),
                    loc: this.getLOC(m),
                })));
                return;
            }
            this.currentModule.enums.set(node.name.text, {
                name: node.name.text,
                const: Boolean(node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ConstKeyword)),
                members: node.members.map(m => ({
                    name: m.name.getText(),
                    initializer: m.initializer && m.initializer.getText(),
                    loc: this.getLOC(m),
                })),
                loc: [this.getLOC(node, sourceFile)],
                jsDoc: this.getJSDocData(node),
                isExported: node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
            });
        } else if (ts.isTypeAliasDeclaration(node)) {
            this.currentModule.types.set(node.name.text, {
                name: node.name.text,
                loc: this.getLOC(node, sourceFile),
                jsDoc: this.getJSDocData(node),
                isExported: node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
            });
        } else if (ts.isModuleDeclaration(node) && node.body && ts.isModuleBlock(node.body)) {
            const currModule = this.currentModule;
            this.currentModule = this.namespaceCache[node.name.text] ? this.namespaceCache[node.name.text] : createModule(node.name.text, false, this.getLOC(node, node.getSourceFile(), false).sourceFile, true);
            currModule.modules.set(node.name.text, this.currentModule);
            this.namespaceCache[node.name.text] = this.currentModule;
            for (const stmt of node.body.statements) this._preparer(stmt);
            this.currentModule = currModule;
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
            loc: this.getLOC(node),
            jsDoc: this.getJSDocData(node)
        });
    }

    handleVariableDeclaration(node: ts.VariableStatement) : void {
        const declarations: Array<ConstantDecl> = [];
        for (const declaration of node.declarationList.declarations) {
            if (!declaration.initializer) continue;
            declarations.push({
                name: declaration.name.getText(),
                loc: this.getLOC(declaration),
                type: declaration.type ? this.resolveType(declaration.type) : undefined,
                jsDoc: this.getJSDocData(node)
            });
        }
        this.currentModule.constants.push(...declarations);
    }

    handleClassDeclaration(node: ts.ClassDeclaration) : void {
        const res = this.currentModule.classes.get(node.name?.text || "export default") as ClassDecl;
        const sourceFile = node.getSourceFile();
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
                    loc: this.getLOC(member, sourceFile),
                    isOptional: Boolean(member.questionToken),
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
                    loc: this.getLOC(member, sourceFile),
                    isPrivate, isProtected, isStatic, isAbstract,
                    jsDoc: this.getJSDocData(member)
                });
            }
            else if (ts.isConstructorDeclaration(member)) {
                res.constructor = {
                    parameters: member.parameters.map(p => this.resolveParameter(p))
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
        res.properties.push(...node.members.map(m => this.resolveProperty(m as ts.PropertySignature)));
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
                const mod = createModule(pathPart, false, `${lastModule.repository}/${pathPart}`);
                lastModule.modules.set(pathPart, mod);
                lastModule = mod;
            } else lastModule = newLastMod;
        }
        return lastModule;
    }

    forEachModule<R>(module: Module, cb: (module: Module, path: Array<string>) => R|undefined, pathToMod: Array<string> = []) : R|undefined {
        const firstCb = cb(module, pathToMod);
        if (firstCb) return firstCb;
        for (const [, mod] of module.modules) {
            const res = this.forEachModule(mod, cb, [...pathToMod, mod.name]);
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

    getReferenceTypeFromSymbol(symbol: ts.Symbol, moduleName?: string) : ReferenceType|undefined {
        const name = symbol.name;
        if (hasBit(symbol.flags, ts.SymbolFlags.Class)) return this.forEachModule<ReferenceType>(this.module, (module, path) => {
                if ((moduleName && module.name !== moduleName) || !module.classes.has(name)) return this.hooks.resolveSymbol(symbol);;
                return { name, path, kind: TypeKinds.CLASS }
        });
        else if (hasBit(symbol.flags, ts.SymbolFlags.Interface)) return this.forEachModule<ReferenceType>(this.module, (module, path) => {
            if ((moduleName && module.name !== moduleName) || !module.interfaces.has(name)) return this.hooks.resolveSymbol(symbol);;
            return { name, path, kind: TypeKinds.INTERFACE };
        });
        else if (hasBit(symbol.flags, ts.SymbolFlags.Enum)) {
            return this.forEachModule<ReferenceType>(this.module, (module, path) => {
            if ((moduleName && module.name !== moduleName) || !module.enums.has(name)) return this.hooks.resolveSymbol(symbol);
            return { name, path, kind: TypeKinds.ENUM };
        });
    }
        else if (hasBit(symbol.flags, ts.SymbolFlags.TypeAlias)) return this.forEachModule<ReferenceType>(this.module, (module, path) => {
            if ( (moduleName && module.name !== moduleName) || !module.types.has(name) ) return this.hooks.resolveSymbol(symbol);
            return { name, path, kind: TypeKinds.TYPE_ALIAS };
        });
        else return this.forEachModule<ReferenceType>(this.module, (module, path) => {
            if ((moduleName && module.name !== moduleName)) return this.hooks.resolveSymbol(symbol);;
            if (module.classes.has(name)) return { name, path, kind: TypeKinds.CLASS };
            else if (module.interfaces.has(name)) return { name, path, kind: TypeKinds.INTERFACE };
            else if (module.enums.has(name)) return { name, path, kind: TypeKinds.ENUM};
            else if (module.types.has(name)) return { name, path, kind: TypeKinds.TYPE_ALIAS };
            return undefined;
        });
    }

    resolveSymbol(symbol: ts.Symbol, typeParameters?: TypeOrLiteral[], name?: string) : TypeOrLiteral {
        if (EXCLUDED_TYPE_REFS.includes(symbol.name)) return { type: { name: symbol.name, kind: TypeKinds.DEFAULT_API }, typeParameters }
        const symbolRef = this.references.get(symbol.name) || this.hooks.getReference(symbol);
        if (symbolRef) return { type: symbolRef, typeParameters};
        const ref = this.getReferenceTypeFromSymbol(symbol) || { name: symbol.name, kind: TypeKinds.UNKNOWN };
        if (!ref.external) this.references.set(symbol.name, ref);
        return {type: ref, typeParameters};
    }

    resolveType(type: ts.Node) : TypeOrLiteral {
         if (ts.isTypeReferenceNode(type)) {
            const symbol = this.checker.getSymbolAtLocation(type.typeName);
            const typeParameters = type.typeArguments && type.typeArguments.map(arg => this.resolveType(arg));
            if (!symbol) return {
                type: { name: type.getText(), kind: TypeKinds.STRINGIFIED_UNKNOWN},
                typeParameters,
            };
            if (hasBit(symbol.flags, ts.SymbolFlags.TypeParameter)) return {
                type: { name: symbol.name, kind: TypeKinds.TYPE_PARAMETER},
                typeParameters
            };
            if (hasBit(symbol.flags, ts.SymbolFlags.ModuleMember) && symbol.declarations && ts.isModuleBlock(symbol.declarations[0].parent)) {
                const bod = symbol.declarations[0].parent.parent;
                return this.resolveSymbol(symbol, typeParameters, bod.name.text);
            }
            return this.resolveSymbol(symbol, typeParameters);
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
                kind: TypeKinds.UNION
            };
        }
        else if (ts.isIntersectionTypeNode(type)) {
            return {
                types: type.types.map(t => this.resolveType(t)),
                kind: TypeKinds.INTERSECTION
            };
        }
        else if (ts.isTupleTypeNode(type)) {
            return {
                types: type.elements.map(el => this.resolveType(el)),
                kind: TypeKinds.TUPLE
            };
        }
        else if (ts.isTypeOperatorNode(type)) {
            let kind;
            switch (type.operator) {
                case ts.SyntaxKind.UniqueKeyword:
                    kind = TypeKinds.UNIQUE_OPERATOR;
                    break;
                case ts.SyntaxKind.KeyOfKeyword:
                    kind = TypeKinds.KEYOF_OPERATOR;
                    break;
                case ts.SyntaxKind.ReadonlyKeyword:
                    kind = TypeKinds.READONLY_OPERATOR;
            }
            return {
                kind,
                type: this.resolveType(type.type)
            }
        }
        else if (ts.isArrayTypeNode(type)) {
            return {
                type: this.resolveType(type.elementType),
                kind: TypeKinds.ARRAY_TYPE
            }
        }
        else if (ts.isParenthesizedTypeNode(type)) return this.resolveType(type.type);
        else if (ts.isThisTypeNode(type)) {
            const symbol = this.checker.getSymbolAtLocation(type);
            if (!symbol) return { name: type.getText(), kind: TypeKinds.STRINGIFIED_UNKNOWN };;
            return this.resolveSymbol(symbol);
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
            type: this.resolveSymbol(this.checker.getSymbolAtLocation(param.expression) as ts.Symbol),
            typeParameters: param.typeArguments?.map(arg => this.resolveType(arg))
        } as Reference;
    }
    

    resolveProperty(prop: ts.TypeElement) : InterfaceProperty|IndexSignatureDeclaration {
        if (ts.isPropertySignature(prop)) return {
            name: prop.name.getText(),
            type: prop.type && this.resolveType(prop.type),
            isOptional: Boolean(prop.questionToken),
            isReadonly: prop.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ReadonlyKeyword),
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

    getJSDocData(node: ts.Node) : Array<JSDocData>|undefined {
        //@ts-expect-error Internal access - Why is this internal??
        const jsDoc = node.jsDoc as Array<ts.JSDoc>;
        if (!jsDoc || !jsDoc.length) return undefined;
        const res: Array<JSDocData> = [];
        for (const currentDoc of jsDoc) {
            let tags: Array<JSDocTag>|undefined = undefined;
            if (currentDoc.tags) {
                tags = [];
                for (const tag of currentDoc.tags) {
                    tags.push({
                        name: tag.tagName.text, 
                        comment: ts.getTextOfJSDocComment(tag.comment),
                        arg: (tag as {name?: ts.Identifier}).name?.text,
                        type: (tag as {typeExpression?: ts.JSDocTypeExpression}).typeExpression && this.resolveType((tag as unknown as {typeExpression: ts.JSDocTypeExpression}).typeExpression.type)
                    });
                }
            }
            res.push({comment: ts.getTextOfJSDocComment(currentDoc.comment), tags});
        }
        return res;
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

    getLOC(node: ts.Node, sourceFile = node.getSourceFile(), includeLine = true) : Loc {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        if (this.currentModule.isNamespace) return {pos, sourceFile: `${this.currentModule.repository}#L${pos.line + 1}`};
        return {
            pos,
            sourceFile: this.currentModule.repository && `${this.currentModule.repository}/${getLastItemFromPath(sourceFile.fileName)}${includeLine ? `#L${pos.line + 1}`:""}`
        };
    }

    toJSON() : Record<string, unknown> {
        return this.moduleToJSON();
    }

} 