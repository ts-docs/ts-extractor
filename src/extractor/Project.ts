/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from "path";
import ts from "typescript";
import { ObjectProperty, TypescriptExtractor } from ".";
import { getLastItemFromPath, getReadme, getRepository, hasBit, PackageJSON, } from "../utils";
import { registerDirectExport, registerDirectReExport, registerNamespaceReExport, registerOtherExportOrReExport } from "./ExportHandler";
import { ArrowFunction, ClassDecl, ClassMethod, ClassProperty, createModule, FunctionParameter, JSDocData, JSDocTag, Loc, Module, ObjectLiteral, Reference, ReferenceType, Type, TypeKinds, TypeParameter, TypeReferenceKinds } from "./structure";

export class Project {
    repository?: string
    readme?: string
    homepage?: string
    version?: string
    module: Module
    extractor: TypescriptExtractor
    baseDir: string
    private ignoreNamespaceMembers?: boolean
    private idAcc: number
    constructor({ folderPath, extractor, packageJSON }: {
        folderPath: Array<string>,
        extractor: TypescriptExtractor,
        packageJSON: PackageJSON,
    }) {
        folderPath.pop(); // Removes the file name
        this.baseDir = folderPath[folderPath.length - 1];
        this.repository = getRepository(packageJSON, extractor.settings.branchName);
        this.homepage = packageJSON.contents.homepage;
        this.version = packageJSON.contents.version;
        this.readme = getReadme(packageJSON.path);
        let name = packageJSON.contents.name;
        if (name.includes("/")) name = name.split("/")[1];
        this.module = createModule(name, [], true, this.repository && `${this.repository}/${this.baseDir}`, false);
        if (extractor.settings.entryPoints.length !== 1) this.module.path.push(name);
        this.extractor = extractor;
        this.idAcc = 1;
    }

    visitor(sourceFile: ts.SourceFile | ts.Symbol, currentModule: Module): void {
        let sym;
        let fileName;
        if ("fileName" in sourceFile) {
            if (this.extractor.program.isSourceFileFromExternalLibrary(sourceFile) || this.extractor.program.isSourceFileDefaultLibrary(sourceFile)) return;
            fileName = sourceFile.fileName;
            sym = this.extractor.checker.getSymbolAtLocation(sourceFile);
        }
        else {
            sym = sourceFile;
            fileName = this.resolveSymbolFileName(sym);
        }
        if (!sym || !sym.exports) return;
        if (this.extractor.fileCache.has(fileName)) return;

        const isCached = this.extractor.isCachedFile(fileName);

        // @ts-expect-error You should be able to do that
        for (const [, val] of sym.exports) {
            // export * from "..."
            if (val.name === "__export") {
                for (const decl of val.declarations!) {
                    if (ts.isExportDeclaration(decl) && decl.moduleSpecifier && ts.isStringLiteral(decl.moduleSpecifier)) registerDirectReExport(this, currentModule, decl.moduleSpecifier);
                }
            } else if (val.declarations && val.declarations.length) {
                // export { ... } from "...";
                // import { ... } from "..."; export { ... };
                if (ts.isExportSpecifier(val.declarations[0])) registerOtherExportOrReExport(this, currentModule, val);
                // export * as X from "...";
                else if (ts.isNamespaceExport(val.declarations[0])) registerNamespaceReExport(this, currentModule, val);
                // export ...
                else {
                    const sym = this.handleSymbol(val, currentModule, isCached);
                    if (sym) registerDirectExport(fileName, currentModule, sym);
                }
            }
        }
        return;
    }

    getOrCreateModule(source: string): Module {
        const { dir } = path.parse(source);
        if (this.extractor.moduleCache[dir]) return this.extractor.moduleCache[dir];
        let paths = dir.split("/");
        paths = paths.slice(paths.indexOf(this.baseDir) + 1);
        if (!paths.length) {
            this.extractor.moduleCache[dir] = this.module;
            return this.module;
        }
        let lastModule = this.module;
        const newPath = [];
        const skipped: Array<string> = [];
        for (const pathPart of paths) {
            if (pathPart === "") break;
            const newMod = lastModule.modules.get(pathPart);
            if (this.extractor.settings.passthroughModules?.includes(pathPart)) {
                skipped.push(pathPart);
                continue;
            }
            newPath.push(pathPart);
            if (!newMod) {
                let repoPath;
                if (lastModule.repository) {
                    repoPath = lastModule.repository;
                    if (skipped.length) {
                        if (!repoPath.split("/").some(p => skipped.includes(p))) repoPath += `/${skipped.join("/")}`;
                        skipped.length = 0;
                    }
                    repoPath += `/${pathPart}`;
                }
                const mod = createModule(pathPart, [...this.module.path, ...newPath], false, repoPath, false);
                lastModule.modules.set(pathPart, mod);
                lastModule = mod;
            }
            else lastModule = newMod;
        }
        if (skipped.length) lastModule.repository += `/${skipped.join("/")}`;
        this.extractor.moduleCache[dir] = lastModule;
        return lastModule;
    }

