import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { resolve } from "path";
import { check, resolveConfig } from "prettier";

const repoRoot = resolve(__dirname, "../..");

/** Runs the real script against a throwaway copy of the two files it rewrites. */
function bumpTo(version: string): { manifest: string; versions: string } {
    const dir = mkdtempSync(resolve(tmpdir(), "version-bump-"));
    try {
        copyFileSync(resolve(repoRoot, "scripts/version-bump.mjs"), resolve(dir, "version-bump.mjs"));
        writeFileSync(
            resolve(dir, "manifest.json"),
            JSON.stringify({ id: "daily-notes-stream", version: "1.0.0", minAppVersion: "1.8.7" }, null, 4) + "\n"
        );
        writeFileSync(resolve(dir, "versions.json"), JSON.stringify({ "1.0.0": "1.8.7" }, null, 4) + "\n");
        execFileSync("node", ["version-bump.mjs"], { cwd: dir, env: { ...process.env, npm_package_version: version } });
        return {
            manifest: readFileSync(resolve(dir, "manifest.json"), "utf8"),
            versions: readFileSync(resolve(dir, "versions.json"), "utf8"),
        };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe("version-bump.mjs", () => {
    it("writes both files in the style the release workflow's format gate demands", async () => {
        // The gate runs before the build, so tab-indented JSON fails the release
        // rather than the commit that bumped the version.
        const bumped = bumpTo("1.0.1");
        const options = { ...(await resolveConfig(resolve(repoRoot, "manifest.json"))), parser: "json" as const };
        expect(await check(bumped.manifest, options)).toBe(true);
        expect(await check(bumped.versions, options)).toBe(true);
    });

    it("bumps the manifest to the target version", () => {
        expect(JSON.parse(bumpTo("1.0.1").manifest)).toMatchObject({ version: "1.0.1" });
    });

    it("records the new version in versions.json even when minAppVersion is unchanged", () => {
        // Obsidian reads versions.json to find the newest build an older app
        // can install; a missing entry makes the release invisible to it.
        expect(JSON.parse(bumpTo("1.0.1").versions)).toEqual({ "1.0.0": "1.8.7", "1.0.1": "1.8.7" });
    });

    it("leaves versions.json alone when the version is already recorded", () => {
        expect(JSON.parse(bumpTo("1.0.0").versions)).toEqual({ "1.0.0": "1.8.7" });
    });
});
