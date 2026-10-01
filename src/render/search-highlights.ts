import type { Component } from "obsidian";
import { searchPattern } from "../notes/note-search";

/** The names styles.css paints through `::highlight()`. */
const MATCH = "daily-notes-search-match";
const CURRENT = "daily-notes-search-current";

/**
 * The document's highlight of `name`, registered on first use. Shared by every
 * stream view, so each adds and deletes only its own ranges. Null where the
 * platform has no highlight API: the ranges are still tracked, just unpainted.
 */
function registered(name: string): Highlight | null {
    const registry = CSS.highlights as HighlightRegistry | undefined;
    if (!registry) return null;
    let highlight = registry.get(name);
    if (!highlight) {
        highlight = new Highlight();
        // Overlapping ranges paint by priority: the current match over the rest.
        if (name === CURRENT) highlight.priority = 1;
        registry.set(name, highlight);
    }
    return highlight;
}

/**
 * Search matches a note's own source. Linked mentions, embeds and Bases show
 * other files, or Obsidian's word on them; the heading is our label.
 */
const OUTSIDE_THE_NOTE = ".daily-note-mentions, .metadata-properties-heading, .internal-embed, .block-language-base";

/** Every occurrence of `pattern` inside one text node of `root`, what is outside the note left out. */
function findRanges(root: HTMLElement, pattern: RegExp): Range[] {
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, (node) =>
        node.parentElement?.closest(OUTSIDE_THE_NOTE) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of (node as Text).data.matchAll(pattern)) {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            ranges.push(range);
        }
    }
    return ranges;
}

/**
 * Paints the query in rendered notes through the CSS highlight API, which
 * leaves the DOM alone: collapsing and the delegated listeners never see a
 * wrapper element.
 */
export class SearchHighlighter {
    private pattern: RegExp | null = null;
    /** Rendered blocks, and the ranges found in each. */
    private readonly ranges = new Map<HTMLElement, Range[]>();
    private current: Range | null = null;

    /** Highlights `query` in every rendered note, and in each rendered from now on. */
    setQuery(query: string): void {
        this.pattern = searchPattern(query);
        for (const block of this.ranges.keys()) this.highlight(block);
    }

    /** Highlights a freshly rendered block until `component` unloads it. */
    track(block: HTMLElement, component: Component): void {
        this.highlight(block);
        component.register(() => this.forget(block));
    }

    rangesIn(block: HTMLElement): readonly Range[] {
        return this.ranges.get(block) ?? [];
    }

    /** Marks the match the reader is on; null clears the mark. */
    setCurrent(range: Range | null): void {
        const highlight = registered(CURRENT);
        if (this.current) highlight?.delete(this.current);
        this.current = range;
        if (range) highlight?.add(range);
    }

    private highlight(block: HTMLElement): void {
        this.unpaint(block);
        const found = this.pattern ? findRanges(block, this.pattern) : [];
        this.ranges.set(block, found);
        const highlight = registered(MATCH);
        for (const range of found) highlight?.add(range);
    }

    private forget(block: HTMLElement): void {
        this.unpaint(block);
        this.ranges.delete(block);
    }

    private unpaint(block: HTMLElement): void {
        const ranges = this.ranges.get(block) ?? [];
        if (this.current && ranges.includes(this.current)) this.setCurrent(null);
        const highlight = registered(MATCH);
        for (const range of ranges) highlight?.delete(range);
    }
}
