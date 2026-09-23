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

        // One is marked at once, being on screen; the total is what counts.
        await expect(bar.locator(".document-search-count")).toHaveText(new RegExp(`/ ${SEEDED_DAYS}$`));
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

    // Typing marks what the reader already sees, as Obsidian's own bar does,
    // and scrolls nowhere: the first match on screen is the newest note's run.
    test("marks the first match on screen as you type, moving nothing", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const scrollTop = () => container.locator("xpath=..").evaluate((el) => el.scrollTop);
        const before = await scrollTop();
        const bar = await openSearch(page);

        await bar.locator("input").fill("km");

        await expect(bar.locator(".document-search-count")).toHaveText(`1 / ${SEEDED_DAYS}`);
        await expect.poll(() => currentMatch(page)).toEqual({ text: "km", onScreen: true });
        expect(await scrollTop()).toBe(before);
    });

    test("steps through a note's matches before the next note", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        const bar = await openSearch(page);
        const count = bar.locator(".document-search-count");
        await bar.locator("input").fill("km");
        await expect(count).toHaveText(`1 / ${SEEDED_DAYS}`);

        // The newest note says "km" twice: its run, marked as typed, then its table.
        await page.keyboard.press("Enter");
        await expect(count).toHaveText(`1 / ${SEEDED_DAYS}`);
        await page.keyboard.press("Enter");

        await expect(count).toHaveText(`2 / ${SEEDED_DAYS}`);
        await expect.poll(() => currentMatch(page)).toEqual({ text: "km", onScreen: true });

        await page.keyboard.press("Shift+Enter");
        await expect(count).toHaveText(`1 / ${SEEDED_DAYS}`);
    });

    test("unfolds a match under a collapsed heading, unsaved", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const heading = container.locator(".daily-note-block").first().locator(".daily-note-content h2").first();
        await heading.locator(".collapse-indicator").click();
        await expect(heading).toHaveClass(/is-collapsed/);
        const bar = await openSearch(page);
        await bar.locator("input").fill("Stretching");

        await page.keyboard.press("Enter");

        await expect(bar.locator(".document-search-count")).toHaveText(`1 / ${SEEDED_DAYS}`);
        await expect.poll(() => currentMatch(page)).toEqual({ text: "Stretching", onScreen: true });
        await expect(heading).not.toHaveClass(/is-collapsed/);
        // Unsaved: the fold still stands in the vault's own storage.
        const saved = await page.evaluate(() =>
            Object.keys(localStorage).some((key) => key.includes("collapse:") && localStorage[key] === "true")
        );
        expect(saved).toBe(true);
    });

    test("labels a match nothing on screen can show", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        const bar = await openSearch(page);
        // Frontmatter source: the properties panel draws "mood", never "mood:".
        await bar.locator("input").fill("mood:");

        await page.keyboard.press("Enter");

        await expect(bar.locator(".document-search-count")).toHaveText(`1 / ${SEEDED_DAYS} · hidden`);
        expect(await currentMatch(page)).toBeNull();
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
