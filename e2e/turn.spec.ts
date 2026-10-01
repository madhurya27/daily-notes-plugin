import type { Locator, Page } from "@playwright/test";
import {
    test,
    expect,
    openStream,
    scrollThroughStream,
    withoutScrollAnchoring,
    restoreScrollAnchoring,
    LAYOUT_VIEWPORT,
} from "./obsidian";

const PORTRAIT = LAYOUT_VIEWPORT.mobile;
const LANDSCAPE = { width: PORTRAIT.height, height: PORTRAIT.width };

async function turn(page: Page, { width, height }: { width: number; height: number }): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
}

/** Each note's height as laid out now, by path: a placeholder's is what it reserves. */
function heights(container: Locator): Promise<Record<string, number>> {
    return container.evaluate((stream) =>
        Object.fromEntries(
            [...stream.querySelectorAll<HTMLElement>(".daily-note-block")].map((block) => [
                block.dataset.sourcePath!,
                Math.round(block.getBoundingClientRect().height),
            ])
        )
    );
}

/** What each unloaded note reserves, by path. */
function reserved(container: Locator): Promise<Record<string, number>> {
    return container.evaluate((stream) =>
        Object.fromEntries(
            [...stream.querySelectorAll<HTMLElement>(".daily-note-block.is-unloaded")].map((block) => [
                block.dataset.sourcePath!,
                Math.round(block.getBoundingClientRect().height),
            ])
        )
    );
}

/** The note at the pane's top, and how far its top is from the pane's. */
function place(container: Locator): Promise<{ path: string; top: number }> {
    return container.evaluate((stream) => {
        const pane = stream.parentElement!.getBoundingClientRect();
        const block = [...stream.querySelectorAll<HTMLElement>(".daily-note-block")].find(
            (b) => b.getBoundingClientRect().bottom > pane.top
        )!;
        return { path: block.dataset.sourcePath!, top: Math.round(block.getBoundingClientRect().top - pane.top) };
    });
}

/**
 * Long enough for a turn to be over: Obsidian reports it to the view a few
 * hundred ms late, and the scroll counts as still 300 ms after that.
 */
const rest = (page: Page) => page.waitForTimeout(1500);

// iOS turns: Chromium stands in, without its own scroll anchoring.
test.describe("a phone turned", () => {
    test.beforeEach(async ({ obsidian, mobileLayout }) => {
        test.skip(!mobileLayout, "a phone's turn");
        await withoutScrollAnchoring(obsidian.page);
    });
    test.afterEach(async ({ obsidian }) => {
        await turn(obsidian.page, PORTRAIT);
        await restoreScrollAnchoring(obsidian.page);
    });

    /** Every note measured in landscape, then the stream opened in portrait: what landscape measured. */
    async function measuredBothWays(page: Page) {
        await turn(page, LANDSCAPE);
        let container = await openStream(page);
        await scrollThroughStream(container);
        const landscape = await heights(container);
        await turn(page, PORTRAIT);
        container = await openStream(page);
        await scrollThroughStream(container);
        return { container, landscape };
    }

    test("re-reserves each unloaded note at its new width once the scroll is still", async ({ obsidian }) => {
        const { page } = obsidian;
        const { container, landscape } = await measuredBothWays(page);
        const blocks = container.locator(".daily-note-block");
        await blocks.nth(9).evaluate((el) => el.scrollIntoView({ block: "start" }));
        await rest(page);

        await turn(page, LANDSCAPE);

        await expect
            .poll(async () => {
                const now = Object.entries(await reserved(container));
                return now.length > 0 && now.every(([path, height]) => height === landscape[path]);
            })
            .toBe(true);
    });

    test("keeps the note at the pane's top through the turn and the re-reserving", async ({ obsidian }) => {
        const { page } = obsidian;
        const { container } = await measuredBothWays(page);
        await container
            .locator(".daily-note-block")
            .nth(7)
            .evaluate((el) => el.scrollIntoView({ block: "start" }));
        await rest(page);
        const before = await place(container);

        await turn(page, LANDSCAPE);
        await rest(page);

        const after = await place(container);
        expect(after.path).toBe(before.path);
        expect(Math.abs(after.top)).toBeLessThan(5);
    });

    // ADR 0014: the stream would shorten past the pane's bottom, and the browser clamp the scroll first.
    test("puts off a shrink larger than the stream below, at its end", async ({ obsidian }) => {
        const { page } = obsidian;
        const { container } = await measuredBothWays(page);
        const before = await reserved(container);
        const { path } = await place(container);

        await turn(page, LANDSCAPE);
        await rest(page);

        const after = await reserved(container);
        for (const [path, height] of Object.entries(before)) expect(after[path], path).toBe(height);
        expect((await place(container)).path).toBe(path);
    });
});
