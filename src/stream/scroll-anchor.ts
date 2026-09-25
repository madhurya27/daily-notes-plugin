import { Platform, debounce } from "obsidian";

/** How long the scroll is still before the stream counts it stopped (docs/decisions.md, 2026-09-23). */
export const SCROLL_IDLE_MS = 300;

/**
 * Holds the reader's place when a block above the pane changes height — a
 * placeholder rendering at its real height, mostly — where the platform does
 * not. Chromium anchors the scroll itself; iOS WebKit has no scroll anchoring,
 * so there the text jumped by the difference.
 *
 * A change is drawn as a shift of the stream first, and handed to the scroll
 * once the scroll is still: mid-glide iOS drops or undoes a scroll write, and
 * plain writes jumped on a phone.
 */
export class ScrollAnchor {
    private observer: ResizeObserver | null = null;
    private scrollRoot: HTMLElement | null = null;
    /** Each block's height at its last report. */
    private readonly heights = new WeakMap<Element, number>();
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
        this.observer = new ResizeObserver((entries) => this.hold(entries));
    }

    observe(block: HTMLElement): void {
        this.observer?.observe(block);
    }

    unobserve(block: HTMLElement): void {
        this.observer?.unobserve(block);
    }

    /** A scroll puts off the hand-over until it stops. */
    onScroll(): void {
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

    detach(): void {
        this.settleOnceStill.cancel();
        this.observer?.disconnect();
        this.observer = null;
        this.scrollRoot?.removeClass("is-scroll-anchored");
        this.scrollRoot = null;
        this.unshift();
    }

    /**
     * Only a block wholly above the pane moves the reader's place: one reaching
     * into it changed where the reader can see, as a chevron tapped there does,
     * and the reader's place is inside it.
     */
    private hold(entries: readonly { target: Element }[]): void {
        const paneTop = this.scrollRoot!.getBoundingClientRect().top;
        for (const { target } of entries) {
            // Read per entry: the shift for the one before moves this one.
            const rect = target.getBoundingClientRect();
            const before = this.heights.get(target);
            this.heights.set(target, rect.height);
            if (before === undefined || rect.top + before > paneTop) continue;

            this.owed += rect.height - before;
            this.shift(target.parentElement!);
            this.settleOnceStill();
        }
    }

    /** The scroll takes the shift over, in the same frame. */
    private settle(): void {
        const root = this.scrollRoot!;
        if (!(this.headedForTop && root.scrollTop === 0)) root.scrollTop += this.owed;
        this.headedForTop = false;
        this.unshift();
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
