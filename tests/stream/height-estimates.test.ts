import { describe, expect, it, vi } from "vitest";
import { TFile, type CachedMetadata } from "obsidian";
import { HeightEstimates, measureText } from "../../src/stream/height-estimates";
import { NoteHeights } from "../../src/stream/note-heights";

const TEMPLATE = new TFile("Templates/Daily.md");
/** 10px a character, 24px a line: at "100:16px", ten characters fill a line. */
const TEXT = { charWidth: 10, lineHeight: 24 };
const PANE = 800;
const HERE = "100:16px";

/** A note of single-line paragraphs, `chars` long each, and `embeds` embeds. */
function note(chars: number[], embeds = 0): CachedMetadata {
    const span = (length: number) => ({
        start: { line: 0, col: 0, offset: 0 },
        end: { line: 0, col: 0, offset: length },
    });
    return {
        sections: chars.map((length) => ({ type: "paragraph", position: span(length) })),
        embeds: Array.from({ length: embeds }, () => ({ link: "a.png", original: "![[a.png]]", position: span(10) })),
    };
}

/** Two one-line paragraphs at any width here. */
const TEMPLATE_CACHE = note([5, 5]);

function setup(caches: Record<string, CachedMetadata> = {}) {
    const heights = new NoteHeights();
    const templates = new NoteHeights();
    const sources = {
        cacheOf: vi.fn((path: string) => ({ [TEMPLATE.path]: TEMPLATE_CACHE, ...caches })[path] ?? null),
        template: vi.fn((): TFile | null => TEMPLATE),
        text: vi.fn((): typeof TEXT | null => TEXT),
        paneHeight: () => PANE,
    };
    const estimates = new HeightEstimates(heights, templates, sources);
    return { heights, templates, sources, estimates };
}

