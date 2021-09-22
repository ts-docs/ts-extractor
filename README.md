# ts-extractor

Extracts modules, classes, interfaces, enums, type aliases and constants from typescript projects. 

Check out the documentation [here](https://ts-docs.github.io/ts-docs/m.extractor/index.html).

## Features

- **Clear project structure** - A project is made up of modules, and a "module" is either a folder or a namespace. Modules can contain other modules (sub-folders, other namespaces), or exported classes, interfaces, enums, functions, constants and types from each file inside the folder. This allows for very easy navigation.

- **References** - Every type reference provides a **path** which leads to the module it's declared in, which allows for super easy and painless linking. 

- **Monorepo support** - Bundle types from all projects in the monorepo.

- **JSDoc support** - Extracts all JSDoc tags, along with their comments and type.

- **External references** - Easily add external references which can link to other documentation sites.

## Install

```npm i @ts-docs/extractor```

## 2.0 changes

This version is faster and gathers way more accurate information.

### Completely different API

```ts
// Before
import { extract } from "...";
const [modules, tsConfig] = extract(["./entry-point.ts"]);

// Now
import { TypescriptExtractor } from "...";
const extractor = new TypescriptExtractor({
    entryPoints: ["./entry-point.ts"],
    externals: [],
    maxConstantTextLength: 1024,
    ignoreFolderNames: []
});
const projects = extractor.run();
```

### `ReferenceType#moduleName` instead of `ReferenceType#external`

All references now have a `moduleName` which is the name of the global module they're from. 

### `GlobalModule#exports` and `GlobalModule#reExports`

Extracts all exports and re-exports from the entry points.

## Examples

### External References

Let's assume you have some module which uses `node-fetch` and some of it's types. Supply the `externals` option in the extractor settings:

```ts
const extractor = new TypescriptExtractor({ 
    entryPoints: ["./entry-point.ts"],
    externals: [
        {
            run: (name) => {
                name = name.name || name; // name can either be a symbol or a string
                switch (name) {
                    case "Response": return "https://github.com/node-fetch/node-fetch#class-response";
                    case "Request": return "https://github.com/node-fetch/node-fetch#class-request";
                }
            }
        }
    ]
})
```