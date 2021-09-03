# ts-extractor

Extracts modules, classes, interfaces, enums, type aliases and constants from typescript projects. 

Check out the documentation [here](https://ts-docs.github.io/ts-docs/m.extractor/index.html).

## Features

- **Clear project structure** - A project is made up of modules, and a "module" is either a folder or a namespace. Modules can contain other modules (sub-folders, other namespaces), or exported classes, interfaces, enums, functions, constants and types from each file inside the folder. This allows for very easy navigation.

- **References** - Every type reference provides a **path** which leads to the module it's declared in, which allows for super easy and painless linking. 

- **Monorepo support** - Bundle types from all projects in the monorepo.

- **JSDoc support** - Extracts all JSDoc tags, along with their comments and type.

## Install

```npm i @ts-docs/extractor```

## Examples

Check out the examples [here](https://github.com/ts-docs/ts-extractor/tree/main/examples)

