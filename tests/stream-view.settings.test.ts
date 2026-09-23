import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TFile } from "./mocks/obsidian";
import { makeApp, makeViewSetup } from "./stream-view-fixture";

const CONFIG_FILE = ".obsidian/daily-notes.json";

/** Fires the vault's undeclared "raw" event, as a config write would. */
function writeConfig(app: ReturnType<typeof makeApp>, path = CONFIG_FILE) {
    for (const [name, callback] of app.vault.on.mock.calls) {
        if (name === "raw") (callback as (p: string) => void)(path);
    }
}

describe("DailyNotesStreamView — Obsidian's daily-notes settings changed", () => {
    let app: ReturnType<typeof makeApp>;
    let view: Awaited<ReturnType<typeof makeViewSetup>>["view"];
    let plugin: any;

    beforeEach(async () => {
        vi.useFakeTimers();
        app = makeApp();
        ({ view, plugin } = await makeViewSetup(app));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Runs the debounced handler and drains the mutation queue. */
    async function settle() {
        await vi.runAllTimersAsync();
        await vi.advanceTimersByTimeAsync(0);
    }

    it("reloads the stream when the format or folder changed", async () => {
        plugin.service.refreshIfSettingsChanged = vi.fn().mockReturnValue(true);
        plugin.service.getBatch = vi.fn().mockReturnValue([new TFile("Journal/2025-01-01.md")]);

        writeConfig(app);
        await settle();

        expect((view as any).stream.state.notes.map((f: TFile) => f.path)).toEqual(["Journal/2025-01-01.md"]);
    });

    it("leaves the stream untouched when the settings are unchanged", async () => {
        plugin.service.refreshIfSettingsChanged = vi.fn().mockReturnValue(false);
        plugin.service.getBatch = vi.fn().mockReturnValue([]);

        writeConfig(app);
        await settle();

        expect(plugin.service.getBatch).not.toHaveBeenCalled();
    });

    it("ignores writes outside the config directory", async () => {
        writeConfig(app, "Notes/2025-01-01.md");
        await settle();

        expect(plugin.service.refreshIfSettingsChanged).not.toHaveBeenCalled();
    });

    it("collapses a burst of config writes into one check", async () => {
        writeConfig(app);
        writeConfig(app);
        writeConfig(app);
        await settle();

        expect(plugin.service.refreshIfSettingsChanged).toHaveBeenCalledTimes(1);
    });

    it("drops notes rendered under the old format before loading the new ones", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([new TFile("Notes/2025-01-01.md")]);
        await (view as any).stream.loadMoreNotes();

        plugin.service.refreshIfSettingsChanged = vi.fn().mockReturnValue(true);
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        writeConfig(app);
        await settle();

        expect((view as any).stream.state.notes).toEqual([]);
        expect((view as any).stream.blocks.el.querySelector(".daily-notes-empty-state")).not.toBeNull();
    });

    it("re-arms infinite scroll against the reloaded stream", async () => {
        plugin.service.refreshIfSettingsChanged = vi.fn().mockReturnValue(true);
        writeConfig(app);
        await settle();

        const attach = (view as any).stream.scroll.attach.mock.calls.at(-1);
        plugin.service.getBatch = vi.fn().mockReturnValue([new TFile("Journal/2025-02-01.md")]);
        await attach[2]();

        expect((view as any).stream.state.notes.map((f: TFile) => f.path)).toEqual(["Journal/2025-02-01.md"]);
    });

    it("keeps the view alive when rebuilding the cache throws", async () => {
        plugin.service.refreshIfSettingsChanged = vi.fn().mockImplementation(() => {
            throw new Error("daily notes folder missing");
        });
        vi.spyOn(console, "error").mockImplementation(() => {});

        writeConfig(app);

        await expect(settle()).resolves.toBeUndefined();
    });

    it("cancels the pending check on close", async () => {
        writeConfig(app);
        await view.onClose();
        await settle();

        expect(plugin.service.refreshIfSettingsChanged).not.toHaveBeenCalled();
    });
});
