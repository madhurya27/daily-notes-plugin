import { App, debounce } from "obsidian";
import { BaseMeasurements } from "../render/bases/base-measurements";
import { NoteHeights } from "./note-heights";

/** Vault-scoped and per device: a height is only true on the screen that measured it. */
export const LAYOUT_MEMORY_KEY = "daily-notes-stream:layout";
/** A save that no longer reads what is stored bumps this, and the old one is dropped: it is a cache. */
const VERSION = 2;
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
    /** A refused save is logged once: every change after it is refused too. */
    private saveFailed = false;

    constructor(private readonly app: App) {
        const saved: unknown = app.loadLocalStorage(LAYOUT_MEMORY_KEY);
        if (!isVersion(saved)) return;
        this.notes.restore(saved.notes);
        this.bases.restore(saved.bases);
    }

    /** A note's measurements follow it to its new path. */
    rename(oldPath: string, newPath: string): void {
        this.notes.rename(oldPath, newPath);
        this.bases.rename(oldPath, newPath);
    }

    forget(path: string): void {
        this.notes.forget(path);
        this.bases.forget(path);
    }

    /** Forgets notes deleted while the plugin was not running to hear it. */
    retainOnly(paths: ReadonlySet<string>): void {
        this.notes.retainOnly(paths);
        this.bases.retainOnly(paths);
    }

    /** Saves a pending change now: the plugin is unloading. */
    flush(): void {
        this.saveSoon.run();
    }

    /** localStorage is a few megabytes, shared by every vault in the app: a save can be refused. */
    private save(): void {
        try {
            this.app.saveLocalStorage(LAYOUT_MEMORY_KEY, {
                version: VERSION,
                notes: this.notes.toJSON(),
                bases: this.bases.toJSON(),
            });
        } catch (error) {
            if (!this.saveFailed) console.error("DailyNotesStream: Failed to save layout memory", error);
            this.saveFailed = true;
        }
    }
}

function isVersion(saved: unknown): saved is { notes: unknown; bases: unknown } {
    return typeof saved === "object" && saved !== null && (saved as { version?: unknown }).version === VERSION;
}

/**
 * The layout `column` lays notes out in: its width, or the one it is checked
 * against, and text size. Theme margins, line width and pane size all reach
 * the width.
 */
export function layoutOf(column: HTMLElement, width = column.clientWidth): string {
    const textSize = getComputedStyle(column).getPropertyValue("--font-text-size").trim();
    return `${width}:${textSize}`;
}
