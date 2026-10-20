import type { Locator, Page, TestInfo } from "@playwright/test";
import { test, expect, openStream } from "./obsidian";
import { tmpdir } from "os";
import { join } from "path";
import { OUT, prepareDemo, showLightTheme } from "./demo";
import { windowStill } from "../scripts/window-still.mjs";

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

/** One whole note, then the next one's date: notes stacked into a stream. */
function streamFrame(page: Page): Frame {
    return {
        from: note(page, "Notes/2026-09-23.md").locator(".daily-note-header"),
        to: note(page, "Notes/2026-09-22.md").locator(".daily-note-header"),
    };
}

/** Waits for the stream to stop scrolling: a search step glides to its match. */
async function settled(page: Page): Promise<void> {
    const pane = page.locator(".workspace-leaf.mod-active .daily-notes-stream-container").locator("..");
    let last = NaN;
    for (let top = await pane.evaluate((el) => el.scrollTop); top !== last;) {
        last = top;
        await page.waitForTimeout(200);
        top = await pane.evaluate((el) => el.scrollTop);
    }
}

/** One note, by path. */
const note = (page: Page, path: string) => page.locator(`[data-source-path="${path}"]`);

/** A desktop still runs from `from`, at its top, to the end of `to` (D-126). */
type Frame = { from: Locator; to: Locator };

/** One still per layout; on desktop, `frame` sets what it shows, else the top of the column does. */
async function capture(page: Page, name: string, testInfo: TestInfo, frame?: Frame): Promise<void> {
    const layout = testInfo.project.name === "mobile" ? "phone" : "desktop";
    const path = join(OUT, `${name}-${layout}.png`);
    if (frame && layout === "desktop") await toTop(page, frame.from);
    await page.waitForTimeout(1000);
    if (layout === "phone") return void (await page.screenshot({ path }));

    const column = await noteColumn(page);
    if (frame) await fits(column, frame.to);
    const pane = await page.locator(".workspace-split.mod-root").boundingBox();
    if (!pane) throw new Error("the stream's pane is not on screen");
    // The pane, its tab bar and header included, down to the column's end.
    const clip = { x: Math.round(pane.x), y: Math.round(pane.y), width: Math.round(pane.width), height: HEIGHT };
    // Unframed is the jump prompt, over the dimmed page: painting it over would show as a band.
    const cover = await paintBelow(page, clip, frame ? await lastWholeLine(page, column) : clip.y + clip.height);
    const raw = join(tmpdir(), `${name}-${layout}.png`);
    try {
        await page.screenshot({ path: raw, clip });
    } finally {
        await cover.evaluate((el) => el.remove());
    }
    await windowStill(raw, path, clip);
}

/** The space above a still's first line and below its last, and every desktop still's height, its tab bar included: the longest frame's (D-126). */
const MARGIN = 32;
const HEIGHT = 960;
/** The listing's window width, and exactly a still's height: Obsidian places a prompt by the window's height. */
const WINDOW = { width: 904, height: HEIGHT };

type Box = { x: number; y: number; width: number; height: number };

/** The page's background over `box` below `bottom`, so a still ends on a whole line (D-126). */
async function paintBelow(page: Page, box: Box, bottom: number) {
    return page.evaluateHandle(
        ({ box: { x, y, width, height }, bottom }) => {
            const cover = document.body.appendChild(document.createElement("div"));
            Object.assign(cover.style, {
                position: "fixed",
                left: `${x}px`,
                top: `${bottom}px`,
                width: `${width}px`,
                height: `${Math.max(0, y + height - bottom)}px`,
                background: "var(--background-primary)",
                pointerEvents: "none",
                zIndex: "100000",
            });
            return cover;
        },
        { box, bottom }
    );
}

/**
 * Scrolls `element` to a margin under the view's header, or under the search bar while it is open. With the
 * wheel, as a reader would: a search step holds its match in place against a scroll set from script.
 */
async function toTop(page: Page, element: Locator): Promise<void> {
    const leaf = page.locator(".workspace-leaf.mod-active");
    const above = (await leaf.locator(".daily-notes-search").isVisible())
        ? await leaf.locator(".daily-notes-search").boundingBox()
        : await leaf.locator(".view-header").boundingBox();
    const column = await leaf.locator(".daily-notes-stream-container").boundingBox();
    if (!above || !column) throw new Error("the stream is not on screen");
    const top = above.y + above.height + MARGIN;
    await page.mouse.move(column.x + column.width / 2, top + 100);
    await expect(async () => {
        const off = (await element.boundingBox())!.y - top;
        if (Math.abs(off) >= 1) await page.mouse.wheel(0, off);
        await settled(page);
        expect(Math.abs((await element.boundingBox())!.y - top)).toBeLessThan(1);
    }).toPass();
    // Off the note: a hovered property draws an outline.
    await page.mouse.move(column.x + column.width + MARGIN / 2, top);
}

