import { Component, TFile, debounce, type Debouncer } from "obsidian";
import type { NoteRenderer } from "../render/note-renderer";
import type { NoteHeights } from "./note-heights";
import { SCROLL_IDLE_MS, ScrollAnchor } from "./scroll-anchor";
import { HeightHold, SETTLE_MS } from "./height-hold";
import { Reservations, type Reserving } from "./reservations";

/**
 * What a block reserves before anything was measured at this layout, in panes:
 * too tall is safe (D-092), and the notes on screen are measured within moments.
 */
export const UNMEASURED_PANES = 2;

/**
 * Both margins are viewports, not pixels: how far ahead of the reader the
 * stream works is the same question on a phone and on a tall monitor.
 */
const RENDER_VIEWPORTS = 1.5;
/** Well past the render margin, so a block on the edge cannot thrash. */
const UNLOAD_VIEWPORTS = 4;
/** A pane dragged to nothing, or a root not laid out yet, still gets a window. */
const MIN_VIEWPORT_PX = 400;

interface NoteWindow extends Reserving {
    /** Non-null exactly while the block holds rendered content. */
    component: Component | null;
    /** Guards against a second render arriving during the first one's await. */
    rendering: boolean;
    /**
     * The block left while its render was queued or in flight. An observer
     * reports changes, so this is the only unload it will get until it comes
     * back into view — honoring it later is what keeps a fast scroll from
     * leaving rendered notes behind.
     */
    unloadWanted: boolean;
    /** Holds the rendered note at `height` until it settles; null once let go. */
    hold: HeightHold | null;
    /** What was rendered in the block. */
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
    private readonly reserveOnceStill = debounce(() => this.reserve(), SCROLL_IDLE_MS, true);
    private readonly reservations: Reservations;
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
        private readonly measure: (el: HTMLElement) => number = (el) => el.getBoundingClientRect().height,
        /** What a note not measured at a layout reserves there: by default, what the vault's notes measured (D-092). */
        estimate: (layout: string) => number | undefined = (layout) => heights.estimate(layout)
    ) {
        this.reservations = new Reservations(heights, estimate);
    }

    /** `stream` holds the blocks; `loadedToEnd`: every note is loaded, and nothing comes below its end. */
    attach(scrollRoot: HTMLElement, stream: HTMLElement, loadedToEnd: () => boolean): void {
        this.detachObservers();
        this.scrollRoot = scrollRoot;
        this.observeMargins(scrollRoot);
        // Made before the anchor's, so it hears a report first: reports run in
        // that order, and the anchor must read each note re-pinned.
        this.resizes = new ResizeObserver((entries) => this.contentResized(entries.map(({ target }) => target)));
        this.anchor.attach(scrollRoot, stream, loadedToEnd);

        for (const [block, window] of this.windows) {
            this.observe(block);
            if (block.hasClass("is-pinned")) this.anchor.pinned(block);
            this.watch(window.watched);
        }
    }

    /** The margins are viewports of the pane's height, taken now. */
    private observeMargins(scrollRoot: HTMLElement): void {
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
    }

    /** Obsidian reports a pane dragged or a device turned. */
    onResize(): void {
        this.refreshMargins();
        this.expectLayout();
        this.reserveOnceStill();
    }

    /**
     * Rebuilds the margins against the pane's new height. A no-op when the
     * height did not change, so dragging a split costs nothing. The anchor
     * stays (D-055).
     */
    private refreshMargins(): void {
        if (!this.scrollRoot) return;
        if (Math.max(this.scrollRoot.clientHeight, MIN_VIEWPORT_PX) === this.rootHeight) return;
        this.renderObserver?.disconnect();
        this.unloadObserver?.disconnect();
        this.observeMargins(this.scrollRoot);
        for (const block of this.windows.keys()) {
            this.renderObserver!.observe(block);
            this.unloadObserver!.observe(block);
        }
    }

    /**
     * The heights were emptied: every unloaded note, measured or not, reserves
     * as in a session that never measured, once the scroll is still.
     */
    forgetHeights(): void {
        const layout = this.layout();
        for (const window of this.windows.values()) {
            if (window.component) continue;
            window.height = this.unmeasured();
            this.reservations.expect(window, layout);
        }
        this.reserveOnceStill();
    }

    private unmeasured(): number {
        return UNMEASURED_PANES * Math.max(this.rootHeight, MIN_VIEWPORT_PX);
    }

    /** A scroll restarts the wait on any block that left the margin. */
    onScroll(): void {
        this.anchor.onScroll();
        if (this.leaving.size > 0) this.unloadOnceStill();
        if (this.reservations.owed) this.reserveOnceStill();
    }

    /** A Base in a note set its height: the note re-pins in this task (D-108). */
    onBaseResized(target: EventTarget | null): void {
        this.contentResized([target]);
    }

    /** A touch is the reader's own change, such as a collapse: no hold keeps it. */
    onTouch(target: EventTarget | null): void {
        const window = this.windowOf(target);
        if (window) this.releaseHold(window);
    }

    onFingerDown(): void {
        this.anchor.fingerDown();
    }

    onFingerUp(): void {
        this.anchor.fingerUp();
    }

    /** Glides the pane to its top, the newest note. */
    scrollToTop(): void {
        this.anchor.headForTop();
        this.scrollRoot?.scrollTo({ top: 0, behavior: "smooth" });
    }

    /** An unloaded block for `file`, reserving what it last measured, or the estimate. */
    add(file: TFile): HTMLElement {
        const block = this.renderer.createBlock(file);
        const window: NoteWindow = {
            file,
            component: null,
            rendering: false,
            unloadWanted: false,
            height: this.unmeasured(),
            measured: false,
            hold: null,
            watched: [],
            keepOnceSettled: null,
        };
        this.windows.set(block, window);
        this.reservations.add(window, this.layout());
        this.markUnloaded(block, window.height);
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

    /** What the anchor owes goes to the scroll now, and the notes are drawn where it puts them. */
    handOver(): void {
        this.anchor.handOver();
    }

    /**
     * Rebuilds a rendered block's content. An unloaded one renders on re-entry,
     * and meanwhile is estimated afresh once the scroll is still: the edit took
     * its stored height (ADR 0017).
     */
    async refresh(block: HTMLElement): Promise<void> {
        const window = this.windows.get(block);
        if (!window) return;
        if (!window.component) {
            if (window.rendering) return;
            this.reservations.expect(window, this.layout());
            this.reserveOnceStill();
            return;
        }

        this.measureInto(block, window);
        this.stopSettling(window);
        this.discard(window);
        block.empty();
        // Without a component meanwhile, a note coming into view would be drawn twice.
        window.rendering = true;
        try {
            const { component, footer } = await this.renderer.renderInto(block, window.file);
            window.component = component;
            this.watchSettling(block, window, footer);
            this.repin(block);
            if (window.unloadWanted) this.leave(block);
        } finally {
            window.rendering = false;
            window.unloadWanted = false;
        }
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
        this.reserveOnceStill.cancel();
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
            // Back in view before its render finished: honoring the unload it
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

                const { component, footer } = await this.renderer.renderInto(block, window.file);
                // close() empties the container mid-flight, off the queue: the
                // block that comes back from the await may be nobody's child.
                if (!block.isConnected || !this.windows.has(block)) {
                    this.renderer.discard(component);
                    block.empty();
                    return;
                }
                window.component = component;
                block.removeClass("is-unloaded");
                block.style.removeProperty("--daily-note-placeholder-height");
                this.watchSettling(block, window, footer);
                this.repin(block);

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
        this.unpin(block);
        this.markUnloaded(block, window.height);
        this.changes++;
    }

    /**
     * A height is true only at the width it was measured at: on a new one,
     * nothing is held at the old one, and a note rendering again is held at
     * what it measured at the new one. Placeholders take it once the scroll is
     * still. The same width rereads nothing.
     */
    private expectLayout(): void {
        const layout = this.layout();
        if (!this.reservations.expectLayout(layout)) return;
        for (const window of this.windows.values()) {
            this.releaseHold(window);
            if (!window.component) this.reservations.expect(window, layout);
        }
    }

    /**
     * Each unloaded note reserves what it is now expected at: its height at a
     * new width, or an estimate grown wiser since. The anchor draws the notes
     * above the pane moving first, which keeps the scroll range (ADR 0015).
     */
    private reserve(): void {
        const root = this.scrollRoot;
        if (!root) return;
        const unloaded = [...this.windows].filter(([, window]) => !window.component && !window.rendering);
        const plan = this.reservations.plan(
            unloaded,
            this.layout(),
            root.getBoundingClientRect().top,
            root.scrollHeight - root.scrollTop - root.clientHeight
        );
        if (!plan || plan.changed.length === 0) return;
        this.anchor.anticipate(plan.movedAbove);
        for (const [block, window] of plan.changed) this.markUnloaded(block, window.height);
        this.changes++;
        this.anchor.resized();
        // Run only once the scroll is still; put off, a scroll begun meanwhile
        // carries the shift to the top (ADR 0015).
        this.anchor.handOver();
    }

    /**
     * Held, the block cannot shrink: a dip shows only in what was rendered in
     * it. Settling starts once `footer` is drawn: the linked mentions read
     * other notes first, and a quiet spell while they do is not settled.
     */
    private watchSettling(block: HTMLElement, window: NoteWindow, footer: Promise<void>): void {
        if (window.measured) {
            const hold = new HeightHold(block, window.height, () => {
                // Let go while the note stays: the pin hid the drop until now.
                if (window.hold !== hold) return;
                window.hold = null;
                this.repin(block);
            });
            window.hold = hold;
        }
        window.watched = Array.from(block.children);
        this.watch(window.watched);
        const { component } = window;
        void footer.then(() => {
            // Unloaded or re-rendered while the footer drew: that render settles itself.
            if (window.component !== component) return;
            window.keepOnceSettled = debounce(() => this.keepHeight(block, window), SETTLE_MS, true);
            window.keepOnceSettled();
        });
    }

    private watch(rendered: Element[]): void {
        for (const el of rendered) {
            this.resizes?.observe(el);
            this.anchor.observeContent(el);
        }
    }

    /** Emptied or refilled next: its hold goes, and the pin keeps the height meanwhile. */
    private stopSettling(window: NoteWindow): void {
        const { hold } = window;
        window.hold = null;
        hold?.release();
        window.keepOnceSettled?.cancel();
        window.keepOnceSettled = null;
        for (const el of window.watched) {
            this.resizes?.unobserve(el);
            this.anchor.unobserveContent(el);
        }
        window.watched = [];
    }

    /** Lets go of the hold, and the block takes its own height. */
    private releaseHold(window: NoteWindow): void {
        window.hold?.release();
    }

    /** The note `target` is in, or is. */
    private windowOf(target: EventTarget | null): NoteWindow | undefined {
        const block = this.blockOf(target);
        return block ? this.windows.get(block) : undefined;
    }

    /** Re-pins each rendered note something in resized. */
    private contentResized(targets: (EventTarget | null)[]): void {
        for (const block of new Set(targets.map((target) => this.blockOf(target)))) {
            const window = block ? this.windows.get(block) : undefined;
            if (!block || !window) continue;
            if (window.component) this.repin(block);
            window.keepOnceSettled?.();
        }
    }

    private blockOf(target: EventTarget | null): HTMLElement | null {
        return target instanceof Element ? target.closest<HTMLElement>(".daily-note-block") : null;
    }

    /**
     * Pins `block` at the height it lays out at, and tells the anchor in the
     * same task if that changed. Nothing rendering inside a pinned block moves
     * the stream: mid-glide iOS paints a resize before reporting it, and the
     * shift would land a frame late (ADR 0013). A block laid out at nothing,
     * in a hidden tab, stays unpinned.
     */
    private repin(block: HTMLElement): void {
        const before = block.style.getPropertyValue("--daily-note-pinned-height");
        block.style.removeProperty("--daily-note-pinned-height");
        const height = this.measure(block);
        if (height > 0) block.style.setProperty("--daily-note-pinned-height", `${height}px`);
        block.toggleClass("is-pinned", height > 0);
        if (height > 0) this.anchor.pinned(block);
        else this.anchor.unpinned(block);
        if (block.style.getPropertyValue("--daily-note-pinned-height") !== before) this.anchor.resized();
    }

    private unpin(block: HTMLElement): void {
        this.anchor.unpinned(block);
        block.removeClass("is-pinned");
        block.style.removeProperty("--daily-note-pinned-height");
    }

    /** Takes the block's height now; one never laid out measures zero and keeps what it had. */
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
        // What the rest reserve may have changed; they take it at the next rest (ADR 0014).
        if (this.reservations.owed) this.reserveOnceStill();
    }

    /**
     * styles.css turns the custom property into the reserved height. The name
     * is spelled out rather than shared with the clearing site: the compliance
     * rule reads the source text for it (D-003).
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
