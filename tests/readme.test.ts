import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import DailyNotesStreamPlugin from "../src/main";
import { __setMockNotes, __setMockSettings } from "./mocks/daily-notes-interface";
import type { PluginManifest } from "./mocks/obsidian";
import { asApp } from "./stream-view-fixture";

const repoRoot = resolve(__dirname, "..");
const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(repoRoot, "manifest.json"), "utf8")) as { name: string };

/** Loads the plugin far enough to read the commands it registers. */
async function loadedPlugin() {
    __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
    __setMockNotes([]);
    const app = {
        vault: { on: vi.fn().mockReturnValue({}) },
        workspace: { on: vi.fn().mockReturnValue({}), getLeavesOfType: vi.fn().mockReturnValue([]) },
        metadataCache: { on: vi.fn().mockReturnValue({}) },
        loadLocalStorage: vi.fn().mockReturnValue(null),
    };
    const plugin = new DailyNotesStreamPlugin(asApp(app), { id: "daily-notes-stream" } as PluginManifest);
    await plugin.onload();
    return plugin;
}

/** Every local image the README points at, however it is written. */
function referencedImages(): string[] {
    const markdown = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]!);
    const html = [...readme.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]!);
    return [...markdown, ...html].filter((src) => !src.startsWith("http"));
}

describe("README", () => {
    it("shows the plugin rather than only describing it", () => {
        // A screenshot is the first thing a marketplace reader looks for.
        expect(referencedImages().length).toBeGreaterThan(0);
    });

    it("points every image at a file that exists", () => {
        for (const src of referencedImages()) {
            expect(existsSync(resolve(repoRoot, src)), `${src} is missing`).toBe(true);
        }
    });

    it("titles the plugin exactly as the manifest names it", () => {
        expect(readme.split("\n")[0]).toBe(`# ${manifest.name}`);
    });

    it("quotes each command the way the palette displays it", async () => {
        const plugin = await loadedPlugin();
        const commands = (plugin as unknown as { commands: { name: string }[] }).commands;
        expect(commands.length).toBeGreaterThan(0);
        for (const { name } of commands) {
            expect(readme).toContain(`${manifest.name}: ${name}`);
        }
    });
});
