import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Component, MarkdownRenderer, TFile } from "obsidian";
import { Platform } from "../mocks/obsidian";
import { NoteRenderer } from "../../src/render/note-renderer";
import { CollapsibleManager } from "../../src/render/collapsible";
import { CollapsibleStateStore } from "../../src/render/collapse-store";
import { SearchHighlighter } from "../../src/render/search-highlights";
import { FarRuns } from "../../src/render/far-runs";
import { BaseMeasurements } from "../../src/render/bases/base-measurements";
import { NoteBases } from "../../src/render/bases/note-bases";
import { BacklinkIndex } from "../../src/notes/backlink-index";
import { asApp } from "../stream-view-fixture";

/** A day's words, past the twelve characters the fake render keeps. */
const FILLER = " lorem".repeat(3);

/** A note's text and the cache Obsidian would index for it: sections split by blank lines. */
function note(sections: string[], frontmatter = "") {
    const markdown = frontmatter + sections.join("\n\n");
    let offset = frontmatter.length;
    const cached = sections.map((text) => {
        const start = offset;
        offset += text.length + 2;
        return {
            type: text.startsWith("#") ? "heading" : "paragraph",
            position: {
                start: { line: 0, col: 0, offset: start },
                end: { line: 0, col: 0, offset: start + text.length },
            },
        };
    });
    const cache = {
        sections: cached,
        ...(frontmatter
            ? {
                  frontmatterPosition: { end: { offset: frontmatter.length } },
                  frontmatter: Object.fromEntries(
                      [...frontmatter.matchAll(/^(\w+): (.*)$/gm)].map((m): [string, string] => [m[1]!, m[2]!])
                  ),
              }
            : {}),
    };
    return { markdown, cache };
}

const days = (count = 10) => Array.from({ length: count }, (_, i) => `Day ${i}.${FILLER}`);

