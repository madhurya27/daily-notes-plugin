import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Obsidian's community-plugin reviewers check these by hand on submission.
 * Keeping them as tests means a regression fails here, not in review.
 */
const srcDir = resolve(__dirname, "..", "src");
const sources = readdirSync(srcDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: readFileSync(resolve(srcDir, name), "utf8") }));

describe("plugin submission compliance", () => {
    it("reads every source file", () => {
        expect(sources.length).toBeGreaterThan(0);
    });

    it("logs nothing but real errors", () => {
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/console\.(log|debug|info|warn)\b/);
        }
    });

    it("prefixes every logged error with the plugin name", () => {
        for (const { name, text } of sources) {
            for (const [, , message] of text.matchAll(/console\.error\(\s*([`"'])(.*?)\1/g)) {
                expect(message, name).toMatch(/^DailyNotesStream: /);
            }
        }
    });

    it("builds the DOM through the helpers rather than raw HTML", () => {
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
        }
    });

    it("styles through CSS classes, never from JavaScript", () => {
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/\.style\.|cssText|setCssStyles/);
        }
    });

    it("declares no var", () => {
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/\bvar\s/);
        }
    });

    it("uses no Node or Electron API, so the mobile manifest holds", () => {
        expect(JSON.parse(readFileSync(resolve(__dirname, "..", "manifest.json"), "utf8")).isDesktopOnly).toBe(false);
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/require\(|from "(fs|path|os|child_process|electron)"/);
        }
    });

    it("names Obsidian's daily notes plugin in sentence case in user-facing copy", () => {
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/Daily Notes/);
        }
    });
});
