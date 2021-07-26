# ts-extractor

Extracts stuff like modules, classes, interfaces and enums from typescript projects. 

## Usage

```ts
import { extract } from "ts-extractor";

/**
 * This interface is used for testing. 
*/
export interface TestInterface {
    a: string,
    b: number
}

const [module, compilerOptions] = extract("./");

console.log(module.interfaces);
```

Logs:

```

```
