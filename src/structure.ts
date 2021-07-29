import ts from "typescript";

export interface Module {
    name: string,
    modules: Map<string, Module>,
    classes: Map<string, ClassDecl>,
    functions: Array<FunctionDecl>,
    interfaces: Map<string, InterfaceDecl>,
    types: Map<string, TypeDecl>,
    enums: Map<string, EnumDecl>,
    constants: Array<ConstantDecl>,
    repository?: string,
    isGlobal?: boolean
}

export interface JSDocData {
    tags?: Array<string>,
    comment?: string
}

export interface Node {
    name: string,
    pos: ts.LineAndCharacter,
    sourceFile?: string,
    jsDoc?: JSDocData,
    isExported?: boolean
}

export interface PotentiallyNamelessNode {
    name?: string,
    pos: ts.LineAndCharacter,
    sourceFile?: string,
    jsDoc?: JSDocData,
    isExported?: boolean
}

export function createModule(name: string, isGlobal?: boolean, repository?: string) : Module {
    return {
        name,
        repository,
        modules: new Map(),
        classes: new Map(),
        functions: [],
        interfaces: new Map(),
        types: new Map(),
        enums: new Map(),
        constants: [],
        isGlobal
    };
}

export const enum TypeKinds {
    CLASS,
    INTERFACE,
    ENUM,
    FUNCTION,
    CONSTANT,
    NUMBER,
    STRING,
    BOOLEAN,
    VOID,
    TRUE,
    FALSE,
    UNDEFINED,
    NULL,
    ANY,
    STRINGIFIED_UNKNOWN,
    UNKNOWN,
    ARROW_FUNCTION,
    OBJECT_LITERAL,
    TYPE_ALIAS,
    TUPLE,
    TYPE_PARAMETER,
    UNION,
    UNIQUE_OPERATOR,
    READONLY_OPERATOR,
    KEYOF_OPERATOR,
    ARRAY_TYPE,
    INTERSECTION
}

export interface ReferenceType {
    name: string,
    path?: Array<string>,
    external?: string,
    kind: TypeKinds
}

export interface Reference {
    type: ReferenceType,
    typeParameters?: Array<TypeOrLiteral>
}

export interface Type {
    kind: TypeKinds
}

export interface Literal extends Type {
    name: string
}

export type TypeOrLiteral = Reference | ObjectLiteral | ArrowFunction | UnionOrIntersection | Literal | TypeOperator | ArrayType;

export interface TypeParameter extends Node {
    default?: TypeOrLiteral,
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
    type?: TypeOrLiteral,
    isOptional?: boolean,
    isReadonly?: boolean,
    exclamation?: boolean
}

export interface FunctionParameter {
    name: string,
    type?: TypeOrLiteral,
    rest?: boolean,
    isOptional?: boolean,
    defaultValue?: string,
    jsDoc: JSDocData
}

export interface ClassMethod extends ClassMember {
    typeParameters?: Array<TypeParameter>,
    returnType?: TypeOrLiteral,
    parameters?: Array<FunctionParameter>
}

export type Constructor = Omit<ArrowFunction, "kind">

export interface ClassDecl extends PotentiallyNamelessNode {
    typeParameters?: Array<TypeParameter>,
    properties: Array<ClassProperty>,
    methods: Array<ClassMethod>,
    extends?: Reference,
    constructor?: Constructor,
    implements?: Array<TypeOrLiteral>,
    isAbstract?: boolean
}

export interface FunctionDecl extends PotentiallyNamelessNode {
    typeParameters?: Array<TypeParameter>,
    returnType?: TypeOrLiteral,
    parameters: Array<FunctionParameter>
}

// (...parameters) => returnValue
export interface ArrowFunction extends Type {
    typeParameters?: Array<TypeParameter>,
    returnType?: TypeOrLiteral,
    parameters?: Array<FunctionParameter>
}

export interface IndexSignatureDeclaration {
    key?: TypeOrLiteral,
    type: TypeOrLiteral
}

// { a: type }
export interface ObjectLiteral extends Type {
    properties: Array<InterfaceProperty|IndexSignatureDeclaration>,
}

// a | b , a & b
export interface UnionOrIntersection  extends Type {
    types: Array<TypeOrLiteral>
}

// keyof a, unqiue a, readonly a
export interface TypeOperator extends Type {
    type: TypeOrLiteral
}

// [a, b, c]
export interface Tuple extends Type {
    types: Array<TypeOrLiteral>,
}

// a[]
export interface ArrayType extends Type {
    type: TypeOrLiteral
}

export interface InterfaceProperty {
    name: string,
    type?: TypeOrLiteral,
    isReadonly?: boolean,
    isOptional: boolean
}

export interface InterfaceDecl extends Node {
    properties: Array<InterfaceProperty|IndexSignatureDeclaration>,
    extends?: TypeOrLiteral,
    implements?: Array<TypeOrLiteral>
}

export interface TypeDecl extends Node {
    value?: TypeOrLiteral
}

export interface ConstantDecl extends Node {
    type?: TypeOrLiteral|undefined,
    content?: string
}

export interface EnumMember extends Node {
    initializer?: string
}

export interface EnumDecl extends Node {
    members: Array<EnumMember>
    const: boolean
}