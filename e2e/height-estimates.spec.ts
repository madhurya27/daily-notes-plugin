import { writeFileSync } from "fs";
import { join } from "path";
import type { Page } from "@playwright/test";
import { test, expect, openStream } from "./obsidian";

/** What a placeholder is estimated from reads the column as a note lays it out (D-079). */

const CONFIG = { folder: "Notes", format: "YYYY-MM-DD" };
const TEMPLATE_PATH = "Templates/Daily.md";
const TEMPLATE = "---\ntags: daily\n---\n## Morning\n\n## Work\n- \n";
/** Newer than every seeded note, so it opens the stream. */
const NOTE = "Notes/2026-03-15.md";

function writeDailyNotesConfig(vaultPath: string, config: Record<string, string>) {
    writeFileSync(join(vaultPath, ".obsidian", "daily-notes.json"), JSON.stringify(config));
}

async function setHideEmptyNotes(page: Page, on: boolean) {
    await page.evaluate(async (on) => {
        const plugin = window.app.plugins.plugins["daily-notes-stream"];
        plugin.settings.hideEmptyNotes = on;
        await plugin.saveSettings();
    }, on);
}

test("reads the note text's font and line height as a note's paragraph has them", async ({ obsidian }) => {
    const container = await openStream(obsidian.page);
    const paragraph = container.locator(".daily-note-content p").first();
    await expect(paragraph).toBeVisible();

    const { measured, laidOut } = await paragraph.evaluate((p) => {
        const { estimates } = window.app.workspace.getLeavesOfType("daily-notes-stream-view")[0].view.stream;
        const style = getComputedStyle(p);
        const context = document.createElement("canvas").getContext("2d")!;
        context.font = style.font;
        const text = p.textContent ?? "";
        return {
            measured: estimates.sources.text() as { charWidth: number; lineHeight: number },
            laidOut: {
                charWidth: context.measureText(text).width / text.length,
                lineHeight: parseFloat(style.lineHeight),
            },
        };
    });

    expect(measured.lineHeight).toBe(laidOut.lineHeight);
    // A sample sentence, not this paragraph: near its average character, not on it.
    expect(Math.abs(measured.charWidth / laidOut.charWidth - 1)).toBeLessThan(0.15);
});

test.describe("with a daily-notes template", () => {
    test.beforeEach(async ({ obsidian }) => {
        const { page, vaultPath } = obsidian;
        await page.evaluate(
            async ({ path, text, note }) => {
                await window.app.vault.createFolder("Templates").catch(() => {});
                await window.app.vault.create(path, text);
                await window.app.vault.create(note, text);
            },
            { path: TEMPLATE_PATH, text: TEMPLATE, note: NOTE }
        );
        writeDailyNotesConfig(vaultPath, { ...CONFIG, template: "Templates/Daily" });
        await expect
            .poll(() =>
                page.evaluate(() => window.app.internalPlugins.getPluginById("daily-notes").instance.options.template)
            )
            .toBe("Templates/Daily");
        await setHideEmptyNotes(page, false);
    });

    test.afterEach(async ({ obsidian }) => {
        const { page, vaultPath } = obsidian;
        await setHideEmptyNotes(page, true);
        writeDailyNotesConfig(vaultPath, CONFIG);
        await page.evaluate(
            async (paths) => {
                for (const path of paths) {
                    const file = window.app.vault.getAbstractFileByPath(path);
                    if (file) await window.app.vault.delete(file);
                }
            },
            [NOTE, TEMPLATE_PATH]
        );
    });

    // A note never measured is estimated up from it.
    test("measures the template as tall as a note holding only it", async ({ obsidian }) => {
        const container = await openStream(obsidian.page);
        const note = container.locator(`.daily-note-block[data-source-path="${NOTE}"]`);
        await expect(note.locator(".daily-note-content")).toBeVisible();

        const template = () =>
            container.evaluate((column, path) => {
                const { layoutMemory } = window.app.plugins.plugins["daily-notes-stream"];
                const layout = `${column.clientWidth}:${getComputedStyle(column).getPropertyValue("--font-text-size").trim()}`;
                return layoutMemory.templates.heightOf(layout, path) as number | undefined;
            }, TEMPLATE_PATH);
        await expect.poll(template).toBeGreaterThan(0);

        const rendered = await note.evaluate((block) => block.getBoundingClientRect().height);
        expect(Math.abs(rendered - (await template())!)).toBeLessThanOrEqual(1);
        // Measured out of sight, and gone.
        await expect(obsidian.page.locator(".daily-notes-stream-probe")).toHaveCount(0);
    });

    test("forgets every height on a device build's command, and measures the template again", async ({ obsidian }) => {
        const container = await openStream(obsidian.page);
        const memory = () =>
            container.evaluate((column, path) => {
                const { layoutMemory } = window.app.plugins.plugins["daily-notes-stream"];
                const layout = `${column.clientWidth}:${getComputedStyle(column).getPropertyValue("--font-text-size").trim()}`;
                return {
                    notes: layoutMemory.notes.entries(layout).length as number,
                    template: layoutMemory.templates.heightOf(layout, path) as number | undefined,
                };
            }, TEMPLATE_PATH);
        await expect.poll(async () => (await memory()).notes).toBeGreaterThan(0);
        await expect.poll(async () => (await memory()).template).toBeGreaterThan(0);

        const forgotten = await obsidian.page.evaluate(() => {
            // A release build, as e2e runs, has no command: call what it runs.
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.forgetNoteHeights();
            const { layoutMemory } = plugin;
            return layoutMemory.notes.layouts().flatMap((layout: string) => layoutMemory.notes.entries(layout));
        });
        expect(forgotten).toEqual([]);
        await expect.poll(async () => (await memory()).template).toBeGreaterThan(0);
    });
});
