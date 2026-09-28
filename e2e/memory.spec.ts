import { test, expect, openStream, emulatePhoneCpu, seededDate, SEEDED_DAYS } from "./obsidian";

/**
 * The ceiling ADR 0006 exists to remove: a vault of several years, scrolled to
 * its end. Only meaningful against a vault that size, so it runs on its own —
 * `pnpm run test:memory` — rather than in the ordinary e2e sweep.
 */
const YEARS = 3;

test.describe("a multi-year vault scrolled to the end", () => {
    test.skip(SEEDED_DAYS < YEARS * 365, "run via pnpm run test:memory");
    test.skip(({ mobileLayout }) => mobileLayout, "measured on desktop only");
    test.setTimeout(900_000);

    test("holds a bounded number of rendered notes, not the whole vault", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const blocks = container.locator(".daily-note-block");
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Performance.enable");

        /** JS heap and DOM nodes, as Chromium counts them, after a collection: what is kept, not what awaits one. */
        const sample = async () => {
            await cdp.send("HeapProfiler.collectGarbage");
            const { metrics } = await cdp.send("Performance.getMetrics");
            const by = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
            return { heapMb: by("JSHeapUsedSize") / 1e6, nodes: by("Nodes") };
        };

        const scroller = container.locator("xpath=..");
        const scrollToEnd = () => scroller.evaluate((el) => void (el.scrollTop = el.scrollHeight));

        await expect(blocks).toHaveCount(10); // BATCH_SIZE
        const first = await sample();

        // Every batch needs the sentinel back in view; the count stops growing
        // when the service runs out of notes.
        let loaded = 0;
        for (let batch = 0; loaded < SEEDED_DAYS && batch < SEEDED_DAYS; batch++) {
            await scrollToEnd();
            await expect(blocks).not.toHaveCount(loaded);
            loaded = await blocks.count();
        }

        expect(loaded).toBe(SEEDED_DAYS);

        // Settle: the last scroll leaves renders and unloads in flight.
        await page.waitForTimeout(2000);
        const end = await sample();
        const renderedAtEnd = await container.locator(".daily-note-block:not(.is-unloaded)").count();
        // Chromium's Nodes metric counts detached nodes until they are
        // collected, so the live tree is what says whether the DOM is bounded.
        const liveNodes = await container.evaluate((el) => el.querySelectorAll("*").length);
        // Says whether ESTIMATED_NOTE_HEIGHT_PX is anywhere near a real note.
        const placeholderPx = await container.evaluate((el) =>
            Array.from(el.querySelectorAll<HTMLElement>(".daily-note-block:not(.is-unloaded)"), (b) =>
                Math.round(b.getBoundingClientRect().height)
            )
        );

        // eslint-disable-next-line no-console -- the number this test exists to report
        console.log(
            `[memory] ${SEEDED_DAYS} notes | rendered ${renderedAtEnd} | ` +
                `heap ${first.heapMb.toFixed(1)} → ${end.heapMb.toFixed(1)} MB | ` +
                `nodes ${first.nodes} → ${end.nodes} (${liveNodes} live in the stream) | ` +
                `rendered heights ${placeholderPx.join(", ")}`
        );

        // The whole point: what is rendered follows the viewport, not the vault.
        expect(renderedAtEnd).toBeLessThan(40);
        // One element per unloaded note. A rendered note's weight is the
        // renderer's business, so the bound is on emptiness, not a node count.
        const unloadedChildren = await container.evaluate(
            (el) => el.querySelectorAll(".daily-note-block.is-unloaded *").length
        );
        expect(unloadedChildren).toBe(0);
        // Reaching the end of a three-year vault must not cost more heap than
        // the first ten notes did.
        expect(end.heapMb).toBeLessThan(first.heapMb * 2);
    });

    // The flick a reader actually does: straight to the end in one throw, fast
    // enough that blocks cross both margins between frames.
    test("leaves nothing rendered behind after a flick to the end", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const scroller = container.locator("xpath=..");

        let loaded = 0;
        for (let batch = 0; loaded < SEEDED_DAYS && batch < SEEDED_DAYS; batch++) {
            await scroller.evaluate((el) => void (el.scrollTop = el.scrollHeight));
            await expect(container.locator(".daily-note-block")).not.toHaveCount(loaded);
            loaded = await container.locator(".daily-note-block").count();
        }

        // Back to the top and down again in single jumps, with no settling.
        for (const position of [0, 1, 0, 1]) {
            await scroller.evaluate((el, at) => void (el.scrollTop = at * el.scrollHeight), position);
        }
        await page.waitForTimeout(3000);

        const rendered = await container.locator(".daily-note-block:not(.is-unloaded)").count();
        // eslint-disable-next-line no-console -- the number this test exists to report
        console.log(`[memory] after four flicks across ${SEEDED_DAYS} notes: ${rendered} rendered`);
        expect(rendered).toBeLessThan(40);
    });

    test("comes back to life at the top after the round trip", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const scroller = container.locator("xpath=..");

        await scroller.evaluate((el) => void (el.scrollTop = el.scrollHeight));
        await expect(container.locator(".daily-note-block").first()).toHaveClass(/is-unloaded/);

        await scroller.evaluate((el) => void (el.scrollTop = 0));

        const top = container.locator(".daily-note-block").first();
        await expect(top).not.toHaveClass(/is-unloaded/);
        await expect(top.locator(".daily-note-content")).toBeVisible();
    });
});

