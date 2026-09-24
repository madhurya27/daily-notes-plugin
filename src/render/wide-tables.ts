import type { Component } from "obsidian";

/**
 * Names each body cell after its column and stacks a table wider than the note
 * as cards, re-checked when the note's width changes. A table may not scroll
 * sideways inside the stream (ADR 0008).
 */
export function stackWideTables(contentEl: HTMLElement, noteComponent: Component): void {
    const tables = Array.from(contentEl.querySelectorAll("table"));
    if (tables.length === 0) return;
    tables.forEach(labelColumns);

    const fit = () => {
        for (const table of tables) {
            // Measured as a grid: stacked, it is exactly as wide as the note.
            table.removeClass("is-stacked");
            table.toggleClass("is-stacked", table.offsetWidth > contentEl.clientWidth + 1);
        }
    };
    fit();

    let width = contentEl.clientWidth;
    const observer = new ResizeObserver(() => {
        if (contentEl.clientWidth === width) return;
        width = contentEl.clientWidth;
        fit();
    });
    observer.observe(contentEl);
    noteComponent.register(() => observer.disconnect());
}

/** A stacked cell shows its column's name, read from `data-column` by the stylesheet. */
function labelColumns(table: HTMLTableElement): void {
    const names = Array.from(table.querySelectorAll("thead th")).map((th) => th.getText().trim());
    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
        Array.from(row.querySelectorAll<HTMLElement>(":scope > td")).forEach((cell, i) => {
            const name = names[i];
            if (name) cell.dataset.column = name;
        });
    }
}
