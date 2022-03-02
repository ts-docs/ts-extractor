import ts from "typescript";
import { FileExports } from "./ExportHandler";

export interface Module {
    name: string,
    modules: Map<string, Module>,
    classes: ClassDecl[],
    functions: FunctionDecl[],
    interfaces: InterfaceDecl[],
    types: TypeDecl[],
    enums: EnumDecl[],
    constants: ConstantDecl[],
    repository?: string,
    isGlobal?: boolean,
    isNamespace?: boolean,
    exports: Record<string, FileExports>,
    path: Array<string>,
    ref: ReferenceType,
    /**
     * Only present in namespace modules
     */
    jsDoc?: Array<JSDocData>,
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
    sourceFile?: string,
    filename?: string
}

export interface Node {
    name: string,
    loc: Loc
    jsDoc?: Array<JSDocData>,
    /**
     * Only classes, interfaces, enums, functions, types and constants have an ID, and they only have it if there is another thing of the same type with the same name.
     */
    id?: number,
    isCached?: boolean
}

export type NamelessNode = Omit<Node, "name">;
export type LoclessNode = Omit<Node, "loc" | "name">

export type NodeWithManyLOC = {
    name: string,
    jsDoc?: Array<JSDocData>,
    isExported?: boolean
    loc: Array<Loc>,
    id?: number,
    isCached?: boolean
}

