/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from "path";
import ts from "typescript";
import { TypescriptExtractor } from ".";
import { getLastItemFromPath, getReadme, getRepository, hasBit, PackageJSON } from "../utils";
import { ArrowFunction, ClassDecl, ClassMethod, ClassProperty, createModule, FunctionParameter, IndexSignatureDeclaration, JSDocData, JSDocTag, Loc, Module, ObjectLiteral, Property, Reference, ReferenceType, Type, TypeKinds, TypeParameter, TypeReferenceKinds } from "./structure";

/**
 * Here's how the module structure works:
 * 
 * Every folder is considered a **module**, every defined thing in that folder is part of that module.
 * Inner-folders are inner-modules of that module, same with namespaces.
 */

export class Project {
    repository?: string
    readme?: string
    homepage?: string
    version?: string
    module: Module
    extractor: TypescriptExtractor
    baseDir: string
    private moduleCache: Record<string, Module>
    constructor({folderPath, extractor, packageJSON}: {
        folderPath: Array<string>, 
        extractor: TypescriptExtractor
        packageJSON: PackageJSON,
    }) {
        folderPath.pop(); // Removes the file name
        this.baseDir = folderPath[folderPath.length - 1];
        this.repository = getRepository(packageJSON);
        this.homepage = packageJSON.contents.homepage;
        this.version = packageJSON.contents.version;
        this.readme = getReadme(packageJSON.path);
        this.module = createModule(packageJSON.contents.name, [], true, this.repository && `${this.repository}/${this.baseDir}`, false);
        this.extractor = extractor;
        this.moduleCache = {};
    }

    visitor(sourceFile: ts.SourceFile|ts.Symbol) : void {
        let sym;
        if ("fileName" in sourceFile) sym = this.extractor.checker.getSymbolAtLocation(sourceFile);
        else sym = sourceFile;
        if (!sym || !sym.exports) return;

        // @ts-expect-error You should be able to do that
        for (const [, val] of sym.exports) {
            // export * from "..."
            if (val.name === "__export") {
                for (const decl of val.declarations!) {
                    if (ts.isExportDeclaration(decl) && decl.moduleSpecifier && ts.isStringLiteral(decl.moduleSpecifier)) {
                        const reExportedFile = this.resolveSourceFile(decl.getSourceFile().fileName, decl.moduleSpecifier.text);
                        if (!reExportedFile) return;
                        this.visitor(reExportedFile);
                    }
                } 
            } else this.handleSymbol(val);
        }

    }

    getOrCreateModule(source: string) : Module {
        const {dir} = path.parse(source);
        if (this.moduleCache[dir]) return this.moduleCache[dir];
        let paths = dir.split("/");
        paths = paths.slice(paths.indexOf(this.baseDir) + 1);
        if (!paths.length) {
            this.moduleCache[dir] = this.module;
            return this.module;
        }
        let lastModule = this.module;
        for (const pathPart of paths) {
            const newMod = lastModule.modules.get(pathPart);
            if (!newMod) {
                const mod = createModule(pathPart, paths, false, `${lastModule.repository}/${pathPart}`, false);
                lastModule.modules.set(pathPart, mod);
                lastModule = mod;
            } 
            else lastModule = newMod;
        }
        this.moduleCache[dir] = lastModule;
        return lastModule;
    }

    forEachModule<R>(module = this.module, cb: (module: Module, path: Array<string>) => R|undefined, pathToMod: Array<string> = []) : R|undefined {
        const firstCb = cb(module, pathToMod);
        if (firstCb) return firstCb;
        for (const [, mod] of module.modules) {
            const res = this.forEachModule(mod, cb, [...pathToMod, mod.name]);
            if (res) return res;
        }
        return undefined;
    }

