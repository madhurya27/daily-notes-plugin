import type { Page } from "@playwright/test";
import { test, expect, openStream, seededDate } from "./obsidian";

/** The first note reaching into the pane, and how far its top sits from the pane's. */
function place(page: Page) {
    return page.evaluate(() => {
        const pane = document.querySelector(".daily-notes-stream-container")?.parentElement;
        if (!pane) return null;
        const paneTop = pane.getBoundingClientRect().top;
        for (const block of pane.querySelectorAll<HTMLElement>(".daily-note-block")) {
            const { top, bottom } = block.getBoundingClientRect();
            if (bottom > paneTop) return { path: block.dataset.sourcePath, offset: Math.round(top - paneTop) };
        }
        return null;
    });
}

/** Scrolls the stream past the top of the note `daysBack`, and waits for the notes around it to settle. */
async function scrollPast(page: Page, daysBack: number) {
    const container = await openStream(page);
    const target = container.locator(`.daily-note-block[data-source-path="Notes/${seededDate(daysBack)}.md"]`);
    await target.evaluate((el) => {
        const pane = el.closest(".daily-notes-stream-container")!.parentElement!;
        pane.scrollTop += el.getBoundingClientRect().top - pane.getBoundingClientRect().top + 150;
    });
    // The notes around it render once scrolled to, and push it about.
    let before = await place(page);
    await expect
        .poll(async () => {
            const now = await place(page);
            const settled = JSON.stringify(now) === JSON.stringify(before);
            before = now;
            return settled;
        })
        .toBe(true);
    return { container, target, before };
}

test.describe("history", () => {
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
        const { page } = obsidian;
        const { target } = await scrollPast(page, 3);
        const title = await target.locator(".daily-note-title").elementHandle();

        // In one task: on a phone the notes around it may still be rendering,
        // so the place is taken the instant it is left.
        const { left, frames } = await page.evaluate(async (title) => {
            const placeNow = () => {
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
            const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

            // Back does nothing until the stream is in the leaf's history.
            const history = () => window.app.workspace.getLeaf(false).history.backHistory.length;
            const behind = history();
            const deadline = performance.now() + 15_000;

            const left = placeNow();
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
                const frame = placeNow();
                if (frame === undefined) continue;
                quiet = frame === seen.at(-1) ? quiet + 1 : 0;
                seen.push(frame);
            }
            return { left, frames: [...new Set(seen)] };
        }, title);

        expect(frames).toEqual([left]);
    });
});