/** Renders each paragraph as a `p` holding its first twelve characters, each heading at its level. */
function renderParagraphs() {
    return vi
        .spyOn(MarkdownRenderer, "render")
        .mockClear()
        .mockImplementation(async (_app, markdown, el) => {
            for (const block of markdown.split("\n\n")) {
                const heading = /^(##+) (.*)/.exec(block);
                if (heading) el.createEl(`h${heading[1]!.length}` as "h2", { text: heading[2] });
                else el.createEl("p", { text: block.slice(0, 12) });
            }
        });
}

function storage() {
    const saved = new Map<string, unknown>();
    return {
        loadLocalStorage: (key: string) => saved.get(key) ?? null,
        saveLocalStorage: (key: string, value: unknown) => void saved.set(key, value),
    };
}

const file = new TFile("Notes/2025-01-01.md");

describe("NoteRenderer, a note by section", () => {
    let current: ReturnType<typeof note>;
    let app: {
        vault: { cachedRead: () => Promise<string>; getFileByPath: (path: string) => TFile | null };
        metadataCache: { getFileCache: () => unknown; getFirstLinkpathDest: () => null; on: () => object };
    };
    let collapsible: CollapsibleManager;
    let farRuns: FarRuns;
    let highlighter: SearchHighlighter;
    let renderer: NoteRenderer;
    let block: HTMLElement;
    let component: Component;
    let showProperties: boolean;

    const content = () => block.querySelector<HTMLElement>(".daily-note-content")!;
    const texts = () => Array.from(content().children, (el) => el.textContent);

    async function open(sections: string[], frontmatter = "") {
        current = note(sections, frontmatter);
        block = renderer.createBlock(file);
        document.body.append(block);
        ({ component } = (await renderer.renderInto(block, file))!);
    }

    /** As the window manager renders a note saved since it opened: whole again, by section now. */
    async function rerender() {
        renderer.discard(component);
        block.empty();
        ({ component } = (await renderer.renderInto(block, file))!);
    }

    /** Open, then saved once: from then on its saves can update it in part. */
    async function openSaved(sections: string[], frontmatter = "") {
        await open(sections, frontmatter);
        expect(await save(sections, frontmatter)).toBe(false);
        await rerender();
    }

    function save(sections: string[], frontmatter = "") {
        current = note(sections, frontmatter);
        return renderer.update(block, file, component);
    }

    /** Today's note is the one expected to be saved while on screen. */
    const today = (note: TFile) => note.path === file.path;

    function makeRenderer(expectsSaves?: (note: TFile) => boolean) {
        return new NoteRenderer(
            asApp(app),
            new Component(),
            collapsible,
            () => ({
                showProperties,
                propertiesCollapsed: false,
                showLinkedMentions: false,
                linkedMentionsCollapsed: false,
                hideEmptyNotes: false,
            }),
            highlighter,
            new BaseMeasurements(),
            new BacklinkIndex(() => ({})),
            expectsSaves
        );
    }

    /** Every reading of the clock 10 ms on; the thread given back through a timer, run at once. */
    function slowClock(onYield: () => void = () => {}) {
        let now = 0;
        vi.spyOn(performance, "now").mockImplementation(() => (now += 10));
        return vi.spyOn(globalThis, "setTimeout").mockImplementation(((resolve: () => void) => {
            onYield();
            resolve();
            return 0;
        }) as unknown as typeof setTimeout);
    }

    beforeEach(() => {
        showProperties = false;
        app = {
            vault: { cachedRead: () => Promise.resolve(current.markdown), getFileByPath: () => file },
            metadataCache: { getFileCache: () => current.cache, getFirstLinkpathDest: () => null, on: () => ({}) },
        };
        // Every element shown, a line tall: jsdom lays nothing out.
        farRuns = new FarRuns(() => ({ top: 0, bottom: 20, marginTop: 0, marginBottom: 0 }));
        collapsible = new CollapsibleManager(new CollapsibleStateStore(asApp(storage())), farRuns);
        // Chevrons answer through the stream's delegated listener.
        collapsible.delegate(new Component(), document.body);
        highlighter = new SearchHighlighter();
        renderer = makeRenderer();
        renderParagraphs();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        document.body.empty();
        Platform.isMobile = false;
    });

    it("renders a note whole when it opens, by section once saved", async () => {
        const render = renderParagraphs();
        await open(days());
        expect(render).toHaveBeenCalledOnce();

        expect(await save(days())).toBe(false);
        render.mockClear();
        await rerender();
        expect(render).toHaveBeenCalledTimes(10);
    });

    it("renders a note expected to be saved by section from the first, today's", async () => {
        renderer = makeRenderer(today);
        const render = renderParagraphs();
        await open(days());
        expect(render).toHaveBeenCalledTimes(10);

        const changed = days();
        changed[4] = `Day X.${FILLER}`;
        expect(await save(changed)).toBe(true);
    });

    // In slices, a short note fits one anyway: it would only draw later (ADR 0020).
    it("renders a note under 6,000 characters in one call", async () => {
        expect(note(days(200)).markdown.length).toBeLessThan(6000);
        const render = renderParagraphs();
        await open(days(200));
        expect(render).toHaveBeenCalledOnce();
        expect(texts()).toHaveLength(200);
    });

    it("renders a note from 6,000 characters a chunk at a time", async () => {
        expect(note(days(240)).markdown.length).toBeGreaterThanOrEqual(6000);
        const render = renderParagraphs();
        await open(days(240));
        expect(render.mock.calls.length).toBeGreaterThan(1);
    });

    it("renders a long note whole a chunk at a time, every section in order", async () => {
        const render = renderParagraphs();
        await open(days(400));
        expect(render.mock.calls.length).toBeGreaterThan(1);
        expect(render.mock.calls.length).toBeLessThan(400);
        expect(texts()).toEqual(days(400).map((d) => d.slice(0, 12)));
    });

    describe("from its end, as the reader comes up into it", () => {
        async function openFromEnd(sections: string[]) {
            current = note(sections);
            block = renderer.createBlock(file);
            document.body.append(block);
            ({ component } = (await renderer.renderInto(block, file, undefined, "from-end"))!);
        }

        it("draws a long note's last chunk first, every section in order", async () => {
            const render = renderParagraphs();
            await openFromEnd(days(400));
            expect(render.mock.calls[0]![1]).toContain("Day 399.");
            expect(render.mock.calls.at(-1)![1]).toContain("Day 0.");
            expect(texts()).toEqual(days(400).map((d) => d.slice(0, 12)));
        });

        it("draws today's note from its last section too, in order", async () => {
            renderer = makeRenderer(today);
            const render = renderParagraphs();
            await openFromEnd(days(20));
            expect(render.mock.calls[0]![1]).toContain("Day 19.");
            expect(texts()).toEqual(days(20).map((d) => d.slice(0, 12)));
        });

        it("keeps its sections in order, for a save to update in place", async () => {
            renderer = makeRenderer(today);
            await openFromEnd(days(20));
            const changed = days(20);
            changed[4] = `Day X.${FILLER}`;
            expect(await save(changed)).toBe(true);
            expect(texts()[4]).toBe("Day X. lorem");
        });

        it("marks its block while it draws, for the stream to lay it out from its bottom", async () => {
            const marked: boolean[] = [];
            renderParagraphs().mockImplementation(async (_app, markdown, el) => {
                marked.push(block.hasClass("is-drawing-from-end"));
                el.createEl("p", { text: markdown.slice(0, 12) });
            });
            await openFromEnd(days(400));
            expect(marked.length).toBeGreaterThan(1);
            expect(marked.every(Boolean)).toBe(true);
            // The stream lays it out from its top again in the task it lands in.
            expect(block.hasClass("is-drawing-from-end")).toBe(true);
        });

        // Drawn in one call, it has no end to draw first.
        it("leaves a note it renders whole unmarked", async () => {
            await openFromEnd(days(200));
            expect(block.hasClass("is-drawing-from-end")).toBe(false);
        });

        it("keeps its runs in order, for the stream to hide when far", async () => {
            await openFromEnd(days(400));
            const runs = renderer.runsOf(component);
            expect(runs.length).toBeGreaterThan(1);
            expect(runs.flat().map((el) => el.textContent)).toEqual(texts());
        });
    });

    it("gives the thread back between chunks once a slice of time is spent", async () => {
        const yielded = slowClock();
        await open(days(400));
        expect(yielded).toHaveBeenCalled();
        expect(texts()).toHaveLength(400);
    });

    it("gives the thread back between sections of today's note too", async () => {
        renderer = makeRenderer(today);
        const yielded = slowClock();
        await open(days(20));
        expect(yielded).toHaveBeenCalled();
        expect(texts()).toHaveLength(20);
    });

    it("gives up a note no longer wanted at its next slice, leaving its block empty", async () => {
        renderer = makeRenderer(today);
        const render = renderParagraphs();
        slowClock();
        current = note(days(20));
        block = renderer.createBlock(file);
        document.body.append(block);
        let wanted = true;
        render.mockImplementation(async (_app, markdown, el) => {
            el.createEl("p", { text: markdown.slice(0, 12) });
            wanted = false;
        });
        const children = vi.spyOn(Component.prototype, "removeChild");

        expect(await renderer.renderInto(block, file, () => Promise.resolve(wanted))).toBeNull();
        expect(render.mock.calls.length).toBeLessThan(20);
        expect(block.childElementCount).toBe(0);
        expect(children).toHaveBeenCalled();
    });

    // The stream draws a note on screen there, ahead of the rest of this one.
    it("draws on only once what runs between slices is done", async () => {
        renderer = makeRenderer(today);
        const render = renderParagraphs();
        slowClock();
        current = note(days(20));
        block = renderer.createBlock(file);
        document.body.append(block);
        let between = false;
        const drawnMeanwhile: string[] = [];
        render.mockImplementation(async (_app, markdown, el) => {
            el.createEl("p", { text: markdown.slice(0, 12) });
            if (between) drawnMeanwhile.push(markdown.slice(0, 12));
        });
        const goOn = vi.fn(async () => {
            between = true;
            await new Promise<void>((resolve) => queueMicrotask(resolve));
            between = false;
            return true;
        });

        await renderer.renderInto(block, file, goOn);
        expect(goOn).toHaveBeenCalled();
        expect(drawnMeanwhile).toEqual([]);
        expect(texts()).toHaveLength(20);
    });

    it("stops drawing a note taken out of the document meanwhile, as a closed stream", async () => {
        renderer = makeRenderer(today);
        const render = renderParagraphs();
        slowClock(() => block.remove());
        await open(days(20));
        expect(render.mock.calls.length).toBeLessThan(20);
    });

    it("renders each section on its own, flat in the note's content, in order", async () => {
        const render = renderParagraphs();
        await openSaved(["## Morning", ...days(3), "## Evening", ...days(7)]);
        render.mockClear();
        await rerender();
        expect(render).toHaveBeenCalledTimes(12);
        expect(texts()).toEqual([
            "Morning",
            "Day 0. lorem",
            "Day 1. lorem",
            "Day 2. lorem",
            "Evening",
            ...days(7).map((d) => d.slice(0, 12)),
        ]);
    });

    it("updates a short note in place once saved too", async () => {
        await openSaved(["## Morning", "Day 0."]);
        expect(await save(["## Morning", "Day 1."])).toBe(true);
        expect(texts()).toEqual(["Morning", "Day 1."]);
    });

    it("re-renders only the section a save changed, keeping the others' elements", async () => {
        await openSaved(days());
        const kept = Array.from(content().children);
        const render = renderParagraphs();

        const changed = days();
        changed[4] = `Day X.${FILLER}`;
        expect(await save(changed)).toBe(true);

        expect(render).toHaveBeenCalledOnce();
        expect(render.mock.calls[0]![1]).toBe(changed[4]);
        expect(content().children[4]!.textContent).toBe("Day X. lorem");
        const after = Array.from(content().children);
        expect(after.filter((el, i) => i !== 4).every((el, i) => el === kept[i >= 4 ? i + 1 : i])).toBe(true);
        expect(after).toHaveLength(10);
    });

    it("inserts and removes sections where the save put them", async () => {
        await openSaved(days());
        expect(await save([...days().slice(0, 2), "## Noon", ...days().slice(2)])).toBe(true);
        expect(texts()[2]).toBe("Noon");
        expect(await save(days().slice(1))).toBe(true);
        expect(texts()).toEqual(
            days()
                .slice(1)
                .map((d) => d.slice(0, 12))
        );
    });

    it("frees what a replaced section registered", async () => {
        const freed = vi.fn();
        vi.spyOn(MarkdownRenderer, "render").mockImplementation(async (_app, markdown, el, _path, owner) => {
            el.createEl("p", { text: markdown.slice(0, 12) });
            if (markdown.startsWith("Day 4.")) owner.register(freed);
        });
        await openSaved(days());
        const changed = days();
        changed[4] = `Day X.${FILLER}`;
        await save(changed);
        expect(freed).toHaveBeenCalledOnce();
    });

    it("leaves a note it failed to update to a whole render", async () => {
        await openSaved(days());
        vi.spyOn(MarkdownRenderer, "render").mockRejectedValue(new Error("broken plugin"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const changed = days();
        changed[4] = `Day X.${FILLER}`;
        expect(await save(changed)).toBe(false);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to update"), expect.any(Error));
    });

    it("leaves a note deleted mid-update to its removal, reporting nothing", async () => {
        await openSaved(days());
        app.vault.cachedRead = () => Promise.reject(new Error("ENOENT"));
        app.vault.getFileByPath = () => null;
        const error = vi
            .spyOn(console, "error")
            .mockClear()
            .mockImplementation(() => {});
        expect(await save(days())).toBe(false);
        expect(error).not.toHaveBeenCalled();
    });

    it("leaves the DOM alone when no section changed", async () => {
        await openSaved(days());
        const render = renderParagraphs();
        expect(await save(days())).toBe(true);
        expect(render).not.toHaveBeenCalled();
    });

    describe("once the frontmatter changed", () => {
        const properties = () => block.querySelector(".metadata-container");
        const values = () => Array.from(block.querySelectorAll(".metadata-property-value"), (el) => el.textContent);

        beforeEach(() => (showProperties = true));

        it("redraws only the properties, keeping the sections' elements", async () => {
            await openSaved(days(), "---\nmood: ok\n---\n");
            const kept = Array.from(content().children);
            const render = renderParagraphs();

            expect(await save(days(), "---\nmood: low\n---\n")).toBe(true);

            expect(render).not.toHaveBeenCalled();
            expect(values()).toEqual(["low"]);
            expect(block.querySelectorAll(".metadata-container")).toHaveLength(1);
            expect(Array.from(content().children)).toEqual(kept);
        });

        it("draws properties added to a note that had none above its content", async () => {
            await openSaved(days());
            expect(await save(days(), "---\nmood: low\n---\n")).toBe(true);
            expect(values()).toEqual(["low"]);
            expect(properties()!.nextElementSibling).toBe(content());
        });

        it("takes the properties away with the frontmatter", async () => {
            await openSaved(days(), "---\nmood: ok\n---\n");
            expect(await save(days())).toBe(true);
            expect(properties()).toBeNull();
        });

        it("re-renders the sections a save changed with it", async () => {
            await openSaved(days(), "---\nmood: ok\n---\n");
            const changed = days();
            changed[4] = `Day X.${FILLER}`;
            expect(await save(changed, "---\nmood: low\n---\n")).toBe(true);
            expect(texts()[4]).toBe("Day X. lorem");
            expect(values()).toEqual(["low"]);
        });
    });

    it("renders whole once a section depends on another", async () => {
        await openSaved(days());
        const changed = days();
        changed[2] = "A fact.^[Source]";
        expect(await save(changed)).toBe(false);
    });

    it("updates in place when a kept heading's collapse key moved", async () => {
        await openSaved(["## Morning", "## Notes", ...days()]);
        // A "Notes" before the kept one takes the bare key from it.
        expect(await save(["## Notes", "## Notes", ...days()])).toBe(true);
    });

    it("gives a new heading its chevron, and keeps a collapsed section's new content hidden", async () => {
        await openSaved(["## Morning", ...days(), "## Evening", "Day Y."]);
        content().querySelector<HTMLElement>("h2 .collapse-indicator")!.click();
        const changed = ["## Morning", ...days(), "## Evening", "Day Y."];
        changed[3] = `Day X.${FILLER}`;
        changed.splice(5, 0, "### Noon");

        expect(await save(changed)).toBe(true);

        const replaced = content().children[3]!;
        expect(replaced.textContent).toBe("Day X. lorem");
        expect(replaced.hasClass("is-hidden")).toBe(true);
        const noon = Array.from(content().querySelectorAll("h3")).find((h) => h.textContent === "Noon")!;
        expect(noon.querySelector(".collapse-indicator")).not.toBeNull();
        expect(noon.hasClass("is-hidden")).toBe(true);
    });

    it("marks a new section's unresolved links", async () => {
        vi.spyOn(MarkdownRenderer, "render").mockImplementation(async (_app, markdown, el) => {
            const p = el.createEl("p", { text: markdown.slice(0, 12) });
            if (markdown.startsWith("Day X."))
                p.createEl("a", { cls: "internal-link", attr: { "data-href": "Nowhere" } });
        });
        await openSaved(days());
        const changed = days();
        changed[1] = `Day X.${FILLER}`;
        await save(changed);
        expect(content().querySelector(".internal-link")!.hasClass("is-unresolved")).toBe(true);
    });

    it("finds an open search's matches in the new section", async () => {
        highlighter.setQuery("Day X");
        await openSaved(days());
        expect(highlighter.rangesIn(block)).toHaveLength(0);
        const changed = days();
        changed[1] = `Day X.${FILLER}`;
        await save(changed);
        expect(highlighter.rangesIn(block)).toHaveLength(1);
    });

    describe("its runs, which the stream hides when far (ADR 0021)", () => {
        const elementsOf = (runs: Element[][]) => runs.flat().map((el) => el.textContent);

        it("are the runs a long note rendered in, each its elements, in order", async () => {
            const render = renderParagraphs();
            await open(days(400));

            const runs = renderer.runsOf(component);

            expect(runs).toHaveLength(render.mock.calls.length);
            expect(elementsOf(runs)).toEqual(texts());
        });

        it("are a note's sections taken together up to a run's length, rendered by section", async () => {
            renderer = makeRenderer(today);
            const render = renderParagraphs();
            await open(days(400));
            expect(render).toHaveBeenCalledTimes(400);

            const runs = renderer.runsOf(component);

            expect(runs.length).toBeGreaterThan(1);
            expect(runs.length).toBeLessThan(400);
            expect(elementsOf(runs)).toEqual(texts());
        });

        // Drawn from its end, the stream hides runs between slices: one hidden
        // then must be a run still once the note is drawn.
        it("hold as a note drawn from its end grows at its top, all but the topmost", async () => {
            renderer = makeRenderer(today);
            renderParagraphs();
            slowClock();
            current = note(days(400));
            block = renderer.createBlock(file);
            document.body.append(block);
            const seen: string[][] = [];
            const goOn = async (drawing: Component) => {
                for (const run of renderer.runsOf(drawing).slice(1)) seen.push(run.map((el) => el.textContent!));
                return true;
            };

            ({ component } = (await renderer.renderInto(block, file, goOn, "from-end"))!);

            const final = renderer.runsOf(component).map((run) => run.map((el) => el.textContent!));
            expect(seen.length).toBeGreaterThan(0);
            for (const run of seen) expect(final).toContainEqual(run);
        });

        it("are none in a note rendered whole", async () => {
            await open(days(10));
            expect(renderer.runsOf(component)).toEqual([]);
        });

        it("follow a save that updated the note in place", async () => {
            renderer = makeRenderer(today);
            await open(days(400));
            const changed = days(400);
            changed.splice(200, 1, `Day X.${FILLER}`, `Day Y.${FILLER}`);

            expect(await save(changed)).toBe(true);

            expect(elementsOf(renderer.runsOf(component))).toEqual(texts());
            expect(texts()).toContain("Day Y. lorem");
        });

        it("are shown again before a save updates the note in place", async () => {
            renderer = makeRenderer(today);
            await open(days(400));
            for (const run of renderer.runsOf(component)) farRuns.hide(run);
            const changed = days(400);
            changed[200] = `Day X.${FILLER}`;

            expect(await save(changed)).toBe(true);

            expect(content().querySelector(".is-far, .daily-note-far-run")).toBeNull();
            expect(texts()[200]).toBe("Day X. lorem");
        });
    });

    describe("on mobile, with Bases", () => {
        beforeEach(() => {
            Platform.isMobile = true;
            vi.stubGlobal(
                "ResizeObserver",
                class {
                    observe() {}
                    unobserve() {}
                    disconnect() {}
                }
            );
            vi.spyOn(NoteBases.prototype, "render").mockResolvedValue(undefined);
            return () => vi.unstubAllGlobals();
        });

        const BASE = "```base\nviews:\n  - type: table\n```";

        it("renders whole when a changed section holds a Base", async () => {
            await openSaved(days());
            const changed = days();
            changed[3] = BASE;
            expect(await save(changed)).toBe(false);
        });

        it("renders whole when a Base's section was changed away", async () => {
            const withBase = days();
            withBase[3] = BASE;
            await openSaved(withBase);
            expect(await save(days())).toBe(false);
        });

        it("renders whole when the frontmatter changed, which a Base's formulas may read", async () => {
            const withBase = days();
            withBase[3] = BASE;
            await openSaved(withBase, "---\nmood: ok\n---\n");
            expect(await save(withBase, "---\nmood: low\n---\n")).toBe(false);
        });

        it("redraws only the properties when the frontmatter changed in a note with no Base", async () => {
            await openSaved(days(), "---\nmood: ok\n---\n");
            expect(await save(days(), "---\nmood: low\n---\n")).toBe(true);
        });

        it("re-renders a section beside a Base that stayed", async () => {
            const withBase = days();
            withBase[3] = BASE;
            await openSaved(withBase);
            const changed = [...withBase];
            changed[6] = `Day X.${FILLER}`;
            expect(await save(changed)).toBe(true);
        });
    });
});
