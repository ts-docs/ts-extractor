
import * as ts from "typescript";
import { TypescriptExtractor } from "./extractor";

export default (): ts.TransformerFactory<ts.Node> => ctx => {
    return firstNode => {
        return new TypescriptExtractor(ctx).run(firstNode);
    };
};