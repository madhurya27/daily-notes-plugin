import { TFile } from "obsidian";

export interface AnchorSnapshot {
    file: TFile;
    /** Top of the anchor element relative to the scroll container's top, captured before re-render */
    relativeTopPx: number;
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
    containerEl: HTMLElement,
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

/** How near the top of the pane counts as arrived. */
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

/**
 * Puts `block` at the top of `scrollEl` and keeps it there. Scrolling to it
 * brings the window manager to it, and a note rendering *above* it grows past
 * its placeholder estimate and pushes it down (ADR 0006), so the scroll is
 * re-applied until the block is at the top of a stream that has stopped
 * rendering.
 */
export async function scrollToTop(block: HTMLElement, scrollEl: HTMLElement, layout: StreamLayout): Promise<void> {
    for (let pass = 0; pass < MAX_SCROLL_PASSES; pass++) {
        const changes = layout.layoutChanges();
        block.scrollIntoView({ block: "start" });
        await observersDelivered();
        await layout.drain();

        // The block sits at the top the instant it is scrolled to; the
        // renders that will push it down land after. Arrived means at the
        // top *and* nothing rendered or unloaded on this pass.
        const offset = block.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top;
        if (Math.abs(offset) <= SCROLL_TOLERANCE_PX && layout.layoutChanges() === changes) return;
    }
    // Out of passes: a note too short to reach the top of a tall pane
    // cannot, and the stream is scrolled as far as it goes.
}
