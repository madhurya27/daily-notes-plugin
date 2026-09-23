import type { Locator, Page } from "@playwright/test";
import { test, expect, openStream, SEEDED_DAYS } from "./obsidian";

/** Opens the bar from the header, which both layouts show. */
async function openSearch(page: Page): Promise<Locator> {
    await page.locator('.view-action[aria-label="Search"]').click();
    const bar = page.locator(".daily-notes-search");
    await expect(bar.locator("input")).toBeFocused();
    return bar;
}

/** How many ranges the named highlight paints. */
const painted = (page: Page, name: string) => page.evaluate((n) => CSS.highlights.get(n)?.size ?? 0, name);

/** The current match's text, and whether it lies inside the pane's visible area. */
const currentMatch = (page: Page) =>
    page.evaluate(() => {
        const [range] = [...(CSS.highlights.get("daily-notes-search-current") ?? [])] as Range[];
        if (!range) return null;
        const pane = document.querySelector(".daily-notes-stream-container")!.parentElement!.getBoundingClientRect();
        const rect = range.getBoundingClientRect();
        return { text: range.toString(), onScreen: rect.top >= pane.top && rect.bottom <= pane.bottom };
    });

test.describe("search the stream", () => {
    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.keyboard.press("Escape");
    });

    test("opens on the vault's search hotkey, with the other hotkeys left alone", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);

        await page.keyboard.press("ControlOrMeta+f");
        await expect(page.locator(".daily-notes-search input")).toBeFocused();

        await page.keyboard.press("Escape");
        await page.keyboard.press("ControlOrMeta+p");
        await expect(page.locator(".prompt")).toBeVisible();
    });

    test("counts matching notes, not matches", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        const bar = await openSearch(page);

        // Every seeded note says "km" twice; one run a day.
        await bar.locator("input").fill("km");

        await expect(bar.locator(".document-search-count")).toHaveText(`${SEEDED_DAYS} notes`);
    });

    test("reaches a note past the loaded batch and shows its match", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        await expect(container.locator(".daily-note-block")).toHaveCount(10); // BATCH_SIZE
        const bar = await openSearch(page);

        // Day 2 is the second-oldest note, far below the first batch.
        await bar.locator("input").fill("Ran 2 km");
        await expect(bar.locator(".document-search-count")).toHaveText("1 note");
        await page.keyboard.press("Enter");

        await expect(bar.locator(".document-search-count")).toHaveText("1 / 1");
        await expect.poll(() => currentMatch(page)).toEqual({ text: "Ran 2 km", onScreen: true });
    });

    test("steps through a note's matches before the next note", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        const bar = await openSearch(page);
        await bar.locator("input").fill("km");

        await page.keyboard.press("Enter");
        await expect(bar.locator(".document-search-count")).toHaveText(`1 / ${SEEDED_DAYS}`);
        await page.keyboard.press("Enter");
        await expect(bar.locator(".document-search-count")).toHaveText(`1 / ${SEEDED_DAYS}`);
        await page.keyboard.press("Enter");

        await expect(bar.locator(".document-search-count")).toHaveText(`2 / ${SEEDED_DAYS}`);
        await expect.poll(() => currentMatch(page)).toEqual({ text: "km", onScreen: true });

        await page.keyboard.press("Shift+Enter");
        await expect(bar.locator(".document-search-count")).toHaveText(`1 / ${SEEDED_DAYS}`);
    });

    test("skips a match under a collapsed heading", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        await container
            .locator(".daily-note-block")
            .first()
            .locator(".daily-note-content h2")
            .first()
            .locator(".collapse-indicator")
            .click();
        const bar = await openSearch(page);
        await bar.locator("input").fill("Stretching");

        await page.keyboard.press("Enter");
        // The newest note's only match is hidden: it is visited, nothing marked.
        await expect(bar.locator(".document-search-count")).toHaveText(`1 / ${SEEDED_DAYS}`);
        expect(await currentMatch(page)).toBeNull();

        await page.keyboard.press("Enter");
        await expect.poll(() => currentMatch(page)).toEqual({ text: "Stretching", onScreen: true });
    });

    test("clears every highlight on close", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        const bar = await openSearch(page);
        await bar.locator("input").fill("km");
        await page.keyboard.press("Enter");
        await expect.poll(() => painted(page, "daily-notes-search-match")).toBeGreaterThan(0);

        await page.keyboard.press("Escape");

        await expect(bar).toBeHidden();
        await expect.poll(() => painted(page, "daily-notes-search-match")).toBe(0);
        expect(await painted(page, "daily-notes-search-current")).toBe(0);
    });
});
