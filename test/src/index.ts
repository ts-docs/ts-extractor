

namespace A {
    export enum Names {
        A,
        B,
        C
    }
}

namespace A {
    export enum Names {
        E = 3,
        D,
        F
    }
}

/*
export enum Names {
    A, 
    B,
    C
} */

export interface Names {
    a: string
}

export const a: A.Names = 5;