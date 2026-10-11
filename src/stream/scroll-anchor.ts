import { Platform, debounce } from "obsidian";
import { BASE_SLOT_CLASS } from "../render/bases/bases-as-cards";
import { blockAt } from "./stream-blocks";

/** How long the scroll is still before the stream counts it stopped (D-032). */
export const SCROLL_IDLE_MS = 300;

/** From a block down to an element, each where it was drawn in the pane, and how tall. */
type Place = { el: Element; top: number; height: number }[];

/**
 * Holds the reader's place where the platform does not: Chromium anchors the
 * scroll itself, iOS WebKit not at all. The place is the element at the pane's
 * top; whatever moves it lies above, beyond the reader's touch, so it is
 * undone. A chevron tapped on screen changes only what is below.
 *
 * A change is drawn as a shift of the stream first, and handed to the scroll
 * once the scroll is still: mid-glide iOS drops or undoes a scroll write, and
 * plain writes jumped on a phone.
 */
export class ScrollAnchor {
    private observer: ResizeObserver | null = null;
    private scrollRoot: HTMLElement | null = null;
    /** What the blocks sit in, shifted while anything is owed. */
    private stream: HTMLElement | null = null;
    /** The blocks watched. */
    private readonly watched = new Set<Element>();
    /** Watched blocks whose size goes unobserved: they resize only when re-pinned, and are told of. */
    private readonly pins = new Set<Element>();
    /**
     * From a block down to the element at the pane's top, each where it was
     * drawn. A re-render may replace the deeper ones: the deepest left stands in.
     */
    private place: Place = [];
    /**
     * The same from the first element starting inside the pane, held instead
     * once the pane's width changes (D-057).
     */
    private reflowPlace: Place = [];
    /** What the Base the pane's top crosses draws: it fills in after drawing, inside a box held open. */
    private drawnBase: Element | null = null;
    /** The scroll `place` was read at: a script may move it before a resize reports. */
    private placeScroll = 0;
    /** The pane's width `place` was read at. */
    private placeWidth = 0;
    /** What was owed when `place` was read: a reflow reads it no more until handed over. */
    private placeOwed = 0;
    /**
     * The width changed since the last hand-over: the text reflows over
     * several frames, and `reflowPlace`, as read before, is held through all
     * of them. Re-read mid-reflow, it was whatever was being redrawn.
     */
    private reflowing = false;
    /** What the scroll owes the content, drawn as a shift until the scroll stops. */
    private owed = 0;
    /** The blocks' parent, shifted while `owed` is. */
    private shifted: HTMLElement | null = null;
    /** A scroll to the top is under way; nothing above it is owed. */
    private headedForTop = false;
    /** The scroll went past the top: iOS bounces a glide that runs out of scroll there. */
    private bouncing = false;
    /** A finger is on the pane: a bounce under it reads the top for a frame, and goes on. */
    private touching = false;
    private readonly settleOnceStill = debounce(() => this.settle(), SCROLL_IDLE_MS, true);
    /** Every note is loaded: nothing comes below the stream's end to fill what a shift draws past it. */
    private loadedToEnd!: () => boolean;

    /** Holds the place of `stream`'s blocks, scrolled in `scrollRoot`. */
    attach(scrollRoot: HTMLElement, stream: HTMLElement, loadedToEnd: () => boolean): void {
        this.detach();
        this.loadedToEnd = loadedToEnd;
        // iOS WebKit parses overflow-anchor, so CSS.supports says yes, and
        // anchors nothing: a phone's trace showed this never switched on.
        if (!Platform.isIosApp && CSS.supports("overflow-anchor", "auto")) return;
        this.scrollRoot = scrollRoot;
        this.stream = stream;
        this.placeWidth = scrollRoot.clientWidth;
        // styles.css: overflow-anchor none, so no half-working native anchoring
        // corrects a second time.
        scrollRoot.addClass("is-scroll-anchored");
        this.observer = new ResizeObserver(() => this.hold());
    }

    observe(block: HTMLElement): void {
        if (!this.observer) return;
        this.observer.observe(block);
        this.watched.add(block);
    }

    unobserve(block: HTMLElement): void {
        this.observer?.unobserve(block);
        this.watched.delete(block);
        this.pins.delete(block);
    }

