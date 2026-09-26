import { Platform, debounce } from "obsidian";

/** How long the scroll is still before the stream counts it stopped (docs/decisions.md, 2026-09-23). */
export const SCROLL_IDLE_MS = 300;

/**
 * Holds the reader's place when something above the pane's top changes height
 * — a placeholder rendering at its real height, a Base filling — where the
 * platform does not. Chromium anchors the scroll itself; iOS WebKit has no
 * scroll anchoring, so there the text jumped by the difference.
 *
 * The place is the deepest element the pane's top crosses: whatever moves it
 * lies above the pane, where the reader can touch nothing, so it is undone. A
 * chevron tapped on screen changes only what lies below.
 *
 * A change is drawn as a shift of the stream first, and handed to the scroll
 * once the scroll is still: mid-glide iOS drops or undoes a scroll write, and
 * plain writes jumped on a phone.
 */
export class ScrollAnchor {
    private observer: ResizeObserver | null = null;
    private scrollRoot: HTMLElement | null = null;
    /** The blocks watched, in the order they were added: their parent is the stream. */
    private readonly watched = new Set<Element>();
    /**
     * From a block down to the deepest element the pane's top crosses, each
     * where it was drawn: when a re-render replaces the deeper ones, the
     * deepest still in the page stands for the place.
     */
    private place: { el: Element; top: number }[] = [];
    /** The scroll `place` was read at: a script may set it again before a resize reports. */
    private placeScroll = 0;
    /** What the scroll owes the content, drawn as a shift until the scroll stops. */
    private owed = 0;
    /** The blocks' parent, shifted while `owed` is. */
    private shifted: HTMLElement | null = null;
    /** A scroll to the top is under way; nothing above it is owed. */
    private headedForTop = false;
    private readonly settleOnceStill = debounce(() => this.settle(), SCROLL_IDLE_MS, true);

    attach(scrollRoot: HTMLElement): void {
        this.detach();
        // iOS WebKit parses overflow-anchor, so CSS.supports says yes, and
        // anchors nothing: a phone's trace showed this never switched on.
        if (!Platform.isIosApp && CSS.supports("overflow-anchor", "auto")) return;
        this.scrollRoot = scrollRoot;
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
    }

    /** What a note rendered: held at its height, the note hides a change inside it. */
    observeContent(el: Element): void {
        this.observer?.observe(el);
    }

    unobserveContent(el: Element): void {
        this.observer?.unobserve(el);
    }

    /** A scroll moves the place, and puts off the hand-over until it stops. */
    onScroll(): void {
        if (!this.scrollRoot) return;
        this.hold();
        if (this.owed !== 0) this.settleOnceStill();
        else if (this.scrollRoot?.scrollTop === 0) this.headedForTop = false;
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
        this.place = [];
        this.scrollRoot?.removeClass("is-scroll-anchored");
        this.scrollRoot = null;
        this.unshift();
    }

    /** Something resized: however far the place moved, the shift moves it back. */
    private hold(): void {
        if (this.owe()) this.settleOnceStill();
        this.pick();
    }

    /**
     * Owes however far the place moved since it was read, less any scroll
     * since. Run before every new read: the layout that read sees may already
     * hold a change no resize has reported yet, and it would be lost.
     */
    private owe(): boolean {
        const point = [...this.place].reverse().find(({ el }) => this.scrollRoot!.contains(el));
        const scrolled = this.scrollRoot!.scrollTop - this.placeScroll;
        const moved = point ? point.el.getBoundingClientRect().top + scrolled - point.top : 0;
        if (moved === 0) return false;
        this.owed += moved;
        this.shift(this.stream()!);
        return true;
    }

    /**
     * Finds the block the pane's top crosses by halving, since blocks stack and
     * a stream holds thousands; inside it, element by element, since a
     * collapsed section lays out as nothing. It stops at anything held
     * (`HeightHold`): what is inside is still filling, and where its text lies
     * now is not where it will.
     */
    private pick(): void {
        this.place = [];
        const stream = this.stream();
        if (!stream) return;
        const paneTop = this.scrollRoot!.getBoundingClientRect().top;
        this.placeScroll = this.scrollRoot!.scrollTop;
        const blocks = stream.children;
        let low = 0;
        let high = blocks.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (blocks[mid]!.getBoundingClientRect().bottom > paneTop) high = mid;
            else low = mid + 1;
        }
        let el: Element | undefined = blocks[low];
        while (el) {
            this.place.push({ el, top: el.getBoundingClientRect().top });
            if ((el as HTMLElement).style.getPropertyValue("--daily-note-held-height")) break;
            el = Array.from(el.children).find((child) => child.getBoundingClientRect().bottom > paneTop);
        }
    }

    /** What the blocks sit in, shifted while anything is owed. */
    private stream(): HTMLElement | null {
        const [block] = this.watched;
        return block?.parentElement ?? null;
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

    private unshift(): void {
        this.owed = 0;
        this.shifted?.removeClass("is-scroll-shifted");
        this.shifted?.style.removeProperty("--daily-notes-scroll-shift");
        this.shifted = null;
    }
}
