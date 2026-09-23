import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { DailyNoteService } from "../src/notes/daily-note-service";
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
    let service: DailyNoteService;

    beforeEach(async () => {
        vi.useFakeTimers();
        app = makeApp();
        ({ service } = await makeViewSetup(app));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Runs the debounced handler and drains the mutation queue. */
    async function settle() {
        await vi.runAllTimersAsync();
        await vi.advanceTimersByTimeAsync(0);
    }

    // What a changed format does to the stream is note-stream.test.ts's.
    it("checks the daily-notes settings when the config is written", async () => {
        writeConfig(app);
        await settle();

        expect(service.refreshIfSettingsChanged).toHaveBeenCalledOnce();
    });

    it("ignores writes outside the config directory", async () => {
        writeConfig(app, "Notes/2025-01-01.md");
        await settle();

        expect(service.refreshIfSettingsChanged).not.toHaveBeenCalled();
    });
});
