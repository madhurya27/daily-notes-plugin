import { writeFileSync } from "fs";
import { join } from "path";
import type { Page } from "@playwright/test";
import { test, expect, openStream, seededDate } from "./obsidian";

const CONFIG = { folder: "Notes", format: "YYYY-MM-DD" };
const TEMPLATE_PATH = "Templates/Daily.md";
const TEMPLATE = "---\ntags: daily\n---\n# {{date:dddd, MMMM D}}\n\n## Log\n- \n";
/** A day after the newest seeded note, holding only its template. */
const EMPTY_DAY = "2026-03-15";
const EMPTY_NOTE = `Notes/${EMPTY_DAY}.md`;
const EMPTY_TEXT = "---\ntags: daily\n---\n# Sunday, March 15\n\n## Log\n- \n";

function writeDailyNotesConfig(vaultPath: string, config: Record<string, string>) {
    writeFileSync(join(vaultPath, ".obsidian", "daily-notes.json"), JSON.stringify(config));
}

/** Today as YYYY-MM-DD, by the app's clock. */
const today = (page: Page) => page.evaluate(() => new Date().toLocaleDateString("en-CA"));

const todayNote = async (page: Page) => `Notes/${await today(page)}.md`;

/** Writes `text` to `path`, creating it when missing. */
async function write(page: Page, path: string, text: string) {
    await page.evaluate(
        async ({ path, text }) => {
            const { vault } = window.app;
            const file = vault.getFileByPath(path);
            if (file) await vault.modify(file, text);
            else await vault.create(path, text);
        },
        { path, text }
    );
}

async function setHideEmptyNotes(page: Page, on: boolean) {
    await page.evaluate(async (on) => {
        const plugin = window.app.plugins.plugins["daily-notes-stream"];
        plugin.settings.hideEmptyNotes = on;
        await plugin.saveSettings();
    }, on);
}

test.describe("empty daily notes", () => {
    test.beforeEach(async ({ obsidian }) => {
        const { page, vaultPath } = obsidian;
        await page.evaluate(async () => {
            await window.app.vault.createFolder("Templates").catch(() => {});
        });
        await write(page, TEMPLATE_PATH, TEMPLATE);
        await write(page, EMPTY_NOTE, EMPTY_TEXT);
        await write(page, await todayNote(page), EMPTY_TEXT);
        writeDailyNotesConfig(vaultPath, { ...CONFIG, template: "Templates/Daily" });
        await expect
            .poll(() =>
                page.evaluate(
                    () => window.app.internalPlugins.getPluginById("daily-notes").instance.options.template as string
                )
            )
            .toBe("Templates/Daily");
    });

    test.afterEach(async ({ obsidian }) => {
        const { page, vaultPath } = obsidian;
        await setHideEmptyNotes(page, true);
        writeDailyNotesConfig(vaultPath, CONFIG);
        const paths = [TEMPLATE_PATH, EMPTY_NOTE, await todayNote(page)];
        await page.evaluate(async (paths) => {
            for (const path of paths) {
                const file = window.app.vault.getAbstractFileByPath(path);
                if (file) await window.app.vault.delete(file);
            }
        }, paths);
    });

    const titles = async (page: Page) => {
        const container = await openStream(page);
        return container.locator(".daily-note-title");
    };

    test("leaves out a note holding only its template, but shows today's", async ({ obsidian }) => {
        const { page } = obsidian;
        const shown = await titles(page);

        await expect(shown.first()).toHaveText(await today(page));
        await expect(shown.nth(1)).toHaveText(seededDate(0));
        await expect(page.locator(`[data-source-path="${EMPTY_NOTE}"]`)).toHaveCount(0);
    });

    test("shows the note once it is written in", async ({ obsidian }) => {
        const { page } = obsidian;
        const shown = await titles(page);
        await expect(shown.nth(1)).toHaveText(seededDate(0));

        await write(page, EMPTY_NOTE, `${EMPTY_TEXT}- Ran 5 km\n`);

        await expect(shown.nth(1)).toHaveText(EMPTY_DAY);
        await expect(shown.nth(2)).toHaveText(seededDate(0));
    });

    test("shows the note once a property is added", async ({ obsidian }) => {
        const { page } = obsidian;
        const shown = await titles(page);
        await expect(shown.nth(1)).toHaveText(seededDate(0));

        await page.evaluate(async (path) => {
            const file = window.app.vault.getFileByPath(path)!;
            await window.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
                frontmatter.mood = "good";
            });
        }, EMPTY_NOTE);

        await expect(shown.nth(1)).toHaveText(EMPTY_DAY);
    });

    test("hides the note again once it is emptied back to the template", async ({ obsidian }) => {
        const { page } = obsidian;
        await write(page, EMPTY_NOTE, `${EMPTY_TEXT}- Ran 5 km\n`);
        const shown = await titles(page);
        await expect(shown.nth(1)).toHaveText(EMPTY_DAY);

        await write(page, EMPTY_NOTE, EMPTY_TEXT);

        await expect(shown.nth(1)).toHaveText(seededDate(0));
    });

    test("shows every note with the setting off", async ({ obsidian }) => {
        const { page } = obsidian;
        const shown = await titles(page);
        await expect(shown.nth(1)).toHaveText(seededDate(0));

        await setHideEmptyNotes(page, false);

        await expect(shown.nth(1)).toHaveText(EMPTY_DAY);
    });
});
