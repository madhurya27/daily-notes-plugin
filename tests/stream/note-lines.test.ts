import { describe, expect, it } from "vitest";
import type { CachedMetadata } from "obsidian";
import { embedCount, wrappedLines } from "../../src/stream/note-lines";

/** `lines` source lines holding `chars` characters, as the metadata cache records a span. */
function span(lines: number, chars: number) {
    return {
        start: { line: 0, col: 0, offset: 0 },
        end: { line: lines - 1, col: 0, offset: chars },
    };
}

const section = (type: string, lines: number, chars: number) => ({ type, position: span(lines, chars) });
const item = (chars: number) => ({ parent: -1, position: span(1, chars) });

/** 100px of text a line, 10px a character: ten characters fill one. */
const WIDTH = 100;
const CHAR_WIDTH = 10;

describe("wrappedLines", () => {
    it("counts a short paragraph as one line, a long one as the lines it wraps to", () => {
        const cache: CachedMetadata = { sections: [section("paragraph", 1, 4), section("paragraph", 1, 25)] };

        expect(wrappedLines(cache, WIDTH, CHAR_WIDTH)).toBe(1 + 3);
    });

    it("counts a list by its items, each wrapped on its own", () => {
        const cache: CachedMetadata = {
            sections: [section("list", 3, 32)],
            listItems: [item(5), item(12), item(15)],
        };

        expect(wrappedLines(cache, WIDTH, CHAR_WIDTH)).toBe(1 + 2 + 2);
    });

    // A code block keeps its line breaks: five short lines are five, not one.
    it("counts at least one line per source line", () => {
        const cache: CachedMetadata = { sections: [section("code", 5, 30)] };

        expect(wrappedLines(cache, WIDTH, CHAR_WIDTH)).toBe(5);
    });

    // A table's rows, a callout's lines: each wraps on its own, and the cache holds no line's length.
    it("wraps a section of several lines as lines of its average length", () => {
        const cache: CachedMetadata = { sections: [section("table", 3, 45)] };

        expect(wrappedLines(cache, WIDTH, CHAR_WIDTH)).toBe(3 * 2);
    });

    it("leaves out frontmatter", () => {
        const cache: CachedMetadata = { sections: [section("yaml", 4, 60), section("heading", 1, 9)] };

        expect(wrappedLines(cache, WIDTH, CHAR_WIDTH)).toBe(1);
    });

    it("counts nothing in a note with no sections", () => {
        expect(wrappedLines({}, WIDTH, CHAR_WIDTH)).toBe(0);
    });
});

describe("embedCount", () => {
    it("counts a note's embeds", () => {
        const embed = { link: "a.png", original: "![[a.png]]", position: span(1, 10) };

        expect(embedCount({ embeds: [embed, embed] })).toBe(2);
        expect(embedCount({})).toBe(0);
    });
});
