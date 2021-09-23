import ts from "typescript";
import { Project } from ".";


/**
 * If the `references` property is an empty array, then everything (*) is exported from the module.
 */
export interface ModuleExport {
    module: ReferenceType,
    alias?: string,
    references: Array<AliasedReference>
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

export function createModuleRef(mod: Module, project: Project) : ReferenceType {
    return { kind: TypeReferenceKinds.NAMESPACE_OR_MODULE, path: mod.path, moduleName: project.module.name, name: mod.name }; 
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

/**
 * If the object's [[ReferenceType.link]] property is not undefined, then that means it's an **external**
 * object. The [[ReferenceType.moduleName]] property will be set to the external library's name.
 * 
 * [[ReferenceType.displayName]] is only present when the referenced item is an **enum member**. The
 * property will be set to the member's name, while the **name** property will be set to the enum name.
 * 
 * Type parameters and [[TypeReferenceKinds.STRINGIFIED_UNKNOWN]] do not have a [[ReferenceType.moduleName]] property.
 */
export interface ReferenceType {
    name: string,
    displayName?: string,
    path?: Array<string>,
    link?: string,
    moduleName?: string,
    kind: TypeReferenceKinds
}

export interface BaseType {
    kind: TypeKinds
}

export interface Reference extends BaseType {
    type: ReferenceType,
    typeArguments?: Array<Type>
}

export type Type = Reference | Literal | ArrowFunction | ObjectLiteral | UnionOrIntersection | TypeOperator | Tuple | ArrayType | MappedType | ConditionalType | TemplateLiteralType | IndexAccessedType | TypePredicateType | InferType;

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
    properties: Array<Property|IndexSignatureDeclaration>,
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

export interface InterfaceProperty {
    value: Property|IndexSignatureDeclaration|ArrowFunction,
    jsDoc?: Array<JSDocData>
}

export interface InterfaceDecl extends NodeWithManyLOC {
    properties: Array<InterfaceProperty>,
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