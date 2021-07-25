import {B} from "./inner/test";

export class A extends Array<string> {
    private static a: string
    constructor(a: string) {
        super();
        //this.a = a;
    }

    someFn<T extends string>(text: T) : {str: string} {
        return { str: text.toUpperCase() };
    }
}

const m = new A("");
export const a: (a: A) => B<string> = () => new B();