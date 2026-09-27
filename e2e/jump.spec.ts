import {
    test,
    expect,
    openStream,
    scrollThroughStream,
    seededDate,
    LAYOUT_VIEWPORT,
    SEEDED_DAYS,
    withoutScrollAnchoring,
    restoreScrollAnchoring,
} from "./obsidian";

/** The note at the pane's top, how far it starts above it, and how many unloaded notes lie above. */
function readingPoint(container: import("@playwright/test").Locator) {
    return container.evaluate((column) => {
        const pane = column.parentElement!.getBoundingClientRect();
        const blocks = [...column.querySelectorAll<HTMLElement>(".daily-note-block")];
        const i = blocks.findIndex((block) => block.getBoundingClientRect().bottom > pane.top + 1);
        return {
            path: blocks[i]!.dataset.sourcePath,
            offset: blocks[i]!.getBoundingClientRect().top - pane.top,
            unloadedAbove: blocks.slice(0, i).filter((block) => block.classList.contains("is-unloaded")).length,
        };
    });
}

/** Turns the phone on its side, as a reader does. */
async function turnPhone(page: import("@playwright/test").Page) {
    const turn = ({ width, height }: { width: number; height: number }) =>
        cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    const cdp = await page.context().newCDPSession(page);
    await turn({ width: LAYOUT_VIEWPORT.mobile.height, height: LAYOUT_VIEWPORT.mobile.width });
    return { restore: () => turn(LAYOUT_VIEWPORT.mobile) };
}

/**
 * Narrows the pane as a desktop reader does. Not by resizing the viewport:
 * afterwards Obsidian's menus no longer close on Escape.
 */
