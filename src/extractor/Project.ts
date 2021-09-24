/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from "path";
import ts from "typescript";
import { TypescriptExtractor } from ".";
import { getLastItemFromPath, getReadme, getRepository, hasBit, PackageJSON } from "../utils";
import { AliasedReference, ArrowFunction, ClassDecl, ClassMethod, ClassProperty, createModule, createModuleRef, FunctionParameter, IndexSignatureDeclaration, JSDocData, JSDocTag, Loc, Module, ModuleExport, ObjectLiteral, Property, Reference, ReferenceType, Type, TypeKinds, TypeParameter, TypeReferenceKinds } from "./structure";

export class Project {
    repository?: string
    readme?: string
    homepage?: string
    version?: string
    module: Module
    extractor: TypescriptExtractor
    baseDir: string
    private fileCache: Set<string>
    private fileExportsCache: Record<string, [Array<ReferenceType>, Array<ModuleExport>]>
    private ignoreNamespaceMembers?: boolean
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
        if (extractor.settings.entryPoints.length !== 1) this.module.path.push(this.module.name);
        console.log(this.module.path);
        this.extractor = extractor;
        this.fileCache = new Set();
        this.fileExportsCache = {};
    }

    visitor(sourceFile: ts.SourceFile|ts.Symbol, currentModule?: Module, addToExports = false) : void {
        let sym;
        if ("fileName" in sourceFile) sym = this.extractor.checker.getSymbolAtLocation(sourceFile);
        else sym = sourceFile;
        if (!sym || !sym.exports) return;
        if (this.fileCache.has(sym.name)) return;
        this.fileCache.add(sym.name);
        if (!currentModule) currentModule = this.getOrCreateModule(sym.name);
        const reExports: Record<string, ModuleExport> = {};
        const exports: Array<AliasedReference> = [];
        // @ts-expect-error You should be able to do that
        for (const [, val] of sym.exports) {
            // export * from "..." - goes to "exports"
            if (val.name === "__export") {
                for (const decl of val.declarations!) {
                    if (ts.isExportDeclaration(decl) && decl.moduleSpecifier && ts.isStringLiteral(decl.moduleSpecifier)) {
                        const reExportedFile = this.resolveSourceFile(decl.getSourceFile().fileName, decl.moduleSpecifier.text);
                        if (!reExportedFile) continue;
                        const mod = this.getOrCreateModule(reExportedFile.fileName);
                        if (mod !== currentModule) {
                            if (!reExports[mod.name]) reExports[mod.name] = {references: [], module: createModuleRef(mod) };
                            this.visitor(reExportedFile, mod);
                        } else this.visitor(reExportedFile, mod, true);
                    }
                } 
            } else if (val.declarations && val.declarations.length) {
                // export { ... } from "...";
                // import { ... } from "..."; export { ... };
                // If the module is different, goes to "reExports", otherwise "exports"
                if (ts.isExportSpecifier(val.declarations[0])) {
                    const aliased = this.resolveAliasedSymbol(val);
                    if (!aliased.declarations || !aliased.declarations.length) continue;
                    const source = aliased.declarations![0].getSourceFile();
                    const mod = this.getOrCreateModule(source.fileName);
                    this.visitor(source, mod);
                    const alias = val.name !== aliased.name ? val.name : undefined;
                    if (mod !== currentModule) {
                        if (!reExports[mod.name]) {
                            const references = [];
                            if (this.extractor.refs.has(aliased)) references.push(this.extractor.refs.get(aliased)!);
                            reExports[mod.name] = { module: createModuleRef(mod), references, alias };
                        } else if (this.extractor.refs.has(aliased)) reExports[mod.name].references.push({...this.extractor.refs.get(aliased)!, alias });
                    } else {
                        const aliasedRef = this.extractor.refs.get(aliased);
                        const reExportsOfMod = this.fileExportsCache[aliased.name];
                        if (!reExportsOfMod) continue;
                        if (!aliasedRef) {
                            const newMod = this.getOrCreateModule(aliased.name.replace(/"/g, ""));
                            reExports[val.name] = { alias, module: createModuleRef(newMod), references: reExportsOfMod[0] };
                        }
                        else exports.push({ ...aliasedRef, alias });
                    }
                } 
                // export * as X from "...";
                // Always goes to "reExports"
                else if (ts.isNamespaceExport(val.declarations[0])) {
                    const namespaceName = val.declarations[0].name.text;
                    const aliased = this.resolveAliasedSymbol(val);
                    if (!aliased.declarations || !aliased.declarations.length) continue;
                    const mod = this.getOrCreateModule(aliased.name);
                    this.visitor(aliased, mod);
                    const exportsFromMod = this.fileExportsCache[aliased.name];
                    if (!exportsFromMod) continue;
                    reExports[aliased.name] = {
                        alias: namespaceName,
                        module: createModuleRef(mod),
                        references: exportsFromMod[0]
                    };
                }
                // export ...
                // Always go to "exports"
                else {
                    const sym = this.handleSymbol(val, currentModule);
                    if (sym) exports.push(sym);
                }
            }
        }
        const reExportsArr = Object.values(reExports);
        this.fileExportsCache[sym.name] = [exports, reExportsArr];
        if (addToExports || sym.name.endsWith("index\"")) {
            currentModule.exports.push(...exports);
            currentModule.reExports.push(...reExportsArr);
        }
        return;
    }

    getOrCreateModule(source: string) : Module {
        const {dir} = path.parse(source);
        if (this.extractor.moduleCache[dir]) return this.extractor.moduleCache[dir];
        let paths = dir.split("/");
        paths = paths.slice(paths.indexOf(this.baseDir) + 1);
        if (!paths.length) {
            this.extractor.moduleCache[dir] = this.module;
            return this.module;
        }
        let lastModule = this.module;
        for (const pathPart of paths) {
            const newMod = lastModule.modules.get(pathPart);
            if (!newMod) {
                const mod = createModule(pathPart, [...this.module.path, ...paths], false, `${lastModule.repository}/${pathPart}`, false);
                lastModule.modules.set(pathPart, mod);
                lastModule = mod;
            } 
            else lastModule = newMod;
        }
        this.extractor.moduleCache[dir] = lastModule;
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

    handleSymbol(val: ts.Symbol, currentModule?: Module) : ReferenceType | undefined {
        if (!val.declarations || !val.declarations.length) return;
        if (this.extractor.refs.has(val)) return this.extractor.refs.get(val);
        if (!this.ignoreNamespaceMembers && ts.isModuleBlock(val.declarations[0].parent)) {
            const namespaceSym = this.extractor.checker.getSymbolAtLocation(val.declarations[0].parent.parent.name);
            if (namespaceSym) {
                if (!this.extractor.refs.has(namespaceSym)) this.handleNamespaceDecl(namespaceSym);
                return this.extractor.refs.get(val);
            }
        }
        // TODO?: A symbol can both be an interface/type alias and a variable/function. 
        if (hasBit(val.flags, ts.SymbolFlags.Class)) return this.handleClassDecl(val, currentModule);
        else if (hasBit(val.flags, ts.SymbolFlags.Interface)) return this.handleInterfaceDecl(val, currentModule);
        else if (hasBit(val.flags, ts.SymbolFlags.Enum)) return this.handleEnumDecl(val, currentModule);
        else if (hasBit(val.flags, ts.SymbolFlags.TypeAlias)) return this.handleTypeAliasDecl(val, currentModule);
        else if (hasBit(val.flags, ts.SymbolFlags.Module)) return this.handleNamespaceDecl(val, currentModule);
        else if (hasBit(val.flags, ts.SymbolFlags.Variable) && !hasBit(val.flags, ts.SymbolFlags.FunctionScopedVariable)) return this.handleVariableDecl(val, currentModule);
        else if (hasBit(val.flags, ts.SymbolFlags.Function)) return this.handleFunctionDecl(val, currentModule);
        else if (hasBit(val.flags, ts.SymbolFlags.EnumMember)) {
            //@ts-expect-error Private property
            const parent = val.parent;
            if (!this.extractor.refs.has(parent)) this.handleEnumDecl(parent, currentModule);
            return this.extractor.refs.get(val);
        }
        else {
            const aliased = this.resolveAliasedSymbol(val);
            if (this.extractor.refs.has(aliased)) return this.extractor.refs.get(aliased);
            if (aliased.declarations && aliased.declarations.length) {
                const decl = aliased.declarations![0];
                let name: ts.Symbol|string = aliased;
                let importedFrom;
                if (ts.isImportClause(decl)) importedFrom = (decl.parent.moduleSpecifier as ts.StringLiteral).text;
                else if (ts.isImportSpecifier(decl)) {
                    importedFrom = (decl.parent.parent.parent.moduleSpecifier as ts.StringLiteral).text;
                    if (decl.propertyName) name = decl.propertyName.text;
                }
                if (importedFrom) return this.extractor.refs.findExternal(name, importedFrom);
            }
            return;
        }
    }

    handleClassDecl(symbol: ts.Symbol, currentModule?: Module) : ReferenceType | undefined {
        const decl = symbol.declarations![0] as ts.ClassDeclaration;
        if (!currentModule) currentModule = this.getOrCreateModule(decl.getSourceFile().fileName);
        const name = symbol.name;
        const ref = {
            name,
            path: currentModule.path,
            kind: TypeReferenceKinds.CLASS,
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
                    loc: this.getLOC(currentModule, member),
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

    handleInterfaceDecl(sym: ts.Symbol, currentModule?: Module) : ReferenceType | undefined {
        const firstDecl = sym.declarations!.find(decl => ts.isInterfaceDeclaration(decl)) as ts.InterfaceDeclaration;
        if (!currentModule) currentModule = this.getOrCreateModule(firstDecl.getSourceFile().fileName);
        const ref = {
            name: sym.name,
            path: currentModule.path,
            kind: TypeReferenceKinds.INTERFACE
        };
        this.extractor.refs.set(sym, ref);
        const properties = [];
        const loc = [];
        const jsDoc = [];
        for (const decl of (sym.declarations as Array<ts.InterfaceDeclaration>)) {
            for (const member of (decl.members || [])) properties.push({
                value: this.resolveProperty(member),
                jsDoc: this.getJSDocData(member)
            });
            loc.push(this.getLOC(currentModule, decl));
            const jsdoc = this.getJSDocData(decl);
            if (jsdoc) jsDoc.push(...jsdoc);
        }
        let extendsInt, implementsInt;
        if (firstDecl.heritageClauses) {
            const extendsClause = firstDecl.heritageClauses.find(c => c.token === ts.SyntaxKind.ExtendsKeyword);
            extendsInt = extendsClause && extendsClause.types.map(t => this.resolveHeritage(t));
            const implementsClause = firstDecl.heritageClauses.find(c => c.token === ts.SyntaxKind.ImplementsKeyword);
            implementsInt = implementsClause && implementsClause.types.map(impl => this.resolveType(impl));
        }
        currentModule.interfaces.push({
            name: sym.name,
            extends: extendsInt,
            implements: implementsInt,
            loc,
            properties,
            jsDoc,
            typeParameters: firstDecl.typeParameters && firstDecl.typeParameters.map(p => this.resolveTypeParameters(p))
        });
        return ref;
    }

    handleEnumDecl(sym: ts.Symbol, currentModule?: Module) : ReferenceType | undefined {
        const firstDecl = sym.declarations![0];
        if (!currentModule) currentModule = this.getOrCreateModule(firstDecl.getSourceFile().fileName);
        const ref = {
            name: sym.name,
            path: currentModule.path,
            kind: TypeReferenceKinds.ENUM
        };
        this.extractor.refs.set(sym, ref);
        const members = [];
        const loc = [];
        const jsDoc = [];
        for (const decl of (sym.declarations as Array<ts.EnumDeclaration>)) {
            for (const el of (decl.members || [])) {
                const name = el.name.getText();
                members.push({
                    name,
                    initializer: el.initializer && this.resolveExpressionToType(el.initializer),
                    loc: this.getLOC(currentModule, el),
                    jsDoc: this.getJSDocData(el)
                });
                const elSymbol = this.extractor.checker.getSymbolAtLocation(el.name);
                if (elSymbol) {
                    this.extractor.refs.set(elSymbol, {
                        name: sym.name,
                        displayName: name,
                        path: currentModule.path,
                        kind: TypeReferenceKinds.ENUM_MEMBER
                    });
                }
            }
            loc.push(this.getLOC(currentModule, decl));
            const jsDocData = this.getJSDocData(decl);
            if (jsDocData) jsDoc.push(...jsDocData);
        }
        currentModule.enums.push({
            name: sym.name,
            isConst: Boolean(firstDecl.modifiers && firstDecl.modifiers.some(mod => mod.kind === ts.SyntaxKind.ConstKeyword)),
            loc,
            jsDoc,
            members
        });
        return ref;
    }

    handleTypeAliasDecl(sym: ts.Symbol, currentModule?: Module) : ReferenceType | undefined {
        const decl = sym.declarations!.find(decl => ts.isTypeAliasDeclaration(decl)) as ts.TypeAliasDeclaration;
        if (!currentModule) currentModule = this.getOrCreateModule(decl.getSourceFile().fileName);
        const ref = {
            name: sym.name,
            path: currentModule.path,
            kind: TypeReferenceKinds.TYPE_ALIAS
        };
        this.extractor.refs.set(sym, ref);
        currentModule.types.push({
            name: sym.name,
            value: this.resolveType(decl.type),
            typeParameters: decl.typeParameters?.map(param => this.resolveTypeParameters(param)),
            loc: this.getLOC(currentModule, decl),
            jsDoc: this.getJSDocData(decl)
        });
        return ref;
    }

    handleNamespaceDecl(symbol: ts.Symbol, currentModule?: Module) : ReferenceType|undefined {
        const firstDecl = symbol.declarations![0]! as ts.ModuleDeclaration;
        if (!currentModule) currentModule = this.getOrCreateModule(firstDecl.getSourceFile().fileName);
        const newMod = createModule(firstDecl.name.text, [...currentModule.path, firstDecl.name.text], false, undefined, true);
        const namespaceLoc = this.getLOC(newMod, firstDecl);
        newMod.repository = namespaceLoc.sourceFile;
        currentModule.modules.set(newMod.name, newMod);
        const ref = {
            name: symbol.name,
            path: currentModule.path,
            kind: TypeReferenceKinds.NAMESPACE_OR_MODULE
        };
        this.extractor.refs.set(symbol, ref);
        this.ignoreNamespaceMembers = true;
        // @ts-expect-error You should be able to do that
        for (const [, element] of symbol.exports) {
            const sym = this.handleSymbol(element, newMod);
            if (sym) newMod.exports.push(sym);
        }
        this.ignoreNamespaceMembers = false;
        return ref;
    }

    handleVariableDecl(sym: ts.Symbol, currentModule?: Module) : ReferenceType | undefined {
        const decl = sym.declarations!.find(decl => ts.isVariableDeclaration(decl)) as ts.VariableDeclaration;
        if (!currentModule) currentModule = this.getOrCreateModule(decl.getSourceFile().fileName);
        const ref = {
            name: sym.name,
            kind: TypeReferenceKinds.CONSTANT,
            path: currentModule.path,
        };
        this.extractor.refs.set(sym, ref);
        const maxLen = this.extractor.settings.maxConstantTextLength || 256;
        const text = decl.initializer && decl.initializer.getText();
        currentModule.constants.push({
            name: decl.name.getText(),
            loc: this.getLOC(currentModule, decl),
            jsDoc: this.getJSDocData(decl),
            content: text && (text.length > maxLen) ? text.slice(0, maxLen) : text
        });
        return ref;
    }

    handleFunctionDecl(sym: ts.Symbol, currentModule?: Module) : ReferenceType | undefined {
        const lastDecl = sym.declarations![sym.declarations!.length - 1];
        if (!currentModule) currentModule = this.getOrCreateModule(lastDecl.getSourceFile().fileName);
        const ref = {
            name: sym.name,
            path: currentModule.path,
            kind: TypeReferenceKinds.FUNCTION
        };
        this.extractor.refs.set(sym, ref);
        const signatures = [];
        for (const decl of (sym.declarations as Array<ts.FunctionDeclaration>)) {
            signatures.push({
                returnType: this.resolveReturnType(decl),
                typeParameters: decl.typeParameters?.map(param => this.resolveTypeParameters(param)),
                parameters: decl.parameters.map(param => this.resolveParameter(param)),
                jsDoc: this.getJSDocData(decl)
            });
        }
        currentModule.functions.push({
            name: sym.name,
            signatures,
            loc: this.getLOC(currentModule, lastDecl)
        });
        return ref;
    }

    resolveSymbol(sym: ts.Symbol, typeArguments?: Array<Type>) : Reference {
        sym = this.resolveAliasedSymbol(sym);
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
        const newlyCreated = this.handleSymbol(sym);
        if (newlyCreated) return { kind: TypeKinds.REFERENCE, typeArguments, type: newlyCreated };
        return { kind: TypeKinds.REFERENCE, typeArguments, type: { kind: TypeReferenceKinds.UNKNOWN, name: sym.name }};
    }

    resolveType(type: ts.Node) : Type {
        if (ts.isTypeReferenceNode(type)) {
            const symbol = this.extractor.checker.getSymbolAtLocation(type.typeName);
            const typeArguments = type.typeArguments?.map(arg => this.resolveType(arg));
            if (symbol) return this.resolveSymbol(symbol, typeArguments);
            const externalMaybe = this.extractor.refs.findUnnamedExternal(type.typeName.getText());
            if (externalMaybe) return {
                kind: TypeKinds.REFERENCE,
                typeArguments,
                type: externalMaybe
            };
            return { kind: TypeKinds.REFERENCE, typeArguments, type: { name: type.typeName.getText(), kind: TypeReferenceKinds.STRINGIFIED_UNKNOWN } };
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
            const sym = this.extractor.checker.getSymbolAtLocation(type);
            if (!sym) return { name: "this", kind: TypeKinds.STRINGIFIED_UNKNOWN };
            return this.resolveSymbol(sym);
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
        //@ts-expect-error Internal API
        return this.resolveSymbol(sym, type.resolvedTypeArguments && type.resolvedTypeArguments.map(t => {
            const symbol = t.getSymbol();
            if (!symbol) return { kind: TypeKinds.ANY, name: "any" };
            return this.resolveSymbol(symbol);
        }));
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
        const sym = this.extractor.checker.getSymbolAtLocation(param.expression);
        if (!sym) return {
            type: {
                name: param.expression.getText(),
                kind: TypeReferenceKinds.STRINGIFIED_UNKNOWN
            },
            typeArguments: param.typeArguments?.map(arg => this.resolveType(arg)),
            kind: TypeKinds.REFERENCE
        };
        return this.resolveSymbol(sym, param.typeArguments?.map(arg => this.resolveType(arg)));
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
        if (ts.isNewExpression(exp)) {
            const expSym = this.extractor.checker.getSymbolAtLocation(exp.expression);
            if (!expSym) return;
            return this.resolveSymbol(expSym, exp.typeArguments?.map(arg => this.resolveType(arg)));
        }
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
        while (hasBit(symbol.flags, ts.SymbolFlags.Alias)) {
            const newSym = this.extractor.checker.getAliasedSymbol(symbol);
            if (newSym.name === "unknown") return symbol;
            symbol = newSym;
        }
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
        if (!currentModule.repository) return { pos };
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
