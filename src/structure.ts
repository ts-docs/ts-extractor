
export interface Module {
    name: string,
    modules: Map<string, Module>,
    classes: Array<ClassDecl>,
    functions: Array<FunctionDecl>,
    interfaces: Array<InterfaceDecl>,
    types: Array<TypeDecl>,
    enums: Array<EnumDecl>,
    constants: Array<ConstantDecl>,
    isGlobal?: boolean
    sourceFile: string
}

export interface Node {
    name: string,
    start: number,
    end: number,
    sourceFile?: string
}

export function createModule(name: string, sourceFile: string, isGlobal?: boolean) : Module {
    return {
        name,
        sourceFile,
        modules: new Map(),
        classes: [],
        functions: [],
        interfaces: [],
        types: [],
        enums: [],
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
    STRINGIFIED,
    UNKNOWN,
    ARROW_FUNCTION,
    OBJECT_LITERAL,
    UNION
}


export interface Reference {
    name: string,
    path?: Array<string>,
    typeParameters?: Array<TypeOrLiteral>,
    kind: TypeKinds
}

export type TypeOrLiteral = Reference | ObjectLiteral | ArrowFunction | Union;

export interface TypeParameter extends Node {
    default?: TypeOrLiteral,
    constraint?: Reference
}

export interface ClassMember extends Node {
    isPublic?: boolean,
    isPrivate?: boolean,
    isStatic?: boolean,
    isProtected?: boolean
}

export interface ClassProperty extends ClassMember {
    type?: TypeOrLiteral,
    optional?: boolean,
    exclamation?: boolean
}

export interface FunctionParameter extends Node {
    type?: TypeOrLiteral,
    rest?: boolean,
    optional?: boolean,
    defaultValue?: string
}

export interface ClassMethod extends ClassMember {
    typeParameters?: Array<TypeParameter>,
    returnType?: TypeOrLiteral,
    parameters?: Array<FunctionParameter>
}

export type Constructor = Omit<ArrowFunction, "kind">

export interface ClassDecl extends Node {
    typeParameters?: Array<TypeParameter>,
    properties?: Array<ClassProperty>,
    methods?: Array<ClassMethod>,
    extends?: Reference,
    constructor?: Constructor,
    implements?: Reference,
    isAbstract?: boolean
}

export interface FunctionDecl extends Node {
    typeParameters?: Array<TypeParameter>,
    returnType?: TypeOrLiteral,
    parameters?: Array<FunctionParameter>
}


export interface ArrowFunction extends Omit<Node, "name"> {
    typeParameters?: Array<TypeParameter>,
    returnType?: TypeOrLiteral,
    parameters?: Array<FunctionParameter>,
    kind: TypeKinds
}

export interface IndexSignatureDeclaration extends Omit<Node, "name"> {
    key?: TypeOrLiteral,
    type: TypeOrLiteral
}

export interface ObjectLiteral extends Omit<Node, "name">  {
    properties: Array<InterfaceProperty|IndexSignatureDeclaration>,
    kind: TypeKinds
}

export interface Union extends Omit<Node, "name"> {
    left: TypeOrLiteral,
    right: TypeOrLiteral,
    kind: TypeKinds
}

export interface InterfaceProperty extends Node {
    type?: TypeOrLiteral,
    optional: boolean
}

export interface InterfaceDecl extends Node {
    properties: Array<InterfaceProperty|IndexSignatureDeclaration>,
}

export interface TypeDecl extends Node {
    value: TypeOrLiteral
}

export interface ConstantDecl extends Node {
    type?: TypeOrLiteral|undefined,
    content: string
}

export interface EnumMember extends Node {
    initializer?: string
}

export interface EnumDecl extends Node {
    members: Array<EnumMember>
    const: boolean
}