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
