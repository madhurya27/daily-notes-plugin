import type { Page, TestInfo } from "@playwright/test";
import { test, expect, openStream } from "./obsidian";
import { join } from "path";
import { OUT, prepareDemo, showLightTheme } from "./demo";

/**
 * Captures the README's stills from the real app rather than a mockup, one per
 * Playwright project so both layouts come from the same run. Opt-in, through
 * `pnpm run capture:screenshots`: an ordinary `pnpm run test:e2e` must not
 * rewrite files in docs/.
 */

/**
 * Opens the stream with a note boundary mid-screen: that is what makes it read as a stream. The boundary sits
 * below 2026-09-23, the newest note nothing links to, so linked mentions show only in the collapse still.
 */
async function showStream(page: Page): Promise<void> {
    const container = await openStream(page);
    const below = container.locator('[data-source-path="Notes/2026-09-22.md"]');
    await below.scrollIntoViewIfNeeded();
    await expect(below.locator(".daily-note-content")).toBeVisible();
    await below.evaluate((block) => block.firstElementChild?.scrollIntoView({ block: "center" }));
}

async function capture(page: Page, name: string, testInfo: TestInfo): Promise<void> {
    await page.waitForTimeout(1000);
    const layout = testInfo.project.name === "mobile" ? "phone" : "desktop";
    const path = join(OUT, `${name}-${layout}.png`);
    if (layout === "phone") return void (await page.screenshot({ path }));

    const clip = await noteColumn(page);
    const frame = await framed(page, clip);
    try {
        await page.screenshot({ path, clip });
    } finally {
        await frame.evaluate((el) => el.remove());
    }
}

type Box = { x: number; y: number; width: number; height: number };

/** A border along `box`'s edges, drawn into the still (D-126). */
async function framed(page: Page, box: Box) {
    return page.evaluateHandle(({ x, y, width, height }) => {
        const frame = document.body.appendChild(document.createElement("div"));
        Object.assign(frame.style, {
            position: "fixed",
            left: `${x}px`,
            top: `${y}px`,
            width: `${width}px`,
            height: `${height}px`,
            boxSizing: "border-box",
            border: "1px solid var(--background-modifier-border)",
            pointerEvents: "none",
            zIndex: "100000",
        });
        return frame;
    }, box);
}

/** The top of the note column, from under the view's header so an open search bar shows (D-126). */
async function noteColumn(page: Page): Promise<Box> {
    const leaf = page.locator(".workspace-leaf.mod-active");
    const header = await leaf.locator(".view-header").boundingBox();
    const column = await leaf.locator(".daily-notes-stream-container").boundingBox();
    if (!header || !column) throw new Error("the stream is not on screen");
    const margin = 32;
    return { x: column.x - margin, y: header.y + header.height, width: column.width + 2 * margin, height: 520 };
}

test.describe("README screenshots", () => {
    test.skip(process.env.CAPTURE_SCREENSHOTS !== "1", "set CAPTURE_SCREENSHOTS=1 to capture");
    test.describe.configure({ mode: "serial" });

    test.beforeAll(async ({ obsidian }) => {
        await prepareDemo(obsidian.page);
    });

    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.keyboard.press("Escape");
    });

    test("the stream", async ({ obsidian }, testInfo) => {
        test.skip(testInfo.project.name === "desktop", "on desktop the recording leads the README instead");
        await showStream(obsidian.page);
        await capture(obsidian.page, "stream", testInfo);
    });

    test("the stream in dark mode", async ({ obsidian }, testInfo) => {
        const { page } = obsidian;
        await page.emulateMedia({ colorScheme: "dark" });
        try {
            await expect(page.locator("body")).toHaveClass(/theme-dark/);
            await showStream(page);
            await capture(page, "stream-dark", testInfo);
        } finally {
            await showLightTheme(page);
        }
    });

    test("search", async ({ obsidian }, testInfo) => {
        const { page } = obsidian;
        await openStream(page);
        await page.locator('.view-action[aria-label="Search"]').click();
        const bar = page.locator(".daily-notes-search");
        await bar.locator("input").fill("Mara");
        // Typing makes the first match current; the second is the one a step scrolls into view.
        await page.keyboard.press("Enter");
        await expect(bar.locator(".document-search-count")).toHaveText(/^2 \/ \d+$/);
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

    // Before the collapse still, which folds these footers and leaves them folded.
    test("linked mentions", async ({ obsidian }, testInfo) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const mentions = container.locator(".daily-note-block").first().locator(".daily-note-mentions");
        await expect(mentions.locator(".daily-note-mention").first()).toBeVisible();
        await mentions.evaluate((footer) => footer.scrollIntoView({ block: "center" }));
        await capture(page, "mentions", testInfo);
    });

    test("collapsed sections", async ({ obsidian }, testInfo) => {
        const { page } = obsidian;
        const container = await openStream(page);
        // Every section of the first two notes folded, linked mentions too: the chevrons show, and more dates fit.
        for (const index of [0, 1]) {
            const block = container.locator(".daily-note-block").nth(index);
            const mentions = block.locator(".daily-note-mentions");
            const headings = block.locator(".daily-note-content h2");
            for (const heading of await headings.all()) {
                await heading.locator(".collapse-indicator").click();
                await expect(heading).toHaveClass(/is-collapsed/);
            }
            await mentions.locator(".daily-note-mentions-heading .collapse-indicator").click();
            await expect(mentions).toHaveClass(/is-collapsed/);
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
