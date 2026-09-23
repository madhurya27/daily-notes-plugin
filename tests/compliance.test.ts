import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Obsidian's community-plugin reviewers check these by hand on submission.
 * Keeping them as tests means a regression fails here, not in review.
 */
const repoRoot = resolve(__dirname, "..");
const srcDir = resolve(repoRoot, "src");
const manifest = JSON.parse(readFileSync(resolve(repoRoot, "manifest.json"), "utf8")) as {
    id: string;
    name: string;
    description: string;
    isDesktopOnly: boolean;
    fundingUrl?: string;
};
/** Every `.ts` file under `dir`, folders included, relative to it. */
const tsFilesUnder = (dir: string) =>
    readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".ts"));

const sources = tsFilesUnder(srcDir).map((name) => ({ name, text: readFileSync(resolve(srcDir, name), "utf8") }));

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

    // A placeholder's height is measured at runtime, so it cannot live in a
    // class. Custom properties are the exception: styles.css still owns which
    // declaration uses the value. See docs/decisions.md (2026-09-20).
    it("styles through CSS classes, never from JavaScript", () => {
        const customProperty = /\.style\.(set|remove)Property\("--[\w-]+"/g;
        for (const { name, text } of sources) {
            expect(text.replace(customProperty, ""), name).not.toMatch(/\.style\.|cssText|setCssStyles/);
        }
    });

    it("declares no var", () => {
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/\bvar\s/);
        }
    });

    it("uses no Node or Electron API, so the mobile manifest holds", () => {
        expect(manifest.isDesktopOnly).toBe(false);
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/require\(|from "(fs|path|os|child_process|electron)"/);
        }
    });

    it("names Obsidian's daily notes plugin in sentence case in user-facing copy", () => {
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/Daily Notes/);
        }
    });

    // The global app object exists for debugging and may be withdrawn; a plugin
    // reaches its own App through this.app.
    it("reaches the app through the plugin instance, never the global", () => {
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/\bwindow\.app\b/);
            expect(text, name).not.toMatch(/(^|[^.\w])app\.(workspace|vault|metadataCache|plugins)\b/m);
        }
    });

    // Obsidian prefixes command ids with the plugin id; repeating it here would
    // register "daily-notes-stream:daily-notes-stream-open-stream".
    it("leaves the plugin id out of its command ids", () => {
        for (const { name, text } of sources) {
            for (const [, id] of text.matchAll(/\bid:\s*["'`]([^"'`]+)["'`]/g)) {
                expect(id, name).not.toContain(manifest.id);
            }
        }
    });

    // A default hotkey overrides whatever the user has bound to that chord.
    it("binds no hotkey by default", () => {
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/\bhotkeys\s*:/);
        }
    });

    // Obsidian reinstates every open leaf where it was; detaching on unload
    // moves the user's view for them.
    it("detaches no leaf when the plugin unloads", () => {
        for (const { name, text } of sources) {
            const unload = /\bonunload\s*\(\)\s*\{([\s\S]*?)\n {4}\}/.exec(text);
            if (unload) expect(unload[1], name).not.toMatch(/detachLeavesOfType|\.detach\(/);
        }
    });

    it("describes the plugin the way the directory requires", () => {
        expect(manifest.description.length).toBeLessThanOrEqual(250);
        expect(manifest.description).toMatch(/\.$/);
        expect(manifest.description).not.toMatch(/^This is a plugin/i);
        // Emoji and other symbols beyond plain punctuation.
        expect(manifest.description).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}]|\u{FE0F}/u);
    });

    // The field is optional; an empty or placeholder one is rejected.
    it("claims no funding page it does not have", () => {
        if ("fundingUrl" in manifest) expect(manifest.fundingUrl).toMatch(/^https:\/\/\S+$/);
    });

    it("keeps the reserved word out of the plugin id", () => {
        expect(manifest.id).not.toContain("obsidian");
    });

    it("registers every DOM listener through the component that owns it", () => {
        // AGENTS.md: register* helpers, so unload releases them. Chevrons and
        // titles are rebuilt on every re-render, so they delegate to one
        // listener on the stream container instead of binding per element.
        for (const { name, text } of sources) {
            expect(text, name).not.toMatch(/\.addEventListener\(/);
            expect(text, name).not.toMatch(/\.onClickEvent\(/);
        }
    });

    it("debounces the file-system event it re-renders from", () => {
        // AGENTS.md: debounce file-system handlers. Obsidian autosaves while
        // typing, and each save would otherwise re-render the whole note.
        const stream = sources.find(({ name }) => name === "stream/note-stream.ts")!;
        expect(stream.text).toMatch(/debounce\(/);
        expect(stream.text).toMatch(/flushModified/);
    });

    // Obsidian's sample plugin names files in kebab-case; docs/decisions.md, 2026-09-23.
    it("names every source and test file in kebab-case", () => {
        const kebab = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*\.ts$/;
        for (const dir of ["src", "tests", "e2e"]) {
            for (const path of tsFilesUnder(resolve(repoRoot, dir))) {
                for (const segment of path.split(/[\\/]/)) {
                    expect(segment, `${dir}/${path}`).toMatch(
                        segment.endsWith(".ts") ? kebab : /^[a-z0-9]+(-[a-z0-9]+)*$/
                    );
                }
            }
        }
    });

    it("ships the licence the directory requires", () => {
        expect(existsSync(resolve(repoRoot, "LICENSE"))).toBe(true);
        expect(readFileSync(resolve(repoRoot, "LICENSE"), "utf8").trim().length).toBeGreaterThan(0);
    });
});
