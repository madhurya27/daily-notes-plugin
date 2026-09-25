import { TFile } from "obsidian";

export interface AnchorSnapshot {
    file: TFile;
    /** Top of the anchor element relative to the scroll container's top, captured before re-render */
    relativeTopPx: number;
}

/**
 * Where the stream is scrolled to, in a form Obsidian's history can keep: the
 * first note reaching into the pane, and its top's offset from the pane's.
 */
export interface StreamPlace {
    path: string;
    offset: number;
    /** The notes' heights down to it, so Back lays the stream out as it was. */
    layout?: PlaceLayout;
}

/** Heights by path, valid only at the pane width they were measured at. */
export interface PlaceLayout {
    width: number;
    heights: Record<string, number>;
}

export function isStreamPlace(value: unknown): value is StreamPlace {
    if (typeof value !== "object" || value === null) return false;
    const { path, offset, layout } = value as Partial<StreamPlace>;
    return typeof path === "string" && typeof offset === "number" && (layout === undefined || isPlaceLayout(layout));
}

function isPlaceLayout(value: unknown): value is PlaceLayout {
    if (typeof value !== "object" || value === null) return false;
    const { width, heights } = value as Partial<PlaceLayout>;
    if (typeof width !== "number" || typeof heights !== "object" || heights === null) return false;
    return Object.values(heights).every((height) => typeof height === "number");
}

/**
 * Captures the first note element that is at or below the current scroll position
 * as an anchor for later restoration.
 *
 * Uses getBoundingClientRect() relative to the scroll container so that
 * position: relative ancestors do not affect the measurement.
 */
export function captureAnchor(
    notes: readonly TFile[],
    scrollEl: HTMLElement,
    findElement: (file: TFile) => HTMLElement | null
): AnchorSnapshot | null {
    const scrollRect = scrollEl.getBoundingClientRect();

    for (const file of notes) {
        const el = findElement(file);
        if (!el) continue;
        const elRect = el.getBoundingClientRect();
        const elBottom = elRect.bottom - scrollRect.top;
        if (elBottom > 0) {
            return {
                file,
                relativeTopPx: elRect.top - scrollRect.top,
            };
        }
    }
    return null;
}

/**
 * Restores scroll position so that the anchor element is at the same relative
 * position it was at when captureAnchor was called.
 */
export function restoreAnchor(
    snapshot: AnchorSnapshot,
    scrollEl: HTMLElement,
    findElement: (file: TFile) => HTMLElement | null
): void {
    const el = findElement(snapshot.file);
    if (!el) return;
    const scrollRect = scrollEl.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const currentRelativeTop = elRect.top - scrollRect.top;
    scrollEl.scrollTop += currentRelativeTop - snapshot.relativeTopPx;
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

/** Where in the pane an element is brought: its top to the pane's top, or centre to centre. */
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
