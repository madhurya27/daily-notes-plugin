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

test.describe("history", () => {
    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.evaluate(() => window.app.workspace.detachLeavesOfType("markdown"));
    });

    test("Back returns to the note the stream was scrolled to", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const target = container.locator(`.daily-note-block[data-source-path="Notes/${seededDate(8)}.md"]`);
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

        // The stream is the active, navigable tab: Obsidian opens the note in it.
        await page.evaluate(async () => {
            await window.app.workspace.getLeaf(false).openFile(window.app.vault.getFileByPath("Reading list.md")!);
        });
        await expect(container).toHaveCount(0);
        await page.evaluate(() => window.app.commands.executeCommandById("app:go-back"));

        await expect.poll(() => place(page)).toEqual(before);
    });
});