test.describe("search across a multi-year vault", () => {
    test.skip(SEEDED_DAYS < YEARS * 365, "run via pnpm run test:memory");

    // Every query and every refresh reads every note. Obsidian's cachedRead
    // already keeps each note's text until it changes (docs/decisions.md, 2026-09-28).
    test("searches the whole vault, and again after an edit, from memory after the first", async ({
        obsidian,
        mobileLayout,
    }) => {
        const { page } = obsidian;
        await openStream(page);

        const restoreCpu = mobileLayout ? await emulatePhoneCpu(page) : async () => {};
        const result = await page.evaluate(async (newest) => {
            const { app } = window;
            const search = app.workspace.getLeavesOfType("daily-notes-stream-view")[0].view.search as {
                matches: unknown[];
                search(query: string): Promise<void>;
                refresh(): Promise<void>;
            };
            const timed = async (run: () => Promise<void>) => {
                const start = performance.now();
                await run();
                return { ms: Math.round(performance.now() - start), found: search.matches.length };
            };
            const first = await timed(() => search.search("the"));
            const unmatched = await timed(() => search.search("zzqx"));
            await app.vault.append(app.vault.getAbstractFileByPath(`Notes/${newest}.md`), "\nzzqx");
            const refresh = await timed(() => search.refresh());
            await search.search("");
            return { first, unmatched, refresh };
        }, seededDate(0));
        await restoreCpu();

        // eslint-disable-next-line no-console -- the number this test exists to report
        console.log(
            `[memory] search across ${SEEDED_DAYS} notes: first ${result.first.ms} ms | ` +
                `again ${result.unmatched.ms} ms | refresh after an edit ${result.refresh.ms} ms`
        );

        expect(result.first.found).toBe(SEEDED_DAYS);
        expect(result.unmatched.found).toBe(0);
        expect(result.refresh.found).toBe(1);
        // The first query reads every note cold: 585–707 ms at phone speed. Later ones hit memory.
        expect(result.first.ms).toBeLessThan(1500);
        expect(result.unmatched.ms).toBeLessThan(100);
        expect(result.refresh.ms).toBeLessThan(100);
    });
});

// A session's first open parses every markdown file's name, in one task,
// before any note draws (docs/decisions.md, 2026-09-28).
test.describe("opening a multi-year vault", () => {
    test.skip(SEEDED_DAYS < YEARS * 365, "run via pnpm run test:memory");
    test.setTimeout(300_000);

    /** Notes that are not daily notes, as a real vault holds beside its journal. */
    const OTHER_NOTES = 3000;

    test("parses every file's date, and draws the first note, quickly", async ({ obsidian, mobileLayout }) => {
        const { page } = obsidian;
        await page.evaluate(async (count) => {
            const { vault } = window.app;
            if (!vault.getAbstractFileByPath("Other")) await vault.createFolder("Other");
            for (let i = 0; i < count; i++) {
                const path = `Other/Note ${i}.md`;
                if (!vault.getAbstractFileByPath(path)) await vault.create(path, `Note ${i}`);
            }
        }, OTHER_NOTES);
        await openStream(page);

        const restoreCpu = mobileLayout ? await emulatePhoneCpu(page) : async () => {};
        // A fresh service and date cache: what the plugin's first open does.
        const parse = await page.evaluate(async () => {
            const { app } = window;
            const service = app.workspace.getLeavesOfType("daily-notes-stream-view")[0].view.service;
            const Service = service.constructor;
            const Dates = service.parsedDates.constructor;
            const time = async () => {
                const fresh = new Service(() => app.vault.getMarkdownFiles(), new Dates());
                const start = performance.now();
                await fresh.initialize();
                return { ms: Math.round(performance.now() - start), notes: fresh.length as number };
            };
            const options = app.internalPlugins.getPluginById("daily-notes").instance.options;
            const folder = options.folder;
            const inFolder = await time();
            // Unset, every file's name goes through the date parse.
            options.folder = "";
            try {
                return { inFolder, noFolder: await time(), files: app.vault.getMarkdownFiles().length as number };
            } finally {
                options.folder = folder;
            }
        });

        // Open to the first note's content, in the page: openStream's own waits would dwarf it.
        await page.evaluate(() => window.app.workspace.detachLeavesOfType("daily-notes-stream-view"));
        await page.waitForTimeout(1000);
        // Every note unread, as on a session's first open; each seeded note is small enough to read (ADR 0011).
        await page.evaluate(() => {
            const notes = window.app.plugins.plugins["daily-notes-stream"].emptyNotes;
            notes.template = null;
            notes.reads = 0;
            const { read } = notes.reader;
            notes.reader.read = (file: unknown) => (notes.reads++, read(file));
        });
        const open = await page.evaluate(async () => {
            const start = performance.now();
            await window.app.commands.executeCommandById("daily-notes-stream:open-stream");
            while (!document.querySelector(".daily-notes-stream-container .daily-note-content"))
                await new Promise((resolve) => setTimeout(resolve, 5));
            const ms = Math.round(performance.now() - start);
            return { ms, reads: window.app.plugins.plugins["daily-notes-stream"].emptyNotes.reads as number };
        });
        // A later session: what this one saved, restored into a fresh index.
        const later = await page.evaluate(async () => {
            const { app } = window;
            const notes = app.plugins.plugins["daily-notes-stream"].emptyNotes;
            notes.flush();
            const fresh = new notes.constructor(notes.reader, notes.store);
            const daily = app.vault
                .getMarkdownFiles()
                .filter((file: { path: string }) => file.path.startsWith("Notes/"));
            notes.reads = 0;
            const start = performance.now();
            await fresh.checkAll(daily);
            return { ms: Math.round(performance.now() - start), reads: notes.reads as number };
        });
        await restoreCpu();

        // eslint-disable-next-line no-console -- the numbers this test exists to report
        console.log(
            `[memory] ${mobileLayout ? "phone speed" : "laptop"}: first open over ${parse.files} files: parse ${parse.inFolder.ms} ms ` +
                `(${parse.inFolder.notes} daily notes), folder unset ${parse.noFolder.ms} ms | ` +
                `open to first note ${open.ms} ms, reading ${open.reads} notes for emptiness | ` +
                `a later session's check ${later.ms} ms, reading ${later.reads}`
        );

        expect(parse.inFolder.notes).toBe(SEEDED_DAYS);
        // About 3x phone speed's worst (docs/decisions.md, 2026-09-28).
        expect(parse.noFolder.ms).toBeLessThan(100);
        expect(open.reads).toBe(SEEDED_DAYS);
        expect(open.ms).toBeLessThan(300);
        // Every note is unchanged since the saved check, and this vault sets no template.
        expect(later.reads).toBe(0);
    });
});

