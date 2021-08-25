import ts from "typescript";

export interface Module {
    name: string,
    modules: Map<string, Module>,
    classes: Map<string, ClassDecl>,
    functions: Map<string, FunctionDecl>,
    interfaces: Map<string, InterfaceDecl>,
    types: Map<string, TypeDecl>,
    enums: Map<string, EnumDecl>,
    constants: Map<string, ConstantDecl>,
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

export type NamelessNode = Omit<Node, "name">;
export type LoclessNode = Omit<Node, "loc" | "name">

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
        constants: new Map(),
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
    NUMBER_LITERAL,
    STRING_LITERAL,
    MAPPED_TYPE,
    CONDITIONAL_TYPE,
    TEMPLATE_LITERAL,
    INDEX_ACCESS,
    TYPEOF_OPERATOR,
    SYMBOL,
    BIGINT,
    TYPE_PREDICATE,
    THIS,
    NEVER,
    OBJECT,
    INFER_TYPE
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
    ENUM_MEMBER,
    DEFAULT_API,
    NAMESPACE_OR_MODULE
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

export interface Reference extends BaseType {
    type: ReferenceType,
    typeParameters?: Array<Type>
}

export type Type = Reference | Literal | ArrowFunction | ObjectLiteral | UnionOrIntersection | TypeOperator | Tuple | ArrayType | MappedType | ConditionalType | TemplateLiteralType | IndexAccessedType | TypePredicateType | InferType;

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

export interface Property {
    name: string,
    type?: Type,
    isReadonly?: boolean,
    isOptional: boolean,
    initializer?: Type
}

export interface ClassProperty extends ClassMember, Property {
    type?: Type,
    exclamation?: boolean,
}

export interface FunctionParameter {
    name: string,
    type?: Type,
    rest?: boolean,
    isOptional?: boolean,
    defaultValue?: Type,
    jsDoc: JSDocData
}

export interface FunctionSignature extends LoclessNode {
    parameters?: Array<FunctionParameter>,
    typeParameters?: Array<TypeParameter>,
    returnType?: Type
}

export interface ClassMethod extends ClassMember {
    signatures: Array<FunctionSignature>,
    isGetter?: boolean,
    isSetter?: boolean
}

export interface ClassDecl extends Node {
    typeParameters?: Array<TypeParameter>,
    properties: Array<ClassProperty>,
    methods: Array<ClassMethod>,
    extends?: Reference,
    _constructor?: Omit<FunctionDecl, "name">,
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
    properties: Array<Property|IndexSignatureDeclaration>,
}

// a | b , a & b
export interface UnionOrIntersection  extends BaseType {
    types: Array<Type>
}

// keyof a, unqiue a, readonly a, typeof a
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

export interface InterfaceDecl extends NodeWithManyLOC {
    properties: Array<Property|IndexSignatureDeclaration|ArrowFunction>,
    typeParameters?: Array<TypeParameter>
    extends?: Array<Type>,
    implements?: Array<Type>
}

export interface TypeDecl extends Node {
    value?: Type,
    typeParameters?: Array<TypeParameter>
}

export interface ConstantDecl extends Node {
    type?: Type|undefined,
    content?: string
}

export interface EnumMember extends Node {
    initializer?: Type
}

export interface EnumDecl extends NodeWithManyLOC {
    members: Array<EnumMember>
    const: boolean
}

export interface MappedType extends BaseType {
    typeParameter: string,
    constraint?: Type,
    optional?: boolean,
    type?: Type
}

export interface ConditionalType extends BaseType {
    checkType: Type,
    extendsType: Type,
    trueType: Type,
    falseType: Type
}

export interface TemplateLiteralType extends BaseType {
    head: string,
    spans: Array<{type: Type, text: string}>
}

export interface IndexAccessedType extends BaseType {
    object: Type,
    index: Type
}

/**
 * Parameter can either be [[TypeKinds.THIS]] or a parameter name.
 */
export interface TypePredicateType extends BaseType {
    parameter: Type|string, 
    type: Type
}

export interface InferType extends BaseType {
    typeParameter: TypeParameter
}