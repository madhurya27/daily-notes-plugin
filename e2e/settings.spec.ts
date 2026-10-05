import type { Page } from "@playwright/test";
import { test, expect, openStream, seededDate, writeDailyNotesConfig, DAILY_NOTES_CONFIG } from "./obsidian";

const JOURNAL_NOTE = "Journal/2026-06-05.md";

test.describe("Obsidian's daily-notes settings change under a live stream", () => {
    test.afterEach(async ({ obsidian }) => {
        writeDailyNotesConfig(obsidian.vaultPath, DAILY_NOTES_CONFIG);
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

    test("says so when the daily-notes folder is missing, and shows the notes once it points back", async ({
        obsidian,
    }) => {
        const { page, vaultPath } = obsidian;
        const container = await openStream(page);
        await expect(container.locator(".daily-note-title").first()).toHaveText("2026-03-14");

        writeDailyNotesConfig(vaultPath, { folder: "Missing", format: "YYYY-MM-DD" });
        await expect(container.locator(".daily-notes-empty-state")).toBeVisible();
        await expect(container.locator(".daily-note-block")).toHaveCount(0);

        writeDailyNotesConfig(vaultPath, DAILY_NOTES_CONFIG);
        await expect(container.locator(".daily-note-title").first()).toHaveText("2026-03-14");
        await expect(container.locator(".daily-notes-empty-state")).toHaveCount(0);
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

test("redraws the stream on a setting's change, keeping the note being read at the top", async ({ obsidian }) => {
    const { page } = obsidian;
    const setShowProperties = (on: boolean) =>
        page.evaluate(async (on) => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = on;
            await plugin.saveSettings();
        }, on);
    const container = await openStream(page);
    const reading = container.locator(`.daily-note-block[data-source-path="Notes/${seededDate(4)}.md"]`);
    /** How far below the pane's top the note being read starts. */
    const offset = () =>
        reading.evaluate(
            (el) => el.getBoundingClientRect().top - el.parentElement!.parentElement!.getBoundingClientRect().top
        );
    await reading.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    await expect.poll(offset).toBeCloseTo(0, 0);
    await expect(container.locator(".metadata-container").first()).toBeAttached();

    await setShowProperties(false);
    try {
        // Every note above lost its properties panel, and so its height.
        await expect(container.locator(".metadata-container")).toHaveCount(0);
        await expect.poll(offset).toBeCloseTo(0, 0);
    } finally {
        await setShowProperties(true);
    }
});
