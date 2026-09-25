import { Component, TFile, debounce } from "obsidian";
import type { NoteRenderer } from "../render/note-renderer";
import { SCROLL_IDLE_MS, ScrollAnchor } from "./scroll-anchor";

/**
 * What a block reserves before this vault has measured anything. A guess only
 * until the first note is unloaded, after which the vault's own notes say.
 */
export const ESTIMATED_NOTE_HEIGHT_PX = 400;

/**
 * How many measurements the estimate is drawn from. Short enough that a window
 * resize, which changes every note's height, is forgotten quickly.
 */
const MEASUREMENT_WINDOW = 50;

/**
 * Both margins are viewports, not pixels: how far ahead of the reader the
 * stream works is the same question on a phone and on a tall monitor.
 */
const RENDER_VIEWPORTS = 1.5;
/** Well past the render margin, so a block on the edge cannot thrash. */
const UNLOAD_VIEWPORTS = 4;
/** A pane dragged to nothing, or a root not laid out yet, still gets a window. */
const MIN_VIEWPORT_PX = 400;

interface NoteWindow {
    file: TFile;
    /** Non-null exactly while the block holds rendered content. */
    component: Component | null;
    /** Guards against a second render arriving during the first one's await. */
    rendering: boolean;
    /**
     * The block left while its render was queued or in flight. An observer
     * reports changes, so this is the only unload it will get until it comes
     * back into view — honouring it later is what keeps a fast scroll from
     * leaving rendered notes behind.
     */
    unloadWanted: boolean;
    /** Measured on the last unload; the estimate until then. */
    height: number;
}

/**
 * Keeps the rendered part of the stream bounded: every loaded note has a block,
 * but only blocks near the viewport hold content. An unloaded block keeps its
 * height, so scroll position survives the round trip.
 */
export class NoteWindowManager {
    private readonly windows = new Map<HTMLElement, NoteWindow>();

    /**
     * Renders and unloads since load. Both move everything below them, so a
     * caller holding a scroll position watches this to know the stream settled.
     */
    private changes = 0;
    private renderObserver: IntersectionObserver | null = null;
    private unloadObserver: IntersectionObserver | null = null;
    /** A render or unload moves everything below it; above the pane, that is the reader's place. */
    private readonly anchor = new ScrollAnchor();
    private scrollRoot: HTMLElement | null = null;
    /** Recent measured note heights, oldest first; the estimate is their median. */
    private readonly measured: number[] = [];
    /** The height the current margins were computed from. */
    private rootHeight = 0;
    /** Rendered blocks past the unload margin, waiting for the scroll to be still. */
    private readonly leaving = new Set<HTMLElement>();
    private readonly unloadOnceStill = debounce(() => this.unloadLeaving(), SCROLL_IDLE_MS, true);

    constructor(
        private readonly renderer: NoteRenderer,
        /**
         * Renders run through the stream's queue, like every other mutation
         * (ADR 0004). Its promise is the view's to chain; nothing here waits.
         */
        private readonly enqueue: (task: () => Promise<void>) => unknown,
        /** jsdom lays nothing out, so measurement is the one seam tests replace. */
        private readonly measure: (el: HTMLElement) => number = (el) => el.getBoundingClientRect().height
    ) {}

