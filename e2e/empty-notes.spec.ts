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
/** Not a daily note: it links to the empty one. */
const MENTIONING_NOTE = "Meeting.md";
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
        const paths = [TEMPLATE_PATH, EMPTY_NOTE, MENTIONING_NOTE, await todayNote(page)];
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

    test("shows the note, with its linked mentions, when another note links to it", async ({ obsidian }) => {
        const { page } = obsidian;
        await write(page, MENTIONING_NOTE, `Planned on [[${EMPTY_DAY}]].\n`);
        await expect
            .poll(() => page.evaluate((path) => path in window.app.metadataCache.resolvedLinks, MENTIONING_NOTE))
            .toBe(true);

        const shown = await titles(page);

        await expect(shown.nth(1)).toHaveText(EMPTY_DAY);
        await expect(page.locator(`[data-source-path="${EMPTY_NOTE}"]`)).toContainText("Planned on");
    });

    test("shows the note as soon as another note links to it", async ({ obsidian }) => {
        const { page } = obsidian;
        const shown = await titles(page);
        await expect(shown.nth(1)).toHaveText(seededDate(0));

        await write(page, MENTIONING_NOTE, `Planned on [[${EMPTY_DAY}]].\n`);

        await expect(shown.nth(1)).toHaveText(EMPTY_DAY);
        await expect(page.locator(`[data-source-path="${EMPTY_NOTE}"]`)).toContainText("Planned on");
    });

    test("hides the note again once its last link is removed", async ({ obsidian }) => {
        const { page } = obsidian;
        await write(page, MENTIONING_NOTE, `Planned on [[${EMPTY_DAY}]].\n`);
        const shown = await titles(page);
        await expect(shown.nth(1)).toHaveText(EMPTY_DAY);

        await write(page, MENTIONING_NOTE, "Planned on another day.\n");

        await expect(shown.nth(1)).toHaveText(seededDate(0));
    });

    test("hides the note again once the note linking to it is deleted", async ({ obsidian }) => {
        const { page } = obsidian;
        await write(page, MENTIONING_NOTE, `Planned on [[${EMPTY_DAY}]].\n`);
        const shown = await titles(page);
        await expect(shown.nth(1)).toHaveText(EMPTY_DAY);

        await page.evaluate((path) => window.app.vault.delete(window.app.vault.getFileByPath(path)), MENTIONING_NOTE);

        await expect(shown.nth(1)).toHaveText(seededDate(0));
    });

    // Each note's check is saved on this device (ADR 0011).
    test("reads no unchanged note after the plugin reloads, and still hides the empty one", async ({ obsidian }) => {
        const { page } = obsidian;
        await titles(page);
        const read = await page.evaluate(async () => {
            const { app } = window;
            await app.plugins.disablePlugin("daily-notes-stream");
            const { vault } = app;
            const cachedRead = vault.cachedRead;
            const read: string[] = [];
            vault.cachedRead = (file: { path: string }) => (read.push(file.path), cachedRead.call(vault, file));
            try {
                await app.plugins.enablePlugin("daily-notes-stream");
                await app.commands.executeCommandById("daily-notes-stream:open-stream");
                while (!document.querySelector(".daily-notes-stream-container .daily-note-content"))
                    await new Promise((resolve) => setTimeout(resolve, 5));
            } finally {
                vault.cachedRead = cachedRead;
            }
            // What the stream drew reads each note too; only the check is under test.
            const drawn = new Set(
                [...document.querySelectorAll<HTMLElement>(".daily-note-block:not(.is-unloaded)")].map(
                    (el) => el.dataset.sourcePath
                )
            );
            return read.filter((path) => path.startsWith("Notes/") && !drawn.has(path));
        });

        expect(read).toEqual([]);
        const shown = (await openStream(page)).locator(".daily-note-title");
        await expect(shown.nth(1)).toHaveText(seededDate(0));
    });

    test("shows every note with the setting off", async ({ obsidian }) => {
        const { page } = obsidian;
        const shown = await titles(page);
        await expect(shown.nth(1)).toHaveText(seededDate(0));

        await setHideEmptyNotes(page, false);

        await expect(shown.nth(1)).toHaveText(EMPTY_DAY);
    });

    test.describe("toggling the setting while reading", () => {
        const block = (page: Page, path: string) => page.locator(`[data-source-path="${path}"]`);

        /** Scrolls the note at `path` to the top of the pane. */
        const readAt = (page: Page, path: string) =>
            block(page, path).evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));

        /**
         * Waits until every note down to `path` has its height remembered, as
         * it has by the time a reader reaches a setting.
         */
        const settled = (page: Page, path: string) =>
            expect
                .poll(() =>
                    page.evaluate((path) => {
                        const blocks = [...document.querySelectorAll<HTMLElement>(".daily-note-block")];
                        const above = blocks.slice(0, blocks.findIndex((b) => b.dataset.sourcePath === path) + 1);
                        const notes: [string, [string, number][]][] =
                            window.app.plugins.plugins["daily-notes-stream"].layoutMemory.notes.toJSON();
                        const kept = new Set(notes.flatMap(([, heights]) => heights.map(([p]) => p)));
                        return above.every((b) => kept.has(b.dataset.sourcePath!));
                    }, path)
                )
                .toBe(true);

        /** How far below the pane's top the note at `path` starts. */
        const offsetOf = (page: Page, path: string) =>
            block(page, path).evaluate((el) => {
                const pane = el.closest(".daily-notes-stream-container")!.parentElement!;
                return el.getBoundingClientRect().top - pane.getBoundingClientRect().top;
            });

        test("keeps the note being read at the top", async ({ obsidian }) => {
            const { page } = obsidian;
            const reading = `Notes/${seededDate(3)}.md`;
            await titles(page);
            await readAt(page, reading);
            await settled(page, reading);

            await setHideEmptyNotes(page, false);

            await expect(block(page, EMPTY_NOTE)).toHaveCount(1);
            await expect.poll(() => offsetOf(page, reading)).toBeCloseTo(0, 0);
        });

        test("moves to the next older note when the one being read is hidden", async ({ obsidian }) => {
            const { page } = obsidian;
            await setHideEmptyNotes(page, false);
            await titles(page);
            await readAt(page, EMPTY_NOTE);
            await settled(page, EMPTY_NOTE);

            await setHideEmptyNotes(page, true);

            await expect(block(page, EMPTY_NOTE)).toHaveCount(0);
            await expect.poll(() => offsetOf(page, `Notes/${seededDate(0)}.md`)).toBeCloseTo(0, 0);
        });
    });
});
