import type { Page } from "@playwright/test";
import { test, expect, openStream, restoreScrollAnchoring, seededDate, withoutScrollAnchoring } from "./obsidian";

/**
 * Defines `window.streamPlace` in the page: the first note reaching into the
 * pane and how far its top sits from the pane's, as the stream keeps its place;
 * undefined while no stream is open.
 */
function measurePlaces(page: Page) {
    return page.evaluate(() => {
        window.streamPlace = () => {
            const pane = document.querySelector(".daily-notes-stream-container")?.parentElement;
            if (!pane) return undefined;
            const paneTop = pane.getBoundingClientRect().top;
            const first = [...pane.querySelectorAll<HTMLElement>(".daily-note-block")].find(
                (block) => block.getBoundingClientRect().bottom > paneTop
            );
            return JSON.stringify(
                first && {
                    path: first.dataset.sourcePath,
                    offset: Math.round(first.getBoundingClientRect().top - paneTop),
                }
            );
        };
    });
}

const place = (page: Page) => page.evaluate(() => window.streamPlace!());

/** Waits until the stream's place has held still: renders push it about, a Base fills in later still, and the phone window draws a frame a second. */
async function settledPlace(page: Page) {
    let before = await place(page);
    let stillSince = Date.now();
    await expect
        .poll(
            async () => {
                const now = await place(page);
                if (now !== before) stillSince = Date.now();
                before = now;
                return Date.now() - stillSince;
            },
            { intervals: [250], timeout: 20_000 }
        )
        .toBeGreaterThan(1500);
    return before;
}

/**
 * Scrolls the stream `past` the top of the note `daysBack` and waits for it to
 * settle. Twice: the first scroll is measured against placeholders, and the
 * notes it renders move the target.
 */
async function scrollPast(page: Page, daysBack: number, past = 150) {
    const container = await openStream(page);
    const target = container.locator(`.daily-note-block[data-source-path="Notes/${seededDate(daysBack)}.md"]`);
    const scrollTo = () =>
        target.evaluate((el, past) => {
            const pane = el.closest(".daily-notes-stream-container")!.parentElement!;
            pane.scrollTop += el.getBoundingClientRect().top - pane.getBoundingClientRect().top + past;
        }, past);
    await scrollTo();
    await settledPlace(page);
    await scrollTo();
    return { container, target, before: await settledPlace(page) };
}

/** Leaves the stream for a note and comes Back; every place the stream showed on the way, and the one it left. */
async function goBack(page: Page) {
    const { target } = await scrollPast(page, 3);
    const title = await target.locator(".daily-note-title").elementHandle();

    // In one task: on a phone the notes around it may still be rendering,
    // so the place is taken the instant it is left.
    const { left, frames } = await page.evaluate(async (title) => {
        const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

        // Back does nothing until the stream is in the leaf's history.
        const history = () => window.app.workspace.getLeaf(false).history.backHistory.length;
        const behind = history();
        const deadline = performance.now() + 15_000;

        const left = window.streamPlace!();
        // Playwright's click() would scroll the title into view first, and move the place.
        title!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        while (history() === behind) {
            if (performance.now() > deadline) return { left: "the note never opened", frames: [] };
            await nextFrame();
        }

        // Every frame from Back on, as the stream shows it, until it holds still.
        const seen: string[] = [];
        window.app.commands.executeCommandById("app:go-back");
        for (let quiet = 0; quiet < 30 && performance.now() < deadline;) {
            await nextFrame();
            const frame = window.streamPlace!();
            if (frame === undefined) continue;
            quiet = frame === seen.at(-1) ? quiet + 1 : 0;
            seen.push(frame);
        }
        return { left, frames: [...new Set(seen)] };
    }, title);

    return { left, frames };
}

/**
 * Reopens the stream and hands it the place it left once it has drawn a frame,
 * as iOS does; every place it showed from then on, and the one it left.
 */
