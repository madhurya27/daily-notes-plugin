import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(repoRoot, file), "utf8");

describe("build configuration", () => {
    it('keeps "type": "module" even though the bundle is CommonJS', () => {
        // The two are unrelated: esbuild's format is an output setting Obsidian
        // consumes, while the field tells Node — and so Playwright's TypeScript
        // loader — how to read this repo's own sources. e2e/obsidian.ts uses
        // import.meta.url, which fails to parse without it.
        const pkg = JSON.parse(read("package.json")) as { type?: string };
        expect(read("esbuild.config.mjs")).toContain('format: "cjs"');
        expect(pkg.type).toBe("module");
        expect(read("e2e/obsidian.ts")).toContain("import.meta.url");
    });
});
