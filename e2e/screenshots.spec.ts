import type { Page, TestInfo } from "@playwright/test";
import { test, expect, openStream } from "./obsidian";
import { mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { demoVault } from "../scripts/demo-vault.mjs";

/**
 * Captures the README's images from the real app rather than a mockup, one per
 * Playwright project so both layouts come from the same run. Opt-in: an
 * ordinary `pnpm run test:e2e` must not rewrite files in docs/.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs", "images");

/** Fixed, so a retake shows the same days. */
const DEMO = demoVault({ until: new Date(Date.UTC(2026, 8, 25)), days: 21 });

/** Swaps the fixture's test notes for the demo journal, in the folder the fixture's daily notes use. */
async function seedDemo(page: Page): Promise<void> {
    const files = Object.entries(DEMO).map(([path, text]): [string, string] => [
        path.replace(/^Journal\//, "Notes/"),
        text,
    ]);
    await page.evaluate(async (files) => {
        const { vault } = window.app;
        for (const file of vault.getFiles()) await vault.delete(file);
        for (const [path, text] of files) {
            const folder = path.split("/").slice(0, -1).join("/");
            if (folder && !vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
            await vault.create(path, text);
        }
        // The stream renders from metadataCache, which lags the write.
        await new Promise((r) => setTimeout(r, 1000));
    }, files);
}

async function capture(page: Page, name: string, testInfo: TestInfo): Promise<void> {
    await page.waitForTimeout(1000);
    const layout = testInfo.project.name === "mobile" ? "phone" : "desktop";
    await page.screenshot({ path: join(OUT, `${name}-${layout}.png`) });
}

test.describe("README screenshots", () => {
    test.skip(process.env.CAPTURE_SCREENSHOTS !== "1", "set CAPTURE_SCREENSHOTS=1 to capture");
    test.describe.configure({ mode: "serial" });

    test.beforeAll(async ({ obsidian }) => {
        await seedDemo(obsidian.page);
        // The sidebar carries the throwaway vault's generated name; collapsed it
        // also gives the stream the width a reader cares about. Phone layout
        // hides it already.
        await obsidian.page.evaluate(() => window.app.workspace.leftSplit?.collapse?.());
        mkdirSync(OUT, { recursive: true });
    });

    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.keyboard.press("Escape");
    });

    test("the stream", async ({ obsidian }, testInfo) => {
        const container = await openStream(obsidian.page);
        // A note boundary mid-screen is what makes it read as a stream.
        await container
            .locator(".daily-note-block")
            .nth(1)
            .evaluate((block) => block.firstElementChild?.scrollIntoView({ block: "center" }));
        await capture(obsidian.page, "stream", testInfo);
    });

    test("search", async ({ obsidian }, testInfo) => {
        const { page } = obsidian;
        await openStream(page);
        await page.locator('.view-action[aria-label="Search"]').click();
        const bar = page.locator(".daily-notes-search");
        await bar.locator("input").fill("Priya");
        await page.keyboard.press("Enter");
        await expect(bar.locator(".document-search-count")).toHaveText(/^1 \/ \d+$/);
        await capture(page, "search", testInfo);
    });

    test("jump to date", async ({ obsidian }, testInfo) => {
        const { page } = obsidian;
        await openStream(page);
        await page.locator('.view-action[aria-label="Jump to date"]').click();
        const prompt = page.locator(".prompt");
        await prompt.locator("input.prompt-input").fill("2026-09-1");
        await expect(prompt.locator(".suggestion-item").first()).toBeVisible();
        await capture(page, "jump", testInfo);
    });

    test("collapsed sections", async ({ obsidian }, testInfo) => {
        const { page } = obsidian;
        const container = await openStream(page);
        // Every section of the first two notes folded: the chevrons show, and more dates fit.
        for (const index of [0, 1]) {
            const headings = container.locator(".daily-note-block").nth(index).locator(".daily-note-content h2");
            for (const heading of await headings.all()) {
                await heading.locator(".collapse-indicator").click();
                await expect(heading).toHaveClass(/is-collapsed/);
            }
        }
        // Folding shifts the page under the scroll anchor; start from the newest note again.
        await container
            .locator(".daily-note-block")
            .first()
            .evaluate((block) => block.scrollIntoView({ block: "start" }));
        await capture(page, "collapse", testInfo);
    });

    test("a Base in a Sunday review", async ({ obsidian }, testInfo) => {
        const { page } = obsidian;
        const container = await openStream(page);
        // Only notes near the viewport are rendered: bring the block in, then its heading to the top.
        const sunday = container.locator('[data-source-path="Notes/2026-09-20.md"]');
        await sunday.scrollIntoViewIfNeeded();
        const reading = sunday.locator("h3", { hasText: "Reading" });
        await reading.evaluate((heading) => heading.scrollIntoView({ block: "start" }));
        await expect(sunday.locator(".bases-thead, .bases-cards-item").first()).toBeVisible();
        await capture(page, "bases", testInfo);
    });
});
