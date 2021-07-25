
import {Module} from "./structure";
import * as ts from "typescript";

export class TypescriptExtractor {
    ctx: ts.TransformationContext
    module: Module
    visitor: ts.Visitor
    constructor(ctx: ts.TransformationContext, globalModule: Module) {
        this.ctx = ctx;
        this.module = globalModule;
        this.visitor = this._visitor.bind(this);
    }

    run(node: ts.Node) : ts.Node {
        return ts.visitNode(node, this.visitor);
    }

    _visitor(node: ts.Node) : ts.Node|undefined {
        console.log(node.kind, node.getText());
        return ts.visitEachChild(node, this.visitor, this.ctx);
    }

}