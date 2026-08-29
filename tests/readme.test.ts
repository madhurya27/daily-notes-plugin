import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import DailyNotesStreamPlugin from "../src/main";
import { __setMockNotes, __setMockSettings } from "./mocks/daily-notes-interface";

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
    const plugin = new DailyNotesStreamPlugin(app as any, { id: "daily-notes-stream" } as any);
    await plugin.onload();
    return plugin;
}

describe("README", () => {
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
