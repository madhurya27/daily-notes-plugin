import { test, expect, openStream, seededDate, SEEDED_DAYS } from "./obsidian";

/** Fills the jump modal and submits it. */
async function jumpTo(page: import("@playwright/test").Page, date: string) {
    await page.locator('.view-action[aria-label="Jump to date"]').click();
    const modal = page.locator(".modal");
    await expect(modal).toBeVisible();
    await modal.locator('input[type="date"]').fill(date);
    await modal.getByRole("button", { name: "Jump" }).click();
    await expect(modal).toBeHidden();
}

test.describe("jump to date", () => {
    test("loads past the first batch and brings the note to the top", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const blocks = container.locator(".daily-note-block");

        await expect(blocks).toHaveCount(10); // BATCH_SIZE
        const oldest = seededDate(SEEDED_DAYS - 1);

        await jumpTo(page, oldest);

        // The target lay beyond the first batch, so reaching it had to load more.
        await expect(blocks).toHaveCount(SEEDED_DAYS);
        const target = container.locator(`.daily-note-block[data-source-path="Notes/${oldest}.md"]`);
        await expect(target.locator(".daily-note-title")).toHaveText(oldest);

        // Scrolled to, not merely loaded: the block settles at the top of the
        // pane. Polled, because the jump keeps correcting the scroll as the
        // notes around the target render and push it down.
        await expect
            .poll(() =>
                target.evaluate((el) => {
                    const scroller = el.closest(".daily-notes-stream-container")!.parentElement!;
                    return Math.abs(el.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
                })
            )
            .toBeLessThan(40);
    });

    test("falls back to the nearest older note when the date has none", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const newest = seededDate(0);

        // A day past the end of the vault: the newest note is what precedes it.
        await jumpTo(page, seededDate(-1));

        const target = container.locator(`.daily-note-block[data-source-path="Notes/${newest}.md"]`);
        await expect(target.locator(".daily-note-title")).toHaveText(newest);
    });

    test("says so, and moves nothing, when no note is that old", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const blocks = container.locator(".daily-note-block");
        const scroller = container.locator("xpath=..");
        await expect(blocks).toHaveCount(10); // BATCH_SIZE

        await jumpTo(page, seededDate(SEEDED_DAYS + 30));

        await expect(page.locator(".notice")).toHaveText("No daily note on or before that date.");
        await expect(blocks).toHaveCount(10);
        expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
    });
});