describe("HeightEstimates", () => {
    it("estimates nothing for a note the cache has not read, or before the column lays out", () => {
        const { heights, sources, estimates } = setup({ "a.md": note([30]) });
        heights.keep("300:16px", "a.md", 500);

        sources.text.mockReturnValueOnce(null);
        expect(estimates.estimate(HERE, "a.md")).toBeUndefined();
        expect(estimates.estimate(HERE, "b.md")).toBeUndefined();
        expect(estimates.estimate(HERE, "a.md")).toBe(548);
    });

    describe("a note measured at another layout", () => {
        // A turn changes a text note only by re-wrapping its text.
        it("is that height, its text re-wrapped here", () => {
            const { heights, estimates } = setup({ "a.md": note([30]) });
            heights.keep("300:16px", "a.md", 500);

            expect(estimates.estimate(HERE, "a.md")).toBe(500 + (3 - 1) * TEXT.lineHeight);
        });

        it("is taken from the nearest width at the same text size", () => {
            const { heights, estimates } = setup({ "a.md": note([30]) });
            heights.keep("300:16px", "a.md", 500);
            heights.keep("120:16px", "a.md", 540);
            heights.keep("100:20px", "a.md", 999);

            expect(estimates.estimate(HERE, "a.md")).toBe(540);
        });
    });

    describe("a note never measured", () => {
        it("is the template's height here, and a line height for each line past it", () => {
            const { templates, estimates } = setup({ "a.md": note([5, 5, 5, 25]) });
            templates.keep(HERE, TEMPLATE.path, 360);

            expect(estimates.estimate(HERE, "a.md")).toBe(360 + (6 - 2) * TEXT.lineHeight);
        });

        it("reserves a pane's height for each embed until one is measured here", () => {
            const { templates, estimates } = setup({ "a.md": note([5, 5], 2) });
            templates.keep(HERE, TEMPLATE.path, 360);

            expect(estimates.estimate(HERE, "a.md")).toBe(360 + 2 * PANE);
        });

        // A line of a note measures more than a line of text: headings, list spacing, margins.
        it("takes a line's height from text-only notes measured at any width of this text size", () => {
            const { heights, templates, estimates } = setup({
                "a.md": note([5, 5, 5, 5]),
                "b.md": note([5, 5, 5, 5, 5, 5]),
                "embeds.md": note([5, 5, 5], 1),
                "large.md": note([5, 5, 5]),
                "new.md": note([5, 5, 5, 5, 5]),
            });
            templates.keep("200:16px", TEMPLATE.path, 360);
            templates.keep(HERE, TEMPLATE.path, 360);
            templates.keep("200:20px", TEMPLATE.path, 400);
            heights.keep("200:16px", "a.md", 360 + 2 * 35);
            heights.keep("200:16px", "b.md", 360 + 4 * 35);
            heights.keep("200:16px", "embeds.md", 2000);
            heights.keep("200:20px", "large.md", 1000);
            heights.keep("200:16px", "unread.md", 3000);

            expect(estimates.estimate(HERE, "new.md")).toBe(360 + 3 * 35);
        });

        it("reserves for each embed what embeds measured at this layout", () => {
            const { heights, templates, estimates } = setup({
                "a.md": note([5, 5, 5], 1),
                "b.md": note([5, 5, 5], 1),
                "elsewhere.md": note([5, 5, 5], 1),
                "new.md": note([5, 5], 2),
            });
            templates.keep(HERE, TEMPLATE.path, 360);
            templates.keep("300:16px", TEMPLATE.path, 360);
            heights.keep(HERE, "a.md", 360 + 24 + 500);
            heights.keep(HERE, "b.md", 360 + 24 + 700);
            heights.keep("300:16px", "elsewhere.md", 5000);

            expect(estimates.estimate(HERE, "new.md")).toBe(360 + 2 * 700);
        });

        it("estimates nothing before the template is measured here, or without one", () => {
            const { templates, sources, estimates } = setup({ "a.md": note([5]) });
            templates.keep("300:16px", TEMPLATE.path, 360);
            expect(estimates.estimate(HERE, "a.md")).toBeUndefined();

            templates.keep(HERE, TEMPLATE.path, 360);
            sources.template.mockReturnValueOnce(null);
            expect(estimates.estimate(HERE, "a.md")).toBeUndefined();
            sources.cacheOf.mockImplementation((path) => (path === "a.md" ? note([5]) : null));
            expect(estimates.estimate(HERE, "a.md")).toBeUndefined();
        });
    });

    // Every placeholder of a batch asks: what is learned from every height is read once per change.
    it("learns from the heights again only once they change", () => {
        const { heights, templates, sources, estimates } = setup({ "a.md": note([5, 5, 5]), "b.md": note([5]) });
        templates.keep(HERE, TEMPLATE.path, 360);
        heights.keep(HERE, "a.md", 400);

        estimates.estimate(HERE, "b.md");
        const reads = sources.cacheOf.mock.calls.length;
        estimates.estimate(HERE, "b.md");
        expect(sources.cacheOf.mock.calls.length - reads).toBe(2);

        heights.keep(HERE, "a.md", 410);
        estimates.estimate(HERE, "b.md");
        expect(sources.cacheOf.mock.calls.length - reads).toBeGreaterThan(4);
    });

    it("measures the text once per text size", () => {
        const { templates, sources, estimates } = setup({ "a.md": note([5]) });
        templates.keep(HERE, TEMPLATE.path, 360);

        estimates.estimate(HERE, "a.md");
        estimates.estimate("300:16px", "a.md");
        expect(sources.text).toHaveBeenCalledTimes(1);

        estimates.estimate("100:20px", "a.md");
        expect(sources.text).toHaveBeenCalledTimes(2);
    });
});

describe("measureText", () => {
    /** A column in a pane, where a paragraph lays out in `font` at `lineHeight`. */
    function setup(font: string, lineHeight: string) {
        const pane = document.body.createDiv();
        const column = pane.createDiv();
        const styles = vi
            .spyOn(window, "getComputedStyle")
            .mockReturnValue({ font, lineHeight } as CSSStyleDeclaration);
        const context = { font: "", measureText: vi.fn((text: string) => ({ width: text.length * 7 })) };
        const canvas = vi
            .spyOn(HTMLCanvasElement.prototype, "getContext")
            .mockReturnValue(context as unknown as CanvasRenderingContext2D);
        const restore = () => {
            styles.mockRestore();
            canvas.mockRestore();
            pane.remove();
        };
        return { pane, column, context, restore };
    }

    it("reads a note paragraph's font and line height, beside the column", () => {
        const { pane, column, context, restore } = setup("16px Inter", "24px");

        expect(measureText(column)).toEqual({ charWidth: 7, lineHeight: 24 });
        expect(context.font).toBe("16px Inter");
        expect(pane.children).toHaveLength(1);
        restore();
    });

    it("reads nothing where nothing lays out", () => {
        const { column, restore } = setup("", "normal");
        expect(measureText(column)).toBeNull();
        expect(measureText(document.createElement("div"))).toBeNull();
        restore();
    });

    it("reads nothing without a canvas to measure on", () => {
        const { column, restore } = setup("16px Inter", "24px");
        vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
        expect(measureText(column)).toBeNull();
        restore();
    });
});
