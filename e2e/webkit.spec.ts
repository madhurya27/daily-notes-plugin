import type { Page } from "@playwright/test";
import { SEEDED_DAYS, openStream } from "./obsidian";
import { test, expect } from "./webkit";

/** A day after the newest seeded note, so the stream opens on it. */
const MATH_NOTE = "Notes/2026-03-15.md";

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

    // Nor on text sharing its parent with a block: a list item's own words
    // above its sub-list.
    test("paints a match in a list item holding a sub-list", async ({ obsidian, inWebKit }) => {
        await search(obsidian.page, "groceries");

        expect(await paints(await inWebKit(), "daily-notes-search-match")).toBe(true);
    });

    for (const [part, query] of [
        ["key", "mood"],
        ["value", "day-"],
        ["tag pill", "daily"],
    ] as const) {
        test(`paints a match in a property's ${part}`, async ({ obsidian, inWebKit }) => {
            await search(obsidian.page, query);

            const phone = await inWebKit();
            const inPanel = await phone.evaluate(() => {
                const [range] = [...CSS.highlights.get("daily-notes-search-match")!] as Range[];
                return !!range!.startContainer.parentElement!.closest(".metadata-container");
            });
            expect(inPanel).toBe(true);
            expect(await paints(phone, "daily-notes-search-match")).toBe(true);
        });
    }

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

    // MathJax 3 put each equation on a layer of its own, in WebKit only: on an
    // iPhone, a flick begun on a note holding math then stopped dead (D-085).
    test("puts no equation on a layer of its own", async ({ obsidian, inWebKit }) => {
        const { page } = obsidian;
        await page.evaluate(async (path) => void (await window.app.vault.create(path, "Effort: $CO_2$.")), MATH_NOTE);
        try {
            const container = await openStream(page);
            await expect(container.locator("mjx-container")).toBeAttached();

            const phone = await inWebKit();

            expect(await phone.locator("mjx-container").evaluate((el) => getComputedStyle(el).willChange)).toBe("auto");
        } finally {
            await page.evaluate(async (path) => {
                const file = window.app.vault.getAbstractFileByPath(path);
                if (file) await window.app.vault.delete(file);
            }, MATH_NOTE);
        }
    });
});
