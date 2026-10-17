import type { Component } from "obsidian";
import type { Box, FarRuns } from "../render/far-runs";
import type { NoteRenderer } from "../render/note-renderer";

/** What is watched of a drawn note's runs. */
interface Watched {
    /** The spacers of its runs hidden when far, each watched with the render margin (ADR 0021). */
    spacers: Set<HTMLElement>;
    /** The first and last element of each run shown, watched with the hide margin (ADR 0023). */
    edges: Set<Element>;
}

function blockOf(el: Element): HTMLElement | null {
    return el.closest<HTMLElement>(".daily-note-block");
}

/** Where the hide margin lies, in the viewport's coordinates. */
export interface Bounds {
    top: number;
    bottom: number;
}

/**
 * Hides a long note's runs past the hide margin and shows them on entering
 * the render margin, mid-glide too (ADR 0023). The stream's observers watch
 * the runs beside its blocks: whatever they report that is no block is a run's.
 */
export class FarRunWatch {
    private readonly notes = new Map<HTMLElement, Watched>();
    /** Each watched edge of a run shown, to its run and note. */
    private readonly edges = new Map<Element, { block: HTMLElement; run: Element[] }>();
    private renderObserver: IntersectionObserver | null = null;
    private hideObserver: IntersectionObserver | null = null;

    constructor(
        private readonly renderer: Pick<NoteRenderer, "farRuns" | "runsOf">,
        /** Whether `block` holds a drawn note: a run shown in one is watched again. */
        private readonly isDrawn: (block: HTMLElement) => boolean
    ) {
        this.farRuns.onShown = (run) => this.runShown(run);
    }

    private get farRuns(): FarRuns {
        return this.renderer.farRuns;
    }

    /** The stream's observers, made anew: every spacer and edge is watched by these from now on. */
    observeWith(render: IntersectionObserver | null, hide: IntersectionObserver | null): void {
        this.renderObserver = render;
        this.hideObserver = hide;
        for (const { spacers, edges } of this.notes.values()) {
            for (const spacer of spacers) render?.observe(spacer);
            for (const edge of edges) hide?.observe(edge);
        }
    }

    /**
     * Watches the edges of each run of a drawn note shown: the observer's
     * first report hides those far. Re-pinned first, so the anchor has put
     * the reader back: far is read from there.
     */
    watch(block: HTMLElement, component: Component): void {
        this.unwatchEdges(block);
        for (const run of this.renderer.runsOf(component)) if (!this.farRuns.hides(run[0]!)) this.watchRun(block, run);
    }

    /** Hides the edges reported past the hide margin, whole runs at a time. */
    reported(entries: IntersectionObserverEntry[]): void {
        const far = new Set<{ block: HTMLElement; run: Element[] }>();
        for (const entry of entries) {
            const edge = this.edges.get(entry.target);
            if (edge && this.pastMargin(entry, edge.run)) far.add(edge);
        }
        // Every run measured before any hides: a hide between two reads lays the note out again.
        this.hide([...far].map((edge) => ({ ...edge, box: this.farRuns.measure(edge.run) })));
    }

    /** Drawing from its end, a note hides the runs it drew outside `bounds` between slices. */
    hideDrawnOutside(block: HTMLElement, runs: Element[][], bounds: Bounds): void {
        // Every run measured before any hides: a hide between two reads lays the note out again.
        const far = runs.flatMap((run) => {
            if (this.farRuns.hides(run[0]!)) return [];
            const box = this.farRuns.measure(run);
            return box && (box.bottom <= bounds.top || box.top >= bounds.bottom) ? [{ block, run, box }] : [];
        });
        this.hide(far);
    }

    /** A hidden run's spacer entered the render margin. */
    show(spacer: HTMLElement): void {
        const block = blockOf(spacer);
        this.farRuns.reveal(spacer);
        this.renderObserver?.unobserve(spacer);
        // Stryker disable next-line ConditionalExpression: a spacer in no block is in no note's set either.
        if (block) this.notes.get(block)?.spacers.delete(spacer);
    }

    /** Every run of `block` shown, as its spacers measured another width. */
    showAll(block: HTMLElement): void {
        this.farRuns.revealAll(block);
        this.forgetSpacers(block);
    }

    /** A save drew `block` in place: the runs it touched are shown, their spacers gone. */
    updated(block: HTMLElement): void {
        const watched = this.notes.get(block);
        if (!watched) return;
        for (const spacer of watched.spacers) {
            if (spacer.isConnected) continue;
            this.renderObserver?.unobserve(spacer);
            watched.spacers.delete(spacer);
        }
    }

    /** `block` was emptied: nothing of it is watched. */
    forget(block: HTMLElement): void {
        this.forgetSpacers(block);
        this.unwatchEdges(block);
        // Stryker disable next-line all: frees memory only; the entry's sets are emptied above.
        this.notes.delete(block);
    }

    /** `block` was emptied mid-draw, with any run it hid between slices. */
    forgetSpacers(block: HTMLElement): void {
        const watched = this.notes.get(block);
        if (!watched) return;
        for (const spacer of watched.spacers) this.renderObserver?.unobserve(spacer);
        watched.spacers.clear();
    }

    /**
     * Its last element past the hide margin above, or its first past it below:
     * the whole run is. One laid out at nothing, folded or in a hidden note,
     * lies nowhere: Chromium reports it an empty box in empty root bounds.
     */
    private pastMargin(entry: IntersectionObserverEntry, run: Element[]): boolean {
        const { boundingClientRect: box, target } = entry;
        if (box.width === 0 && box.height === 0) return false;
        // The root is the pane, in this document: its bounds are always given.
        const margin = entry.rootBounds!;
        return (target === run.at(-1) && box.bottom <= margin.top) || (target === run[0] && box.top >= margin.bottom);
    }

    /** Hides each far run, measured at `box`, behind a spacer watched to show it again (ADR 0023). */
    private hide(far: { block: HTMLElement; run: Element[]; box: Box | null }[]): void {
        for (const { block, run, box } of far) {
            this.unwatchRun(block, run);
            const spacer = this.farRuns.hide(run, box);
            if (!spacer) continue;
            this.watched(block).spacers.add(spacer);
            this.renderObserver?.observe(spacer);
        }
    }

    /** A run shown again, by a scroll, a collapse, a search step or a save, is watched again. */
    private runShown(run: Element[]): void {
        const block = blockOf(run[0]!);
        if (block && this.isDrawn(block)) this.watchRun(block, run);
    }

    private watchRun(block: HTMLElement, run: Element[]): void {
        for (const edge of new Set([run[0]!, run.at(-1)!])) {
            this.edges.set(edge, { block, run });
            this.watched(block).edges.add(edge);
            this.hideObserver?.observe(edge);
        }
    }

    private unwatchRun(block: HTMLElement, run: Element[]): void {
        for (const edge of new Set([run[0]!, run.at(-1)!])) {
            this.edges.delete(edge);
            this.notes.get(block)?.edges.delete(edge);
            this.hideObserver?.unobserve(edge);
        }
    }

    private unwatchEdges(block: HTMLElement): void {
        const watched = this.notes.get(block);
        if (!watched) return;
        for (const edge of watched.edges) {
            this.edges.delete(edge);
            this.hideObserver?.unobserve(edge);
        }
        watched.edges.clear();
    }

    private watched(block: HTMLElement): Watched {
        let watched = this.notes.get(block);
        if (!watched) this.notes.set(block, (watched = { spacers: new Set(), edges: new Set() }));
        return watched;
    }
}
