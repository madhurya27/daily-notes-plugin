import {
    test,
    expect,
    openStream,
    emulatePhoneCpu,
    restoreNote,
    seededDate,
    todayNote,
    writeNote,
    SEEDED_DAYS,
} from "./obsidian";

/**
 * What opening a long note costs, and a save while it is on screen, as typing
 * beside the stream autosaves (ADR 0019). Times hold only on a fast machine,
 * so it runs under `pnpm run test:memory`.
 */

/** A long journal: headings, prose, lists, tasks, code and a table, repeated. */
function longNote(lines: number): string {
    const chunk = [
        "## Entry",
        "",
        "Woke early, walked to the [[Notes|river]] and back. The light was flat and grey, the kind that makes everything look closer than it is.",
        "",
        "- coffee with **Sam**, talked about the move",
        "- read two chapters of _The Rings of Saturn_",
        "    - the bit about the herring",
        "- [ ] call the landlord",
        "- [x] pay the gas bill",
        "",
        "```js",
        "const total = items.reduce((sum, item) => sum + item.price, 0);",
        "```",
        "",
        "| Meal | What |",
        "| --- | --- |",
        "| Lunch | soup |",
        "",
        "> Some days are just for getting through. #mood/tired",
        "",
    ];
    return Array.from({ length: Math.ceil(lines / chunk.length) }, () => chunk)
        .flat()
        .slice(0, lines)
        .join("\n");
}

/** A timer meant to fire this often; how late it comes shows what a render holds up. */
const TICK_MS = 20;

/** Long tasks, render times, and the longest a timer waited, collected in the page. */
async function instrument(page: import("@playwright/test").Page) {
    await page.evaluate((tickMs) => {
        const w = window as unknown as {
            longTasks: number[];
            renders: number[];
            timerWait: number;
            probe?: PerformanceObserver;
            ticker?: number;
        };
        w.longTasks = [];
        w.renders = [];
        w.timerWait = 0;
        window.clearInterval(w.ticker);
        let last = performance.now();
        w.ticker = window.setInterval(() => {
            const now = performance.now();
            w.timerWait = Math.max(w.timerWait, now - last - tickMs);
            last = now;
        }, tickMs);
        w.probe?.disconnect();
        w.probe = new PerformanceObserver((list) => list.getEntries().forEach((e) => w.longTasks.push(e.duration)));
        w.probe.observe({ type: "longtask" });
        const view = window.app.workspace.getLeavesOfType("daily-notes-stream-view")[0].view;
        const proto = Object.getPrototypeOf(view.renderer);
        const render = (proto.realRenderInto ??= proto.renderInto);
        proto.renderInto = async function (...args: unknown[]) {
            const start = performance.now();
            const result = await render.apply(this, args);
            w.renders.push(performance.now() - start);
            return result;
        };
    }, TICK_MS);
}

async function collect(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
        const w = window as unknown as { longTasks: number[]; renders: number[]; timerWait: number };
        const out = { longTasks: [...w.longTasks], renders: [...w.renders], timerWait: w.timerWait };
        w.longTasks.length = 0;
        w.renders.length = 0;
        w.timerWait = 0;
        return out;
    });
}

const fmt = (ms: number[]) =>
    `${ms.length} [${ms.map((m) => m.toFixed(0)).join(", ")}] max ${Math.max(0, ...ms).toFixed(0)} ms`;

/** About twice the longest measured on an M5 (ADR 0019); none at all on desktop. */
const LONGEST_SAVE_TASK_MS = { desktop: 100, mobile: 300 };

/**
 * A note drawn a run of sections at a time leaves no render-long freeze on
 * opening, and timers run between its slices (ADR 0020): about twice the
 * longest measured on an M5.
 */
const LONGEST_OPEN_TASK_MS = { desktop: 300, mobile: 600 };
const LONGEST_TIMER_WAIT_MS = { desktop: 300, mobile: 1000 };

// A trace snapshots the DOM after each action: long tasks of its own.
test.use({ trace: "off" });

/**
 * Waits in the page until `path` is drawn. Not `expect`: each of its polls
 * walks the whole page, and would land between a long note's slices.
 */
function drawn(page: import("@playwright/test").Page, path: string) {
    return page.evaluate(
        (path) =>
            new Promise<void>((resolve) => {
                const isDrawn = () =>
                    document.querySelector(
                        `.daily-note-block[data-source-path="${path}"]:not(.is-unloaded) .daily-note-content`
                    );
                if (isDrawn()) return resolve();
                const observer = new MutationObserver(() => {
                    if (!isDrawn()) return;
                    observer.disconnect();
                    resolve();
                });
                observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
            }),
        path
    );
}

