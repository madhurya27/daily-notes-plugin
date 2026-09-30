/**
 * A copy of the stream's column beside it in its pane, as wide and unseen:
 * what lays out in it lays out as in a note. Null for a column in no pane.
 * The caller removes it.
 */
export function probeBeside(column: HTMLElement): HTMLElement | null {
    const pane = column.parentElement;
    if (!pane) return null;
    const probe = pane.createDiv({ cls: "daily-notes-stream-container daily-notes-stream-probe" });
    probe.style.setProperty("--daily-notes-probe-width", `${column.offsetWidth}px`);
    return probe;
}