    forEachModule<R>(module = this.module, cb: (module: Module, path: Array<string>) => R | undefined, pathToMod: Array<string> = []): R | undefined {
        const firstCb = cb(module, pathToMod);
        if (firstCb) return firstCb;
        for (const [, mod] of module.modules) {
            const res = this.forEachModule(mod, cb, [...pathToMod, mod.name]);
            if (res) return res;
        }
        return undefined;
    }

    handleSymbol(val: ts.Symbol, currentModule?: Module, isCached?: boolean): ReferenceType | undefined {
        if (!val.declarations || !val.declarations.length) return;
        if (this.extractor.refs.has(val)) return this.extractor.refs.get(val);
        if (!currentModule) {
            const origin = val.declarations[0].getSourceFile();
            if (this.extractor.program.isSourceFileFromExternalLibrary(origin) || this.extractor.program.isSourceFileDefaultLibrary(origin)) return;
            const fileName = origin.fileName;
            currentModule = this.getOrCreateModule(fileName);
            isCached = this.extractor.fileCache.has(fileName) ? this.extractor.fileCache.get(fileName) : this.extractor.settings.fileCache?.has(fileName);
        }

        if (!this.ignoreNamespaceMembers && ts.isModuleBlock(val.declarations[0].parent)) {
            const namespaceSym = this.extractor.checker.getSymbolAtLocation(val.declarations[0].parent.parent.name);
            if (namespaceSym) {
                if (!this.extractor.refs.has(namespaceSym)) this.handleNamespaceDecl(namespaceSym, currentModule, isCached);
                return this.extractor.refs.get(val);
            }
        }

        let type;
        if (hasBit(val.flags, ts.SymbolFlags.Module)) type = this.handleNamespaceDecl(val, currentModule, isCached);
        if (hasBit(val.flags, ts.SymbolFlags.Interface)) type = this.handleInterfaceDecl(val, currentModule, isCached);
        if (hasBit(val.flags, ts.SymbolFlags.Enum)) type = this.handleEnumDecl(val, currentModule, isCached);
        if (hasBit(val.flags, ts.SymbolFlags.TypeAlias)) type = this.handleTypeAliasDecl(val, currentModule, isCached);
        if (hasBit(val.flags, ts.SymbolFlags.Variable) && !hasBit(val.flags, ts.SymbolFlags.FunctionScopedVariable)) type = this.handleVariableDecl(val, currentModule, isCached);
        if (hasBit(val.flags, ts.SymbolFlags.Function)) type = this.handleFunctionDecl(val, currentModule, isCached);
        if (hasBit(val.flags, ts.SymbolFlags.Class)) type = this.handleClassDecl(val, currentModule, isCached);
        if (hasBit(val.flags, ts.SymbolFlags.EnumMember)) {
            //@ts-expect-error Private property
            const parent = val.parent;
            if (!this.extractor.refs.has(parent)) this.handleEnumDecl(parent, currentModule, isCached);
            type = this.extractor.refs.get(val);
        }
        if (type) return type;
        const aliased = this.resolveAliasedSymbol(val);
        if (this.extractor.refs.has(aliased)) return this.extractor.refs.get(aliased);
        if (aliased.declarations && aliased.declarations.length) return this.extractor.refs.findExternal(aliased);
        return;

    }

