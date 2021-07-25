
export interface Module {
    name: string,
    modules: Map<string, Module>,
    classes: Array<ClassDecl>,
    functions: Array<FunctionDecl>,
    interfaces: Array<InterfaceDecl>,
    types: Array<TypeDecl>,
    enums: Array<EnumDecl>,
    constants: Array<ConstantDecl>,
    sourceFile: string
}

export interface Node {
    name: string,
    start: number,
    end: number
}

export function createModule(name: string, sourceFile: string) : Module {
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
    };
}

export const enum ReferenceTypes {
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
    UNKNOWN
}

export interface Reference {
    name: string,
    path?: Array<string>,
    typeParameters?: Array<TypeOrLiteral>,
    type: ReferenceTypes
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

export interface ClassDecl extends Node {
    typeParameters?: Array<TypeParameter>,
    properties?: Array<ClassProperty>,
    methods?: Array<ClassMethod>,
    extends?: Reference,
    constructor?: ArrowFunction,
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
    parameters?: Array<FunctionParameter>
}

export interface ObjectLiteral extends Omit<Node, "name">  {
    properties: Array<InterfaceProperty>
}

export interface Union extends Omit<Node, "name"> {
    left: TypeOrLiteral,
    right: TypeOrLiteral
}

export interface InterfaceProperty extends Node {
    type: TypeOrLiteral,
    isOptional: boolean
}

export interface InterfaceDecl extends Node {
    properties: Array<InterfaceProperty>,
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
}