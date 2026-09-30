import { writeFileSync } from "fs";
import { join } from "path";
import type { Page } from "@playwright/test";
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

    test("says so when the last daily note is deleted, and clears once one is back", async ({ obsidian }) => {
        const { page, vaultPath } = obsidian;
        const container = await openStream(page);

        await page.evaluate(async (path) => {
            await window.app.vault.createFolder("Journal").catch(() => {});
            await window.app.vault.create(path, "## The only note\n");
        }, JOURNAL_NOTE);
        writeDailyNotesConfig(vaultPath, { folder: "Journal", format: "YYYY-MM-DD" });
        await expect(container.locator(".daily-note-title")).toHaveText(["2026-06-05"]);

        await page.evaluate(async (path) => {
            await window.app.vault.delete(window.app.vault.getAbstractFileByPath(path)!);
        }, JOURNAL_NOTE);
        await expect(container.locator(".daily-notes-empty-state")).toBeVisible();

        await page.evaluate(async (path) => {
            await window.app.vault.create(path, "## Back again\n");
        }, JOURNAL_NOTE);
        await expect(container.locator(".daily-note-title")).toHaveText(["2026-06-05"]);
        await expect(container.locator(".daily-notes-empty-state")).toHaveCount(0);
    });
});

/** Opens the plugin's settings tab and returns the page drawing it: desktop gives settings a window of their own. */
async function openPluginSettings(page: Page, mobileLayout: boolean): Promise<Page> {
    const settingsWindow = mobileLayout ? page : page.context().waitForEvent("page");
    await page.evaluate(() => {
        window.app.setting.open();
        window.app.setting.openTabById("daily-notes-stream");
    });
    return settingsWindow;
}

test.describe("The plugin's settings tab", () => {
    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.evaluate(() => window.app.setting.close());
    });

    test("groups each section under a heading and drops a hidden section's collapse toggle", async ({
        obsidian,
        mobileLayout,
    }) => {
        const settings = await openPluginSettings(obsidian.page, mobileLayout);
        const rows = settings.locator(".vertical-tab-content .setting-item");
        const names = rows.locator(".setting-item-name");
        const grouped = [
            "Hide empty notes",
            "Properties",
            "Show note properties",
            "Collapse by default",
            "Linked mentions",
            "Show linked mentions",
            "Collapse by default",
        ];
        await expect(names).toHaveText(grouped);
        await expect(rows.locator("visible=true")).toHaveCount(grouped.length);
        await expect(rows.and(settings.locator(".setting-item-heading")).locator(".setting-item-name")).toHaveText([
            "Properties",
            "Linked mentions",
        ]);

        await rows.filter({ hasText: "Show note properties" }).locator(".checkbox-container").click();

        await expect(names).toHaveText(grouped.filter((_, row) => row !== 3));
    });
});