/** Fails unless `end`, and a margin under it, fit `column`: a frame that needs more raises HEIGHT. */
async function fits(column: Box, end: Locator): Promise<void> {
    const box = await end.boundingBox();
    if (!box) throw new Error("the still's end is not on screen");
    expect(box.y + box.height + MARGIN, "the frame's end, within the still").toBeLessThanOrEqual(
        column.y + column.height
    );
}

/** A margin under the last line `box` shows whole, or the next line's top if that comes sooner. */
async function lastWholeLine(page: Page, box: Box): Promise<number> {
    return page.evaluate(
        ({ box, margin }) => {
            const lines: DOMRect[] = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (!node.textContent?.trim() || node.parentElement?.closest(".view-header")) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                lines.push(...range.getClientRects());
            }
            for (const el of document.querySelectorAll(":is(.view-content, .prompt) :is(img, svg, input, hr)"))
                lines.push(el.getBoundingClientRect());
            const shown = lines.filter(
                (r) => r.height > 0 && r.right > box.x && r.left < box.x + box.width && r.bottom > box.y
            );
            const kept = shown.filter((r) => r.bottom <= box.y + box.height - margin);
            const last = Math.max(...kept.map((r) => r.bottom));
            const next = Math.min(...shown.filter((r) => r.top >= last).map((r) => r.top));
            return Math.min(last + margin, next);
        },
        { box, margin: MARGIN }
    );
}

/** The note column, from under the view's header so an open search bar shows, to the still's end (D-126). */
async function noteColumn(page: Page): Promise<Box> {
    const leaf = page.locator(".workspace-leaf.mod-active");
    const pane = await page.locator(".workspace-split.mod-root").boundingBox();
    const header = await leaf.locator(".view-header").boundingBox();
    const column = await leaf.locator(".daily-notes-stream-container").boundingBox();
    if (!pane || !header || !column) throw new Error("the stream is not on screen");
    const y = header.y + header.height;
    return { x: column.x - MARGIN, y, width: column.width + 2 * MARGIN, height: Math.round(pane.y) + HEIGHT - y };
}

test.describe("README screenshots", () => {
    test.skip(process.env.CAPTURE_SCREENSHOTS !== "1", "set CAPTURE_SCREENSHOTS=1 to capture");
    test.describe.configure({ mode: "serial" });

    test.beforeAll(async ({ obsidian }) => {
        await prepareDemo(obsidian.page);
    });

    // On desktop, a window a still's size at a Retina screen's scale, without the status bar, which would sit
    // over the notes; the phone's stays its screen.
    test.beforeEach(async ({ obsidian, mobileLayout }) => {
        if (mobileLayout) return;
        const { page } = obsidian;
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setDeviceMetricsOverride", { ...WINDOW, deviceScaleFactor: 2, mobile: false });
        await page.addStyleTag({ content: ".status-bar { display: none; }" });
    });

    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.keyboard.press("Escape");
    });

    test("the stream", async ({ obsidian }, testInfo) => {
        await showStream(obsidian.page);
        await capture(obsidian.page, "stream", testInfo, streamFrame(obsidian.page));
    });

    test("the stream in dark mode", async ({ obsidian }, testInfo) => {
        const { page } = obsidian;
        await page.emulateMedia({ colorScheme: "dark" });
        try {
            await expect(page.locator("body")).toHaveClass(/theme-dark/);
            await showStream(page);
            await capture(page, "stream-dark", testInfo, streamFrame(page));
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
        // Typing makes the first match current; two steps on is one in a note the other stills don't show.
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
        await expect(bar.locator(".document-search-count")).toHaveText(/^3 \/ \d+$/);
        await settled(page);
        // From the match's date down to the list it is in.
        await page.evaluate(() => {
            const [match] = CSS.highlights.get("daily-notes-search-current")!;
            const node = (match as Range).startContainer;
            const line = node instanceof Element ? node : node.parentElement!;
            line.closest("ul, ol, p")!.setAttribute("data-still-end", "");
            line.closest(".daily-note-block")!.setAttribute("data-still-start", "");
        });
        const from = page.locator("[data-still-start] .daily-note-header");
        await capture(page, "search", testInfo, { from, to: page.locator("[data-still-end]") });
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
        const from = container.locator(".daily-note-header").first();
        await capture(page, "mentions", testInfo, { from, to: mentions });
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
        const blocks = container.locator(".daily-note-block");
        const from = blocks.first().locator(".daily-note-header");
        await capture(page, "collapse", testInfo, { from, to: blocks.nth(1).locator(".daily-note-header") });
    });

    test("a Base in a Sunday review", async ({ obsidian }, testInfo) => {
        test.skip(testInfo.project.name === "desktop", "on desktop a Base looks as it does in Obsidian");
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