export function createModule(name: string, path: Array<string>, isGlobal?: boolean, repository?: string, isNamespace?: boolean) : Module {
    return {
        name,
        repository,
        modules: new Map(),
        classes: [],
        functions: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
        isGlobal,
        isNamespace,
        exports: {},
        path,
        ref: {
            kind: TypeReferenceKinds.NAMESPACE_OR_MODULE,
            path,
            name
        }
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
    INFER_TYPE,
    REGEX_LITERAL,
    CONSTRUCTOR_TYPE
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
    NAMESPACE_OR_MODULE,
    EXTERNAL,
    INTERNAL
}

export const enum DeclarationTypes {
    CLASS,
    INTERFACE,
    ENUM,
    FUNCTION,
    CONSTANT,
    TYPE_ALIAS
}

export function createRefFromDecl(decl: Declaration, module: Module) : Reference {
    return {
        kind: TypeKinds.REFERENCE,
        type: {
            name: decl.name,
            kind: decl.kind as unknown as TypeReferenceKinds,
            path: module.path,
            id: decl.id
        }
    };
}

export interface ReferenceType {
    name: string,
    /**
     * The display name of the reference. If the reference is an enum member, this will be set to the **member**'s name,
     * while the [[ReferenceType.name]] property will be set to the enum's name.
     */
    displayName?: string,
    /**
     * The module path to the reference. External references, unknown references and stringified unknown references don't have a path.
     */
    path?: Array<string>,
    /**
     * If this property is not undefined, then the reference is external. External references don't have a path.
     */
    link?: string,
    id?: number,
    kind: TypeReferenceKinds
}

export interface BaseType {
    kind: TypeKinds
}

export interface Reference extends BaseType {
    type: ReferenceType,
    typeArguments?: Array<Type>,
    kind: TypeKinds.REFERENCE
}

export type Type = Reference | Literal | ArrowFunction | ObjectLiteral | UnionOrIntersection | TypeOperator | Tuple | ArrayType | MappedType | ConditionalType | TemplateLiteralType | IndexAccessedType | TypePredicateType | InferType | ConstructorType | StringifiedUnknown;

export interface StringifiedUnknown extends BaseType {
    name: string,
    kind: TypeKinds.STRINGIFIED_UNKNOWN
}

/**
 * `string`, `number`, `boolean`, etc.
 */
export interface Literal extends BaseType {
    name: string,
    kind: TypeKinds.NUMBER_LITERAL | TypeKinds.STRING_LITERAL | TypeKinds.BOOLEAN | TypeKinds.REGEX_LITERAL
}

export interface TypeParameter {
    name: string
    default?: Type,
    constraint?: Type
}

export interface ClassMember extends Node {
    isPublic?: boolean,
    isPrivate?: boolean,
    isStatic?: boolean,
    isProtected?: boolean,
    isAbstract?: boolean
}

export interface Property {
    name: string | Type,
    rawName: string
    type?: Type,
    isReadonly?: boolean,
    isOptional?: boolean,
    initializer?: Type
    exclamation?: boolean,
}

/**
 * Only [[ObjectProperty.prop]] and [[ObjectProperty.index]] are possible. 
 * The [[ClassProperty.isReadonly as readonly]] property is only present if the [[ClassProperty.index]]
 * property is not undefined.
 */
export interface ClassProperty extends Omit<ClassMember, "name">, ObjectProperty {
    exclamation?: boolean,
    isReadonly?: boolean
}

export interface FunctionParameter {
    name: string,
    type?: Type,
    rest?: boolean,
    isOptional?: boolean,
    defaultValue?: Type,
    jsDoc?: JSDocData
}

export interface FunctionSignature extends LoclessNode {
    parameters?: Array<FunctionParameter>,
    typeParameters?: Array<TypeParameter>,
    returnType?: Type
}

export interface ClassMethod extends Omit<ClassMember, "name"> {
    signatures: Array<FunctionSignature>,
    isGetter?: boolean,
    isSetter?: boolean,
    isGenerator?: boolean,
    name: string | Type,
    rawName: string
}

export type ClassConstructor = Omit<FunctionDecl, "name"|"kind">

export interface ClassDecl extends Node {
    typeParameters?: Array<TypeParameter>,
    properties: Array<ClassProperty>,
    methods: Array<ClassMethod>,
    extends?: Reference,
    _constructor?: ClassConstructor,
    implements?: Array<Type>,
    isAbstract?: boolean,
    kind: DeclarationTypes.CLASS
}

export interface FunctionDecl extends Node {
    signatures: Array<FunctionSignature>,
    isGenerator?: boolean,
    kind: DeclarationTypes.FUNCTION
}

export type ConstructorType = FunctionSignature & BaseType;

/**
 * `(...parameters) => returnValue`
 */
export interface ArrowFunction extends BaseType {
    typeParameters?: Array<TypeParameter>,
    returnType?: Type,
    parameters?: Array<FunctionParameter>,
    kind: TypeKinds.ARROW_FUNCTION
}

/**
 * `[key: string]: type`
 * 
 * `key` is the type of the key, `type` is the type of the value.
 */
export interface IndexSignatureDeclaration {
    key?: Type,
    type: Type,
    isReadonly?: boolean
}

/**
 * `{ someProperty: type }`
 */
export interface ObjectLiteral extends BaseType {
    properties: Array<ObjectProperty>,
    kind: TypeKinds.OBJECT_LITERAL
}

/**
 * `a | b` or `a & b`
 */
export interface UnionOrIntersection extends BaseType {
    types: Array<Type>,
    kind: TypeKinds.UNION | TypeKinds.INTERSECTION
}

/**
 * ```ts
 * keyof a
 * unqiue a
 * readonly a
 * typeof a
 * ```
 */
export interface TypeOperator extends BaseType {
    type: Type,
    kind: TypeKinds.TYPEOF_OPERATOR | TypeKinds.UNIQUE_OPERATOR | TypeKinds.READONLY_OPERATOR | TypeKinds.KEYOF_OPERATOR
}

export interface TupleMember {
    type: Type,
    spread?: boolean,
    name?: string,
    optional?: boolean
}

/**
 * `[a, b, c]`
 */
export interface Tuple extends BaseType {
    types: Array<TupleMember>,
    kind: TypeKinds.TUPLE
}

/**
 * `a[]`
 */
export interface ArrayType extends BaseType {
    type: Type,
    kind: TypeKinds.ARRAY_TYPE
}

export interface ObjectProperty {
    /**
     * Will only be present if the interface property is a property, for example:
     * ```
     * name: type
     * ```
     */
    prop?: Property,
    /**
     * Will only be present if the interface property is an index:
     * ```
     * [key: type1]: type2
     * ```
     */
    index?: IndexSignatureDeclaration,
    /**
     * Will only be present if the interface property is a call signature:
     * ```
     * (...params) => value
     * ```
     */
    call?: FunctionSignature,
    /**
     * Will only be present if the interface property is a constructor signature
     * ```
     * new (...params) => value
     * ```
     */
    construct?: FunctionSignature,
    jsDoc?: Array<JSDocData>
}

export interface InterfaceDecl extends NodeWithManyLOC {
    properties: Array<ObjectProperty>,
    typeParameters?: Array<TypeParameter>
    extends?: Array<Type>,
    implements?: Array<Type>,
    kind: DeclarationTypes.INTERFACE
}

export interface TypeDecl extends Node {
    value?: Type,
    typeParameters?: Array<TypeParameter>,
    kind: DeclarationTypes.TYPE_ALIAS
}

export interface ConstantDecl extends Node {
    type?: Type|undefined,
    content?: string,
    kind: DeclarationTypes.CONSTANT
}

export interface EnumMember extends Node {
    initializer?: Type
}

export interface EnumDecl extends NodeWithManyLOC {
    members: Array<EnumMember>
    isConst: boolean,
    kind: DeclarationTypes.ENUM
}

/**
 * ```ts
 * type OptionsFlags<Type> = {
 * [Property in keyof Type]: boolean;
 * };
 * ```
 */
export interface MappedType extends BaseType {
    typeParameter: string,
    constraint?: Type,
    optional?: boolean,
    type?: Type,
    kind: TypeKinds.MAPPED_TYPE
}

/**
 * ```ts
 * a extends b ? number : string;
 * ```
 */
export interface ConditionalType extends BaseType {
    checkType: Type,
    extendsType: Type,
    trueType: Type,
    falseType: Type,
    kind: TypeKinds.CONDITIONAL_TYPE
}

/**
 * ```ts
 * type World = "world";
 * type Greeting = `hello ${World}`;
 * ```
 */
export interface TemplateLiteralType extends BaseType {
    head: string,
    spans: Array<{type: Type, text: string}>,
    kind: TypeKinds.TEMPLATE_LITERAL
}

/**
 * ```ts
 * type Person = { age: number; name: string; alive: boolean };
 * type Age = Person["age"];
 * ```
 */
export interface IndexAccessedType extends BaseType {
    object: Type,
    index: Type,
    kind: TypeKinds.INDEX_ACCESS
}

/**
 * Parameter can either be [[TypeKinds.THIS]] or a parameter name.
 */
export interface TypePredicateType extends BaseType {
    parameter: Type|string, 
    type: Type,
    kind: TypeKinds.TYPE_PREDICATE
}

export interface InferType extends BaseType {
    typeParameter: Reference,
    kind: TypeKinds.INFER_TYPE
}

export type Declaration = ClassDecl | InterfaceDecl | EnumDecl | FunctionDecl | TypeDecl | ConstantDecl;