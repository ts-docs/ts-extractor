const { createSingleFileExtractor } = require("./setup");

test("Interface properties", () => {
    const project = createSingleFileExtractor(`
       export class Test {};
       export interface Test2 {
           property1: Test,
           [key: string]: Test,
           )
           new (prop: Test);
       }
    `);
     const testInterface = project.module.interfaces.find(cl => cl.name === "Test2");
     expect(testInterface.properties.some(prop => prop.prop && prop.prop.name === "property1" && prop.prop.type.type.name === "Test")).toBe(true);
     expect(testInterface.properties.some(prop => prop.index && prop.index.key.kind === 13 && prop.index.type.type.name === "Test")).toBe(true);
     expect(testInterface.properties.some(prop => prop.construct && prop.construct.parameters[0].type.type.name === "Test")).toBe(true);
});