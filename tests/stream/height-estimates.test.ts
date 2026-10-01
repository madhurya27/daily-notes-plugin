import { describe, expect, it, vi } from "vitest";
import { TFile, type CachedMetadata } from "obsidian";
import { HeightEstimates, measureText } from "../../src/stream/height-estimates";
import { NoteHeights } from "../../src/stream/note-heights";

const TEMPLATE = new TFile("Templates/Daily.md");
/** 10px a character, 24px a line: at "100:16px", ten characters fill a line. */
const TEXT = { charWidth: 10, lineHeight: 24 };
const PANE = 800;
const HERE = "100:16px";

/** A note of single-line paragraphs, `chars` long each, embedding `embeds`. */
function note(chars: number[], embeds: string[] = []): CachedMetadata {
    const span = (length: number) => ({
        start: { line: 0, col: 0, offset: 0 },
        end: { line: 0, col: 0, offset: length },
    });
    return {
        sections: chars.map((length) => ({ type: "paragraph", position: span(length) })),
        embeds: embeds.map((link) => ({ link, original: `![[${link}]]`, position: span(10) })),
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

        // A Base drawn as cards at one width and a table at another changes by up to a screen or more.
        describe("embedding a Base", () => {
            const OTHER = "300:16px";

            it("changes by what the same Base changed in notes measured at both widths", () => {
                const { heights, estimates } = setup({
                    "a.md": note([30], ["Reading.base"]),
                    "b.md": note([5], ["Reading.base"]),
                    "c.md": note([5], ["Reading.base#Table"]),
                    "d.md": note([5], ["Reading.base"]),
                    "other.md": note([5], ["People.base"]),
                    "image.md": note([5], ["a.png"]),
                });
                heights.keep(OTHER, "a.md", 2000);
                heights.keep(OTHER, "b.md", 1900);
                heights.keep(HERE, "b.md", 1000);
                heights.keep(OTHER, "c.md", 1900);
                heights.keep(HERE, "c.md", 1100);
                heights.keep(OTHER, "d.md", 1900);
                heights.keep(HERE, "d.md", 1200);
                heights.keep(OTHER, "other.md", 900);
                heights.keep(HERE, "other.md", 100);
                heights.keep(OTHER, "image.md", 900);
                heights.keep(HERE, "image.md", 100);

                expect(estimates.estimate(HERE, "a.md")).toBe(2000 + (3 - 1) * TEXT.lineHeight - 800);
            });

            it("shares a note's change among the Bases it embeds", () => {
                const { heights, estimates } = setup({
                    "a.md": note([5], ["Reading.base"]),
                    "b.md": note([5], ["Reading.base", "Reading.base"]),
                });
                heights.keep(OTHER, "a.md", 2000);
                heights.keep(OTHER, "b.md", 3000);
                heights.keep(HERE, "b.md", 1000);

                expect(estimates.estimate(HERE, "a.md")).toBe(1000);
            });

            // Every placeholder of a batch asks, as for what is learned at one layout.
            it("learns what Bases changed again only once the heights change", () => {
                const { heights, sources, estimates } = setup({
                    "a.md": note([5], ["Reading.base"]),
                    "b.md": note([5], ["Reading.base"]),
                });
                heights.keep(OTHER, "a.md", 2000);
                heights.keep(OTHER, "b.md", 1900);
                heights.keep(HERE, "b.md", 1000);

                estimates.estimate(HERE, "a.md");
                const reads = sources.cacheOf.mock.calls.length;
                estimates.estimate(HERE, "a.md");
                expect(sources.cacheOf.mock.calls.length - reads).toBe(1);

                heights.keep(HERE, "b.md", 1100);
                estimates.estimate(HERE, "a.md");
                expect(sources.cacheOf.mock.calls.length - reads).toBe(3);
            });

            it("is the height re-wrapped where no note with that Base is measured at both widths", () => {
                const { heights, estimates } = setup({
                    "a.md": note([5], ["Reading.base"]),
                    "b.md": note([5], ["Reading.base"]),
                    "unread.md": note([5], ["Reading.base"]),
                });
                heights.keep(OTHER, "a.md", 2000);
                heights.keep(OTHER, "b.md", 1900);
                heights.keep("200:16px", "b.md", 1000);
                heights.keep(HERE, "unread.md", 100);
                heights.keep(OTHER, "gone.md", 1900);
                heights.keep(HERE, "gone.md", 100);

                expect(estimates.estimate(HERE, "a.md")).toBe(2000);
            });

            // Cards at the narrower width may be a table here, a screen or more shorter.
            describe("turned wider", () => {
                const NARROWER = "50:16px";

                it("is the template's estimate here while that Base's change is not learned", () => {
                    const { heights, templates, estimates } = setup({ "a.md": note([30], ["Reading.base"]) });
                    heights.keep(NARROWER, "a.md", 3000);
                    templates.keep(HERE, TEMPLATE.path, 360);

                    expect(estimates.estimate(HERE, "a.md")).toBe(360 + (3 - 2) * TEXT.lineHeight + PANE);
                });

                it("is the height re-wrapped before the template is measured here", () => {
                    const { heights, estimates } = setup({ "a.md": note([30], ["Reading.base"]) });
                    heights.keep(NARROWER, "a.md", 3000);

                    expect(estimates.estimate(HERE, "a.md")).toBe(3000 - (6 - 3) * TEXT.lineHeight);
                });

                it("changes by what the same Base changed, once learned", () => {
                    const { heights, templates, estimates } = setup({
                        "a.md": note([5], ["Reading.base"]),
                        "b.md": note([5], ["Reading.base"]),
                    });
                    heights.keep(NARROWER, "a.md", 3000);
                    heights.keep(NARROWER, "b.md", 3000);
                    heights.keep(HERE, "b.md", 1000);
                    templates.keep(HERE, TEMPLATE.path, 360);

                    expect(estimates.estimate(HERE, "a.md")).toBe(1000);
                });

                it("is the height re-wrapped without a Base", () => {
                    const { heights, templates, estimates } = setup({ "a.md": note([5], ["a.png"]) });
                    heights.keep(NARROWER, "a.md", 3000);
                    templates.keep(HERE, TEMPLATE.path, 360);

                    expect(estimates.estimate(HERE, "a.md")).toBe(3000);
                });
            });

            // Narrower, a table may become cards: taller, and the template's estimate overshoots more.
            it("is the height re-wrapped when turned narrower, the template measured here", () => {
                const { heights, templates, estimates } = setup({ "a.md": note([5], ["Reading.base"]) });
                heights.keep(OTHER, "a.md", 1000);
                templates.keep(HERE, TEMPLATE.path, 360);

                expect(estimates.estimate(HERE, "a.md")).toBe(1000);
            });
        });
    });

    describe("a note never measured", () => {
        it("is the template's height here, and a line height for each line past it", () => {
            const { templates, estimates } = setup({ "a.md": note([5, 5, 5, 25]) });
            templates.keep(HERE, TEMPLATE.path, 360);

            expect(estimates.estimate(HERE, "a.md")).toBe(360 + (6 - 2) * TEXT.lineHeight);
        });

        it("reserves a pane's height for each embed until one is measured here", () => {
            const { templates, estimates } = setup({ "a.md": note([5, 5], ["a.png", "a.png"]) });
            templates.keep(HERE, TEMPLATE.path, 360);

            expect(estimates.estimate(HERE, "a.md")).toBe(360 + 2 * PANE);
        });

        // A line of a note measures more than a line of text: headings, list spacing, margins.
        it("takes a line's height from text-only notes measured at any width of this text size", () => {
            const { heights, templates, estimates } = setup({
                "a.md": note([5, 5, 5, 5]),
                "b.md": note([5, 5, 5, 5, 5, 5]),
                "embeds.md": note([5, 5, 5], ["a.png"]),
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
                "a.md": note([5, 5, 5], ["a.png"]),
                "b.md": note([5, 5, 5], ["a.png"]),
                "elsewhere.md": note([5, 5, 5], ["a.png"]),
                "new.md": note([5, 5], ["a.png", "a.png"]),
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
