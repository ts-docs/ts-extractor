# ts-extractor

Extracts stuff like modules, classes, interfaces and enums from typescript projects. 

## What's different?

- **Clear project structure** - A project is made up of modules, and a "module" is basically a folder. Modules can contain other modules (sub-folders), or exported classes, interfaces, enums, functions, constants and types from each file inside the folder.

- **References** - Every type reference provides a **path** which leads to the module it's declared in, which allows for super easy and painless liking. 

## Usage

File structure:
```
- package.json
- index.ts
- tsconfig.json
```

`index.ts`:
```ts
import {extract} from "ts-extractor";

/**
 * This interface is used for testing. 
*/
export interface TestInterface {
    a: string,
    b: number,
    c?: TestInterface
}

const [extractor] = extract(["./index.ts"]);

console.dir(extractor.module, {depth: 10});
```

Logs:

```js
[
  {
    name: 'Global',
    modules: Map(0) {},
    classes: [],
    functions: [],
    interfaces: [
      {
        name: 'TestInterface',
        start: 39,
        end: 206,
        sourceFile: 'path/index.ts',
        properties: [
          {
            name: 'a',
            type: { name: 'string', kind: 6 },
            isOptional: false,
            isReadonly: undefined,
            start: 125,
            end: 141
          },
          {
            name: 'b',
            type: { name: 'number', kind: 5 },
            isOptional: false,
            isReadonly: undefined,
            start: 141,
            end: 157
          },
          {
            name: 'c',
            type: {
              type: { name: 'TestInterface', path: [], kind: 1 },
              typeParameters: undefined
            },
            isOptional: true,
            isReadonly: undefined,
            start: 157,
            end: 181
          },
          {
            name: 'd',
            type: {
              type: { name: 'Array', kind: 15 },
              typeParameters: [ { name: 'string', kind: 6 } ]
            },
            isOptional: false,
            isReadonly: undefined,
            start: 181,
            end: 203
          }
        ],
        jsDoc: {
          comment: 'This interface is used for testing.',
          tags: undefined
        }
      }
    ],
    types: [],
    enums: [],
    constants: [],
    isGlobal: true
  }
]
```
