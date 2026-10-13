import type { CDPSession, Page } from "@playwright/test";
import { statSync } from "fs";
import { join } from "path";
import { test, expect, SEEDED_DAYS } from "./obsidian";
import { installPinned, DAILY_NOTES_EDITOR } from "./pinned-plugin";

/**
 * The same five-year vault, opened and scrolled to its end by this plugin and
 * by Daily Notes Editor: the numbers behind the README's comparison. Reports,
 * and asserts only that both reached the end.
 */
const YEARS = 5;
const DAYS_IN_YEAR = 365;

/** What differs between the two: the command opening the view, and where its notes are. */
interface Subject {
    name: string;
    command: string;
    /** The first note's content, drawn: the view is open. */
    content: string;
    scroller: string;
    block: string;
    /** A note whose content is drawn now, not a placeholder. */
    rendered: string;
}

const STREAM: Subject = {
    name: "Daily notes stream",
    command: "daily-notes-stream:open-stream",
    content: ".daily-note-block .daily-note-content",
    scroller: ".workspace-leaf-content[data-type='daily-notes-stream-view'] > .view-content",
    block: ".daily-note-block",
    rendered: ".daily-note-block:not(.is-unloaded)",
};

const EDITOR: Subject = {
    name: "Daily Notes Editor",
    command: "daily-notes-editor:open-daily-note-editor",
    content: ".daily-note-wrapper .cm-content",
    scroller: ".workspace-leaf-content[data-type='daily-note-editor-view'] > .view-content",
    block: ".daily-note-wrapper",
    rendered: ".daily-note-wrapper:has(.cm-editor)",
};

/** Main-thread busy time and JS heap, after a collection. */
async function sample(cdp: CDPSession) {
    await cdp.send("HeapProfiler.collectGarbage");
    const { metrics } = await cdp.send("Performance.getMetrics");
    const by = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
    return { busyMs: by("TaskDuration") * 1000, heapMb: by("JSHeapUsedSize") / 1e6 };
}

async function measure(page: Page, subject: Subject) {
    await page.evaluate(() => {
        window.app.workspace.detachLeavesOfType("daily-notes-stream-view");
        window.app.workspace.detachLeavesOfType("daily-note-editor-view");
    });
    await page.waitForTimeout(1000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const before = await sample(cdp);

    let start = Date.now();
    await page.evaluate((id) => window.app.commands.executeCommandById(id), subject.command);
    await expect(page.locator(subject.content).first()).toBeVisible();
    const openMs = Date.now() - start;

    // Five seconds untouched at the top: what the open view costs at rest.
    await page.waitForTimeout(2000);
    const idleFrom = await sample(cdp);
    await page.waitForTimeout(5000);
    const idleMs = (await sample(cdp)).busyMs - idleFrom.busyMs;

    const scroller = page.locator(subject.scroller);
    const blocks = page.locator(subject.block);
    const scrollFrom = await sample(cdp);
    start = Date.now();
    let loaded = await blocks.count();
    /** Heap added by the time each whole year has loaded, collected first. */
    const heapByYear: number[] = [];
    // Scrolled to the end until more load, as a reader keeps scrolling: a
    // note growing as it draws can push the loader back off screen.
    while (loaded < SEEDED_DAYS) {
        const previous = loaded;
        await expect
            .poll(
                async () => {
                    await scroller.evaluate((el) => void (el.scrollTop = el.scrollHeight));
                    return blocks.count();
                },
                { timeout: 60_000, intervals: [100] }
            )
            .toBeGreaterThan(previous);
        loaded = await blocks.count();
        if (loaded >= (heapByYear.length + 1) * DAYS_IN_YEAR) {
            heapByYear.push(+((await sample(cdp)).heapMb - before.heapMb).toFixed(1));
        }
    }
    const scrollMs = Date.now() - start;
    await page.waitForTimeout(3000);
    const end = await sample(cdp);

    const result = {
        plugin: subject.name,
        loaded,
        "open (ms)": openMs,
        "idle CPU per 5 s (ms)": Math.round(idleMs),
        "scroll to the end (s)": +(scrollMs / 1000).toFixed(1),
        "main thread busy scrolling (s)": +((end.busyMs - scrollFrom.busyMs) / 1000).toFixed(1),
        "rendered at the end": await page.locator(subject.rendered).count(),
        "live DOM nodes": await page.locator(subject.scroller).evaluate((el) => el.querySelectorAll("*").length),
        "heap added (MB)": +(end.heapMb - before.heapMb).toFixed(1),
        "heap added by year (MB)": heapByYear.join(", "),
    };
    await cdp.detach();
    return result;
}

test.describe("against Daily Notes Editor", () => {
    test.skip(SEEDED_DAYS < YEARS * 365, "run via pnpm run test:compare");
    test.skip(({ mobileLayout }) => mobileLayout, "measured on desktop only");
    test.setTimeout(1_800_000);

    test("opens and scrolls a five-year vault to its end", async ({ obsidian }) => {
        const { page } = obsidian;
        const stream = await measure(page, STREAM);
        const uninstall = await installPinned(page, DAILY_NOTES_EDITOR);
        try {
            const editor = await measure(page, EDITOR);
            const bundleKb = (dir: string) => Math.round(statSync(join(dir, "main.js")).size / 1000);
            // eslint-disable-next-line no-console -- the numbers this test exists to report
            console.log(
                JSON.stringify(
                    [
                        { ...stream, "main.js (KB)": bundleKb(".") },
                        {
                            ...editor,
                            "main.js (KB)": bundleKb(
                                `.dev/e2e-plugins/${DAILY_NOTES_EDITOR.id}-${DAILY_NOTES_EDITOR.version}`
                            ),
                        },
                    ],
                    null,
                    2
                )
            );
            expect(stream.loaded).toBe(SEEDED_DAYS);
            expect(editor.loaded).toBe(SEEDED_DAYS);
        } finally {
            await uninstall();
        }
    });
});
