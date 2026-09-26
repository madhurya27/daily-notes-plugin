import { App, debounce } from "obsidian";
import { BaseMeasurements } from "../render/bases/base-measurements";
import { NoteHeights } from "./note-heights";

/** Vault-scoped and per device: a height is only true on the screen that measured it. */
export const LAYOUT_MEMORY_KEY = "daily-notes-stream:layout";
/** A save that no longer reads what is stored bumps this, and the old one is dropped: it is a cache. */
const VERSION = 1;
/** From the first change of a burst, so a long scroll still saves as it goes. */
export const SAVE_DELAY_MS = 1000;

/**
 * What the stream measured, kept across sessions, so a note never rendered
 * this session still reserves its real height (docs/adr/0010-layout-memory.md).
 * One per plugin; every view shares it.
 */
export class LayoutMemory {
    readonly notes = new NoteHeights(() => this.saveSoon());
    readonly bases = new BaseMeasurements(() => this.saveSoon());
    private readonly saveSoon = debounce(() => this.save(), SAVE_DELAY_MS);

    constructor(private readonly app: App) {
        const saved: unknown = app.loadLocalStorage(LAYOUT_MEMORY_KEY);
        if (!isVersion(saved)) return;
        this.notes.restore(saved.notes);
        this.bases.restore(saved.bases);
    }

    /** Saves a pending change now: the plugin is unloading. */
    flush(): void {
        this.saveSoon.run();
    }

    private save(): void {
        this.app.saveLocalStorage(LAYOUT_MEMORY_KEY, {
            version: VERSION,
            notes: this.notes.toJSON(),
            bases: this.bases.toJSON(),
        });
    }
}

function isVersion(saved: unknown): saved is { notes: unknown; bases: unknown } {
    return typeof saved === "object" && saved !== null && (saved as { version?: unknown }).version === VERSION;
}

/**
 * The layout `column` lays notes out in: its width and text size. Theme
 * margins, line width and pane size all reach the width.
 */
export function layoutOf(column: HTMLElement): string {
    const textSize = getComputedStyle(column).getPropertyValue("--font-text-size").trim();
    return `${column.clientWidth}:${textSize}`;
}
