import { App } from "obsidian";
import { saveLoggingOnce } from "../local-storage";

/**
 * Collapse state in Obsidian's vault-scoped localStorage. Keys: slugified text
 * for headers, `li-{depth}-{own text}` for list items. A per-file index lets
 * clearForFile() work without key enumeration, which the API does not expose.
 */
export class CollapsibleStateStore {
    private readonly saveLogged = saveLoggingOnce("collapse state");

    constructor(private readonly app: App) {}

    isCollapsed(filePath: string, sectionKey: string): boolean {
        return this.collapsedOr(filePath, sectionKey, false);
    }

    /** Saved state, or `fallback` — the properties panel defaults to a setting. */
    collapsedOr(filePath: string, sectionKey: string, fallback: boolean): boolean {
        const saved: unknown = this.app.loadLocalStorage(this.sectionStorageKey(filePath, sectionKey));
        return typeof saved === "boolean" ? saved : fallback;
    }

    /** Both states are persisted: "expanded" has to outlive a re-render too. */
    setCollapsed(filePath: string, sectionKey: string, collapsed: boolean): void {
        this.save(this.sectionStorageKey(filePath, sectionKey), collapsed);
        this.addToIndex(filePath, sectionKey);
    }

    /** Carries collapse state across a rename or move, so nothing re-expands. */
    migrate(oldPath: string, newPath: string): void {
        for (const sectionKey of this.readIndex(oldPath)) {
            this.setCollapsed(newPath, sectionKey, this.isCollapsed(oldPath, sectionKey));
        }
        this.clearForFile(oldPath);
    }

    /** Forgets the note's sections outside `keep` — headings and lists it no longer has. */
    retainOnly(filePath: string, keep: ReadonlySet<string>): void {
        const index = this.readIndex(filePath);
        const kept = index.filter((sectionKey) => keep.has(sectionKey));
        if (kept.length === index.length) return;

        for (const sectionKey of index) {
            if (!keep.has(sectionKey)) this.save(this.sectionStorageKey(filePath, sectionKey), null);
        }
        this.save(this.indexStorageKey(filePath), kept.length > 0 ? kept : null);
    }

    clearForFile(filePath: string): void {
        for (const sectionKey of this.readIndex(filePath)) {
            this.save(this.sectionStorageKey(filePath, sectionKey), null);
        }
        this.save(this.indexStorageKey(filePath), null);
    }

    private save(key: string, value: unknown): void {
        this.saveLogged(() => this.app.saveLocalStorage(key, value));
    }

    private sectionStorageKey(filePath: string, sectionKey: string): string {
        return `collapse:${filePath}:${sectionKey}`;
    }

    private indexStorageKey(filePath: string): string {
        return `collapse-idx:${filePath}`;
    }

    private readIndex(filePath: string): string[] {
        const raw: unknown = this.app.loadLocalStorage(this.indexStorageKey(filePath));
        if (!Array.isArray(raw)) return [];
        return raw.filter((x): x is string => typeof x === "string");
    }

    private addToIndex(filePath: string, sectionKey: string): void {
        const index = this.readIndex(filePath);
        if (!index.includes(sectionKey)) {
            this.save(this.indexStorageKey(filePath), [...index, sectionKey]);
        }
    }
}