    handleClassDecl(symbol: ts.Symbol, currentModule: Module, isCached?: boolean): ReferenceType | undefined {
        const decl = symbol.declarations!.find(decl => ts.isClassDeclaration(decl)) as ts.ClassDeclaration;
        const name = symbol.name;
        const ref: ReferenceType = {
            name,
            path: currentModule.path,
            kind: TypeReferenceKinds.CLASS,
        };
        this.extractor.refs.set(symbol, ref);
        if (this.isInternalNode(decl)) {
            ref.kind = TypeReferenceKinds.INTERNAL;
            return ref;
        }
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
                properties.push({
                    index: {
                        key: member.parameters[0]?.type && this.resolveType(member.parameters[0].type),
                        type: this.resolveType(member.type)
                    },
                    isStatic, isReadonly,
                    loc: this.getLOC(currentModule, member),
                    jsDoc: this.getJSDocData(member)
                });
            }
            if (ts.isPropertyDeclaration(member)) {
                if (this.isInternalNode(member)) continue;
                const computedName = ts.isComputedPropertyName(member.name) && this.resolveExpressionToType(member.name.expression);
                properties.push({
                    prop: {
                        name: computedName || (member.name as ts.Identifier).text,
                        rawName: (member.name as ts.Identifier).text,
                        type: member.type && this.resolveType(member.type),
                        isOptional: Boolean(member.questionToken),
                        initializer: member.initializer && this.resolveExpressionToType(member.initializer)
                    },
                    isPrivate, isProtected, isStatic, isReadonly, isAbstract,
                    jsDoc: this.getJSDocData(member),
                    loc: this.getLOC(currentModule, member)
                });
            }
            else if (ts.isConstructorDeclaration(member)) {
                if (this.isInternalNode(member)) continue;
                if (!constructor) {
                    constructor = {
                        loc: this.getLOC(currentModule, member),
                        signatures: [{
                            parameters: member.parameters.map(p => this.resolveParameter(p)),
                            jsDoc: this.getJSDocData(member)
                        }],
                    };
                } else {
                    constructor.signatures.push({ parameters: member.parameters.map(p => this.resolveParameter(p)), jsDoc: this.getJSDocData(member) });
                    if (member.body) constructor.loc = this.getLOC(currentModule, member);
                }
            }
            else if (ts.isMethodDeclaration(member)) {
                if (this.isInternalNode(member)) continue;
                const methodName = member.name.getText();
                const method = methods.get(methodName);
                const computedName = ts.isComputedPropertyName(member.name) ? this.resolveExpressionToType(member.name.expression) : undefined;
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
                        name: computedName || methodName,
                        rawName: methodName,
                        loc: this.getLOC(currentModule, member),
                        isPrivate, isProtected, isStatic, isAbstract,
                        jsDoc: this.getJSDocData(member),
                        isGenerator: Boolean(member.asteriskToken),
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
                if (this.isInternalNode(member)) continue;
                const methodName = member.name.getText();
                const computedName = ts.isComputedPropertyName(member.name) ? this.resolveExpressionToType(member.name.expression) : undefined;
                methods.set(methodName, {
                    name: computedName || methodName,
                    rawName: methodName,
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
                if (this.isInternalNode(member)) continue;
                const methodName = member.name.getText();
                const computedName = ts.isComputedPropertyName(member.name) ? this.resolveExpressionToType(member.name.expression) : undefined;
                methods.set(methodName, {
                    name: computedName || methodName,
                    rawName: methodName,
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
            isAbstract: decl.modifiers && decl.modifiers.some(m => m.kind === ts.SyntaxKind.AbstractKeyword),
            _constructor: constructor,
            isCached
        };
        if (decl.heritageClauses) {
            const extendsClause = decl.heritageClauses.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword);
            classObj.extends = extendsClause && this.resolveHeritage(extendsClause.types[0]) as Reference;
            const implementsClauses = decl.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ImplementsKeyword);
            classObj.implements = implementsClauses && implementsClauses.types.map(clause => this.resolveHeritage(clause));
        }
        if (currentModule.classes.some(cl => cl.name === name)) classObj.id = ref.id = this.idAcc++;
        currentModule.classes.push(classObj);
        return ref;
    }

    handleInterfaceDecl(sym: ts.Symbol, currentModule: Module, isCached?: boolean): ReferenceType | undefined {
        const firstDecl = sym.declarations!.find(decl => ts.isInterfaceDeclaration(decl)) as ts.InterfaceDeclaration;
        const ref: ReferenceType = {
            name: sym.name,
            path: currentModule.path,
            kind: TypeReferenceKinds.INTERFACE
        };
        this.extractor.refs.set(sym, ref);
        if (this.isInternalNode(firstDecl)) {
            ref.kind = TypeReferenceKinds.INTERNAL;
            return ref;
        }
        const properties = [];
        const loc = [];
        const jsDoc = [];
        for (const decl of (sym.declarations as Array<ts.Node>)) {
            if (!ts.isInterfaceDeclaration(decl)) continue;
            for (const member of (decl.members || [])) {
                if (this.isInternalNode(member)) continue;
                properties.push(this.resolveObjectProperty(member));
            }
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
        let id;
        if (currentModule.interfaces.some(int => int.name === sym.name)) ref.id = id = this.idAcc++;
        currentModule.interfaces.push({
            name: sym.name,
            extends: extendsInt,
            implements: implementsInt,
            loc,
            properties,
            jsDoc,
            id,
            typeParameters: firstDecl.typeParameters && firstDecl.typeParameters.map(p => this.resolveTypeParameters(p)),
            isCached: (isCached && sym.declarations!.length === 1) ? true : undefined
        });
        return ref;
    }

    handleEnumDecl(sym: ts.Symbol, currentModule: Module, isCached?: boolean): ReferenceType | undefined {
        const firstDecl = sym.declarations!.find(decl => ts.isEnumDeclaration(decl))!;
        const ref: ReferenceType = {
            name: sym.name,
            path: currentModule.path,
            kind: TypeReferenceKinds.ENUM
        };
        this.extractor.refs.set(sym, ref);
        if (this.isInternalNode(firstDecl)) {
            ref.kind = TypeReferenceKinds.INTERNAL;
            return ref;
        }
        const members = [];
        const loc = [];
        const jsDoc = [];
        for (const decl of sym.declarations!) {
            if (!ts.isEnumDeclaration(decl)) continue;
            for (const el of (decl.members || [])) {
                const isInternal = this.isInternalNode(el);
                const name = el.name.getText();
                if (!isInternal) members.push({
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
                        kind: isInternal ? TypeReferenceKinds.INTERNAL : TypeReferenceKinds.ENUM_MEMBER
                    });
                }
            }
            loc.push(this.getLOC(currentModule, decl));
            const jsDocData = this.getJSDocData(decl);
            if (jsDocData) jsDoc.push(...jsDocData);
        }
        let id;
        if (currentModule.enums.some(int => int.name === sym.name)) ref.id = id = this.idAcc++;
        currentModule.enums.push({
            name: sym.name,
            isConst: Boolean(firstDecl.modifiers && firstDecl.modifiers.some(mod => mod.kind === ts.SyntaxKind.ConstKeyword)),
            loc,
            jsDoc,
            members,
            id,
            isCached: (isCached && sym.declarations!.length === 1) ? true : undefined
        });
        return ref;
    }

    handleTypeAliasDecl(sym: ts.Symbol, currentModule: Module, isCached?: boolean): ReferenceType | undefined {
        const decl = sym.declarations!.find(decl => ts.isTypeAliasDeclaration(decl)) as ts.TypeAliasDeclaration;
        const ref: ReferenceType = {
            name: sym.name,
            path: currentModule.path,
            kind: TypeReferenceKinds.TYPE_ALIAS
        };
        this.extractor.refs.set(sym, ref);
        if (this.isInternalNode(decl)) {
            ref.kind = TypeReferenceKinds.INTERNAL;
            return ref;
        }
        let id;
        if (currentModule.types.some(int => int.name === sym.name)) ref.id = id = this.idAcc++;
        currentModule.types.push({
            name: sym.name,
            value: this.resolveType(decl.type),
            typeParameters: decl.typeParameters?.map(param => this.resolveTypeParameters(param)),
            loc: this.getLOC(currentModule, decl),
            jsDoc: this.getJSDocData(decl),
            id,
            isCached
        });
        return ref;
    }

    handleNamespaceDecl(symbol: ts.Symbol, currentModule: Module, isCached?: boolean): ReferenceType | undefined {
        const firstDecl = symbol.declarations!.find(t => ts.isModuleDeclaration(t)) as ts.ModuleDeclaration;
        if (!firstDecl) return;
        const newMod = createModule(firstDecl.name.text, [...currentModule.path, firstDecl.name.text], false, this.getLOC(currentModule, firstDecl).sourceFile, true);
        newMod.exports.index = { exports: [], reExports: [] };
        const namespaceLoc = this.getLOC(currentModule, firstDecl);
        newMod.repository = namespaceLoc.sourceFile;
        currentModule.modules.set(newMod.name, newMod);
        newMod.jsDoc = this.getJSDocData(firstDecl);
        const ref = {
            name: symbol.name,
            path: currentModule.path,
            kind: TypeReferenceKinds.NAMESPACE_OR_MODULE
        };
        this.extractor.refs.set(symbol, ref);
        this.ignoreNamespaceMembers = true;
        const areChildrenCached = isCached && symbol.declarations!.length === 1 ? true : undefined;
        // @ts-expect-error You should be able to do that
        for (const [, element] of symbol.exports) {
            if (!hasBit(element.flags, ts.SymbolFlags.ModuleMember)) continue;
            const sym = this.handleSymbol(element, newMod, areChildrenCached);
            if (sym) newMod.exports.index.exports.push(sym);
        }
        this.ignoreNamespaceMembers = false;
        return ref;
    }

    handleVariableDecl(sym: ts.Symbol, currentModule: Module, isCached?: boolean): ReferenceType | undefined {
        const decl = sym.declarations!.find(decl => ts.isVariableDeclaration(decl)) as ts.VariableDeclaration;
        const ref: ReferenceType = {
            name: sym.name,
            kind: TypeReferenceKinds.CONSTANT,
            path: currentModule.path,
        };
        this.extractor.refs.set(sym, ref);
        if (this.isInternalNode(decl)) {
            ref.kind = TypeReferenceKinds.INTERNAL;
            return ref;
        }
        const maxLen = this.extractor.settings.maxConstantTextLength || 256;
        let text;
        let type = decl.type && this.resolveType(decl.type);
        if (decl.initializer) {
            text = decl.initializer.getText();
            if (!type && ts.isArrowFunction(decl.initializer)) type = this.resolveTypeType(this.extractor.checker.getTypeAtLocation(decl.initializer));
        }
        let id;
        if (currentModule.constants.some(int => int.name === sym.name)) ref.id = id = this.idAcc++;
        currentModule.constants.push({
            name: decl.name.getText(),
            loc: this.getLOC(currentModule, decl),
            jsDoc: this.getJSDocData(decl),
            content: text && (text.length > maxLen) ? text.slice(0, maxLen) : text,
            type,
            id,
            isCached
        });
        return ref;
    }

    handleFunctionDecl(sym: ts.Symbol, currentModule: Module, isCached?: boolean): ReferenceType | undefined {
        const lastDecl = sym.declarations![sym.declarations!.length - 1] as ts.FunctionDeclaration;
        const ref: ReferenceType = {
            name: sym.name,
            path: currentModule.path,
            kind: TypeReferenceKinds.FUNCTION
        };
        this.extractor.refs.set(sym, ref);
        if (this.isInternalNode(lastDecl)) {
            ref.kind = TypeReferenceKinds.INTERNAL;
            return ref;
        }
        const signatures = [];
        for (const decl of sym.declarations!) {
            if (!ts.isFunctionDeclaration(decl)) continue;
            signatures.push({
                returnType: this.resolveReturnType(decl),
                typeParameters: decl.typeParameters?.map(param => this.resolveTypeParameters(param)),
                parameters: decl.parameters.map(param => this.resolveParameter(param)),
                jsDoc: this.getJSDocData(decl)
            });
        }
        let id;
        if (currentModule.functions.some(int => int.name === sym.name)) ref.id = id = this.idAcc++;
        currentModule.functions.push({
            name: sym.name,
            signatures,
            loc: this.getLOC(currentModule, lastDecl),
            isGenerator: Boolean(lastDecl.asteriskToken),
            id,
            isCached
        });
        return ref;
    }

    resolveSymbolOrStr(node: ts.Node, typeArguments?: Array<Type>): Type {
        const expSym = this.extractor.checker.getSymbolAtLocation(node);
        if (expSym && expSym.name === "unknown" && ts.isQualifiedName(node)) {
            const leftSym = this.extractor.checker.getSymbolAtLocation(node.left);
            if (leftSym) {
                const external = this.extractor.refs.findExternal(leftSym, undefined, node.right.text);
                if (external) return { kind: TypeKinds.REFERENCE, type: external, typeArguments };
            }
            return { kind: TypeKinds.STRINGIFIED_UNKNOWN, name: node.getText() };
        }
        if (!expSym) {
            if (!node.getSourceFile()) return { kind: TypeKinds.UNKNOWN };
            const external = this.extractor.refs.findUnnamedExternal(node.getText());
            if (external) return { kind: TypeKinds.REFERENCE, type: external, typeArguments };
            return { kind: TypeKinds.STRINGIFIED_UNKNOWN, name: node.getText() };
        }
        if (expSym.name === "unknown") return { kind: TypeKinds.STRINGIFIED_UNKNOWN, name: node.getText() };
        return this.resolveSymbol(expSym, typeArguments);
    }

    resolveSymbol(sym: ts.Symbol, typeArguments?: Array<Type>): Reference {
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
        const newlyCreated = this.handleSymbol(sym, undefined);
        if (newlyCreated) return { kind: TypeKinds.REFERENCE, typeArguments, type: newlyCreated };
        const possiblyExternal = this.extractor.refs.findExternal(sym);
        if (possiblyExternal) return { kind: TypeKinds.REFERENCE, typeArguments, type: possiblyExternal };
        return { kind: TypeKinds.REFERENCE, typeArguments, type: { kind: TypeReferenceKinds.UNKNOWN, name: sym.name } };
    }

    resolveType(type: ts.Node): Type {
        if (ts.isTypeReferenceNode(type)) {
            if ("symbol" in type.typeName) return this.resolveSymbol((type.typeName as Record<string, ts.Symbol>).symbol, type.typeArguments?.map(arg => this.resolveType(arg)));
            return this.resolveSymbolOrStr(type.typeName, type.typeArguments?.map(arg => this.resolveType(arg)));
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
                properties: type.members.map(p => this.resolveObjectProperty(p)),
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
                types: type.elements.map(el => {
                    if (ts.isNamedTupleMember(el)) return { type: this.resolveType(el.type), name: el.name.text, spread: Boolean(el.dotDotDotToken), optional: Boolean(el.questionToken) };
                    else if (ts.isRestTypeNode(el)) return { type: this.resolveType(el.type), spread: true };
                    else if (ts.isOptionalTypeNode(el)) return { type: this.resolveType(el.type), optional: true };
                    return { type: this.resolveType(el) };
                }),
                kind: TypeKinds.TUPLE
            };
        }
        else if (ts.isTypePredicateNode(type)) {
            if (ts.isThisTypeNode(type.parameterName)) return { kind: TypeKinds.TYPE_PREDICATE, parameter: { kind: TypeKinds.THIS }, type: type.type && this.resolveType(type.type) };
            else return {
                kind: TypeKinds.TYPE_PREDICATE,
                parameter: type.parameterName.text,
                type: type.type && this.resolveType(type.type)
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
                typeParameter: { kind: TypeKinds.REFERENCE, type: { kind: TypeReferenceKinds.TYPE_PARAMETER, name: type.typeParameter.name.text } }
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
                spans: type.templateSpans.map(sp => ({ type: this.resolveType(sp.type), text: sp.literal.text })),
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
            return {
                type: this.resolveSymbolOrStr(type.exprName),
                kind: TypeKinds.TYPEOF_OPERATOR
            };
        }
        else if (ts.isConstructorTypeNode(type)) {
            return {
                kind: TypeKinds.CONSTRUCTOR_TYPE,
                returnType: type.type && this.resolveType(type.type),
                parameters: type.parameters?.map(param => this.resolveParameter(param)),
                typeParameters: type.typeParameters?.map(param => this.resolveTypeParameters(param))
            };
        }
        else switch (type.kind) {
        //@ts-expect-error This shouldn't be erroring.
        case ts.SyntaxKind.LiteralType: return this.resolveType((type as unknown as ts.LiteralType).literal);
        case ts.SyntaxKind.NumberKeyword: return { kind: TypeKinds.NUMBER };
        case ts.SyntaxKind.StringKeyword: return { kind: TypeKinds.STRING };
        case ts.SyntaxKind.BooleanKeyword: return { kind: TypeKinds.BOOLEAN };
        case ts.SyntaxKind.TrueKeyword: return { kind: TypeKinds.TRUE };
        case ts.SyntaxKind.FalseKeyword: return { kind: TypeKinds.FALSE };
        case ts.SyntaxKind.UndefinedKeyword: return { kind: TypeKinds.UNDEFINED };
        case ts.SyntaxKind.NullKeyword: return { kind: TypeKinds.NULL };
        case ts.SyntaxKind.VoidKeyword: return { kind: TypeKinds.VOID };
        case ts.SyntaxKind.AnyKeyword: return { kind: TypeKinds.ANY };
        case ts.SyntaxKind.UnknownKeyword: return { kind: TypeKinds.UNKNOWN };
        case ts.SyntaxKind.BigIntLiteral:
        case ts.SyntaxKind.PrefixUnaryExpression:
        case ts.SyntaxKind.PostfixUnaryExpression:
        case ts.SyntaxKind.NumericLiteral: return { name: (type as ts.NumericLiteral).text, kind: TypeKinds.NUMBER_LITERAL };
        case ts.SyntaxKind.StringLiteral: return { name: (type as ts.StringLiteral).text, kind: TypeKinds.STRING_LITERAL };
        case ts.SyntaxKind.RegularExpressionLiteral: return { name: (type as ts.RegularExpressionLiteral).text, kind: TypeKinds.REGEX_LITERAL };
        case ts.SyntaxKind.SymbolKeyword: return { kind: TypeKinds.SYMBOL };
        case ts.SyntaxKind.BigIntKeyword: return { kind: TypeKinds.BIGINT };
        case ts.SyntaxKind.NeverKeyword: return { kind: TypeKinds.NEVER };
        case ts.SyntaxKind.ObjectKeyword: return { kind: TypeKinds.OBJECT };
        default: return { name: type.pos === -1 ? "unknown" : type.getText(), kind: TypeKinds.STRINGIFIED_UNKNOWN };
        }
    }

    resolveReturnType(fn: ts.MethodDeclaration | ts.FunctionDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration | ts.FunctionExpression | ts.ArrowFunction): Type | undefined {
        if (fn.type) return this.resolveType(fn.type);
        const sig = this.extractor.checker.getSignatureFromDeclaration(fn);
        if (!sig) return;
        return this.resolveTypeType(sig.getReturnType());
    }

    resolveTypeParameters(generic: ts.TypeParameterDeclaration): TypeParameter {
        return {
            name: generic.name.text,
            default: generic.default ? this.resolveType(generic.default) : undefined,
            constraint: generic.constraint ? this.resolveType(generic.constraint) : undefined
        } as TypeParameter;
    }

    resolveObjectProperty(prop: ts.TypeElement): ObjectProperty {
        if (ts.isPropertySignature(prop)) {
            const computedName = ts.isComputedPropertyName(prop.name) && this.resolveExpressionToType(prop.name.expression);
            return {
                prop: {
                    name: computedName || (prop.name as ts.Identifier).text,
                    rawName: (prop.name as ts.Identifier).text,
                    type: prop.type && this.resolveType(prop.type),
                    isOptional: Boolean(prop.questionToken),
                    isReadonly: prop.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ReadonlyKeyword)
                },
                jsDoc: this.getJSDocData(prop)
            };
        }
        else if (ts.isMethodSignature(prop)) {
            const computedName = ts.isComputedPropertyName(prop.name) && this.resolveExpressionToType(prop.name.expression);
            return {
                prop: {
                    name: computedName || (prop.name as ts.Identifier).text,
                    rawName: (prop.name as ts.Identifier).text,
                    type: {
                        kind: TypeKinds.ARROW_FUNCTION,
                        parameters: prop.parameters?.map(param => this.resolveParameter(param)),
                        typeParameters: prop.typeParameters?.map(param => this.resolveTypeParameters(param)),
                        returnType: prop.type && this.resolveType(prop.type)
                    },
                    isOptional: Boolean(prop.questionToken),
                },
                jsDoc: this.getJSDocData(prop)
            };
        }
        else if (ts.isCallSignatureDeclaration(prop)) return {
            call: {
                parameters: prop.parameters?.map(param => this.resolveParameter(param)),
                typeParameters: prop.typeParameters?.map(param => this.resolveTypeParameters(param)),
                returnType: prop.type && this.resolveType(prop.type),
            },
            jsDoc: this.getJSDocData(prop)
        };
        else if (ts.isConstructSignatureDeclaration(prop)) return {
            construct: {
                parameters: prop.parameters.map(p => this.resolveParameter(p)),
                typeParameters: prop.typeParameters?.map(param => this.resolveTypeParameters(param)),
                returnType: prop.type && this.resolveType(prop.type),
            },
            jsDoc: this.getJSDocData(prop)
        };
        else {
            const param = (prop as ts.IndexSignatureDeclaration).parameters[0];
            return {
                index: {
                    key: param.type && this.resolveType(param.type),
                    type: this.resolveType((prop as ts.IndexSignatureDeclaration).type),
                    isReadonly: prop.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ReadonlyKeyword)
                },
                jsDoc: this.getJSDocData(prop)
            };
        }
    }

    resolveHeritage(param: ts.ExpressionWithTypeArguments): Type {
        return this.resolveSymbolOrStr(param.expression, param.typeArguments?.map(arg => this.resolveType(arg)));
    }

    resolveParameter(param: ts.ParameterDeclaration): FunctionParameter {
        const name = ts.isIdentifier(param.name) ? param.name.text : "__namedParameters";
        return {
            name,
            isOptional: Boolean(param.questionToken),
            rest: Boolean(param.dotDotDotToken),
            type: param.type && this.resolveType(param.type),
            defaultValue: param.initializer && this.resolveExpressionToType(param.initializer),
            jsDoc: { comment: this.getJSDocCommentOfParam(param) }
        };
    }

    resolveExpressionToType(exp: ts.Node): Type {
        if (ts.isNewExpression(exp)) return this.resolveSymbolOrStr(exp.expression, exp.typeArguments?.map(arg => this.resolveType(arg)));
        switch (exp.kind) {
        case ts.SyntaxKind.BigIntLiteral:
        case ts.SyntaxKind.PrefixUnaryExpression:
        case ts.SyntaxKind.PostfixUnaryExpression:
        case ts.SyntaxKind.NumericLiteral: return { name: exp.getText(), kind: TypeKinds.NUMBER_LITERAL };
        case ts.SyntaxKind.FalseKeyword: return { kind: TypeKinds.FALSE };
        case ts.SyntaxKind.TrueKeyword: return { kind: TypeKinds.TRUE };
        case ts.SyntaxKind.StringLiteral: return { name: (exp as ts.StringLiteral).text, kind: TypeKinds.STRING_LITERAL };
        case ts.SyntaxKind.NullKeyword: return { kind: TypeKinds.NULL };
        case ts.SyntaxKind.RegularExpressionLiteral: return { name: exp.getText(), kind: TypeKinds.REGEX_LITERAL };
        case ts.SyntaxKind.UndefinedKeyword: return { kind: TypeKinds.UNDEFINED };
        default: {
            const type = this.extractor.checker.getTypeAtLocation(exp);
            if (!type) return { kind: TypeKinds.STRINGIFIED_UNKNOWN, name: exp.getText() };
            if (type.symbol) {
                const aliased = this.resolveAliasedSymbol(type.symbol);
                if (this.extractor.refs.has(aliased)) return {
                    kind: TypeKinds.REFERENCE,
                    type: this.extractor.refs.get(aliased)!,
                    typeArguments: this.extractor.checker.getTypeArguments(type as ts.TypeReference)?.map(arg => this.resolveTypeType(arg))
                };
            }
            const res = this.resolveTypeType(type);
            if (res.kind === TypeKinds.UNKNOWN || (res as Reference).type?.kind === TypeReferenceKinds.UNKNOWN) return { kind: TypeKinds.STRINGIFIED_UNKNOWN, name: exp.getText() };
            return res;
        }
        }
    }

    resolveTypeType(type: ts.Type): Type {
        if (type.isStringLiteral()) return { kind: TypeKinds.STRING_LITERAL, name: type.value };
        else if (type.isNumberLiteral()) return { kind: TypeKinds.NUMBER_LITERAL, name: type.value.toString() };
        else if (type.isUnion()) return { kind: TypeKinds.UNION, types: type.types.map(v => this.resolveTypeType(v)) };
        else if (type.isIntersection()) return { kind: TypeKinds.INTERSECTION, types: type.types.map(v => this.resolveTypeType(v)) };
        else if (hasBit(type.flags, ts.TypeFlags.Unknown)) return { kind: TypeKinds.UNKNOWN };
        else if (hasBit(type.flags, ts.TypeFlags.String)) return { kind: TypeKinds.STRING };
        else if (hasBit(type.flags, ts.TypeFlags.Boolean)) return { kind: TypeKinds.BOOLEAN };
        else if (hasBit(type.flags, ts.TypeFlags.Number)) return { kind: TypeKinds.NUMBER };
        else if (hasBit(type.flags, ts.TypeFlags.Undefined)) return { kind: TypeKinds.UNDEFINED };
        else if (hasBit(type.flags, ts.TypeFlags.Null)) return { kind: TypeKinds.NULL };
        else if (hasBit(type.flags, ts.TypeFlags.Void)) return { kind: TypeKinds.VOID };
        else if (hasBit(type.flags, ts.TypeFlags.Never)) return { kind: TypeKinds.NEVER };
        else if (hasBit(type.flags, ts.TypeFlags.Any)) return { kind: TypeKinds.ANY };
        else if (hasBit(type.flags, ts.TypeFlags.ESSymbol)) return { kind: TypeKinds.SYMBOL };
        else if (hasBit(type.flags, ts.TypeFlags.BigIntLike)) return { kind: TypeKinds.BIGINT };
        const typeNode = this.extractor.checker.typeToTypeNode(type, undefined, undefined);
        if (typeNode) {
            if (typeNode.kind === ts.SyntaxKind.ArrayType) return { kind: TypeKinds.ARRAY_TYPE, type: this.resolveTypeType(this.extractor.checker.getTypeArguments(type as unknown as ts.TypeReference)[0]) };
            else if (typeNode.kind === ts.SyntaxKind.TupleType) return this.resolveType(typeNode);
        }
        if (type.symbol && type.symbol.name === "__object") {
            const properties: Array<ObjectProperty> = [];
            for (const property of type.getProperties()) {
                properties.push({
                    prop: {
                        name: property.name,
                        rawName: property.name,
                        type: this.resolveTypeType(this.extractor.checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration!))
                    }
                });
            }
            if (type.getNumberIndexType()) {
                properties.push({
                    index: {
                        key: { kind: TypeKinds.NUMBER },
                        type: this.resolveTypeType(type.getNumberIndexType()!)
                    }
                });
            }
            if (type.getStringIndexType()) {
                properties.push({
                    index: {
                        key: { kind: TypeKinds.STRING },
                        type: this.resolveTypeType(type.getStringIndexType()!)
                    }
                });
            }
            return {
                kind: TypeKinds.OBJECT_LITERAL,
                properties
            };
        }
        else if (type.isTypeParameter()) return { kind: TypeKinds.REFERENCE, type: { kind: TypeReferenceKinds.TYPE_ALIAS, name: type.symbol.name } };
        else {
            const sig = this.extractor.checker.getSignaturesOfType(type, ts.SignatureKind.Call)[0];
            if (sig) return {
                kind: TypeKinds.ARROW_FUNCTION,
                parameters: sig.parameters.map(p => ({
                    type: this.resolveTypeType(this.extractor.checker.getTypeOfSymbolAtLocation(p, p.valueDeclaration!)),
                    name: p.name,
                    rest: Boolean((p.declarations![0] as ts.ParameterDeclaration).dotDotDotToken)
                })),
                typeParameters: sig.typeParameters?.map<TypeParameter>(p => ({
                    name: p.symbol.name,
                    default: p.getDefault() ? this.resolveTypeType(p.getDefault()!) : undefined,
                    constraint: p.getConstraint() ? this.resolveTypeType(p.getConstraint()!) : undefined,
                })),
                returnType: this.resolveTypeType(sig.getReturnType())
            };
        }
        const typeStr = this.extractor.checker.typeToString(type);
        if (typeStr === "true") return { kind: TypeKinds.TRUE };
        else if (typeStr === "false") return { kind: TypeKinds.FALSE };
        const sym = (type as ts.Type).getSymbol();
        if (sym) return this.resolveSymbol(sym, this.extractor.checker.getTypeArguments(type as unknown as ts.TypeReference).map(t => this.resolveTypeType(t)));
        return { kind: TypeKinds.STRINGIFIED_UNKNOWN, name: typeStr };
    }

    resolveAliasedSymbol(symbol: ts.Symbol): ts.Symbol {
        while (hasBit(symbol.flags, ts.SymbolFlags.Alias)) {
            const newSym = this.extractor.checker.getAliasedSymbol(symbol);
            if (newSym.name === "unknown") return symbol;
            symbol = newSym;
        }
        return symbol;
    }

    getJSDocCommentOfParam(node: ts.ParameterDeclaration): string | undefined {
        const tag = ts.getJSDocParameterTags(node)[0];
        if (!tag) return;
        return ts.getTextOfJSDocComment(tag.comment);
    }

    resolveSymbolFileName(sym: ts.Symbol): string {
        return sym.name.slice(1, -1) + ".ts";
    }

    getJSDocData(node: ts.Node): Array<JSDocData> | undefined {
        //@ts-expect-error Internal access - Why is this internal?
        const jsDoc = node.jsDoc as Array<ts.JSDoc>;
        if (!jsDoc || !jsDoc.length) return undefined;
        const res: Array<JSDocData> = [];
        for (const currentDoc of jsDoc) {
            let tags: Array<JSDocTag> | undefined = undefined;
            if (currentDoc.tags) {
                tags = [];
                for (const tag of currentDoc.tags) {
                    tags.push({
                        name: tag.tagName.text,
                        comment: ts.getTextOfJSDocComment(tag.comment),
                        arg: (tag as { name?: ts.Identifier }).name?.text,
                        type: (tag as { typeExpression?: ts.JSDocTypeExpression }).typeExpression && this.resolveType((tag as unknown as { typeExpression: ts.JSDocTypeExpression }).typeExpression.type)
                    });
                }
            }
            res.push({ comment: ts.getTextOfJSDocComment(currentDoc.comment), tags });
        }
        return res;
    }

    getLOC(currentModule: Module, node: ts.Node, sourceFile = node.getSourceFile(), includeLine = true): Loc {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        if (!currentModule.repository) return { pos };
        if (currentModule.isNamespace) return { pos, sourceFile: `${currentModule.repository.slice(0, currentModule.repository.indexOf("#"))}#L${pos.line + 1}` };
        return {
            pos,
            sourceFile: currentModule.repository && `${currentModule.repository}/${getLastItemFromPath(sourceFile.fileName)}${includeLine ? `#L${pos.line + 1}` : ""}`
        };
    }

    moduleToJSON(module = this.module): Record<string, unknown> {
        const clone: Record<string, unknown> = { ...module };
        clone.modules = [];
        for (const [, mod] of module.modules) {
            (clone.modules as Array<Record<string, unknown>>).push(this.moduleToJSON(mod));
        }
        return clone;
    }

    toJSON(): Record<string, unknown> {
        return {
            readme: this.readme,
            repository: this.repository,
            homepage: this.homepage,
            module: this.moduleToJSON()
        };
    }

    isInternalNode(node: ts.Node): boolean | undefined {
        //@ts-expect-error Internal access
        return this.extractor.settings.stripInternal && node.jsDoc?.some(t => t.tags && t.tags.some(tag => tag.tagName.text === "internal"));
    }

}