
import * as ts from "typescript";

export class TypescriptExtractor {
    ctx: ts.TransformationContext
    visitor: ts.Visitor
    constructor(ctx: ts.TransformationContext) {
        this.ctx = ctx;
        this.visitor = this._visitor.bind(this);
    }

    run(node: ts.Node) : ts.Node {
        return ts.visitNode(node, this.visitor);
    }

    _visitor(node: ts.Node) : ts.Node|undefined {
        console.log(node.kind, node.getText(), node.getSourceFile());
        return ts.visitEachChild(node, this.visitor, this.ctx);
    }
    
}