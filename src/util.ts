
export function getLastItemFromPath(path: string) : string {
    return path.substring(path.lastIndexOf("\\") + 1);
}