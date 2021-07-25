import {B} from "./inner/test";

class A {
    a: string
    constructor(a: string) {
        this.a = a;
    }
}

const a = new A("HELLOW");

console.log(a, new B());