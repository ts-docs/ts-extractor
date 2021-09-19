import ts from "typescript";
import { ReferenceType } from "./structure";


export class ReferenceManager extends Map<ts.Symbol, ReferenceType> {
    constructor() {
        super();
    }

}