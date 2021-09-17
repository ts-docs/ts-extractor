import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export function removePartOfEndOfPath(tsPath: string, toRemove: Array<string>) : Array<string> {
    const newPath = tsPath.split("/");
    if (toRemove.length > newPath.length) return newPath;
    return newPath.slice(toRemove.length);
}

export function removePartOfPath(path: Array<string>, parts: Array<string>) : string {
    return path.filter(p => !parts.includes(p)).join("/");
}

export interface PackageJSON { 
    contents: Record<string, string>,
    path: string
}

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
        return `${url.replace(new RegExp(`${type}\\+|\\.${type}|${type}:`, "g"), "")}/tree/${branch}${repository.directory || ""}`;
    }
}

export function getBranchName(path: string) : string|undefined {
    return execSync(`cd ${path} && git rev-parse --abbrev-ref HEAD`).slice(0, -1).toString("utf-8");
}

export function getReadme(dir: string) : string|undefined {
    const pathToReadme = path.join(dir, "README.md");
    if (fs.existsSync(pathToReadme)) return fs.readFileSync(pathToReadme, "utf-8");
    return;
}

export function hasBit(num: number, bit: number) : boolean {
    return (num & bit) !== 0;
}