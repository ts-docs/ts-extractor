import {B} from "./inner/test";

class A {
    a: string
    constructor(a: string) {
        this.a = a;
    }
}

export const a: () => B<string> = () => new B();