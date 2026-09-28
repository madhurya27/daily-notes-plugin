import { describe, it, expect, beforeEach } from "vitest";
import { Component } from "obsidian";
import { SearchHighlighter } from "../../src/render/search-highlights";

/** The registered highlight of `name`, as the stylesheet's `::highlight()` reads it. */
const highlighted = (name: string) => [...(CSS.highlights.get(name) ?? [])].map((r) => (r as Range).toString());

function renderedBlock(html: string): { block: HTMLElement; component: Component } {
    const block = document.createElement("div");
    // Test fixture markup; the source rule against raw HTML covers src/ only.
    block.innerHTML = html;
    const component = new Component();
    component.load();
    return { block, component };
}

describe("SearchHighlighter", () => {
    let highlighter: SearchHighlighter;

    beforeEach(() => {
        CSS.highlights.clear();
        highlighter = new SearchHighlighter();
    });

    it("highlights every occurrence in a rendered note, ignoring case", () => {
        const { block, component } = renderedBlock("<p>Ran 5 km. <b>KM</b> again</p>");
        highlighter.setQuery("km");

        highlighter.track(block, component);

        expect(highlighter.rangesIn(block).map((r) => r.toString())).toEqual(["km", "KM"]);
        expect(highlighted("daily-notes-search-match")).toEqual(["km", "KM"]);
    });

    // Stream search matches a note's own source; another note's excerpt is not a match in it.
    it("highlights nothing in a note's linked mentions", () => {
        const { block, component } = renderedBlock(
            '<p>Ran 5 km.</p><div class="daily-note-mentions"><p>Ran 10 km.</p></div>'
        );
        highlighter.setQuery("km");

        highlighter.track(block, component);

        expect(highlighter.rangesIn(block).map((r) => r.toString())).toEqual(["km"]);
    });

    it("re-highlights the rendered notes when the query changes", () => {
        const { block, component } = renderedBlock("<p>milk and bread</p>");
        highlighter.track(block, component);
        expect(highlighter.rangesIn(block)).toEqual([]);

        highlighter.setQuery("bread");

        expect(highlighted("daily-notes-search-match")).toEqual(["bread"]);
    });

    it("clears every highlight for a blank query", () => {
        const { block, component } = renderedBlock("<p>milk</p>");
        highlighter.setQuery("milk");
        highlighter.track(block, component);

        highlighter.setQuery("");

        expect(highlighter.rangesIn(block)).toEqual([]);
        expect(highlighted("daily-notes-search-match")).toEqual([]);
    });

    it("drops a note's highlights when its component unloads", () => {
        const { block, component } = renderedBlock("<p>milk</p>");
        highlighter.setQuery("milk");
        highlighter.track(block, component);
        highlighter.setCurrent(highlighter.rangesIn(block)[0]!);

        component.unload();

        expect(highlighter.rangesIn(block)).toEqual([]);
        expect(highlighted("daily-notes-search-match")).toEqual([]);
        expect(highlighted("daily-notes-search-current")).toEqual([]);
    });

    it("marks one range as current, and moves the mark", () => {
        const { block, component } = renderedBlock("<p>one milk, two milk</p>");
        highlighter.setQuery("milk");
        highlighter.track(block, component);
        const [first, second] = highlighter.rangesIn(block);

        highlighter.setCurrent(first!);
        highlighter.setCurrent(second!);

        expect([...CSS.highlights.get("daily-notes-search-current")!]).toEqual([second]);
    });

    it("leaves other views' ranges in the shared highlight", () => {
        const other = new SearchHighlighter();
        const a = renderedBlock("<p>milk</p>");
        const b = renderedBlock("<p>milk</p>");
        highlighter.setQuery("milk");
        other.setQuery("milk");
        highlighter.track(a.block, a.component);
        other.track(b.block, b.component);

        highlighter.setQuery("");

        expect(highlighted("daily-notes-search-match")).toEqual(["milk"]);
    });

    it("tracks ranges without painting where the platform has no highlight API", () => {
        const registry = CSS.highlights;
        (CSS as { highlights?: HighlightRegistry }).highlights = undefined;
        try {
            const { block, component } = renderedBlock("<p>milk</p>");
            highlighter.setQuery("milk");
            highlighter.track(block, component);
            highlighter.setCurrent(highlighter.rangesIn(block)[0]!);

            expect(highlighter.rangesIn(block).map((r) => r.toString())).toEqual(["milk"]);
        } finally {
            CSS.highlights = registry;
        }
    });
});
