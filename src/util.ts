import ts from "typescript";
import fs from "fs";
import path from "path";
import {execSync} from "child_process";

export function getLastItemFromPath(p: string) : string {
    return path.parse(p).base;
}

export function getAllButLastItemFromPath(p: string) : string {
    return path.parse(p).dir;
}

/** Goes down */
export function findTSConfigDown(basePath = process.cwd()) : ts.CompilerOptions|undefined {
    const allThings = fs.readdirSync(basePath, { withFileTypes: true});
    const files = allThings.filter(thing => thing.isFile());
    for (const file of files) {
        if (file.name === "tsconfig.json") {
            const res = ts.convertCompilerOptionsFromJson(undefined, basePath, "tsconfig.json");
            if (res.errors.length) throw new Error(res.errors[0].messageText.toString());
            return res.options;
        }
    }
    const directories = allThings.filter(thing => thing.isDirectory());
    for (const directory of directories) {
        const res = findTSConfigDown(path.join(basePath, directory.name));
        if (res) return res;
    }
    return undefined;
}

export function findTSConfigUp(basePath = process.cwd()) : ts.CompilerOptions|undefined {
    const pathToTSConfig = path.join(basePath, "tsconfig.json");
    if (fs.existsSync(pathToTSConfig)) {
        const res = ts.convertCompilerOptionsFromJson(undefined, basePath, "tsconfig.json");
        if (res.errors.length) throw new Error(res.errors[0].messageText.toString());
    }
    const newPath = path.join(basePath, "../");
    if (newPath === basePath) return undefined;
    return findTSConfigUp(newPath);
}

export type PackageJSON = { 
    contents: Record<string, string>,
    path: string
}

/** Goes up */
export function findPackageJSON(basePath: string) : PackageJSON|undefined {
    const pathToJson = path.join(basePath, "package.json");
    if (fs.existsSync(pathToJson)) return { contents: JSON.parse(fs.readFileSync(pathToJson, "utf-8")), path: basePath};
    const newPath = path.join(basePath, "../");
    if (newPath === basePath) return undefined;
    return findPackageJSON(newPath);
}

export function getRepository(packageJSON: PackageJSON) : string|undefined {
    const repository = packageJSON.contents.repository as Record<string, string>|string;
    if (!repository) return;
    if (typeof repository === "string") {
        const [type, link] = repository.split(":");
        const branch = getBranchName(packageJSON.path);
        return `https://${type}.com/${link}/tree/${branch}`;
    } else {
        const {type, url} = repository;
        const branch = getBranchName(packageJSON.path);
        return `${url.replace(new RegExp(`${type}\\+|\\.${type}`, "g"), "")}/tree/${branch}${repository.directory || ""}`;
    }
}

export function getBranchName(path: string) : string|undefined {
    return execSync(`cd ${path} && git rev-parse --abbrev-ref HEAD`).slice(0, -1).toString("utf-8");
}

export function hasBit(num: number, bit: number) : boolean {
    return (num & bit) !== 0;
}

/** Goes up */
export function getReadme(dir: string) : string|undefined {
    const pathToJson = path.join(dir, "README.md");
    if (fs.existsSync(pathToJson)) return fs.readFileSync(pathToJson, "utf-8");
    const newPath = path.join(dir, "../");
    if (newPath === dir) return undefined;
    return getReadme(newPath);
}