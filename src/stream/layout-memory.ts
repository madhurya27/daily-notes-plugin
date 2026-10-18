import { App, debounce } from "obsidian";
import { BaseMeasurements } from "../render/bases/base-measurements";
import { NoteHeights } from "./note-heights";
import { saveLoggingOnce } from "../local-storage";

/** Vault-scoped and per device: a height is only true on the screen that measured it. */
export const LAYOUT_MEMORY_KEY = "daily-notes-stream:layout";
/** A save that no longer reads what is stored bumps this, and the old one is dropped: it is a cache. */
const VERSION = 5;
/** From the first change of a burst, so a long scroll still saves as it goes. */
export const SAVE_DELAY_MS = 1000;

/**
 * What the stream measured, kept across sessions, so a note never rendered
 * this session still reserves its real height (docs/adr/0010-layout-memory.md).
 * One per plugin; every view shares it.
 */
export class LayoutMemory {
    readonly notes = new NoteHeights(
        () => this.saveSoon(),
        (path) => this.app.vault.getFileByPath(path)?.stat
    );
    readonly bases = new BaseMeasurements(() => this.saveSoon());
    private readonly saveSoon = debounce(() => this.save(), SAVE_DELAY_MS);
    private readonly saveLogged = saveLoggingOnce("layout memory");

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

    /** Forgets notes deleted, or changed, while the plugin was not running to hear it. */
    retainOnly(paths: ReadonlySet<string>): void {
        this.notes.retainOnly(paths);
        this.bases.retainOnly(paths);
    }

    /** Starts over from nothing measured, as on a new device. */
    forgetAll(): void {
        this.retainOnly(new Set());
    }

    /** Saves a pending change now: the plugin is unloading. */
    flush(): void {
        this.saveSoon.run();
    }

    private save(): void {
        this.saveLogged(() =>
            this.app.saveLocalStorage(LAYOUT_MEMORY_KEY, {
                version: VERSION,
                notes: this.notes.toJSON(),
                bases: this.bases.toJSON(),
            })
        );
    }
}

function isVersion(saved: unknown): saved is { notes: unknown; bases: unknown } {
    // Stryker disable next-line ConditionalExpression: a primitive has no version either.
    return typeof saved === "object" && saved !== null && (saved as { version?: unknown }).version === VERSION;
}

/**
 * The layout `column` lays notes out in: its width, or the one it is checked
 * against, and the size notes are drawn at, which on a phone iOS's text size
 * setting scales. Theme margins, line width and pane size all reach the width.
 */
export function layoutOf(column: HTMLElement, width = column.clientWidth): string {
    // Stryker disable next-line MethodExpression: jsdom trims a custom property's value, as engines since 2021 do; older ones kept the space.
    const textSize = getComputedStyle(column).getPropertyValue("--font-preferred-size").trim();
    return `${width}:${textSize}`;
}