    handleSymbol(val: ts.Symbol, currentModule?: Module, ignoreNamespaces?: boolean) : ReferenceType | undefined {
        if (!val.declarations || !val.declarations.length) return;
        if (this.extractor.refs.has(val)) return this.extractor.refs.get(val);
        if (!ignoreNamespaces && ts.isModuleBlock(val.declarations[0].parent)) {
            const namespaceSym = this.extractor.checker.getSymbolAtLocation(val.declarations[0].parent.parent.name);
            if (namespaceSym) {
                this.handleNamespaceDecl(namespaceSym);
                return this.extractor.refs.get(val);
            }
        }
        if (hasBit(val.flags, ts.SymbolFlags.Class)) return this.handleClassDecl(val, currentModule);
        //else if (hasBit(val.flags, ts.SymbolFlags.Interface)) return this.handleInterfaceDecl(val.declarations as Array<ts.InterfaceDeclaration>, currentModule);
        //else if (hasBit(val.flags, ts.SymbolFlags.Enum)) return this.handleEnumDecl(val.declarations as Array<ts.EnumDeclaration>, currentModule);
        //else if (hasBit(val.flags, ts.SymbolFlags.TypeAlias)) return this.handleTypeAliasDecl(val.declarations[0] as ts.TypeAliasDeclaration, currentModule);
        else if (hasBit(val.flags, ts.SymbolFlags.Module)) return this.handleNamespaceDecl(val, currentModule);
        // if (hasBit(val.flags, ts.SymbolFlags.Variable)) return this.handleVariableDecl(val.declarations[0] as ts.VariableDeclaration, currentModule);
        //else if (hasBit(val.flags, ts.SymbolFlags.Function)) return this.handleFunctionDecl(val.declarations[0] as ts.FunctionDeclaration, currentModule);
        //else if (hasBit(val.flags, ts.SymbolFlags.EnumMember)) return undefined;
        else {
            const aliased = this.resolveAliasedSymbol(val);
            if (aliased.name.includes("/")) {
                this.visitor(aliased);
                return;
            }
            return;
        }
    }

