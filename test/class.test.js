const { createSingleFileExtractor } = require("./setup");

test("Class properties", () => {
    const project = createSingleFileExtractor(`
       export class Test {
           property?: string;
           readonly static property2: Test;
       }
    `);
     const testClass = project.module.classes.find(cl => cl.name === "Test");
     expect(testClass.properties.some(({prop}) => prop.name === "property"  && prop.isOptional)).toBe(true);
     expect(testClass.properties.some((prop) => prop.prop.name === "property2" && prop.isReadonly && prop.isStatic && prop.prop.type.type.name === "Test")).toBe(true);
});

test("Class methods", () => {
    const project = createSingleFileExtractor(`
        type Test2 = string & { test: true };
        export class Test {
            method(param1: Test, param2: Test2) {
                return new Test();
            }
        }
    `);
    const testClass = project.module.classes.find(cl => cl.name === "Test");
    const signature = testClass.methods[0].signatures[0];
    expect(signature.parameters[0].name).toBe("param1");
    expect(signature.parameters[0].type.type.name).toBe("Test");
    expect(signature.parameters[1].name).toBe("param2");
    expect(signature.parameters[1].type.type.name).toBe("Test2");
    expect(signature.returnType.type.name).toBe("Test");
});

test("Class inheritence", () => {
    const project = createSingleFileExtractor(`
        export class Test1 {};
        export class Test2 extends Test1 {
            method(param1: Test, param2: Test2) {
                return new Test();
            }
        }
    `);
    const testClass = project.module.classes.find(cl => cl.name === "Test2");
    expect(testClass.extends.type.name).toBe("Test1");
});