    /**
     * `block` resizes only when re-pinned, through `resized()` (ADR 0013).
     * Its own report would come a round after the content's that caused it,
     * and WebKit logs that as an error.
     */
    pinned(block: HTMLElement): void {
        if (!this.watched.has(block)) return;
        this.pins.add(block);
        this.observer?.unobserve(block);
    }

    /** Unloaded, or laid out at nothing: `block` resizes untold again. */
    unpinned(block: HTMLElement): void {
        if (this.pins.delete(block)) this.observer?.observe(block);
    }

    /** What a note rendered: a held note hides a change inside it. */
    observeContent(el: Element): void {
        this.observer?.observe(el);
    }

    unobserveContent(el: Element): void {
        this.observer?.unobserve(el);
    }

    /**
     * A block resized in this task. Owed now, drawn in the frame it changed:
     * mid-glide iOS paints a resize before reporting it (ADR 0013).
     */
    resized(): void {
        if (this.scrollRoot) this.hold();
    }

    /**
     * The blocks above the place are about to move it by `moved`: drawn now,
     * before a layout reads the stream shortened and clamps the scroll. Told
     * of the resize after, the anchor finds nothing more owed (ADR 0015).
     */
    anticipate(moved: number): void {
        const stream = this.stream;
        if (!this.scrollRoot || !stream || moved === 0) return;
        this.owed += moved;
        this.shift(stream);
        this.settleOnceStill();
    }

    fingerDown(): void {
        this.touching = true;
    }

    /** A finger lifted past the top dragged the stream back: what follows is no bounce, and may be a glide. */
    fingerUp(): void {
        this.touching = false;
        if (this.scrollRoot && this.scrollRoot.scrollTop >= 0) this.bouncing = false;
    }

    /** The scroll is still now: what is owed goes to it at once, not once still again. */
    handOver(): void {
        if (!this.scrollRoot) return;
        this.settleOnceStill.cancel();
        this.settle();
    }

    /**
     * A scroll moves the place, and puts off the hand-over until it stops. A
     * bounce at the top ends a glide: handed over then, not once still, a flick
     * meanwhile finds room above. Mid-bounce, iOS undoes a write, a finger's
     * bounce included: it ends once the finger lifts. A glide
     * about to bring the stream's top, drawn lower than its scroll, into the
     * pane stops at it, short of the blank above.
     */
    onScroll(): void {
        if (!this.scrollRoot) return;
        // Since the place was read, at the last scroll or the anchor's own write: a glide's
        // step. A clamp to the stream's end is none.
        const moved = this.clamped() ? 0 : this.placeScroll - this.scrollRoot.scrollTop;
        this.hold();
        const bounced = this.bouncing && this.scrollRoot.scrollTop >= 0 && !this.touching;
        this.bouncing = this.scrollRoot.scrollTop < 0 || (this.bouncing && this.touching);
        if (this.owed !== 0 && bounced) this.handOver();
        else if (this.owed !== 0 && this.topDueInView(moved)) this.stopGlide();
        else if (this.owed !== 0) this.settleOnceStill();
        else if (this.scrollRoot.scrollTop === 0) this.headedForTop = false;
    }

    /**
     * Stops a glide with the stream's top at the pane's: its last step, short.
     * iOS carries a glide on from a write, undoing it the next frame; with
     * nothing to scroll for that frame, the glide ends where the write puts it.
     */
    private stopGlide(): void {
        const root = this.scrollRoot!;
        root.addClass("is-scroll-frozen");
        requestAnimationFrame(() => root.removeClass("is-scroll-frozen"));
        this.settleOnceStill.cancel();
        root.scrollTop = 0;
        this.headedForTop = false;
        this.unshift();
        this.pick();
    }

    /**
     * The stream, drawn lower than its scroll, starts inside the pane within
     * two more steps of `moved`: what is above it is blank. Stopped once in
     * view, iOS had drawn it a frame past already; a dropped frame doubles a step.
     */
    private topDueInView(moved: number): boolean {
        const stream = this.stream;
        return this.owed < 0 && !!stream && this.topInPane(stream) + 2 * Math.max(moved, 0) >= 0;
    }

