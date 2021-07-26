import {B} from "./inner/test";

export class A<T> extends Array<T> {
    /**   
     *  Test
      * @private
     */

    /**
     * Another TEST!
     */
    private readonly a: string
    constructor(a: string) {
        super();
        this.a = a;
    }

    /**
     * This function does some very special things.
     * @param text This is only for the text
     * @param someNum An array of numbers
     */
    someFn(text: string, ...someNum: Array<number>) : void;
    someFn<T extends string>(text: T, someNum: number) : {str: string} {
        return { str: text.toUpperCase() };
    }
}

const m = new A("");
export const a: (a: A<string>) => B<string> = () => new B();

/**
 * @param a This is a...
 * 
 * TEST TEST TEST
 */
export default function(a: A, b: A<number>) : string|number {
    return 4;
}
