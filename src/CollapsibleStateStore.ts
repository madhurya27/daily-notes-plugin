import { App } from "obsidian";

/**
 * Persists collapse state for headers and list items using Obsidian's
 * vault-scoped localStorage API.
 *
 * sectionKey for headers: slugified header text (e.g. "my-heading")
 * sectionKey for list items: "li-{depth}-{index}"
 *
 * Maintains a per-file index so clearForFile() can remove all entries
 * without key enumeration (which the Obsidian API does not expose).
 */
export class CollapsibleStateStore {
    constructor(private readonly app: App) {}

    isCollapsed(filePath: string, sectionKey: string): boolean {
        return this.app.loadLocalStorage(this.sectionStorageKey(filePath, sectionKey)) === true;
    }

    setCollapsed(filePath: string, sectionKey: string, collapsed: boolean): void {
        const storageKey = this.sectionStorageKey(filePath, sectionKey);
        if (collapsed) {
            this.app.saveLocalStorage(storageKey, true);
            this.addToIndex(filePath, sectionKey);
        } else {
            this.app.saveLocalStorage(storageKey, null);
            this.removeFromIndex(filePath, sectionKey);
        }
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

    private removeFromIndex(filePath: string, sectionKey: string): void {
        const index = this.readIndex(filePath).filter(k => k !== sectionKey);
        this.app.saveLocalStorage(this.indexStorageKey(filePath), index.length > 0 ? index : null);
    }
}
