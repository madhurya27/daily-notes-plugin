/** Bases' own cap on an automatically sized column. */
const DEFAULT_MAX_COLUMN_PX = 300;
/** Narrower than this, a column shows nothing useful; the table clips instead. */
const MIN_COLUMN_PX = 40;

/** The cap last set on each view. */
const caps = new WeakMap<HTMLElement, number>();

/**
 * Shrinks the cap Bases puts on automatically sized columns until the table
 * fits its view, which must not scroll sideways (ADR 0007). Bases reads the cap
 * from a CSS variable when it lays out; a hand-resized column ignores it.
 */
export function fitBaseToWidth(view: HTMLElement): void {
    const thead = view.querySelector<HTMLElement>(".bases-thead");
    // Bases sets the table's width on its header row.
    const tableWidth = thead ? parseFloat(thead.style.width) : NaN;
    const available = view.clientWidth;
    if (!(tableWidth > available) || available <= 0) return;

    const current = caps.get(view) ?? DEFAULT_MAX_COLUMN_PX;
    const next = Math.max(MIN_COLUMN_PX, Math.floor((current * available) / tableWidth));
    if (next >= current) return;

    caps.set(view, next);
    view.style.setProperty("--bases-table-column-max-width", `${next}px`);
    view.style.setProperty("--bases-table-column-min-width", `${MIN_COLUMN_PX}px`);
    // Bases lays the table out again on a scroll event on its view.
    view.dispatchEvent(new Event("scroll"));
}
