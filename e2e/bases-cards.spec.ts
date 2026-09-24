import type { Page } from "@playwright/test";
import { test, expect, openStream } from "./obsidian";

/** Newer than every seeded note, so it opens the stream. */
const NOTE = "Notes/2026-03-15.md";

const TABLE = ["views:", "  - type: table", "    name: Files", "    order:", "      - file.name", "      - file.path"];

/** Two views; an embed names the second. `this` is the embedding note. */
const TWO_VIEWS = [
    "views:",
    "  - type: table",
    "    name: First",
    "    order:",
    "      - file.name",
    "  - type: table",
    "    name: This note",
    "    filters: file.path == this.file.path",
    "    order:",
    "      - file.name",
    "",
].join("\n");

const BODY = ["## Bases", "", "```base", ...TABLE, "```", "", "![[Two.base#This note]]", ""].join("\n");

async function seed(page: Page): Promise<void> {
    await page.evaluate(
        async ({ note, body, base }) => {
            await window.app.vault.create("Two.base", base);
            await window.app.vault.create(note, body);
        },
        { note: NOTE, body: BODY, base: TWO_VIEWS }
    );
}

const read = (page: Page, path: string) => page.evaluate((p) => window.app.vault.adapter.read(p), path);

test.describe("Bases in the stream", () => {
    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.evaluate(
            async (paths) => {
                for (const path of paths) {
                    const file = window.app.vault.getAbstractFileByPath(path);
                    if (file) await window.app.vault.delete(file);
                }
            },
            [NOTE, "Two.base"]
        );
    });

    test("draws a table Base as cards on a phone only", async ({ obsidian, mobileLayout }) => {
        const { page } = obsidian;
        await seed(page);
        const container = await openStream(page);
        const note = container.locator(".daily-note-block").first();
        await expect(note.locator(".bases-view")).toHaveCount(2);

        const cards = note.locator(".bases-view").first().locator(".bases-cards-item[draggable]");
        const table = note.locator(".bases-view").first().locator(".bases-thead");
        if (mobileLayout) {
            await expect(cards.first()).toBeVisible();
            await expect(table).toHaveCount(0);
        } else {
            await expect(table).toBeVisible();
            await expect(cards).toHaveCount(0);
        }
    });

    test("draws an embedded Base's named view as cards, for the note", async ({ obsidian, mobileLayout }) => {
        test.skip(!mobileLayout, "cards are for a phone");
        const { page } = obsidian;
        await seed(page);
        const container = await openStream(page);
        const embedded = container.locator(".daily-note-block").first().locator(".bases-view").nth(1);

        // The view the embed names, filtered by `this`: the note, not the Base.
        // Bases keeps a hidden card to measure with; the drawn ones drag.
        const cards = embedded.locator(".bases-cards-item[draggable]");
        await embedded.scrollIntoViewIfNeeded();
        await expect(cards).toHaveCount(1);
        await expect(cards).toContainText("2026-03-15");
    });

    test("leaves the note and the Base untouched", async ({ obsidian }) => {
        const { page } = obsidian;
        await seed(page);
        const container = await openStream(page);
        await expect(container.locator(".daily-note-block").first().locator(".bases-view")).toHaveCount(2);

        expect(await read(page, NOTE)).toBe(BODY);
        expect(await read(page, "Two.base")).toBe(TWO_VIEWS);
    });

    // Bases saves a block through the editor that holds it; the stream has none.
    test("saves no toolbar edit over the note", async ({ obsidian }) => {
        const { page } = obsidian;
        await seed(page);
        const container = await openStream(page);
        const note = container.locator(".daily-note-block").first();

        await note.locator(".bases-toolbar-views-menu").first().click();
        await page.locator(".menu").getByText("Add view").click();
        // The view was added: Bases opens its settings.
        await expect(page.locator(".menu")).toContainText("Configure view");
        // Bases saves 100 ms after an edit; give a save the time to land.
        await page.waitForTimeout(1000);

        expect(await read(page, NOTE)).toBe(BODY);
    });
});
