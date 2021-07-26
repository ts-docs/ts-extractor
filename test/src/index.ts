import {B} from "./inner/test";

/**
 * @param a This is a...
 * 
 * TEST TEST TEST
 */
export class A<T> extends Array<T> {
    private static a: string
    constructor(a: string) {
        super();
        //this.a = a;
    }

    someFn(text: string) : void;
    someFn<T extends string>(text: T) : {str: string} {
        return { str: text.toUpperCase() };
    }
}

const m = new A("");
export const a: (a: A<string>) => B<string> = () => new B();

export default function(a: A, b: A<number>) : string|number {
    return 4;
}
