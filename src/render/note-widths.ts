import type { Component } from "obsidian";

/** What refits a note when its width changes; `NoteWidths` in the view. */
export interface WidthWatch {
    /** Calls `refit` with `el`'s width each time it changes, until `note` unloads. */
    watch(el: HTMLElement, note: Component, refit: (width: number) => void): void;
}

/** A watched element: the width it last had, and what refits it when that changes. */
interface Watched {
    width: number;
    refits: Set<(width: number) => void>;
}

/**
 * Each rendered note's width, through one observer for the view: tables,
 * equations and Bases refit when it changes. A change of height alone, the
 * most of what a note reports, refits nothing.
 */
export class NoteWidths implements WidthWatch {
    private readonly watched = new Map<Element, Watched>();
    /** Made on the first watch: on desktop nothing refits, and none is needed. */
    private observer: ResizeObserver | null = null;

    constructor(view: Component) {
        view.register(() => this.observer?.disconnect());
    }

    watch(el: HTMLElement, note: Component, refit: (width: number) => void): void {
        let watched = this.watched.get(el);
        if (!watched) {
            watched = { width: el.clientWidth, refits: new Set() };
            this.watched.set(el, watched);
            this.observer ??= new ResizeObserver((entries) => this.refit(entries));
            this.observer.observe(el);
        }
        watched.refits.add(refit);
        note.register(() => this.unwatch(el, refit));
    }

    private refit(entries: ResizeObserverEntry[]): void {
        for (const { target } of entries) {
            const watched = this.watched.get(target);
            // Laid out at nothing, hidden far off (ADR 0023): no width to fit, and back at its own, none changed.
            if (!watched || target.clientWidth === 0 || target.clientWidth === watched.width) continue;
            watched.width = target.clientWidth;
            for (const refit of watched.refits) refit(watched.width);
        }
    }

    private unwatch(el: HTMLElement, refit: (width: number) => void): void {
        // Each refit is a fresh closure, registered once: its note unwatches it once.
        const watched = this.watched.get(el)!;
        watched.refits.delete(refit);
        if (watched.refits.size > 0) return;
        this.watched.delete(el);
        this.observer?.unobserve(el);
    }
}