/** Opens a fresh stream, at phone speed on mobile, and waits until `path` is drawn. */
async function openAt(page: import("@playwright/test").Page, path: string, mobileLayout: boolean) {
    await openStream(page);
    await instrument(page);
    const restoreCpu = mobileLayout ? await emulatePhoneCpu(page) : async () => {};
    await openStream(page);
    await drawn(page, path);
    await page.waitForTimeout(1500);
    return restoreCpu;
}

test.describe("a save of a note open in the stream", () => {
    test.skip(SEEDED_DAYS < 3 * 365, "run via pnpm run test:memory");
    test.setTimeout(300_000);

    for (const lines of [200, 2000, 10000]) {
        test(`costs today's ${lines}-line note only what each save changed`, async ({ obsidian, mobileLayout }) => {
            const { page } = obsidian;
            const TODAY = await todayNote(page);
            const original = await writeNote(page, TODAY, longNote(lines));
            await page.waitForTimeout(2000);

            /** As typing autosaves: a word changed, two seconds apart. */
            const save = async () => {
                await page.evaluate(
                    (path) =>
                        window.app.vault.process(window.app.vault.getAbstractFileByPath(path), (text: string) =>
                            text.replace("Woke early", `Woke early (${Date.now()})`)
                        ),
                    TODAY
                );
                await page.waitForTimeout(2000);
            };

            try {
                const restoreCpu = await openAt(page, TODAY, mobileLayout);
                try {
                    const open = await collect(page);
                    for (let i = 0; i < 10; i++) await save();
                    const saves = await collect(page);

                    // eslint-disable-next-line no-console -- the numbers this test exists to report
                    console.log(
                        [
                            `[${lines} lines, ${mobileLayout ? "mobile 4x" : "desktop"}]`,
                            `  open        renders ${fmt(open.renders)} | long tasks ${fmt(open.longTasks)} | a timer waited ${open.timerWait.toFixed(0)} ms`,
                            `  ten saves   renders ${fmt(saves.renders)} | long tasks ${fmt(saves.longTasks)}`,
                        ].join("\n")
                    );

                    const layout = mobileLayout ? "mobile" : "desktop";
                    // Today's renders by section from the first, and no save renders it again (ADR 0019).
                    expect(saves.renders).toHaveLength(0);
                    // The count holds on any machine; the times only on one as fast as an M5.
                    expect(Math.max(0, ...saves.longTasks)).toBeLessThan(LONGEST_SAVE_TASK_MS[layout]);
                    expect(Math.max(0, ...open.longTasks)).toBeLessThan(LONGEST_OPEN_TASK_MS[layout]);
                    expect(open.timerWait).toBeLessThan(LONGEST_TIMER_WAIT_MS[layout]);
                } finally {
                    await restoreCpu();
                }
            } finally {
                await restoreNote(page, TODAY, original);
            }
        });
    }
});

test.describe("opening a long note", () => {
    test.skip(SEEDED_DAYS < 3 * 365, "run via pnpm run test:memory");
    test.setTimeout(300_000);

    test("an older 10000-line note freezes nothing", async ({ obsidian, mobileLayout }) => {
        const { page } = obsidian;
        const NEWEST = `Notes/${seededDate(0)}.md`;
        const original = await writeNote(page, NEWEST, longNote(10000));
        await page.waitForTimeout(2000);
        try {
            const restoreCpu = await openAt(page, NEWEST, mobileLayout);
            try {
                const open = await collect(page);
                // eslint-disable-next-line no-console -- the numbers this test exists to report
                console.log(
                    `[older 10000 lines, ${mobileLayout ? "mobile 4x" : "desktop"}]\n` +
                        `  open        renders ${fmt(open.renders)} | long tasks ${fmt(open.longTasks)} | a timer waited ${open.timerWait.toFixed(0)} ms`
                );
                expect(Math.max(0, ...open.longTasks)).toBeLessThan(
                    LONGEST_OPEN_TASK_MS[mobileLayout ? "mobile" : "desktop"]
                );
                expect(open.timerWait).toBeLessThan(LONGEST_TIMER_WAIT_MS[mobileLayout ? "mobile" : "desktop"]);
            } finally {
                await restoreCpu();
            }
        } finally {
            await restoreNote(page, NEWEST, original);
        }
    });
});
