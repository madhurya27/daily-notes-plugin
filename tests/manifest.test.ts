import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { execFileSync } from "child_process";

const repoRoot = resolve(__dirname, "..");
const readJson = (name: string) => JSON.parse(readFileSync(resolve(repoRoot, name), "utf8"));

const manifest = readJson("manifest.json") as Record<string, unknown>;
const versions = readJson("versions.json") as Record<string, string>;
const pkg = readJson("package.json") as Record<string, unknown>;

/** The GitHub account that owns `origin`, i.e. the account reviewers will see. */
function repoOwner(): string {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: repoRoot, encoding: "utf8" }).trim();
    const owner = /github\.com[/:]([^/]+)\//.exec(url)?.[1];
    if (!owner) throw new Error(`Could not read the GitHub owner from ${url}`);
    return owner;
}

describe("manifest.json — marketplace submission requirements", () => {
    it("points authorUrl at the GitHub account that owns the repository", () => {
        expect(manifest.authorUrl).toBe(`https://github.com/${repoOwner()}`);
    });

    it("omits fundingUrl, which is rejected unless it is a real funding page", () => {
        expect(manifest).not.toHaveProperty("fundingUrl");
    });

    it("names the plugin without the word 'plugin'", () => {
        expect(manifest.name).toBe("Daily Notes Stream");
    });

    it("records this version's minAppVersion in versions.json", () => {
        expect(versions[manifest.version as string]).toBe(manifest.minAppVersion);
    });

    it("keeps package.json's version in step with the manifest", () => {
        expect(pkg.version).toBe(manifest.version);
    });
});
