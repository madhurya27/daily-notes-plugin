import type { TFile } from "obsidian";
import type { NoteHeights } from "./note-heights";

/** An unloaded note, as far as what it reserves goes. */
export interface Reserving {
    file: TFile;
    /** What it reserves: measured on the last unload, or the estimate. */
    height: number;
    /** `height` was measured, this session or an earlier one, not guessed. */
    measured: boolean;
}

/** What a re-reserve at rest changes. */
export interface ReservePlan {
    /** The blocks to reserve their note's `height` now. */
    changed: [HTMLElement, Reserving][];
    /** How far the blocks wholly above the pane move: the anchor draws it first (ADR 0015). */
    movedAbove: number;
}

/**
 * What each unloaded note reserves, and whether the placeholders are owed a
 * re-reserve: the heights learned more, or the layout changed (ADR 0014).
 */
export class Reservations {
    /** The layout the unloaded notes expect heights in. */
    private expectedIn: string | null = null;
    /** What the placeholders were last reserved from: the heights' revision, and the layout. */
    private reservedFrom: string;

    constructor(
        private readonly heights: NoteHeights,
        /** What a note not measured at a layout reserves there (D-092). */
        private readonly estimate: (layout: string) => number | undefined
    ) {
        this.reservedFrom = this.key();
    }

    get owed(): boolean {
        return this.reservedFrom !== this.key();
    }

    /**
     * What `note` last measured in `layout`, or the estimate there. With
     * none, as just turned, it keeps what it reserves until the notes on
     * screen are measured.
     */
    expect(note: Reserving, layout: string): void {
        const remembered = this.heights.heightOf(layout, note.file.path);
        note.height = remembered ?? this.estimate(layout) ?? note.height;
        note.measured = remembered !== undefined;
    }

    /** A new note, reserved from what is known now; the others too, unless one is owed. */
    add(note: Reserving, layout: string): void {
        const owed = this.owed;
        this.expectedIn = layout;
        this.expect(note, layout);
        if (!owed) this.reservedFrom = this.key();
    }

    /** Whether `layout` is new: the unloaded notes are owed what they measured there. */
    expectLayout(layout: string): boolean {
        if (layout === this.expectedIn) return false;
        this.expectedIn = layout;
        return true;
    }

    /**
     * Each unloaded note's block, to reserve what it is now expected at. Null
     * while the rest would shrink the stream by more than `roomBelow` the
     * pane: the browser would clamp the scroll. Planned, nothing is owed.
     */
    plan(
        unloaded: Iterable<[HTMLElement, Reserving]>,
        layout: string,
        paneTop: number,
        roomBelow: number
    ): ReservePlan | null {
        const key = this.key();
        const changed: [HTMLElement, Reserving][] = [];
        let movedAbove = 0;
        let shrinkBelow = 0;
        for (const [block, note] of unloaded) {
            if (!note.measured) this.expect(note, layout);
            const reserved = parseFloat(block.style.getPropertyValue("--daily-note-placeholder-height"));
            if (reserved === note.height) continue;
            changed.push([block, note]);
            if (isAbove(block, paneTop)) movedAbove += note.height - reserved;
            else shrinkBelow += reserved - note.height;
        }
        if (shrinkBelow > roomBelow) return null;
        this.reservedFrom = key;
        return { changed, movedAbove };
    }

    private key(): string {
        return `${this.heights.revision}\n${this.expectedIn}`;
    }
}

/** Wholly above the pane's top; a block not laid out, in a hidden tab, is nowhere. */
function isAbove(block: HTMLElement, paneTop: number): boolean {
    const { bottom, height } = block.getBoundingClientRect();
    return height > 0 && bottom <= paneTop;
}
