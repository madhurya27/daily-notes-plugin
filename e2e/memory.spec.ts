import { test, expect, openStream, SEEDED_DAYS } from "./obsidian";

/**
 * The ceiling ADR 0006 exists to remove: a vault of several years, scrolled to
 * its end. Only meaningful against a vault that size, so it runs on its own —
 * `pnpm run test:memory` — rather than in the ordinary e2e sweep.
 */
const YEARS = 3;

test.describe("a multi-year vault scrolled to the end", () => {
    test.skip(SEEDED_DAYS < YEARS * 365, "run via pnpm run test:memory");
    test.setTimeout(900_000);

    test("holds a bounded number of rendered notes, not the whole vault", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const blocks = container.locator(".daily-note-block");
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Performance.enable");

        /** JS heap and DOM nodes, as Chromium counts them. */
        const sample = async () => {
            const { metrics } = await cdp.send("Performance.getMetrics");
            const by = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
            return { heapMb: by("JSHeapUsedSize") / 1e6, nodes: by("Nodes") };
        };

        const scroller = container.locator("xpath=..");
        const scrollToEnd = () => scroller.evaluate((el) => void (el.scrollTop = el.scrollHeight));

        await expect(blocks).toHaveCount(10); // BATCH_SIZE
        const first = await sample();

        // Every batch needs the sentinel back in view; the count stops growing
        // when the service runs out of notes.
        let loaded = 0;
        for (let batch = 0; loaded < SEEDED_DAYS && batch < SEEDED_DAYS; batch++) {
            await scrollToEnd();
            await expect(blocks).not.toHaveCount(loaded);
            loaded = await blocks.count();
        }

        expect(loaded).toBe(SEEDED_DAYS);

        // Settle: the last scroll leaves renders and unloads in flight.
        await page.waitForTimeout(2000);
        const end = await sample();
        const renderedAtEnd = await container.locator(".daily-note-block:not(.is-unloaded)").count();
        // Chromium's Nodes metric counts detached nodes until they are
        // collected, so the live tree is what says whether the DOM is bounded.
        const liveNodes = await container.evaluate((el) => el.querySelectorAll("*").length);

        // eslint-disable-next-line no-console -- the number this test exists to report
        console.log(
            `[memory] ${SEEDED_DAYS} notes | rendered ${renderedAtEnd} | ` +
                `heap ${first.heapMb.toFixed(1)} → ${end.heapMb.toFixed(1)} MB | ` +
                `nodes ${first.nodes} → ${end.nodes} (${liveNodes} live in the stream)`
        );

        // The whole point: what is rendered follows the viewport, not the vault.
        expect(renderedAtEnd).toBeLessThan(40);
        // One element per unloaded note, plus the handful that are rendered —
        // not the ~40 each a rendered note costs.
        expect(liveNodes).toBeLessThan(SEEDED_DAYS + 500);
        // Reaching the end of a three-year vault must not cost more heap than
        // the first ten notes did.
        expect(end.heapMb).toBeLessThan(first.heapMb * 2);
    });

    // The flick a reader actually does: straight to the end in one throw, fast
    // enough that blocks cross both margins between frames.
    test("leaves nothing rendered behind after a flick to the end", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const scroller = container.locator("xpath=..");

        let loaded = 0;
        for (let batch = 0; loaded < SEEDED_DAYS && batch < SEEDED_DAYS; batch++) {
            await scroller.evaluate((el) => void (el.scrollTop = el.scrollHeight));
            await expect(container.locator(".daily-note-block")).not.toHaveCount(loaded);
            loaded = await container.locator(".daily-note-block").count();
        }

        // Back to the top and down again in single jumps, with no settling.
        for (const position of [0, 1, 0, 1]) {
            await scroller.evaluate((el, at) => void (el.scrollTop = at * el.scrollHeight), position);
        }
        await page.waitForTimeout(3000);

        const rendered = await container.locator(".daily-note-block:not(.is-unloaded)").count();
        // eslint-disable-next-line no-console -- the number this test exists to report
        console.log(`[memory] after four flicks across ${SEEDED_DAYS} notes: ${rendered} rendered`);
        expect(rendered).toBeLessThan(40);
    });

    test("comes back to life at the top after the round trip", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const scroller = container.locator("xpath=..");

        await scroller.evaluate((el) => void (el.scrollTop = el.scrollHeight));
        await expect(container.locator(".daily-note-block").first()).toHaveClass(/is-unloaded/);

        await scroller.evaluate((el) => void (el.scrollTop = 0));

        const top = container.locator(".daily-note-block").first();
        await expect(top).not.toHaveClass(/is-unloaded/);
        await expect(top.locator(".daily-note-content")).toBeVisible();
    });
});