async function returnAfterAFrame(page: Page, { daysBack = 3, past }: { daysBack?: number; past?: number } = {}) {
    const { before: left } = await scrollPast(page, daysBack, past);
    const eState = await page.evaluate(() =>
        window.app.workspace.getLeavesOfType("daily-notes-stream-view")[0]!.view.getEphemeralState()
    );
    await openStream(page);

    const frames = await page.evaluate(async (eState) => {
        const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        await nextFrame();
        await nextFrame();
        window.app.workspace.getLeavesOfType("daily-notes-stream-view")[0]!.view.setEphemeralState(eState);

        const seen: string[] = [];
        const deadline = performance.now() + 15_000;
        for (let quiet = 0; quiet < 30 && performance.now() < deadline;) {
            await nextFrame();
            const frame = window.streamPlace!()!;
            quiet = frame === seen.at(-1) ? quiet + 1 : 0;
            seen.push(frame);
        }
        return [...new Set(seen)];
    }, eState);
    return { left, frames };
}

test.describe("history", () => {
    test.beforeEach(({ obsidian }) => measurePlaces(obsidian.page));

    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.evaluate(() => window.app.workspace.detachLeavesOfType("markdown"));
    });

    test("Back returns to the note the stream was scrolled to", async ({ obsidian }) => {
        const { page } = obsidian;
        const { container, before } = await scrollPast(page, 8);

        // The stream is the active, navigable tab: Obsidian opens the note in it.
        await page.evaluate(async () => {
            await window.app.workspace.getLeaf(false).openFile(window.app.vault.getFileByPath("Reading list.md")!);
        });
        await expect(container).toHaveCount(0);
        await page.evaluate(() => window.app.commands.executeCommandById("app:go-back"));

        await expect.poll(() => place(page)).toEqual(before);
    });

    test("Back shows the stream only at the place it left", async ({ obsidian }) => {
        const { left, frames } = await goBack(obsidian.page);
        expect(frames).toEqual([left]);
    });

    test("returns to the place it left when handed it after drawing a frame", async ({ obsidian }) => {
        const { left, frames } = await returnAfterAFrame(obsidian.page);
        expect(frames).toEqual([left]);
    });

    // The tenth note ends the first batch: nothing is loaded below it until the
    // stream loads more, too little to scroll to a place near its bottom.
    test("returns to a place near the bottom of the last note loaded with it", async ({ obsidian }) => {
        const { left, frames } = await returnAfterAFrame(obsidian.page, { daysBack: 9, past: 700 });
        expect(frames).toEqual([left]);
    });

    // iOS WebKit has no scroll anchoring: the stream holds the reader's place itself.
    test.describe("where the platform has no scroll anchoring", () => {
        test.beforeEach(({ obsidian }) => withoutScrollAnchoring(obsidian.page));
        test.afterEach(({ obsidian }) => restoreScrollAnchoring(obsidian.page));

        test("Back shows the stream only at the place it left", async ({ obsidian }) => {
            const { left, frames } = await goBack(obsidian.page);
            expect(frames).toEqual([left]);
        });

        test("returns to the place it left when handed it after drawing a frame", async ({ obsidian }) => {
            const { left, frames } = await returnAfterAFrame(obsidian.page);
            expect(frames).toEqual([left]);
        });

        test.describe("past a Base at the top of the note it left", () => {
            const NOTE = `Notes/${seededDate(3)}.md`;
            let original = "";

            test.beforeEach(async ({ obsidian }) => {
                original = await obsidian.page.evaluate(async (path) => {
                    const file = window.app.vault.getFileByPath(path)!;
                    const text = await window.app.vault.read(file);
                    const base = ["```base", "views:", "  - type: table", "    name: Files", "```", ""].join("\n");
                    await window.app.vault.modify(file, base + text);
                    return text;
                }, NOTE);
            });

            test.afterEach(async ({ obsidian }) => {
                await obsidian.page.evaluate(
                    ([path, text]) => window.app.vault.modify(window.app.vault.getFileByPath(path)!, text),
                    [NOTE, original] as const
                );
            });

            // Bases fills a view after it is drawn: the note shrinks, then grows back.
            test("returns to the place it left", async ({ obsidian }) => {
                const { left, frames } = await returnAfterAFrame(obsidian.page, { past: 900 });
                expect(frames).toEqual([left]);
            });
        });
    });
});
