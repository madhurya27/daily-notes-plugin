import type { Page } from "@playwright/test";
import { test, expect, openStream } from "./obsidian";

/** Where each open note sits: its path, and whether its leaf shares the stream's tab group. */
function openNotes(page: Page) {
    return page.evaluate(() => {
        const stream = window.app.workspace.getLeavesOfType("daily-notes-stream-view")[0];
        return window.app.workspace
            .getLeavesOfType("markdown")
            .map((leaf: { view: { file?: { path: string } }; parent: unknown }) => ({
                path: leaf.view.file?.path,
                besideStream: leaf.parent === stream?.parent,
            }));
    });
}

async function streamIsOpen(page: Page) {
    return page.evaluate(() => window.app.workspace.getLeavesOfType("daily-notes-stream-view").length > 0);
}

test.describe("note title", () => {
    // Tests share the instance: a note left open would take the screen from the next test's stream.
    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.evaluate(() => window.app.workspace.detachLeavesOfType("markdown"));
    });

    test("opens the note in the stream's tab, which Back returns to", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);

        await container.locator(".daily-note-title").first().click();

        await expect
            .poll(async () => (await openNotes(page)).map((n: { path?: string }) => n.path))
            .toEqual(["Notes/2026-03-14.md"]);
        expect(await streamIsOpen(page)).toBe(false);
        await page.evaluate(() => window.app.commands.executeCommandById("app:go-back"));
        await expect.poll(() => streamIsOpen(page)).toBe(true);
    });

    test("opens the note in a split when mod-alt-clicked", async ({ obsidian, mobileLayout }) => {
        test.skip(mobileLayout, "a phone has no splits");
        const { page } = obsidian;
        const container = await openStream(page);

        await container
            .locator(".daily-note-title")
            .first()
            .click({ modifiers: ["ControlOrMeta", "Alt"] });

        await expect.poll(() => openNotes(page)).toEqual([{ path: "Notes/2026-03-14.md", besideStream: false }]);
    });

    test("opens the note in a new tab when mod-clicked, keeping the stream", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);

        await container
            .locator(".daily-note-title")
            .first()
            .click({ modifiers: ["ControlOrMeta"] });

        await expect.poll(() => openNotes(page)).toEqual([{ path: "Notes/2026-03-14.md", besideStream: true }]);
    });

    test("offers the file menu on right-click", async ({ obsidian, mobileLayout }) => {
        const { page } = obsidian;
        // A native menu (the macOS default) never reaches the DOM to be read.
        await page.evaluate(() => window.app.vault.setConfig("nativeMenus", false));
        const container = await openStream(page);

        await container.locator(".daily-note-title").first().click({ button: "right" });

        const menu = page.locator(".menu");
        await expect(menu.getByText("Open in new tab")).toBeVisible();
        // Added by Obsidian's own file-menu handlers, not by the plugin.
        await expect(menu.getByText("Bookmark...")).toBeVisible();
        // Obsidian adds its own "Open in new window" wherever windows exist; ours would double it.
        await expect(menu.getByText("Open in new window")).toHaveCount(mobileLayout ? 0 : 1);
        // A phone's menu is a sheet over a backdrop, and ignores Escape.
        if (mobileLayout) await page.locator(".suggestion-bg").click({ position: { x: 5, y: 5 } });
        else await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await page.evaluate(() => window.app.vault.setConfig("nativeMenus", null));
    });
});
