import { App } from "obsidian";
import { saveLoggingOnce } from "../local-storage";

/** Vault-scoped, as the layout memory is. */
export const COLLAPSE_STATE_KEY = "daily-notes-stream:collapse";
/** A save that no longer reads what is stored bumps this, and the old one is dropped. */
const VERSION = 1;

type Sections = Map<string, boolean>;

/**
 * Collapse state, one per plugin, read once and saved whole on each change.
 * Keys: slugified text for headers, `li-{depth}-{own text}` for list items.
 */
export class CollapsibleStateStore {
    private readonly files: Map<string, Sections>;
    private readonly saveLogged = saveLoggingOnce("collapse state");

    constructor(private readonly app: App) {
        this.files = restore(app.loadLocalStorage(COLLAPSE_STATE_KEY));
    }

    isCollapsed(filePath: string, sectionKey: string): boolean {
        return this.collapsedOr(filePath, sectionKey, false);
    }

    /** Saved state, or `fallback` — the properties panel defaults to a setting. */
    collapsedOr(filePath: string, sectionKey: string, fallback: boolean): boolean {
        return this.files.get(filePath)?.get(sectionKey) ?? fallback;
    }

    /** Both states are persisted: "expanded" has to outlive a re-render too. */
    setCollapsed(filePath: string, sectionKey: string, collapsed: boolean): void {
        const sections = this.files.get(filePath) ?? new Map<string, boolean>();
        if (sections.get(sectionKey) === collapsed) return;
        sections.set(sectionKey, collapsed);
        this.files.set(filePath, sections);
        this.save();
    }

    /** Carries collapse state across a rename or move, so nothing re-expands. */
    migrate(oldPath: string, newPath: string): void {
        const sections = this.files.get(oldPath);
        if (!sections) return;
        this.files.delete(oldPath);
        this.files.set(newPath, sections);
        this.save();
    }

    /** Forgets the note's sections outside `keep` — headings and lists it no longer has. */
    retainSections(filePath: string, keep: ReadonlySet<string>): void {
        const sections = this.files.get(filePath);
        if (!sections) return;
        const gone = [...sections.keys()].filter((sectionKey) => !keep.has(sectionKey));
        if (gone.length === 0) return;
        for (const sectionKey of gone) sections.delete(sectionKey);
        if (sections.size === 0) this.files.delete(filePath);
        this.save();
    }

    /** Forgets notes deleted while the plugin was not running to hear it. */
    retainOnly(paths: ReadonlySet<string>): void {
        const gone = [...this.files.keys()].filter((path) => !paths.has(path));
        if (gone.length === 0) return;
        for (const path of gone) this.files.delete(path);
        this.save();
    }

    clearForFile(filePath: string): void {
        if (this.files.delete(filePath)) this.save();
    }

    private save(): void {
        const files = [...this.files].map(([path, sections]) => [path, [...sections]]);
        this.saveLogged(() => this.app.saveLocalStorage(COLLAPSE_STATE_KEY, { version: VERSION, files }));
    }
}

/** What `save` wrote, or nothing for anything else. */
function restore(value: unknown): Map<string, Sections> {
    const { version, files } = (value ?? {}) as { version?: unknown; files?: unknown };
    if (version !== VERSION || !Array.isArray(files) || !files.every(isSavedFile)) return new Map();
    return new Map(files.map(([path, sections]) => [path, new Map(sections)]));
}

function isSavedFile(entry: unknown): entry is [string, [string, boolean][]] {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !Array.isArray(entry[1])) return false;
    return (entry[1] as unknown[]).every(
        (section) => Array.isArray(section) && typeof section[0] === "string" && typeof section[1] === "boolean"
    );
}
