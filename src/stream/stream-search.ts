import type { TFile } from "obsidian";
import { findNotes } from "../notes/note-search";
import type { SearchHighlighter } from "../render/search-highlights";

/** Every daily note, and a way to read its source. */
export interface NoteSource {
    /** Newest first, as the stream orders them. */
    notes(): readonly TFile[];
    read(file: TFile): Promise<string>;
}

/** The stream, as a search moves through it. */
export interface SearchTarget {
    /** Loads `file` into the stream and scrolls to it; its block, or null when gone. */
    reveal(file: TFile): Promise<HTMLElement | null>;
    /** The block `file` is shown in, if loaded. */
    blockOf(file: TFile): HTMLElement | null;
    /** The note at the top of the pane, where a search starts from. */
    firstVisibleNote(): TFile | null;
    /** Centres `el` in the pane, and keeps it there while the stream renders. */
    centre(el: HTMLElement): Promise<void>;
}

type Direction = 1 | -1;

/**
 * Moves through the notes matching a query, counted per note, and through the
 * highlights inside each (docs/decisions.md, 2026-09-23). Every call runs after
 * the ones before it, so a step waits for the search typed ahead of it.
 */
export class StreamSearch {
    private query = "";
    private matches: TFile[] = [];
    /** Index into `matches`; -1 before the first step. */
    private current = -1;
    /** Index into the current note's shown ranges; -1 when it has none. */
    private range = -1;
    private queue: Promise<void> = Promise.resolve();

    constructor(
        private readonly source: NoteSource,
        private readonly target: SearchTarget,
        private readonly highlighter: SearchHighlighter,
        private readonly onStatus: (status: string) => void,
        /** jsdom lays nothing out, so visibility is the one seam tests replace. */
        private readonly isShown: (range: Range) => boolean = (range) => range.getClientRects().length > 0
    ) {}

    search(query: string): Promise<void> {
        return this.run(async () => {
            this.query = query;
            this.current = -1;
            this.range = -1;
            this.highlighter.setCurrent(null);
            this.highlighter.setQuery(query);
            this.matches = await this.find();
        });
    }

    /** Re-reads the vault after it changed, staying on the current note while it matches. */
    refresh(): Promise<void> {
        return this.run(async () => {
            if (!this.query) return;
            const file = this.matches[this.current];
            this.matches = await this.find();
            this.current = file ? this.matches.indexOf(file) : -1;
        });
    }

    close(): Promise<void> {
        return this.search("");
    }

    next(): Promise<void> {
        return this.run(() => this.step(1));
    }

    previous(): Promise<void> {
        return this.run(() => this.step(-1));
    }

    private find(): Promise<TFile[]> {
        return findNotes(this.source.notes(), (file) => this.source.read(file), this.query);
    }

    private async step(direction: Direction): Promise<void> {
        if (this.matches.length === 0) return;
        const file = this.matches[this.current];
        const block = file ? this.target.blockOf(file) : null;
        const ranges = block ? this.shownRanges(block) : [];
        const within = this.range + direction;
        if (file && within >= 0 && within < ranges.length) {
            await this.show(ranges, within);
            return;
        }
        await this.enter(this.adjacentNote(direction), direction);
    }

    /** Reveals the match at `index`, on its first highlight going forwards and its last going back. */
    private async enter(index: number, direction: Direction): Promise<void> {
        this.current = index;
        const block = await this.target.reveal(this.matches[index]!);
        const ranges = block ? this.shownRanges(block) : [];
        await this.show(ranges, direction === 1 ? 0 : ranges.length - 1);
    }

    /** The next match along, wrapping; the first step starts from the note on screen. */
    private adjacentNote(direction: Direction): number {
        const count = this.matches.length;
        if (this.current !== -1) return (this.current + direction + count) % count;

        const order = this.source.notes();
        const top = this.target.firstVisibleNote();
        const from = top ? order.indexOf(top) : 0;
        // Matches are in stream order, so counting those above is finding the first below.
        const positions = this.matches.map((file) => order.indexOf(file));
        if (direction === 1) return positions.filter((position) => position < from).length % count;
        const throughTop = positions.filter((position) => position <= from).length;
        return (throughTop - 1 + count) % count;
    }

    /** Marks the range at `index` and brings it on screen; out of bounds marks none. */
    private async show(ranges: readonly Range[], index: number): Promise<void> {
        const range = ranges[index] ?? null;
        this.range = range ? index : -1;
        this.highlighter.setCurrent(range);
        const el = range?.startContainer.parentElement;
        if (el) await this.target.centre(el);
    }

    private shownRanges(block: HTMLElement): Range[] {
        return this.highlighter.rangesIn(block).filter(this.isShown);
    }

    private status(): string {
        if (!this.query.trim()) return "";
        const count = this.matches.length;
        if (count === 0) return "No results";
        if (this.current === -1) return count === 1 ? "1 note" : `${count} notes`;
        return `${this.current + 1} / ${count}`;
    }

    private run(task: () => Promise<void>): Promise<void> {
        this.queue = this.queue
            .then(task)
            .then(() => this.onStatus(this.status()))
            .catch((e) => console.error("DailyNotesStream: Search failed", e));
        return this.queue;
    }
}
