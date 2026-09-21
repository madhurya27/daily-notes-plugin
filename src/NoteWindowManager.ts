import { Component, TFile } from "obsidian";
import type { NoteRenderer } from "./NoteRenderer";

/**
 * What a block reserves before it has ever been rendered. Wrong by design —
 * the first render replaces it with the measured height.
 */
export const ESTIMATED_NOTE_HEIGHT_PX = 400;

/** Render before a block reaches the viewport... */
const RENDER_MARGIN_PX = 1000;
/** ...and hold it well past the render margin, so an edge block cannot thrash. */
const UNLOAD_MARGIN_PX = 2500;

interface NoteWindow {
    file: TFile;
    /** Non-null exactly while the block holds rendered content. */
    component: Component | null;
    /** Guards against a second render arriving during the first one's await. */
    rendering: boolean;
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
    private renderObserver: IntersectionObserver | null = null;
    private unloadObserver: IntersectionObserver | null = null;

    constructor(
        private readonly renderer: NoteRenderer,
        /**
         * Renders run through the view's queue, like every other mutation
         * (ADR 0004). Its promise is the view's to chain; nothing here waits.
         */
        private readonly enqueue: (task: () => Promise<void>) => unknown,
        /** jsdom lays nothing out, so measurement is the one seam tests replace. */
        private readonly measure: (el: HTMLElement) => number = (el) => el.getBoundingClientRect().height
    ) {}

    attach(scrollRoot: HTMLElement): void {
        this.detachObservers();

        this.renderObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) this.render(entry.target as HTMLElement);
                }
            },
            { root: scrollRoot, rootMargin: `${RENDER_MARGIN_PX}px` }
        );

        this.unloadObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) this.unload(entry.target as HTMLElement);
                }
            },
            { root: scrollRoot, rootMargin: `${UNLOAD_MARGIN_PX}px` }
        );

        for (const block of this.windows.keys()) this.observe(block);
    }

    /** An unloaded block for `file`, reserving `height` until it renders. */
    add(file: TFile, height: number = ESTIMATED_NOTE_HEIGHT_PX): HTMLElement {
        const block = this.renderer.createBlock(file);
        this.windows.set(block, { file, component: null, rendering: false, height });
        this.markUnloaded(block, height);
        this.observe(block);
        return block;
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
        this.discard(window);
        this.windows.delete(block);
    }

    detach(): void {
        this.detachObservers();
        for (const window of this.windows.values()) this.discard(window);
        this.windows.clear();
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    private render(block: HTMLElement): void {
        const window = this.windows.get(block);
        if (!window || window.component || window.rendering) return;
        window.rendering = true;

        this.enqueue(async () => {
            try {
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
            } finally {
                window.rendering = false;
            }
        });
    }

    private unload(block: HTMLElement): void {
        const window = this.windows.get(block);
        if (!window?.component) return;

        window.height = this.measure(block);
        this.discard(window);
        block.empty();
        this.markUnloaded(block, window.height);
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
    }

    private unobserve(block: HTMLElement): void {
        this.renderObserver?.unobserve(block);
        this.unloadObserver?.unobserve(block);
    }

    private detachObservers(): void {
        this.renderObserver?.disconnect();
        this.unloadObserver?.disconnect();
        this.renderObserver = null;
        this.unloadObserver = null;
    }
}
