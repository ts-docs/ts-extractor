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

export function getLastItemFromPath(p: string) : string {
    return path.parse(p).base;
}

export function getFilenameFromPath(p: string) : string {
    const name = path.parse(p);
    return name.base.slice(0, name.base.indexOf("."));
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
    //ssh://git@
    const repository = packageJSON.contents.repository as Record<string, string>|string;
    if (!repository) return;
    if (typeof repository === "string") {
        const [type, link] = repository.split(":");
        const branch = getBranchName(packageJSON.path);
        return `https://${type}.com/${link}/tree/${branch}`;
    } else {
        // eslint-disable-next-line prefer-const
        let {type, url} = repository;
        const branch = getBranchName(packageJSON.path);
        // eslint-disable-next-line no-useless-escape
        url = url.replace(new RegExp(`${type}:\/\/|ssh://${type}@`, "g"), "https://");
        return `${url.replace(new RegExp(`${type}\\+|\\.${type}`, "g"), "")}/tree/${branch}${repository.directory || ""}`;
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


export interface ProjectMetadata {
    readme?: string,
    homepage?: string,
    version?: string,
    repository?: string
}

export function extractMetadata(directory: string) : ProjectMetadata {
    const packageJSON = findPackageJSON(directory);
    return {
        readme: getReadme(directory),
        homepage: packageJSON && packageJSON.contents.homepage,
        version: packageJSON && packageJSON.contents.version,
        repository: packageJSON && getRepository(packageJSON)
    };
}