async function openRightSidebar(page: import("@playwright/test").Page) {
    await page.evaluate(() => window.app.workspace.rightSplit.expand());
    return { restore: () => page.evaluate(() => window.app.workspace.rightSplit.collapse()) };
}

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

    // A focused query raises the phone's keyboard over half the list; the
    // reader looks first, then taps the query or the calendar.
    test("focuses the query on desktop only, and a tap focuses it on mobile", async ({ obsidian, mobileLayout }) => {
        const { page } = obsidian;
        await openStream(page);
        const prompt = await openSuggester(page);
        const query = prompt.locator("input.prompt-input");

        if (!mobileLayout) {
            await expect(query).toBeFocused();
            return;
        }
        // Polled for a while: Obsidian may focus the query after the open.
        await expect.poll(() => query.evaluate((el) => el === document.activeElement), { timeout: 1000 }).toBe(false);
        await page.waitForTimeout(500);
        await expect(query).not.toBeFocused();

        await query.click();
        await expect(query).toBeFocused();
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

    // iOS opens its wheel only for a tap on the date input itself, never
    // through showPicker(): so a tap on the icon must land on the input.
    test("puts the date input under the calendar icon, where a tap lands", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        const prompt = await openSuggester(page);

        const icon = prompt.locator(".daily-notes-jump-calendar");

        // Polled: on mobile the prompt slides up from below the screen.
        await expect
            .poll(async () => {
                const box = (await icon.boundingBox())!;
                return page.evaluate(
                    ({ x, y }) => document.elementFromPoint(x, y)?.matches('input[type="date"]') ?? false,
                    { x: box.x + box.width / 2, y: box.y + box.height / 2 }
                );
            })
            .toBe(true);
    });

    // iOS draws a date input at its own width, whatever its box says; one
    // spilling out of the icon took the clear button's taps.
    test("leaves the clear button its taps, however wide the date input draws", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        const prompt = await openSuggester(page);
        await prompt.locator(".daily-notes-jump-picker").evaluate((el) => (el.style.minWidth = "240px"));
        const clear = prompt.locator(".search-input-clear-button");

        await expect
            .poll(async () => {
                const box = (await clear.boundingBox())!;
                return page.evaluate(
                    ({ x, y }) => document.elementFromPoint(x, y)?.matches(".search-input-clear-button") ?? false,
                    { x: box.x + box.width / 2, y: box.y + box.height / 2 }
                );
            })
            .toBe(true);
    });

    // iOS fills an empty date input with today as its wheel opens; taking
    // focus away on that change closed the wheel before the reader turned it.
    test("keeps the wheel open as it fills the query, and Enter still jumps", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const prompt = await openSuggester(page);
        const picker = prompt.locator(".daily-notes-jump-picker");
        const target = seededDate(SEEDED_DAYS - 1);

        await picker.focus();
        await picker.evaluate((el, value) => {
            (el as HTMLInputElement).value = value;
            el.dispatchEvent(new Event("change"));
        }, target);

        await expect(prompt.locator("input.prompt-input")).toHaveValue(target);
        await expect(picker).toBeFocused();

        await page.keyboard.press("Enter");
        await expect(prompt).toBeHidden();
        const block = container.locator(`.daily-note-block[data-source-path="Notes/${target}.md"]`);
        await expect(block.locator(".daily-note-title")).toHaveText(target);
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

    // A guess grows or shrinks as the reader scrolls back past it (ADR 0010).
    test("reserves the heights notes measured in an earlier session", async ({ obsidian }) => {
        const { page } = obsidian;
        await scrollThroughStream(await openStream(page));
        await page.evaluate(async () => {
            await window.app.plugins.disablePlugin("daily-notes-stream");
            await window.app.plugins.enablePlugin("daily-notes-stream");
        });
        const container = await openStream(page);

        await jumpTo(page, seededDate(SEEDED_DAYS - 1));

        const { layout, remembered, reserved } = await container.evaluate((column) => {
            const layout = `${column.clientWidth}:${getComputedStyle(column).getPropertyValue("--font-text-size").trim()}`;
            const notes: [string, [string, number][]][] =
                window.app.plugins.plugins["daily-notes-stream"].layoutMemory.notes.toJSON();
            const unloaded = [...column.querySelectorAll<HTMLElement>(".daily-note-block.is-unloaded")];
            return {
                layout,
                remembered: Object.fromEntries(notes.find(([key]) => key === layout)?.[1] ?? []),
                reserved: unloaded.map((el) => [
                    el.dataset.sourcePath!,
                    el.style.getPropertyValue("--daily-note-placeholder-height"),
                ]),
            };
        });
        expect(layout).toMatch(/^\d+:\d+px$/);
        expect(reserved.length).toBeGreaterThan(0);
        // A note unloaded this session reserves what it measured; the store keeps whole pixels.
        for (const [path, height] of reserved) expect(Math.round(parseFloat(height!)), path).toBe(remembered[path!]);
    });

    // iOS has no scroll anchoring: whatever changes height as the width
    // changes, the stream alone must hold the place.
    test("keeps the reader's place without native anchoring when the width changes", async ({ obsidian }, testInfo) => {
        const { page } = obsidian;
        await withoutScrollAnchoring(page);
        try {
            const container = await openStream(page);
            await scrollThroughStream(container);
            await jumpTo(page, seededDate(Math.floor(SEEDED_DAYS / 2)));
            const before = await readingPoint(container);
            expect(before.unloadedAbove).toBeGreaterThan(0);
            const widthBefore = await container.evaluate((column) => column.clientWidth);

            const width = testInfo.project.name === "mobile" ? await turnPhone(page) : await openRightSidebar(page);
            try {
                await expect.poll(() => container.evaluate((column) => column.clientWidth)).not.toBe(widthBefore);
                // Obsidian reports the resize late, and the scroll takes the shift once still.
                await page.waitForTimeout(1000);
                const after = await readingPoint(container);
                expect(after.path).toBe(before.path);
                expect(after.offset).toBeCloseTo(before.offset, 0);
            } finally {
                await width.restore();
            }
        } finally {
            await restoreScrollAnchoring(page);
        }
    });
});
