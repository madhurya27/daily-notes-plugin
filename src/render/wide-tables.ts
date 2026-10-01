import type { Component } from "obsidian";

/**
 * Names each body cell after its column and stacks a table wider than the note
 * as cards, re-checked when the note's width changes. A table may not scroll
 * sideways inside the stream (ADR 0008). Tables drawn later, as Dataview's
 * are, get the same.
 */
export function stackWideTables(contentEl: HTMLElement, noteComponent: Component): void {
    const fit = (tables: HTMLTableElement[]) => {
        for (const table of tables) {
            // Measured as a grid: stacked, it is exactly as wide as the note.
            table.removeClass("is-stacked");
            table.toggleClass("is-stacked", table.offsetWidth > contentEl.clientWidth + 1);
        }
    };
    const stack = (tables: HTMLTableElement[]) => {
        tables.forEach(labelColumns);
        fit(tables);
    };
    stack(Array.from(contentEl.querySelectorAll("table")));

    // Dataview fills its table over several renders: a header first, rows later.
    const added = new MutationObserver((records) => {
        const tables = new Set<HTMLTableElement>();
        for (const record of records) {
            const changed = (record.target as Element).closest("table");
            if (changed) tables.add(changed);
            for (const node of Array.from(record.addedNodes)) {
                if (node instanceof HTMLElement) tablesIn(node).forEach((table) => tables.add(table));
            }
        }
        stack([...tables]);
    });
    added.observe(contentEl, { childList: true, subtree: true });

    let width = contentEl.clientWidth;
    const resized = new ResizeObserver(() => {
        if (contentEl.clientWidth === width) return;
        width = contentEl.clientWidth;
        fit(Array.from(contentEl.querySelectorAll("table")));
    });
    resized.observe(contentEl);
    noteComponent.register(() => {
        added.disconnect();
        resized.disconnect();
    });
}

function tablesIn(el: HTMLElement): HTMLTableElement[] {
    return el instanceof HTMLTableElement ? [el] : Array.from(el.querySelectorAll("table"));
}

/** A stacked cell shows its column's name, read from `data-column` by the stylesheet. */
function labelColumns(table: HTMLTableElement): void {
    const names = Array.from(table.querySelectorAll("thead th")).map(columnName);
    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
        Array.from(row.querySelectorAll<HTMLElement>(":scope > td")).forEach((cell, i) => {
            const name = names[i];
            if (name) cell.dataset.column = name;
        });
    }
}

/** Dataview's first header also holds the row count, in a span of its own. */
const RESULT_COUNT = ".dataview.small-text";

function columnName(th: Element): string {
    const name = th.cloneNode(true) as Element;
    name.querySelector(RESULT_COUNT)?.remove();
    return name.getText().trim();
}
