export class C<T = unknown> {
    constructor() {
        console.log("Hello World!");
    }
}

export enum SomeTypes {
    a,
    b,
    c = 5
}

export type CBound = C<SomeTypes>