    attach(scrollRoot: HTMLElement): void {
        this.detachObservers();
        this.scrollRoot = scrollRoot;
        this.rootHeight = Math.max(scrollRoot.clientHeight, MIN_VIEWPORT_PX);

        this.renderObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) this.render(entry.target as HTMLElement);
                }
            },
            { root: scrollRoot, rootMargin: `${Math.round(this.rootHeight * RENDER_VIEWPORTS)}px` }
        );

        this.unloadObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const block = entry.target as HTMLElement;
                    if (entry.isIntersecting) this.leaving.delete(block);
                    else this.unload(block);
                }
            },
            { root: scrollRoot, rootMargin: `${Math.round(this.rootHeight * UNLOAD_VIEWPORTS)}px` }
        );
        this.anchor.attach(scrollRoot);

        for (const block of this.windows.keys()) this.observe(block);
    }

    /**
     * Rebuilds the observers against the pane's new height. A no-op when the
     * height did not change, so dragging a split costs nothing.
     */
    refreshMargins(): void {
        if (!this.scrollRoot) return;
        if (Math.max(this.scrollRoot.clientHeight, MIN_VIEWPORT_PX) === this.rootHeight) return;
        this.attach(this.scrollRoot);
    }

    /** A scroll restarts the wait on any block that left the margin. */
    onScroll(): void {
        this.anchor.onScroll();
        if (this.leaving.size > 0) this.unloadOnceStill();
    }

    /** An unloaded block for `file`, reserving `height` — or the estimate. */
    add(file: TFile, height?: number): HTMLElement {
        const reserved = height ?? this.estimate();
        const block = this.renderer.createBlock(file);
        this.windows.set(block, {
            file,
            component: null,
            rendering: false,
            unloadWanted: false,
            height: reserved,
        });
        this.markUnloaded(block, reserved);
        this.observe(block);
        return block;
    }

    /**
     * The median of what this vault's notes measured, which beats any constant:
     * note length varies by vault, and every height varies by window width.
     */
    private estimate(): number {
        if (this.measured.length === 0) return ESTIMATED_NOTE_HEIGHT_PX;
        const sorted = [...this.measured].sort((a, b) => a - b);
        return sorted[sorted.length >> 1]!;
    }

    get layoutChanges(): number {
        return this.changes;
    }

    /**
     * The height a rebuilt placeholder should reserve. A rendered block is
     * measured now — its stored height is whatever it last unloaded at.
     */
    heightOf(block: HTMLElement): number | undefined {
        const window = this.windows.get(block);
        if (!window) return undefined;
        return window.component ? this.measure(block) : window.height;
    }

    /** Rebuilds a rendered block's content; an unloaded one renders on re-entry. */
    async refresh(block: HTMLElement): Promise<void> {
        const window = this.windows.get(block);
        if (!window?.component) return;

        this.discard(window);
        block.empty();
        window.component = await this.renderer.renderInto(block, window.file);
    }

    remove(block: HTMLElement): void {
        const window = this.windows.get(block);
        if (!window) return;
        this.unobserve(block);
        this.leaving.delete(block);
        this.discard(window);
        this.windows.delete(block);
    }

    detach(): void {
        this.detachObservers();
        this.unloadOnceStill.cancel();
        this.leaving.clear();
        this.scrollRoot = null;
        for (const window of this.windows.values()) this.discard(window);
        this.windows.clear();
    }

    /**
     * Queues a render of `block` unless it holds content or is rendering. The
     * observer calls it on entry; a caller that needs the content now calls it
     * and drains the queue.
     */
    render(block: HTMLElement): void {
        const window = this.windows.get(block);
        if (!window || window.component) return;
        if (window.rendering) {
            // Back in view before its render finished: honouring the unload it
            // asked for would leave it blank, and an observer reports changes,
            // so no second event would ever come to fill it.
            window.unloadWanted = false;
            return;
        }
        window.rendering = true;

        this.enqueue(async () => {
            try {
                // It flew past before its turn came: rendering it would hold the
                // queue — shared with every vault event — for nothing.
                if (window.unloadWanted) return;

                const component = await this.renderer.renderInto(block, window.file);
                // reload() and rerenderAll() empty the container mid-flight: the
                // block that comes back from the await may be nobody's child.
                if (!block.isConnected || !this.windows.has(block)) {
                    this.renderer.discard(component);
                    block.empty();
                    return;
                }
                window.component = component;
                block.removeClass("is-unloaded");
                block.style.removeProperty("--daily-note-placeholder-height");

                if (window.unloadWanted) this.leave(block);
            } finally {
                this.changes++;
                window.rendering = false;
                window.unloadWanted = false;
            }
        });
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    private unload(block: HTMLElement): void {
        const window = this.windows.get(block);
        if (!window) return;
        if (window.rendering) {
            window.unloadWanted = true;
            return;
        }
        if (!window.component) return;

        this.leave(block);
    }

    private leave(block: HTMLElement): void {
        this.leaving.add(block);
        this.unloadOnceStill();
    }

    private unloadLeaving(): void {
        for (const block of this.leaving) {
            const window = this.windows.get(block);
            // A refresh in flight has no component yet: it waits for the next still scroll.
            if (!window?.component) continue;
            this.unloadNow(block, window);
            this.leaving.delete(block);
        }
    }

    private unloadNow(block: HTMLElement, window: NoteWindow): void {
        // A block that was never laid out measures zero: reserving that would
        // collapse a note the reader has scrolled past, and take the scroll
        // position with it. It keeps what it already reserved.
        const measured = this.measure(block);
        if (measured > 0) {
            window.height = measured;
            this.measured.push(measured);
            if (this.measured.length > MEASUREMENT_WINDOW) this.measured.shift();
        }
        this.discard(window);
        block.empty();
        this.markUnloaded(block, window.height);
        this.changes++;
    }

    /**
     * styles.css turns the custom property into the reserved height. The name
     * is spelled out rather than shared with the clearing site: the compliance
     * rule reads the source text for it (docs/decisions.md, 2026-09-20).
     */
    private markUnloaded(block: HTMLElement, height: number): void {
        block.addClass("is-unloaded");
        block.style.setProperty("--daily-note-placeholder-height", `${height}px`);
    }

    private discard(window: NoteWindow): void {
        if (!window.component) return;
        this.renderer.discard(window.component);
        window.component = null;
    }

    private observe(block: HTMLElement): void {
        this.renderObserver?.observe(block);
        this.unloadObserver?.observe(block);
        this.anchor.observe(block);
    }

    private unobserve(block: HTMLElement): void {
        this.renderObserver?.unobserve(block);
        this.unloadObserver?.unobserve(block);
        this.anchor.unobserve(block);
    }

    private detachObservers(): void {
        this.renderObserver?.disconnect();
        this.unloadObserver?.disconnect();
        this.anchor.detach();
        this.renderObserver = null;
        this.unloadObserver = null;
    }
}
