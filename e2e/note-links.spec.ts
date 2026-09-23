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

/** The path of the note in the focused leaf; getActiveFile() would report the last note focused. */
function activeNote(page: Page) {
    return page.evaluate(() => window.app.workspace.activeLeaf?.view?.file?.path);
}

async function focusStream(page: Page) {
    await page.evaluate(() => {
        const stream = window.app.workspace.getLeavesOfType("daily-notes-stream-view")[0]!;
        window.app.workspace.setActiveLeaf(stream, { focus: true });
    });
}

async function firstLink(page: Page, text: string) {
    const container = await openStream(page);
    return container.locator(".internal-link", { hasText: text }).first();
}

test.describe("links in a note", () => {
    // Tests share the instance: a note left open would take the screen from the next test's stream.
    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.evaluate(() => window.app.workspace.detachLeavesOfType("markdown"));
    });

    test("open the linked note without closing the stream", async ({ obsidian }) => {
        const { page } = obsidian;
        await (await firstLink(page, "Reading list")).click();

        await expect.poll(() => openNotes(page)).toEqual([{ path: "Reading list.md", besideStream: true }]);
    });

    test("return to the tab already showing the linked note", async ({ obsidian }) => {
        const { page } = obsidian;
        const link = await firstLink(page, "Reading list");
        await link.click();
        await expect.poll(async () => (await openNotes(page)).length).toBe(1);
        await focusStream(page);

        await link.click();

        await expect.poll(() => activeNote(page)).toBe("Reading list.md");
        expect(await openNotes(page)).toHaveLength(1);
    });

    test("scroll the tab already showing the note to the linked heading", async ({ obsidian }) => {
        const { page } = obsidian;
        await (await firstLink(page, "Reading list")).click();
        await expect.poll(async () => (await openNotes(page)).length).toBe(1);
        await focusStream(page);

        await (await firstLink(page, "what's next")).click();

        await expect.poll(() => activeNote(page)).toBe("Reading list.md");
        const note = page.locator(".workspace-leaf.mod-active .markdown-source-view");
        await expect(note.getByText("Middlemarch")).toBeInViewport();
        expect(await openNotes(page)).toHaveLength(1);
    });

    test("open in a split when mod-alt-clicked", async ({ obsidian, mobileLayout }) => {
        test.skip(mobileLayout, "a phone has no splits");
        const { page } = obsidian;
        await (await firstLink(page, "Reading list")).click({ modifiers: ["ControlOrMeta", "Alt"] });

        await expect.poll(() => openNotes(page)).toEqual([{ path: "Reading list.md", besideStream: false }]);
    });

    test("open a second copy in a new tab when mod-clicked", async ({ obsidian }) => {
        const { page } = obsidian;
        const link = await firstLink(page, "Reading list");
        await link.click();
        await expect.poll(async () => (await openNotes(page)).length).toBe(1);
        await focusStream(page);

        await link.click({ modifiers: ["ControlOrMeta"] });

        await expect.poll(async () => (await openNotes(page)).length).toBe(2);
    });

    test("open in a new tab when middle-clicked", async ({ obsidian }) => {
        const { page } = obsidian;
        await (await firstLink(page, "Reading list")).click({ button: "middle" });

        await expect.poll(() => openNotes(page)).toEqual([{ path: "Reading list.md", besideStream: true }]);
    });

    test("offer the linked note's file menu on right-click", async ({ obsidian, mobileLayout }) => {
        const { page } = obsidian;
        // A native menu (the macOS default) never reaches the DOM to be read.
        await page.evaluate(() => window.app.vault.setConfig("nativeMenus", false));
        await (await firstLink(page, "Reading list")).click({ button: "right" });

        const menu = page.locator(".menu");
        await expect(menu.getByText("Open in new tab")).toBeVisible();
        await expect(menu.getByText("Bookmark...")).toBeVisible();

        // A phone's menu is a sheet over a backdrop, and ignores Escape.
        if (mobileLayout) await page.locator(".suggestion-bg").click({ position: { x: 5, y: 5 } });
        else await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await page.evaluate(() => window.app.vault.setConfig("nativeMenus", null));
    });

    test("fade a link to a note that does not exist, as Obsidian does", async ({ obsidian }) => {
        const { page } = obsidian;
        const missing = await firstLink(page, "Someday");
        const existing = await firstLink(page, "Reading list");

        await expect(missing).toHaveClass(/\bis-unresolved\b/);
        await expect(existing).not.toHaveClass(/\bis-unresolved\b/);
        const opacity = await missing.evaluate((el) => Number(getComputedStyle(el).opacity));
        expect(opacity).toBeLessThan(1);
    });

    test("unfade the link once its note is created", async ({ obsidian }) => {
        const { page } = obsidian;
        const missing = await firstLink(page, "Someday");
        await expect(missing).toHaveClass(/\bis-unresolved\b/);

        await page.evaluate(async () => {
            await window.app.vault.create("Someday.md", "");
        });

        await expect(missing).not.toHaveClass(/\bis-unresolved\b/);
        await page.evaluate(() => window.app.vault.delete(window.app.vault.getFileByPath("Someday.md")!));
        await expect(missing).toHaveClass(/\bis-unresolved\b/);
    });

    test("preview the linked note on mod-hover", async ({ obsidian, mobileLayout }) => {
        test.skip(mobileLayout, "a phone has no hover");
        const { page } = obsidian;
        const link = await firstLink(page, "Reading list");

        await page.keyboard.down("ControlOrMeta");
        await link.hover();

        await expect(page.locator(".hover-popover").getByText("Book 1", { exact: true })).toBeVisible();
        await page.keyboard.up("ControlOrMeta");
        await page.mouse.move(0, 0);
        await expect(page.locator(".hover-popover")).toHaveCount(0);
    });
});
