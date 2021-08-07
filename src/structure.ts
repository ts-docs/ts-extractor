import ts from "typescript";

export interface Module {
    name: string,
    modules: Map<string, Module>,
    classes: Map<string, ClassDecl>,
    functions: Map<string, FunctionDecl>,
    interfaces: Map<string, InterfaceDecl>,
    types: Map<string, TypeDecl>,
    enums: Map<string, EnumDecl>,
    constants: Array<ConstantDecl>,
    repository?: string,
    isGlobal?: boolean,
    isNamespace?: boolean
}

export interface JSDocTag {
    name: string,
    comment?: string,
    arg?: string,
    type?: Type
}

export interface JSDocData {
    tags?: Array<JSDocTag>,
    comment?: string
}

export interface Loc {
    pos: ts.LineAndCharacter,
    sourceFile?: string
}

export interface Node {
    name: string,
    loc: Loc
    jsDoc?: Array<JSDocData>,
    isExported?: boolean
}

export interface NamelessNode {
    loc: Loc
    jsDoc?: Array<JSDocData>,
    isExported?: boolean
}

export type NodeWithManyLOC = {
    name: string,
    jsDoc?: Array<JSDocData>,
    isExported?: boolean
    loc: Array<Loc>
}

export function createModule(name: string, isGlobal?: boolean, repository?: string, isNamespace?: boolean) : Module {
    return {
        name,
        repository,
        modules: new Map(),
        classes: new Map(),
        functions: new Map(),
        interfaces: new Map(),
        types: new Map(),
        enums: new Map(),
        constants: [],
        isGlobal,
        isNamespace
    };
}

export const enum TypeKinds {
    REFERENCE,
    ARROW_FUNCTION,
    OBJECT_LITERAL,
    TUPLE,
    UNION,
    UNIQUE_OPERATOR,
    READONLY_OPERATOR,
    KEYOF_OPERATOR,
    UNKNOWN,
    STRINGIFIED_UNKNOWN,
    ARRAY_TYPE,
    INTERSECTION,
    NUMBER,
    STRING,
    BOOLEAN,
    VOID,
    TRUE,
    FALSE,
    UNDEFINED,
    NULL,
    ANY,
}

export const enum TypeReferenceKinds {
    CLASS,
    INTERFACE,
    ENUM,
    FUNCTION,
    CONSTANT,
    TYPE_ALIAS,
    TYPE_PARAMETER,
    UNKNOWN,
    STRINGIFIED_UNKNOWN,
    UNIQUE_OPERATOR,
    READONLY_OPERATOR,
    KEYOF_OPERATOR,
    ENUM_MEMBER,
    DEFAULT_API,
}


export interface ReferenceType {
    name: string,
    displayName?: string,
    path?: Array<string>,
    external?: string,
    kind: TypeReferenceKinds
}

export interface BaseType {
    kind: TypeKinds
}

export type Type = Reference | Literal | ArrowFunction | ObjectLiteral | UnionOrIntersection | TypeOperator | Tuple | ArrayType;

export interface Reference extends BaseType {
    type: ReferenceType,
    typeParameters?: Array<Type>
}

export interface Literal extends BaseType {
    name: string
}

export interface TypeParameter extends Node {
    default?: Type,
    constraint?: Reference
}

export interface ClassMember extends Node {
    isPublic?: boolean,
    isPrivate?: boolean,
    isStatic?: boolean,
    isProtected?: boolean,
    isAbstract?: boolean
}

export interface ClassProperty extends ClassMember {
    type?: Type,
    isOptional?: boolean,
    isReadonly?: boolean,
    exclamation?: boolean,
    initializer?: Type
}

export interface FunctionParameter {
    name: string,
    type?: Type,
    rest?: boolean,
    isOptional?: boolean,
    defaultValue?: string,
    jsDoc: JSDocData
}

export interface FunctionSignature extends NamelessNode {
    parameters?: Array<FunctionParameter>,
    typeParameters?: Array<TypeParameter>,
    returnType?: Type
}

export interface ClassMethod extends ClassMember {
    signatures: Array<FunctionSignature>
}

export type Constructor = Omit<ArrowFunction, "kind">


export interface ClassDecl extends Node {
    typeParameters?: Array<TypeParameter>,
    properties: Array<ClassProperty>,
    methods: Array<ClassMethod>,
    extends?: Reference,
    constructor?: Constructor,
    implements?: Array<Type>,
    isAbstract?: boolean
}

export interface FunctionDecl extends Node {
    signatures: Array<FunctionSignature>
}

// (...parameters) => returnValue
export interface ArrowFunction extends BaseType {
    typeParameters?: Array<TypeParameter>,
    returnType?: Type,
    parameters?: Array<FunctionParameter>
}

export interface IndexSignatureDeclaration {
    key?: Type,
    type: Type
}

// { a: type }
export interface ObjectLiteral extends BaseType {
    properties: Array<InterfaceProperty|IndexSignatureDeclaration>,
}

// a | b , a & b
export interface UnionOrIntersection  extends BaseType {
    types: Array<Type>
}

// keyof a, unqiue a, readonly a
export interface TypeOperator extends BaseType {
    type: Type
}

// [a, b, c]
export interface Tuple extends BaseType {
    types: Array<Type>,
}

// a[]
export interface ArrayType extends BaseType {
    type: Type
}

export interface InterfaceProperty {
    name: string,
    type?: Type,
    isReadonly?: boolean,
    isOptional: boolean
}

export interface InterfaceDecl extends NodeWithManyLOC {
    properties: Array<InterfaceProperty|IndexSignatureDeclaration>,
    typeParameters?: Array<TypeParameter>
    extends?: Type,
    implements?: Array<Type>
}

export interface TypeDecl extends Node {
    value?: Type
}

export interface ConstantDecl extends Node {
    type?: Type|undefined,
    content?: string
}

export interface EnumMember extends Node {
    initializer?: string
}

export interface EnumDecl extends NodeWithManyLOC {
    members: Array<EnumMember>
    const: boolean
}
