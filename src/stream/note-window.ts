import { Component, TFile, debounce, type Debouncer } from "obsidian";
import type { NoteRenderer } from "../render/note-renderer";
import type { NoteHeights } from "./note-heights";
import { SCROLL_IDLE_MS, ScrollAnchor } from "./scroll-anchor";
import { HeightHold, SETTLE_MS } from "./height-hold";

/**
 * What a block reserves before anything was measured at this layout. A guess
 * only until the first note is, after which the vault's own notes say.
 */
export const ESTIMATED_NOTE_HEIGHT_PX = 400;

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
    /** `height` was measured, here or in an earlier session, rather than guessed. */
    measured: boolean;
    /** Holds the rendered note at `height` until it settles; null once let go. */
    hold: HeightHold | null;
    /** What the settling watch observes: the block and what was rendered in it. */
    watched: Element[];
    /** Remembers the height once the rendered note stops resizing; null while unloaded. */
    keepOnceSettled: Debouncer<[], void> | null;
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
    /** The layout heights are read and kept in, until the task reading it ends. */
    private currentLayout: string | null = null;
    /** The height the current margins were computed from. */
    private rootHeight = 0;
    /** Rendered blocks past the unload margin, waiting for the scroll to be still. */
    private readonly leaving = new Set<HTMLElement>();
    private readonly unloadOnceStill = debounce(() => this.unloadLeaving(), SCROLL_IDLE_MS, true);
    /** Watches rendered notes: a Base filling or an image loading measures short until done. */
    private resizes: ResizeObserver | null = null;

    constructor(
        private readonly renderer: NoteRenderer,
        /**
         * Renders run through the stream's queue, like every other mutation
         * (ADR 0004). Its promise is the view's to chain; nothing here waits.
         */
        private readonly enqueue: (task: () => Promise<void>) => unknown,
        /** Every height measured, kept across sessions (ADR 0010). */
        private readonly heights: NoteHeights,
        /** The layout the stream is laid out in now: a height is true only there. */
        private readonly layoutOf: () => string,
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
        this.resizes = new ResizeObserver((entries) => {
            for (const entry of entries) this.windowOf(entry.target)?.keepOnceSettled?.();
        });

        for (const [block, window] of this.windows) {
            this.observe(block);
            for (const el of window.watched) this.resizes.observe(el);
        }
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

    /** The reader touched `target`: collapsing a section is their own change, which no hold may keep. */
    onTouch(target: EventTarget | null): void {
        const window = this.windowOf(target);
        if (window) this.releaseHold(window);
    }

    /** Glides the pane to its top, the newest note. */
    scrollToTop(): void {
        this.anchor.headForTop();
        this.scrollRoot?.scrollTo({ top: 0, behavior: "smooth" });
    }

    /** An unloaded block for `file`, reserving what it last measured, or the estimate. */
    add(file: TFile): HTMLElement {
        const layout = this.layout();
        const remembered = this.heights.heightOf(layout, file.path);
        const reserved = remembered ?? this.heights.estimate(layout) ?? ESTIMATED_NOTE_HEIGHT_PX;
        const block = this.renderer.createBlock(file);
        this.windows.set(block, {
            file,
            component: null,
            rendering: false,
            unloadWanted: false,
            height: reserved,
            measured: remembered !== undefined,
            hold: null,
            watched: [],
            keepOnceSettled: null,
        });
        this.markUnloaded(block, reserved);
        this.observe(block);
        return block;
    }

    /**
     * Read once per task: reading it lays the stream out, and a batch appends
     * a block between one add and the next.
     */
    private layout(): string {
        if (this.currentLayout === null) {
            this.currentLayout = this.layoutOf();
            queueMicrotask(() => (this.currentLayout = null));
        }
        return this.currentLayout;
    }

    get layoutChanges(): number {
        return this.changes;
    }

    /** The scroll was just set to a place, for the stream as it now stands. */
    placed(): void {
        this.anchor.placed();
    }

    /** Rebuilds a rendered block's content; an unloaded one renders on re-entry. */
    async refresh(block: HTMLElement): Promise<void> {
        const window = this.windows.get(block);
        if (!window?.component) return;

        this.measureInto(block, window);
        this.stopSettling(window);
        this.discard(window);
        block.empty();
        window.component = await this.renderer.renderInto(block, window.file);
        this.watchSettling(block, window);
    }

    remove(block: HTMLElement): void {
        const window = this.windows.get(block);
        if (!window) return;
        this.unobserve(block);
        this.leaving.delete(block);
        this.stopSettling(window);
        this.discard(window);
        this.windows.delete(block);
    }

    detach(): void {
        this.detachObservers();
        this.unloadOnceStill.cancel();
        this.leaving.clear();
        this.scrollRoot = null;
        for (const window of this.windows.values()) {
            this.stopSettling(window);
            this.discard(window);
        }
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
                this.watchSettling(block, window);

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

    /**
     * A block that was never laid out measures zero: reserving that would
     * collapse a note the reader has scrolled past, and take the scroll
     * position with it. It keeps what it already reserved.
     */
    private unloadNow(block: HTMLElement, window: NoteWindow): void {
        this.stopSettling(window);
        this.measureInto(block, window);
        this.discard(window);
        block.empty();
        this.markUnloaded(block, window.height);
        this.changes++;
    }

    /**
     * Held, the block cannot shrink, so a dip shows only in what was rendered
     * in it: that is watched too.
     */
    private watchSettling(block: HTMLElement, window: NoteWindow): void {
        if (window.measured) window.hold = new HeightHold(block, window.height);
        window.keepOnceSettled = debounce(() => this.keepHeight(block, window), SETTLE_MS, true);
        window.keepOnceSettled();
        window.watched = [block, ...Array.from(block.children)];
        for (const el of window.watched) this.resizes?.observe(el);
    }

    private stopSettling(window: NoteWindow): void {
        this.releaseHold(window);
        window.keepOnceSettled?.cancel();
        window.keepOnceSettled = null;
        for (const el of window.watched) this.resizes?.unobserve(el);
        window.watched = [];
    }

    private releaseHold(window: NoteWindow): void {
        window.hold?.release();
        window.hold = null;
    }

    /** The note `target` is in, or is. */
    private windowOf(target: EventTarget | null): NoteWindow | undefined {
        const block = target instanceof Element ? target.closest<HTMLElement>(".daily-note-block") : null;
        return block ? this.windows.get(block) : undefined;
    }

    /**
     * What the block lays out at now, as the height it reserves and holds. A
     * block never laid out measures zero and keeps what it had.
     */
    private measureInto(block: HTMLElement, window: NoteWindow): void {
        const measured = this.measure(block);
        if (measured <= 0) return;
        window.height = measured;
        window.measured = true;
    }

    /** A block not laid out, in a hidden tab, measures zero: nothing to remember. */
    private keepHeight(block: HTMLElement, window: NoteWindow): void {
        this.releaseHold(window);
        const measured = this.measure(block);
        if (measured > 0) this.heights.keep(this.layout(), window.file.path, measured);
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
        this.resizes?.disconnect();
        this.renderObserver = null;
        this.unloadObserver = null;
        this.resizes = null;
    }
}
