
import {C} from "./test1";
/*
THis is a test!
*/
export class B<T = unknown> {
    constructor() {
        console.log("Hello World!");
    }
}

export interface AAA {
    [key: string]: number|number|B|undefined,
    a: string,
    b: number,
    c?: B
}