    /**
     * The scroll is on its way to the top. Blocks above the reader grow on the
     * way, and handing that over on arrival would stop short of the top.
     */
    headForTop(): void {
        this.headedForTop = true;
    }

    /**
     * The scroll was just set for the layout as it stands, as Back sets it:
     * what changed before is in it, though a report of it lands a frame later.
     */
    placed(): void {
        this.settleOnceStill.cancel();
        this.unshift();
        this.pick();
    }

    detach(): void {
        this.settleOnceStill.cancel();
        this.observer?.disconnect();
        this.observer = null;
        this.watched.clear();
        this.pins.clear();
        this.drawnBase = null;
        this.bouncing = false;
        this.touching = false;
        this.place = [];
        this.scrollRoot?.removeClass("is-scroll-anchored");
        this.scrollRoot = null;
        this.stream = null;
        this.unshift();
    }

    /** Something resized: the shift moves the place back. */
    private hold(): void {
        if (this.owe()) this.settleOnceStill();
        if (this.reflowing) this.watchBase();
        else this.pick();
    }

    /**
     * Owes how far the place moved since it was read, less any scroll. Run
     * before every re-read: its layout may hold a change no resize reported yet.
     */
    private owe(): boolean {
        if (this.scrollRoot!.clientWidth !== this.placeWidth && !this.reflowing) {
            this.reflowing = true;
            this.settleOnceStill();
            // A turn's scroll is none of the reader's: a pane turned taller clamps
            // it, and the stream may grow back before the clamp is read (D-101).
            this.placeScroll = this.scrollRoot!.scrollTop;
        }
        const place = this.reflowing ? this.reflowPlace : this.place;
        const point = [...place].reverse().find(({ el }) => this.scrollRoot!.contains(el));
        // A clamp is none of the reader's, then or once the stream grows back.
        if (this.clamped()) this.placeScroll = this.scrollRoot!.scrollTop;
        const scrolled = this.scrollRoot!.scrollTop - this.placeScroll;
        // The shift since the place was read moved it too: what is owed is the rest.
        const drift = this.owed - this.placeOwed;
        const moved = point ? this.movedSince(point, scrolled + drift) - drift : 0;
        if (moved === 0) return false;
        this.owed += moved;
        // Past the end, the place is lost once handed over all the same.
        if (this.loadedToEnd()) this.owed = Math.min(this.owed, this.below());
        this.shift(this.stream!);
        return true;
    }

    /**
     * What is drawn at the pane's top, past anything over the stream, up to its
     * block. Not inside anything held: its text is not yet where it will be.
     * Not inside a Base: what it draws re-flows and is redrawn whole.
     */
    private pick(): void {
        this.place = [];
        this.reflowPlace = [];
        const stream = this.stream;
        if (!stream) return;
        const pane = this.scrollRoot!.getBoundingClientRect();
        this.placeScroll = this.scrollRoot!.scrollTop;
        this.placeWidth = this.scrollRoot!.clientWidth;
        this.placeOwed = this.owed;
        const drawn = document
            .elementsFromPoint(pane.left + pane.width / 2, pane.top + 1)
            .find((el) => el !== stream && stream.contains(el));
        const crossing = drawn ?? blockAt(stream, pane.top);
        if (!crossing) return;

        this.place = this.placeOf(stream, crossing);
        this.watchBase();
        // Held by how far through it the pane's top is, reflowing or not.
        if (this.place.some(({ el }) => el.hasClass(BASE_SLOT_CLASS))) {
            this.reflowPlace = this.place;
            return;
        }
        const starting = this.startingIn(pane, stream, crossing);
        this.reflowPlace = starting === crossing ? this.place : this.placeOf(stream, starting);
    }

    /** From `el`'s block down to it, each where it is drawn, stopping at anything held or a Base. */
    private placeOf(stream: HTMLElement, el: Element): Place {
        const path: Element[] = [];
        for (let at: Element | null = el; at && at !== stream; at = at.parentElement) path.unshift(at);
        const place: Place = [];
        for (const at of path) {
            place.push({ el: at, top: this.topInPane(at), height: this.heightOf(at) });
            if (at.hasClass(BASE_SLOT_CLASS)) break;
            if ((at as HTMLElement).style.getPropertyValue("--daily-note-held-height")) break;
        }
        return place;
    }

