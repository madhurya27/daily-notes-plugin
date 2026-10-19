import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Obsidian's community-plugin reviewers check these by hand on submission, and
 * no lint rule does (eslint.config.mts holds the rest), so a regression fails
 * here, not in review.
 */
const repoRoot = resolve(__dirname, "../..");
const srcDir = resolve(repoRoot, "src");
const manifest = JSON.parse(readFileSync(resolve(repoRoot, "manifest.json"), "utf8")) as { fundingUrl?: string };
/** Every `.ts` file under `dir`, folders included, relative to it. */
const tsFilesUnder = (dir: string) =>
    readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".ts"));

const sources = tsFilesUnder(srcDir).map((name) => ({ name, text: readFileSync(resolve(srcDir, name), "utf8") }));

describe("plugin submission compliance", () => {
    it("reads every source file", () => {
        expect(sources.length).toBeGreaterThan(0);
    });

    it("prefixes every logged error with the plugin name", () => {
        for (const { name, text } of sources) {
            for (const [, , message] of text.matchAll(/console\.error\(\s*([`"'])(.*?)\1/g)) {
                expect(message, name).toMatch(/^DailyNotesStream: /);
            }
        }
    });

    it("names Obsidian's daily notes plugin in sentence case in user-facing copy", () => {
        for (const { name, text } of sources) {
            // The plugin's own name is title case (D-162).
            expect(text, name).not.toMatch(/Daily Notes(?! Stream)/);
        }
    });

    // The field is optional; an empty or placeholder one is rejected.
    it("claims no funding page it does not have", () => {
        if ("fundingUrl" in manifest) expect(manifest.fundingUrl).toMatch(/^https:\/\/\S+$/);
    });

    // Obsidian's sample plugin names files in kebab-case; D-023.
    it("names every source and test file in kebab-case", () => {
        const kebab = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*\.ts$/;
        for (const dir of ["src", "tests", "e2e-tests"]) {
            for (const path of tsFilesUnder(resolve(repoRoot, dir))) {
                for (const segment of path.split(/[\\/]/)) {
                    expect(segment, `${dir}/${path}`).toMatch(
                        segment.endsWith(".ts") ? kebab : /^[a-z0-9]+(-[a-z0-9]+)*$/
                    );
                }
            }
        }
    });

    // The directory's scanner lints every .ts it does not skip, test helpers
    // included; these are its skip patterns that cover our folders. The root's
    // config files are linted, and clean.
    // https://github.com/obsidianmd/eslint-plugin/blob/master/docs/configuration.md#community-plugin-scanner-configuration
    it("keeps every TypeScript folder but src/ where the review scanner skips it", () => {
        const skipped = /^(tests|e2e-tests|scripts|docs)\//;
        const folders = readdirSync(repoRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && !["src", "node_modules", ".dev", ".git"].includes(entry.name))
            .map((entry) => entry.name);
        for (const folder of folders) {
            for (const path of tsFilesUnder(resolve(repoRoot, folder))) expect(`${folder}/${path}`).toMatch(skipped);
        }
    });

    it("ships the license the directory requires", () => {
        expect(existsSync(resolve(repoRoot, "LICENSE"))).toBe(true);
        expect(readFileSync(resolve(repoRoot, "LICENSE"), "utf8").trim().length).toBeGreaterThan(0);
    });
});
