
import {extract} from "@ts-docs/extractor";
import fs from "fs";

// Clone any TS library which would you like to extract the types of

const [extractors, tsconfig] = extract(["pathToEntryPoint"]);

fs.writeFileSync("./output.json", JSON.stringify(extractors.toJSON()));