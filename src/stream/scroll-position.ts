import { SETTLE_MS } from "./height-hold";
import { blockAt } from "./stream-blocks";

/**
 * Where the stream is scrolled to, in a form Obsidian's history can keep: the
 * first note reaching into the pane, and its top's offset from the pane's.
 */
export interface StreamPlace {
    path: string;
    offset: number;
}

export function isStreamPlace(value: unknown): value is StreamPlace {
    if (typeof value !== "object" || value === null) return false;
    const { path, offset } = value as Partial<StreamPlace>;
    return typeof path === "string" && typeof offset === "number";
}

/** Where `stream` is scrolled to in `scrollEl`; null when no note reaches into the pane. */
export function readPlace(stream: HTMLElement, scrollEl: HTMLElement): StreamPlace | null {
    const paneTop = scrollEl.getBoundingClientRect().top;
    const block = blockAt(stream, paneTop);
    // Past the last note, the infinite-scroll sentinel.
    const path = block instanceof HTMLElement ? block.dataset.sourcePath : undefined;
    if (path === undefined) return null;
    return { path, offset: block!.getBoundingClientRect().top - paneTop };
}

/** Scrolls `scrollEl` so `block`'s top sits `offset` below the pane's top. */
export function scrollBlockTo(block: HTMLElement, offset: number, scrollEl: HTMLElement): void {
    scrollEl.scrollTop += block.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top - offset;
}

/** Passes over a scroll before it is left where it landed. */
const MAX_SCROLL_PASSES = 8;

/** How near its place in the pane counts as arrived. */
const SCROLL_TOLERANCE_PX = 2;

/**
 * Two frames: the first gives the scroll a rendering opportunity, the second
 * is when the IntersectionObserver's callback for it has been delivered.
 */
async function observersDelivered(): Promise<void> {
    for (let frame = 0; frame < 2; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
}

/** What moves a block after it has been scrolled to. */
export interface StreamLayout {
    /** Renders and unloads so far; unchanged across a pass means settled. */
    layoutChanges(): number;
    /** Resolves once the renders already queued have run. */
    drain(): Promise<void>;
}

/** Where in the pane an element is brought: its top to the pane's top, or center to center. */
export type Placement = "start" | "center";

/** How far `el` sits from its place in `scrollEl`. */
function offsetFromPlace(el: HTMLElement, placement: Placement, scrollEl: HTMLElement): number {
    const rect = el.getBoundingClientRect();
    const pane = scrollEl.getBoundingClientRect();
    if (placement === "start") return rect.top - pane.top;
    return (rect.top + rect.bottom - pane.top - pane.bottom) / 2;
}

/**
 * Brings `el` to its place in `scrollEl` and keeps it there. Scrolling to it
 * brings the window manager to it, and a note rendering *above* it grows past
 * its placeholder estimate and pushes it down (ADR 0006), so the scroll is
 * re-applied until `el` is in place in a stream that has stopped rendering.
 */
export async function scrollIntoPlace(
    el: HTMLElement,
    placement: Placement,
    scrollEl: HTMLElement,
    layout: StreamLayout
): Promise<void> {
    /** The change count the last pass ended on; nothing yet before the first. */
    let settled: number | null = null;
    for (let pass = 0; pass < MAX_SCROLL_PASSES; pass++) {
        const changes = layout.layoutChanges();
        const scrollTop = scrollEl.scrollTop;
        el.scrollIntoView({ block: placement });
        // A scroll that moved nothing, on a stream that has not changed since
        // the last pass, is as far as it goes: no observer has news, and
        // waiting a frame for one can wait forever where none is drawn.
        if (scrollEl.scrollTop === scrollTop && changes === settled) return;
        await observersDelivered();
        await layout.drain();

        // It is in place the instant it is scrolled to; the renders that
        // will push it down land after. Arrived means in place *and*
        // nothing rendered or unloaded on this pass.
        const offset = offsetFromPlace(el, placement, scrollEl);
        settled = layout.layoutChanges();
        if (Math.abs(offset) <= SCROLL_TOLERANCE_PX && settled === changes) return;
    }
    // Out of passes: something kept pushing it away.
}

/**
 * Keeps `el` at its place in `scrollEl` while what lies above it resizes,
 * until it is still for `SETTLE_MS`; returns what lets go sooner, as the
 * reader moving the pane must. A Base fills in after drawing, uncounted by
 * `scrollIntoPlace`, and one above `el` pushes it off screen. Re-placed in the
 * frame it moved: a resize reports before paint.
 */
export function keepInPlace(
    el: HTMLElement,
    placement: Placement,
    scrollEl: HTMLElement,
    stream: HTMLElement
): () => void {
    let settle = 0;
    const waitForStill = () => {
        window.clearTimeout(settle);
        settle = window.setTimeout(letGo, SETTLE_MS);
    };
    const observer = new ResizeObserver(() => {
        if (!el.isConnected) return letGo();
        if (Math.abs(offsetFromPlace(el, placement, scrollEl)) > SCROLL_TOLERANCE_PX)
            el.scrollIntoView({ block: placement });
        waitForStill();
    });
    function letGo(): void {
        window.clearTimeout(settle);
        observer.disconnect();
    }
    observer.observe(stream);
    for (const above of aboveInBlock(el, stream)) observer.observe(above);
    waitForStill();
    return letGo;
}

/**
 * What lies above `el` inside its block: a note held at its height grows
 * nothing outside it as a Base in it fills in. The blocks above resize the
 * stream.
 */
function aboveInBlock(el: Element, stream: HTMLElement): Element[] {
    const above: Element[] = [];
    for (let at = el; at.parentElement && at.parentElement !== stream; at = at.parentElement) {
        for (let sibling = at.previousElementSibling; sibling; sibling = sibling.previousElementSibling)
            above.push(sibling);
    }
    return above;
}
