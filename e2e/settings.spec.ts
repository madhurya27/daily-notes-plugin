import { writeFileSync } from "fs";
import { join } from "path";
import { test, expect, openStream } from "./obsidian";

const CONFIG = { folder: "Notes", format: "YYYY-MM-DD" };
const JOURNAL_NOTE = "Journal/2026-06-05.md";

/** Rewrites the core daily-notes config, as its settings pane does. */
function writeDailyNotesConfig(vaultPath: string, config: Record<string, string>) {
    writeFileSync(join(vaultPath, ".obsidian", "daily-notes.json"), JSON.stringify(config));
}

test.describe("Obsidian's daily-notes settings change under a live stream", () => {
    test.afterEach(async ({ obsidian }) => {
        writeDailyNotesConfig(obsidian.vaultPath, CONFIG);
        await obsidian.page.evaluate(async (path) => {
            const file = window.app.vault.getAbstractFileByPath(path);
            if (file) await window.app.vault.delete(file);
        }, JOURNAL_NOTE);
    });

    test("reloads the stream when the daily-notes folder changes", async ({ obsidian }) => {
        const { page, vaultPath } = obsidian;
        const container = await openStream(page);
        await expect(container.locator(".daily-note-title").first()).toHaveText("2026-03-14");

        await page.evaluate(async (path) => {
            await window.app.vault.createFolder("Journal").catch(() => {});
            await window.app.vault.create(path, "## From the journal folder\n\nMoved here.\n");
        }, JOURNAL_NOTE);

        writeDailyNotesConfig(vaultPath, { folder: "Journal", format: "YYYY-MM-DD" });

        // The whole stream is replaced: the old folder's notes are gone.
        await expect(container.locator(".daily-note-title")).toHaveText(["2026-06-05"]);
    });
});