    /** How far the scroll can go on down. */
    private below(): number {
        const root = this.scrollRoot!;
        return root.scrollHeight - root.clientHeight - root.scrollTop;
    }

    /**
     * The browser pulled the scroll back to the stream's new end: the stream
     * shrank by more than lay below the pane, as below a note jumped to. The
     * reader never scrolls up onto the end.
     */
    private clamped(): boolean {
        return this.scrollRoot!.scrollTop < this.placeScroll && this.below() <= 1;
    }

    /**
     * How far `point` moved, less `scrolled`. A Base the pane's top crosses is
     * held as far through as it was: redrawn between cards and a table, its
     * entries keep their order, not their height (D-056).
     */
    private movedSince(point: Place[number], scrolled: number): number {
        const now = this.topInPane(point.el) + scrolled;
        const crossed = point.top < 0 && point.top + point.height > 0;
        if (!crossed || !point.el.hasClass(BASE_SLOT_CLASS)) return now - point.top;
        const through = -point.top / point.height;
        return now + through * this.heightOf(point.el);
    }

    /** A Base is as tall as what it draws, not the box held open for it. */
    private heightOf(el: Element): number {
        const drawn = el.hasClass(BASE_SLOT_CLASS) ? (el.lastElementChild ?? el) : el;
        return drawn.getBoundingClientRect().height;
    }

    /** Hears the Base the pane's top crosses fill in, which resizes nothing watched while it is held. */
    private watchBase(): void {
        const base = this.place.find(({ el }) => el.hasClass(BASE_SLOT_CLASS))?.el;
        const drawn = base?.lastElementChild ?? null;
        if (drawn === this.drawnBase) return;
        if (this.drawnBase) this.observer!.unobserve(this.drawnBase);
        this.drawnBase = drawn;
        if (drawn) this.observer!.observe(drawn);
    }

    /**
     * Measured from the pane, not the window: a phone turned on its side hides
     * the status bar, moving the pane and all it holds.
     */
    private topInPane(el: Element): number {
        return el.getBoundingClientRect().top - this.scrollRoot!.getBoundingClientRect().top;
    }

    /**
     * The first block after `crossing`, or after an ancestor, that starts
     * inside the pane: the paragraph or note title below the text crossing the
     * top. Not a span inside text, which reflows with it. `crossing` when the
     * next one starts past the pane.
     */
    private startingIn(pane: DOMRect, stream: HTMLElement, crossing: Element): Element {
        for (let el: Element | null = crossing; el && el !== stream; el = el.parentElement) {
            if (getComputedStyle(el).display.startsWith("inline")) continue;
            const next = this.nextDrawn(el);
            if (!next) continue;
            const { top } = next.getBoundingClientRect();
            if (top >= pane.bottom) return crossing;
            if (top >= pane.top) return next;
        }
        return crossing;
    }

    /** The next sibling that takes up space: a collapsed section's does not. */
    private nextDrawn(el: Element): Element | null {
        let next = el.nextElementSibling;
        while (next && next.getBoundingClientRect().height === 0) next = next.nextElementSibling;
        return next;
    }

    /**
     * The scroll takes the shift over, in the same frame. Nothing owed writes
     * nothing: a write of the same value still stops a glide under way.
     */
    private settle(): void {
        const root = this.scrollRoot!;
        this.owe();
        if (this.owed !== 0 && !(this.headedForTop && root.scrollTop === 0)) root.scrollTop += this.owed;
        this.headedForTop = false;
        this.unshift();
        this.pick();
    }

    /**
     * styles.css turns the custom property into a transform, which moves what
     * is drawn and leaves the scroll alone. The names are spelled out at both
     * sites: the compliance rule reads the source text for them.
     */
    private shift(content: HTMLElement): void {
        this.shifted = content;
        content.addClass("is-scroll-shifted");
        content.style.setProperty("--daily-notes-scroll-shift", `${-this.owed}px`);
    }

    /** Drops the debt, and the reflow it came from. */
    private unshift(): void {
        this.reflowing = false;
        this.owed = 0;
        this.shifted?.removeClass("is-scroll-shifted");
        this.shifted?.style.removeProperty("--daily-notes-scroll-shift");
        this.shifted = null;
    }
}
