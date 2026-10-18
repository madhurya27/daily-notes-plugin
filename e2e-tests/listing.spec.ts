import type { Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { join, resolve } from "path";
import { test, expect, openStream } from "./obsidian";
import { prepareDemo, showLightTheme } from "./demo";

/**
 * Captures the community directory listing's five desktop screenshots: the
 * whole window at the listing's 1200x800, at the display's scale. Uploaded by
 * hand under Edit listing, so they go to .dev/, not docs/. Opt-in, through
 * `pnpm run capture:listing`.
 */

const OUT = resolve(import.meta.dirname, "..", ".dev", "listing");
const SIZE = { width: 1200, height: 800 };

/** Scrolls the stream so the note at `path` starts `fraction` of the way down the window. */
async function placeNote(page: Page, path: string, fraction: number): Promise<void> {
    const block = page.locator(`.daily-notes-stream-container [data-source-path="${path}"]`);
    await block.scrollIntoViewIfNeeded();
    await block.evaluate((el, fraction) => {
        el.scrollIntoView({ block: "start" });
        el.closest(".view-content")!.scrollTop -= fraction * window.innerHeight - el.getBoundingClientRect().top;
    }, fraction);
}

/** The window as a reader's vault shows it: a vault name, not the fixture's, and no sync status. */
async function dressWindow(page: Page): Promise<void> {
    await page.evaluate(
        async ({ width, height }) => window.electron.remote.getCurrentWindow().setContentSize(width, height),
        SIZE
    );
    await page.waitForFunction(({ width }) => window.innerWidth === width, SIZE);
    await page.evaluate(() => {
        window.app.workspace.leftSplit.expand();
        document.querySelector(".workspace-drawer-vault-name")!.textContent = "Journal";
        document.head.appendChild(document.createElement("style")).textContent = ".status-bar { display: none; }";
    });
    const notes = page.locator('.nav-folder-title[data-path="Notes"]');
    await notes.click();
    await expect(page.locator('.nav-file-title[data-path^="Notes/"]').first()).toBeVisible();
}

async function capture(page: Page, name: string): Promise<void> {
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
}

test.describe("listing screenshots", () => {
    test.skip(process.env.CAPTURE_LISTING !== "1", "set CAPTURE_LISTING=1 to capture");
    test.describe.configure({ mode: "serial" });

    test.beforeAll(async ({ obsidian }) => {
        const { page } = obsidian;
        await prepareDemo(page);
        await dressWindow(page);
        mkdirSync(OUT, { recursive: true });
    });

    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.keyboard.press("Escape");
    });

    test("the stream", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        await placeNote(page, "Notes/2026-09-24.md", 0.4);
        await capture(page, "1-stream");
    });

    test("search", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        await page.locator('.view-action[aria-label="Search"]').click();
        const bar = page.locator(".daily-notes-search");
        await bar.locator("input").fill("Mara");
        await page.keyboard.press("Enter");
        await expect(bar.locator(".document-search-count")).toHaveText(/^2 \/ \d+$/);
        await capture(page, "2-search");
    });

    test("jump to date", async ({ obsidian }) => {
        const { page } = obsidian;
        await openStream(page);
        // Below the prompt, so it covers no date.
        await placeNote(page, "Notes/2026-09-24.md", 0.72);
        await page.locator('.view-action[aria-label="Jump to date"]').click();
        const prompt = page.locator(".prompt");
        await prompt.locator("input.prompt-input").fill("2026-09-1");
        await expect(prompt.locator(".suggestion-item").first()).toBeVisible();
        await capture(page, "3-jump");
    });

    test("a Base in a Sunday review", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const sunday = container.locator('[data-source-path="Notes/2026-09-20.md"]');
        await sunday.scrollIntoViewIfNeeded();
        await sunday.locator("h3", { hasText: "Reading" }).evaluate((heading) => heading.scrollIntoView());
        await expect(sunday.locator(".bases-thead").first()).toBeVisible();
        await capture(page, "4-bases");
    });

    test("linked mentions in dark mode", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.emulateMedia({ colorScheme: "dark" });
        try {
            await expect(page.locator("body")).toHaveClass(/theme-dark/);
            const container = await openStream(page);
            const mentions = container.locator(".daily-note-block").first().locator(".daily-note-mentions");
            await expect(mentions.locator(".daily-note-mention").first()).toBeVisible();
            await mentions.evaluate((footer) => footer.scrollIntoView({ block: "center" }));
            await capture(page, "5-mentions-dark");
        } finally {
            await showLightTheme(page);
        }
    });
});
