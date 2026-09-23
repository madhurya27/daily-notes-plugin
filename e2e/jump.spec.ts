import { test, expect, openStream, seededDate, SEEDED_DAYS } from "./obsidian";

/** Opens the jump suggester and returns its prompt. */
async function openSuggester(page: import("@playwright/test").Page) {
    await page.locator('.view-action[aria-label="Jump to date"]').click();
    const prompt = page.locator(".prompt");
    await expect(prompt).toBeVisible();
    return prompt;
}

/** Types `date` into the suggester and takes the first thing it offers. */
async function jumpTo(page: import("@playwright/test").Page, date: string) {
    const prompt = await openSuggester(page);
    await prompt.locator("input.prompt-input").fill(date);
    await prompt.locator(".suggestion-item").first().click();
    await expect(prompt).toBeHidden();
}

test.describe("jump to date", () => {
    // Tests share one Obsidian instance, and a suggester left open puts a
    // modal backdrop over the next test's first click.
    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.keyboard.press("Escape");
        await expect(obsidian.page.locator(".modal-container")).toHaveCount(0);
    });

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

    // Only days the vault has a note for are listed, so the reader can no
    // longer ask for one that silently lands somewhere else.
    test("offers the vault's own dates, newest first", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);

        const prompt = await openSuggester(page);
        const items = prompt.locator(".suggestion-item");

        await expect(items).toHaveCount(SEEDED_DAYS);
        await expect(items.first()).toHaveText(seededDate(0));
        await expect(items.last()).toHaveText(seededDate(SEEDED_DAYS - 1));
    });

    test("narrows to what is typed", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);

        const prompt = await openSuggester(page);
        await prompt.locator("input.prompt-input").fill(seededDate(3));

        await expect(prompt.locator(".suggestion-item")).toHaveText([seededDate(3)]);
    });

    test("says a date has no note before jumping anywhere near it", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);

        // A day past the end of the vault: no note carries it.
        const prompt = await openSuggester(page);
        await prompt.locator("input.prompt-input").fill(seededDate(-1));

        await expect(prompt.locator(".suggestion-item")).toContainText("has no note");
        await expect(prompt.locator(".daily-notes-jump-fallback")).toHaveText("Jump to the nearest older note");
    });

    test("keeps the query box the prompt's full width, clear button inside", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        const prompt = await openSuggester(page);
        const box = async (selector: string) => (await prompt.locator(selector).boundingBox())!;

        const container = await box(".prompt-input-container");
        const input = await box("input.prompt-input");
        const clear = await box(".search-input-clear-button");

        expect(input.x + input.width).toBeCloseTo(container.x + container.width, 0);
        expect(clear.x + clear.width).toBeLessThanOrEqual(input.x + input.width);
    });

    test("fills the query from the platform's own date picker", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);

        const prompt = await openSuggester(page);
        const target = seededDate(2);

        // The wheel itself is the platform's, so the test drives the hidden
        // control the calendar button hands to it and checks what comes back.
        await prompt.locator(".daily-notes-jump-picker").evaluate((el, value) => {
            (el as HTMLInputElement).value = value;
            el.dispatchEvent(new Event("change"));
        }, target);

        await expect(prompt.locator("input.prompt-input")).toHaveValue(target);
        await expect(prompt.locator(".suggestion-item")).toHaveText([target]);
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