// Obsidian resolves every file's links at launch, one `resolve` each: a stream
// already open compares each file's links, then re-checks what changed once.
test.describe("links resolved across a multi-year vault", () => {
    test.skip(SEEDED_DAYS < YEARS * 365, "run via pnpm run test:memory");
    test.setTimeout(300_000);

    /** Notes linking to a daily note each, as meeting notes and projects do. */
    const LINKING_NOTES = 1000;

    test("follows a launch's worth of resolves, and re-checks the linked days, quickly", async ({
        obsidian,
        mobileLayout,
    }) => {
        const { page } = obsidian;
        await page.evaluate(
            async ({ count, dates }) => {
                const { vault } = window.app;
                if (!vault.getAbstractFileByPath("Linking")) await vault.createFolder("Linking");
                for (let i = 0; i < count; i++) {
                    const path = `Linking/Meeting ${i}.md`;
                    if (!vault.getAbstractFileByPath(path)) await vault.create(path, `On [[${dates[i]}]].`);
                }
            },
            { count: LINKING_NOTES, dates: Array.from({ length: LINKING_NOTES }, (_, i) => seededDate(i)) }
        );
        await expect
            .poll(() =>
                page.evaluate(
                    (count) =>
                        Object.keys(window.app.metadataCache.resolvedLinks).filter((path) =>
                            path.startsWith("Linking/")
                        ).length,
                    LINKING_NOTES
                )
            )
            .toBe(LINKING_NOTES);
        await openStream(page);

        const restoreCpu = mobileLayout ? await emulatePhoneCpu(page) : async () => {};
        // A fresh tracker, as at launch: every file's links are new to it.
        const result = await page.evaluate(async () => {
            const { app } = window;
            const plugin = app.plugins.plugins["daily-notes-stream"];
            const view = app.workspace.getLeavesOfType("daily-notes-stream-view")[0].view;
            const current = plugin.linkChanges;
            const fresh = new current.constructor(current.links, current.folder);
            let rechecked = 0;
            fresh.subscribe((paths: string[]) => {
                rechecked = paths.length;
                void view.stream.onLinksChanged(paths.map((path) => app.vault.getFileByPath(path)).filter(Boolean));
            });
            const files = app.vault.getMarkdownFiles();
            const start = performance.now();
            for (const file of files) fresh.onResolve(file.path);
            const resolves = Math.round(performance.now() - start);
            fresh.onResolved();
            await view.stream.queue;
            return { files: files.length as number, resolves, total: Math.round(performance.now() - start), rechecked };
        });
        await restoreCpu();

        // eslint-disable-next-line no-console -- the numbers this test exists to report
        console.log(
            `[memory] ${mobileLayout ? "phone speed" : "laptop"}: ${result.files} resolves ${result.resolves} ms | ` +
                `with ${result.rechecked} linked days re-checked ${result.total} ms`
        );

        expect(result.rechecked).toBe(LINKING_NOTES);
        expect(result.total).toBeLessThan(300);
    });
});
