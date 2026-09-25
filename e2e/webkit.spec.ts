import type { Page } from "@playwright/test";
import { SEEDED_DAYS, openStream } from "./obsidian";
import { test, expect } from "./webkit";

/** Whether clearing the page's highlights changes the pixels under the first range of `name`. */
async function paints(page: Page, name: string): Promise<boolean> {
    const clip = await page.evaluate((n) => {
        const [range] = [...CSS.highlights.get(n)!] as Range[];
        const { x, y, width, height } = range!.getBoundingClientRect();
        return { x, y, width, height };
    }, name);
    const highlighted = await page.screenshot({ clip });
    await page.evaluate(() => CSS.highlights.clear());
    return !highlighted.equals(await page.screenshot({ clip }));
}

test.describe("in iOS's engine", () => {
    test.beforeEach(({ mobileLayout }) => test.skip(!mobileLayout, "a snapshot of the phone layout"));

    /** Searches the stream for `query`, found once in every seeded note. */
    async function search(page: Page, query: string) {
        await openStream(page);
        await page.locator('.view-action[aria-label="Search"]').click();
        const bar = page.locator(".daily-notes-search");
        await bar.locator("input").fill(query);
        await expect(bar.locator(".document-search-count")).toHaveText(`1 / ${SEEDED_DAYS}`);
    }

    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.keyboard.press("Escape");
    });

    // WebKit paints no highlight on text the reader cannot select, and reads
    // only -webkit-user-select, which Obsidian sets to none.
    test("paints the search's highlights", async ({ obsidian, inWebKit }) => {
        await search(obsidian.page, "km");

        expect(await paints(await inWebKit(), "daily-notes-search-match")).toBe(true);
    });

    test("lets the reader select a note's text and title", async ({ obsidian, inWebKit }) => {
        const container = await openStream(obsidian.page);
        await expect(container.locator(".daily-note-content p").first()).toBeAttached();

        const phone = await inWebKit();

        for (const selector of [".daily-note-content p", ".daily-note-title"]) {
            const value = await phone
                .locator(selector)
                .first()
                .evaluate((el) => getComputedStyle(el).webkitUserSelect);
            expect(value, selector).toBe("text");
        }
    });
});