    handleClassDecl(symbol: ts.Symbol, currentModule?: Module) : ReferenceType | undefined {
        const decl = symbol.declarations![0] as ts.ClassDeclaration;
        if (!currentModule) currentModule = this.getOrCreateModule(decl.getSourceFile().fileName);
        const name = decl.name ? decl.name.text : "export default";
        const ref = {
            name,
            path: currentModule.path,
            kind: TypeReferenceKinds.CLASS,
            moduleName: this.module.name
        };
        this.extractor.refs.set(symbol, ref);
        const properties: Array<ClassProperty> = [];
        const methods = new Map<string, ClassMethod>();
        let constructor;
        for (const member of decl.members) {
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
            if (ts.isIndexSignatureDeclaration(member)) {
                const prop = this.resolveProperty(member) as ClassProperty;
                properties.push({
                    ...prop,
                    isOptional: Boolean(member.questionToken),
                    isStatic, isReadonly
                });
            }
            if (ts.isPropertyDeclaration(member)) {
                properties.push({
                    name: member.name.getText(),
                    type: member.type && this.resolveType(member.type),
                    loc: this.getLOC(currentModule, decl),
                    isOptional: Boolean(member.questionToken),
                    isPrivate, isProtected, isStatic, isReadonly, isAbstract, 
                    jsDoc: this.getJSDocData(member),
                    initializer: member.initializer && this.resolveExpressionToType(member.initializer)
                });
            }
            else if (ts.isConstructorDeclaration(member)) {
                if (!constructor) {
                    constructor = {
                        loc: this.getLOC(currentModule, member),
                        signatures: [{
                            parameters: member.parameters.map(p => this.resolveParameter(p))
                        }],
                    };
                } else {
                    constructor.signatures.push({parameters: member.parameters.map(p => this.resolveParameter(p))});
                    if (member.body) constructor.loc = this.getLOC(currentModule, member);
                }
            } 
            else if (ts.isMethodDeclaration(member)) {
                const methodName = member.name.getText();
                const method = methods.get(methodName);
                if (method) {
                    method.signatures.push({
                        returnType: this.resolveReturnType(member),
                        typeParameters: member.typeParameters && member.typeParameters.map(p => this.resolveTypeParameters(p)),
                        parameters: member.parameters.map(p => this.resolveParameter(p)),
                        jsDoc: this.getJSDocData(member)
                    });
                    if (member.body) method.loc = this.getLOC(currentModule, member);
                } else {
                    methods.set(methodName, {
                        name: methodName,
                        loc: this.getLOC(currentModule, member),
                        isPrivate, isProtected, isStatic, isAbstract,
                        jsDoc: this.getJSDocData(member),
                        signatures: [{
                            returnType: this.resolveReturnType(member),
                            typeParameters: member.typeParameters && member.typeParameters.map(p => this.resolveTypeParameters(p)),
                            parameters: member.parameters.map(p => this.resolveParameter(p)),
                            jsDoc: this.getJSDocData(member)
                        }]                        
                    });
                }
            }
            else if (ts.isGetAccessor(member)) {
                const methodName = member.name.getText();
                methods.set(methodName, {
                    name: methodName,
                    signatures: [{
                        returnType: this.resolveReturnType(member),
                        jsDoc: this.getJSDocData(member)
                    }],
                    isPrivate, isProtected, isStatic, isAbstract,
                    loc: this.getLOC(currentModule, member),
                    jsDoc: this.getJSDocData(member),
                    isGetter: true
                });
            } 
            else if (ts.isSetAccessor(member)) {
                const methodName = member.name.getText();
                methods.set(methodName, {
                    name: methodName,
                    signatures: [{
                        returnType: this.resolveReturnType(member),
                        parameters: member.parameters.map(p => this.resolveParameter(p)),
                        jsDoc: this.getJSDocData(member)
                    }],
                    isPrivate, isProtected, isStatic, isAbstract,
                    loc: this.getLOC(currentModule, member),
                    jsDoc: this.getJSDocData(member),
                    isSetter: true
                });
            }
        }
        const classObj: ClassDecl = {
            name,
            typeParameters: decl.typeParameters?.map(p => this.resolveTypeParameters(p)),
            properties,
            methods: [...methods.values()],
            loc: this.getLOC(currentModule, decl),
            jsDoc: this.getJSDocData(decl),
            isAbstract: decl.modifiers && decl.modifiers.some(m => m.kind === ts.SyntaxKind.AbstractKeyword)
        };
        if (decl.heritageClauses) {
            const extendsClause = decl.heritageClauses.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword);
            classObj.extends = extendsClause && this.resolveHeritage(extendsClause.types[0]) as Reference;
            const implementsClauses = decl.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ImplementsKeyword);
            classObj.implements = implementsClauses && implementsClauses.types.map(clause => this.resolveHeritage(clause));
        }
        currentModule.classes.push(classObj);
        return ref;
    }

    handleInterfaceDecl(_decls: Array<ts.InterfaceDeclaration>, _currentModule = this.getOrCreateModule(_decls[0].getSourceFile().fileName)) : ReferenceType | undefined {
        return undefined;
    }

    handleEnumDecl(_decls: Array<ts.EnumDeclaration>, _currentModule = this.getOrCreateModule(_decls[0].getSourceFile().fileName)) : ReferenceType | undefined {
        return undefined;
    }

    handleTypeAliasDecl(_decl: ts.TypeAliasDeclaration, _currentModule = this.getOrCreateModule(_decl.getSourceFile().fileName)) : ReferenceType | undefined {
        return undefined;
    }

    handleNamespaceDecl(symbol: ts.Symbol, currentModule?: Module) : undefined {
        const firstDecl = symbol.declarations![0]! as ts.ModuleDeclaration;
        if (!currentModule) currentModule = this.getOrCreateModule(firstDecl.getSourceFile().fileName);
        const newMod = createModule(firstDecl.name.text, [...currentModule.path, firstDecl.name.text], false, undefined, true);
        const namespaceLoc = this.getLOC(newMod, firstDecl);
        newMod.repository = namespaceLoc.sourceFile;
        currentModule.modules.set(newMod.name, newMod);
        for (const decl of (symbol.declarations as Array<ts.ModuleDeclaration>)) {
            if (!decl.body || !ts.isModuleBlock(decl.body)) continue;
            for (const element of decl.body.statements) {
                //@ts-expect-error Every namespace member has a name
                const sym = this.extractor.checker.getSymbolAtLocation(element.name);
                if (sym) this.handleSymbol(sym, newMod, true);
            }
        }
        return;
    }

    handleVariableDecl(_decl: ts.VariableDeclaration, _currentModule = this.getOrCreateModule(_decl.getSourceFile().fileName)) : ReferenceType | undefined {
        return undefined;
    }

    handleFunctionDecl(_decl: ts.FunctionDeclaration, _currentModule = this.getOrCreateModule(_decl.getSourceFile().fileName)) : ReferenceType | undefined {
        return undefined;
    }

    resolveSymbol(sym?: ts.Symbol, typeArgs?: ts.NodeArray<ts.TypeNode>) : Reference|undefined {
        if (!sym) return;
        sym = this.resolveAliasedSymbol(sym);
        const typeArguments = typeArgs?.map(arg => this.resolveType(arg));
        if (hasBit(sym.flags, ts.SymbolFlags.TypeParameter)) return {
            type: { name: sym.name, kind: TypeReferenceKinds.TYPE_PARAMETER },
            typeArguments,
            kind: TypeKinds.REFERENCE
        };
        if (this.extractor.refs.has(sym)) return {
            kind: TypeKinds.REFERENCE,
            typeArguments,
            type: this.extractor.refs.get(sym)!
        } as Reference;
        // Todo: External types
        const newlyCreated = this.handleSymbol(sym);
        if (newlyCreated) return { kind: TypeKinds.REFERENCE, typeArguments, type: newlyCreated };
        return;
    }

    resolveType(type: ts.Node) : Type {
        if (ts.isTypeReferenceNode(type)) {
            const foundType = this.resolveSymbol(this.extractor.checker.getSymbolAtLocation(type.typeName), type.typeArguments);
            if (!foundType) return { kind: TypeKinds.UNKNOWN };
            return foundType;
        }
        else if (ts.isFunctionTypeNode(type)) {
            return {
                typeParameters: type.typeParameters && type.typeParameters.map(p => this.resolveTypeParameters(p)),
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
        else if (ts.isTypePredicateNode(type)) {
            if (ts.isThisTypeNode(type.parameterName)) return { kind: TypeKinds.TYPE_PREDICATE, parameter: { kind: TypeKinds.THIS }, type: type.type && this.resolveType(type.type) };
            else return {
                kind: TypeKinds.TYPE_PREDICATE,
                parameter: type.parameterName.text
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
            };
        }
        else if (ts.isArrayTypeNode(type)) {
            return {
                type: this.resolveType(type.elementType),
                kind: TypeKinds.ARRAY_TYPE
            };
        }
        else if (ts.isInferTypeNode(type)) {
            return {
                kind: TypeKinds.INFER_TYPE,
                typeParameter: this.resolveTypeParameters(type.typeParameter)
            };
        }
        else if (ts.isParenthesizedTypeNode(type)) return this.resolveType(type.type);
        else if (ts.isThisTypeNode(type)) {
            const resolvedType = this.resolveSymbol(this.extractor.checker.getSymbolAtLocation(type));
            if (!resolvedType) return { name: "this", kind: TypeKinds.STRINGIFIED_UNKNOWN };
            return resolvedType;
        }
        else if (ts.isMappedTypeNode(type)) {
            return {
                typeParameter: type.typeParameter.name.text,
                optional: Boolean(type.questionToken),
                type: type.type && this.resolveType(type.type),
                constraint: type.typeParameter.constraint && this.resolveType(type.typeParameter.constraint),
                kind: TypeKinds.MAPPED_TYPE
            };
        }
        else if (ts.isConditionalTypeNode(type)) {
            return {
                checkType: this.resolveType(type.checkType),
                extendsType: this.resolveType(type.extendsType),
                trueType: this.resolveType(type.trueType),
                falseType: this.resolveType(type.falseType),
                kind: TypeKinds.CONDITIONAL_TYPE
            };
        }
        else if (ts.isTemplateLiteralTypeNode(type)) {
            return {
                head: type.head.text,
                spans: type.templateSpans.map(sp => ({type: this.resolveType(sp.type), text: sp.literal.text})),
                kind: TypeKinds.TEMPLATE_LITERAL
            };
        }
        else if (ts.isIndexedAccessTypeNode(type)) {
            return {
                object: this.resolveType(type.objectType),
                index: this.resolveType(type.indexType),
                kind: TypeKinds.INDEX_ACCESS
            };
        }
        else if (ts.isTypeQueryNode(type)) {
            const sym = this.extractor.checker.getSymbolAtLocation(type.exprName);
            if (!sym) return { kind: TypeKinds.UNKNOWN };
            return {
                type: this.resolveSymbol(sym),
                kind: TypeKinds.TYPEOF_OPERATOR
            };
        }
        else switch (type.kind) {
        //@ts-expect-error This shouldn't be erroring.
        case ts.SyntaxKind.LiteralType: return this.resolveType((type as unknown as ts.LiteralType).literal);
        case ts.SyntaxKind.NumberKeyword: return {name: "number", kind: TypeKinds.NUMBER};
        case ts.SyntaxKind.StringKeyword: return {name: "string", kind: TypeKinds.STRING};
        case ts.SyntaxKind.BooleanKeyword: return {name: "boolean", kind: TypeKinds.BOOLEAN};
        case ts.SyntaxKind.TrueKeyword: return { name: "true", kind: TypeKinds.TRUE};
        case ts.SyntaxKind.FalseKeyword: return { name: "false", kind: TypeKinds.FALSE};
        case ts.SyntaxKind.UndefinedKeyword: return { name: "undefined", kind: TypeKinds.UNDEFINED};
        case ts.SyntaxKind.NullKeyword: return { name: "null", kind: TypeKinds.NULL };
        case ts.SyntaxKind.VoidKeyword: return { name: "void", kind: TypeKinds.VOID };
        case ts.SyntaxKind.AnyKeyword: return { name: "any", kind: TypeKinds.ANY };
        case ts.SyntaxKind.UnknownKeyword: return { name: "unknown", kind: TypeKinds.UNKNOWN };
        case ts.SyntaxKind.BigIntLiteral:
        case ts.SyntaxKind.NumericLiteral: return { name: type.getText(), kind: TypeKinds.NUMBER_LITERAL};
        case ts.SyntaxKind.StringLiteral: return { name: type.getText(), kind: TypeKinds.STRING_LITERAL };
        case ts.SyntaxKind.SymbolKeyword: return { name: "symbol", kind: TypeKinds.SYMBOL };
        case ts.SyntaxKind.BigIntKeyword: return { name: "bigint", kind: TypeKinds.BIGINT };
        case ts.SyntaxKind.NeverKeyword: return { name: "never", kind: TypeKinds.NEVER };
        case ts.SyntaxKind.ObjectKeyword: return { name: "object", kind: TypeKinds.OBJECT };
        default: return {name: type.getText(), kind: TypeKinds.STRINGIFIED_UNKNOWN };
        }
    }

    resolveReturnType(fn: ts.MethodDeclaration|ts.FunctionDeclaration|ts.GetAccessorDeclaration|ts.SetAccessorDeclaration) : Type | undefined {
        if (fn.type) return this.resolveType(fn.type);
        const sig = this.extractor.checker.getSignatureFromDeclaration(fn);
        if (!sig) return;
        const type = this.extractor.checker.getReturnTypeOfSignature(sig);
        if (!type) return;
        const sym = type.getSymbol();
        if (!sym) return;
        const res = this.resolveSymbol(sym);
        if (!res) return;
        //@ts-expect-error Internal API
        res.typeArguments = type.resolvedTypeArguments && type.resolvedTypeArguments.map(t => {
            const symbol = t.getSymbol();
            if (!symbol) return { kind: TypeKinds.ANY, name: "any" };
            return this.resolveSymbol(symbol);
        });
        return;
    }

    resolveTypeParameters(generic: ts.TypeParameterDeclaration) : TypeParameter {
        return {
            name: generic.name.text,
            default: generic.default ? this.resolveType(generic.default) : undefined,
            constraint: generic.constraint ? this.resolveType(generic.constraint) : undefined
        } as TypeParameter;
    }

    resolveProperty(prop: ts.TypeElement) : Property|IndexSignatureDeclaration|ArrowFunction {
        if (ts.isPropertySignature(prop)) return {
            name: prop.name.getText(),
            type: prop.type && this.resolveType(prop.type),
            isOptional: Boolean(prop.questionToken),
            isReadonly: prop.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ReadonlyKeyword)
        };
        else if (ts.isMethodSignature(prop)) return {
            name: prop.name.getText(),
            parameters: prop.parameters.map(p => this.resolveParameter(p)),
            returnType: prop.type && this.resolveType(prop.type),
            kind: TypeKinds.ARROW_FUNCTION
        };
        else {
            const param = (prop as ts.IndexSignatureDeclaration).parameters[0];
            return {
                key: param.type && this.resolveType(param.type),
                type: this.resolveType((prop as ts.IndexSignatureDeclaration).type)
            };
        }
    }

    resolveHeritage(param: ts.ExpressionWithTypeArguments) : Type {
        const sym = this.resolveSymbol(this.extractor.checker.getSymbolAtLocation(param.expression), param.typeArguments);
        if (sym) return sym;
        return {
            type: {
                name: param.expression.getText(),
                kind: TypeReferenceKinds.STRINGIFIED_UNKNOWN
            },
            typeArguments: param.typeArguments?.map(arg => this.resolveType(arg)),
            kind: TypeKinds.REFERENCE
        };
    }

    resolveParameter(param: ts.ParameterDeclaration) : FunctionParameter {
        const name = ts.isIdentifier(param.name) ? param.name.text:"__namedParameters";
        return {
            name,
            isOptional: Boolean(param.questionToken),
            rest: Boolean(param.dotDotDotToken),
            type: param.type && this.resolveType(param.type),
            defaultValue: param.initializer && this.resolveExpressionToType(param.initializer),
            jsDoc: { comment: this.getJSDocCommentOfParam(param) }
        };
    }

    resolveExpressionToType(exp: ts.Node) : Type|undefined {
        if (ts.isNewExpression(exp)) return this.resolveSymbol(this.extractor.checker.getSymbolAtLocation(exp.expression), exp.typeArguments);
        const sym = this.extractor.checker.getSymbolAtLocation(exp);
        if (sym) return this.resolveSymbol(sym);
        switch (exp.kind) {
        case ts.SyntaxKind.BigIntLiteral:
        case ts.SyntaxKind.NumericLiteral: return { name: exp.getText(), kind: TypeKinds.NUMBER_LITERAL };
        case ts.SyntaxKind.FalseKeyword: return { name: "false", kind: TypeKinds.FALSE };
        case ts.SyntaxKind.TrueKeyword: return { name: "true", kind: TypeKinds.TRUE };
        case ts.SyntaxKind.StringLiteral: return { name: exp.getText(), kind: TypeKinds.STRING_LITERAL };
        case ts.SyntaxKind.NullKeyword: return { name: "null", kind: TypeKinds.NULL };
        case ts.SyntaxKind.UndefinedKeyword: return { name: "undefined", kind: TypeKinds.UNDEFINED };
        default: return { name: exp.getText(), kind: TypeKinds.STRINGIFIED_UNKNOWN };
        }
    }

    resolveAliasedSymbol(symbol: ts.Symbol) : ts.Symbol {
        while (hasBit(symbol.flags, ts.SymbolFlags.Alias)) symbol = this.extractor.checker.getAliasedSymbol(symbol);
        return symbol;
    }

    getJSDocCommentOfParam(node: ts.ParameterDeclaration) : string|undefined {
        const tag = ts.getJSDocParameterTags(node)[0];
        if (!tag) return;
        return ts.getTextOfJSDocComment(tag.comment);
    }

    getJSDocData(node: ts.Node) : Array<JSDocData>|undefined {
        //@ts-expect-error Internal access - Why is this internal?
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

    getLOC(currentModule: Module, node: ts.Node, sourceFile = node.getSourceFile(), includeLine = true) : Loc {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        if (currentModule.isNamespace) return {pos, sourceFile: `${currentModule.repository}#L${pos.line + 1}`};
        return {
            pos,
            sourceFile: currentModule.repository && `${currentModule.repository}/${getLastItemFromPath(sourceFile.fileName)}${includeLine ? `#L${pos.line + 1}`:""}`
        };
    }

    resolveSourceFile(filePath: string, relative: string) : ts.SourceFile|undefined {
        let res;
        if (path.isAbsolute(filePath)) {
            res = this.extractor.program.getSourceFile(path.join(filePath, "../", `${relative}.ts`));
            if (!res) res = this.extractor.program.getSourceFile(path.join(filePath, "../", `${relative}/index.ts`));
        } else {
            res = this.extractor.program.getSourceFile(path.join(process.cwd(), filePath, "../", `${relative}.ts`));
            if (!res) res = this.extractor.program.getSourceFile(path.join(process.cwd(), filePath, "../", `${relative}/index.ts`));
        }
        return res;
    }

    moduleToJSON(module = this.module) : Record<string, unknown> {
        const clone: Record<string, unknown> = {...module};
        clone.modules = [];
        for (const [, mod] of module.modules) {
            (clone.modules as Array<Record<string, unknown>>).push(this.moduleToJSON(mod));
        }
        return clone;
    }

    toJSON() : Record<string, unknown> {
        return {
            readme: this.readme,
            repository: this.repository,
            homepage: this.homepage,
            module: this.moduleToJSON()
        };
    }

}
