import { App } from "obsidian";

/**
 * Persists collapse state for headers and list items using Obsidian's
 * vault-scoped localStorage API.
 *
 * sectionKey for headers: slugified header text (e.g. "my-heading")
 * sectionKey for list items: "li-{depth}-{own text}"
 *
 * Maintains a per-file index so clearForFile() can remove all entries
 * without key enumeration (which the Obsidian API does not expose).
 */
export class CollapsibleStateStore {
    constructor(private readonly app: App) {}

    isCollapsed(filePath: string, sectionKey: string): boolean {
        return this.collapsedOr(filePath, sectionKey, false);
    }

    /**
     * Saved state for a section, or `fallback` when it has none — the
     * properties panel defaults to a setting until the user touches it.
     */
    collapsedOr(filePath: string, sectionKey: string, fallback: boolean): boolean {
        const saved: unknown = this.app.loadLocalStorage(this.sectionStorageKey(filePath, sectionKey));
        return typeof saved === "boolean" ? saved : fallback;
    }

    /** Both states are persisted: "expanded" has to outlive a re-render too. */
    setCollapsed(filePath: string, sectionKey: string, collapsed: boolean): void {
        this.app.saveLocalStorage(this.sectionStorageKey(filePath, sectionKey), collapsed);
        this.addToIndex(filePath, sectionKey);
    }

    /** Carries collapse state across a rename or move, so nothing re-expands. */
    migrate(oldPath: string, newPath: string): void {
        for (const sectionKey of this.readIndex(oldPath)) {
            this.setCollapsed(newPath, sectionKey, this.isCollapsed(oldPath, sectionKey));
        }
        this.clearForFile(oldPath);
    }

    clearForFile(filePath: string): void {
        for (const sectionKey of this.readIndex(filePath)) {
            this.app.saveLocalStorage(this.sectionStorageKey(filePath, sectionKey), null);
        }
        this.app.saveLocalStorage(this.indexStorageKey(filePath), null);
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
            this.app.saveLocalStorage(this.indexStorageKey(filePath), [...index, sectionKey]);
        }
    }
}
