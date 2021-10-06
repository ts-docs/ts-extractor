import ts from "typescript";

/**
 * If the `references` property is an empty array, then everything (*) is exported from the module.
 */
export interface ModuleExport {
    module: ReferenceType,
    alias?: string,
    references: Array<AliasedReference>,
    /**
     * If the module re-exports a re-export with an "alias". Confusing, I know.
     */
    reExportsReExport?: string
}

export interface AliasedReference extends ReferenceType {
    alias?: string
}

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
    reExports: Array<ModuleExport>,
    exports: Array<AliasedReference>,
    path: Array<string>
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
    isExported?: boolean,
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
        reExports: [],
        exports: [],
        isGlobal,
        isNamespace,
        path
    };
}

export function createModuleRef(mod: Module) : ReferenceType {
    return { kind: TypeReferenceKinds.NAMESPACE_OR_MODULE, path: mod.path, name: mod.name }; 
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
    EXTERNAL
}

export interface ReferenceType {
    name: string,
    /**
     * The display name of the reference. If the reference is an enum member, this will be set to the **member**'s name,
     * while the [[ReferenceType.name]] property will be set to the enum's name.
     */
    displayName?: string,
    /**
     * The module path to the reference.
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
    typeArguments?: Array<Type>
}

export type Type = Reference | Literal | ArrowFunction | ObjectLiteral | UnionOrIntersection | TypeOperator | Tuple | ArrayType | MappedType | ConditionalType | TemplateLiteralType | IndexAccessedType | TypePredicateType | InferType | ConstructorType;

/**
 * `string`, `number`, `boolean`, etc.
 */
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
    exclamation?: boolean,
}

export interface ClassProperty extends ClassMember, Property {
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

export interface ClassMethod extends Omit<ClassMember, "name"> {
    signatures: Array<FunctionSignature>,
    isGetter?: boolean,
    isSetter?: boolean,
    name: string | Type,
    realName?: string
}

export type ClassConstructor = Omit<FunctionDecl, "name">

export interface ClassDecl extends Node {
    typeParameters?: Array<TypeParameter>,
    properties: Array<ClassProperty|IndexSignatureDeclaration>,
    methods: Array<ClassMethod>,
    extends?: Reference,
    _constructor?: ClassConstructor,
    implements?: Array<Type>,
    isAbstract?: boolean
}

export interface FunctionDecl extends Node {
    signatures: Array<FunctionSignature>
}

export type ConstructorType = FunctionSignature & BaseType;

/**
 * `(...parameters) => returnValue`
 */
export interface ArrowFunction extends BaseType {
    typeParameters?: Array<TypeParameter>,
    returnType?: Type,
    parameters?: Array<FunctionParameter>
}

/**
 * `[key: string]: type`
 * 
 * `key` is the type of the key, `type` is the type of the value.
 */
export interface IndexSignatureDeclaration {
    key?: Type,
    type: Type
}

/**
 * `{ someProperty: type }`
 */
export interface ObjectLiteral extends BaseType {
    properties: Array<ObjectProperty>,
}

/**
 * `a | b` or `a & b`
 */
export interface UnionOrIntersection extends BaseType {
    types: Array<Type>
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
    type: Type
}

/**
 * `[a, b, c]`
 */
export interface Tuple extends BaseType {
    types: Array<Type>,
}

/**
 * `a[]`
 */
export interface ArrayType extends BaseType {
    type: Type
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
     * (...params) => value
     */
    call?: FunctionSignature,
    /**
     * Will only be present if the interface property is a constructor signature
     * new (...params) => value
     */
    construct?: FunctionSignature,
    jsDoc?: Array<JSDocData>
}

export interface InterfaceDecl extends NodeWithManyLOC {
    properties: Array<ObjectProperty>,
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
    isConst: boolean
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
    type?: Type
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
    falseType: Type
}

/**
 * ```ts
 * type World = "world";
 * type Greeting = `hello ${World}`;
 * ```
 */
export interface TemplateLiteralType extends BaseType {
    head: string,
    spans: Array<{type: Type, text: string}>
}

/**
 * ```ts
 * type Person = { age: number; name: string; alive: boolean };
 * type Age = Person["age"];
 * ```
 */
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