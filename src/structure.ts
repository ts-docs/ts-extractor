
export interface Module {
    name: string,
    modules: Array<Module>,
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
        modules: [],
        classes: [],
        functions: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: []
    };
}

export interface Reference {
    name: string,
    path?: Array<string>,
    typeParameters?: Array<TypeParameter>
}

export interface Literal {
    stringified: string,
    object?: ObjectLiteral | ArrowFunction | Union; 
}

export type TypeOrLiteral = Reference | Literal;

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
    typeParameters?: TypeParameter,
    optional?: boolean,
    exclamation?: boolean
}

export interface FunctionParameter extends Node {
    type?: TypeOrLiteral,
    isRest?: boolean,
    isOptional?: boolean,
    defaultValue?: string
}

export interface ClassMethod extends ClassMember {
    typeParameters?: Array<TypeParameter>,
    returnType?: TypeOrLiteral,
    parameters?: Array<FunctionParameter>
}

export interface ClassDecl extends Node {
    typeParameters: Array<TypeParameter>,
    properties: Array<ClassProperty>,
    methods: Array<ClassMethod>,
    extends?: Reference,
    implements?: Reference
}

export interface FunctionDecl extends Node {
    typeParameters?: Array<TypeParameter>,
    returnType?: TypeOrLiteral,
    parameters?: Array<FunctionParameter>
}

export interface ArrowFunction extends Omit<Node, "name"> {
    typeParameters?: Array<TypeParameter>,
    returnType?: TypeOrLiteral,
    parameters?: Array<TypeOrLiteral>
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
    type?: TypeOrLiteral,
    content: string
}

export interface EnumMember extends Node {
    initializer?: string
}

export interface EnumDecl extends Node {
    members: Array<EnumMember>
}