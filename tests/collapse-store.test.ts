import { describe, it, expect, beforeEach, vi } from "vitest";
import { CollapsibleStateStore } from "../src/render/collapse-store";

function makeApp() {
    const storage = new Map<string, unknown>();
    return {
        loadLocalStorage: vi.fn((key: string) => storage.get(key) ?? null),
        saveLocalStorage: vi.fn((key: string, value: unknown) => {
            if (value === null) storage.delete(key);
            else storage.set(key, value);
        }),
    };
}

describe("CollapsibleStateStore", () => {
    let app: ReturnType<typeof makeApp>;
    let store: CollapsibleStateStore;

    beforeEach(() => {
        app = makeApp();
        store = new CollapsibleStateStore(app as any);
    });

    it("isCollapsed returns false when key not set", () => {
        expect(store.isCollapsed("file.md", "heading-1")).toBe(false);
    });

    it("setCollapsed(true) persists state and isCollapsed returns true", () => {
        store.setCollapsed("file.md", "heading-1", true);
        expect(store.isCollapsed("file.md", "heading-1")).toBe(true);
    });

    it("setCollapsed(false) removes the key and isCollapsed returns false", () => {
        store.setCollapsed("file.md", "heading-1", true);
        store.setCollapsed("file.md", "heading-1", false);
        expect(store.isCollapsed("file.md", "heading-1")).toBe(false);
    });

    it("collapsedOr returns the fallback when the section has no saved state", () => {
        expect(store.collapsedOr("file.md", "properties", true)).toBe(true);
        expect(store.collapsedOr("file.md", "properties", false)).toBe(false);
    });

    it("collapsedOr prefers a saved expanded state over a collapsed fallback", () => {
        store.setCollapsed("file.md", "properties", false);

        expect(store.collapsedOr("file.md", "properties", true)).toBe(false);
    });

    it("clearForFile removes all entries for that file", () => {
        store.setCollapsed("file.md", "heading-1", true);
        store.setCollapsed("file.md", "heading-2", true);
        store.clearForFile("file.md");
        expect(store.isCollapsed("file.md", "heading-1")).toBe(false);
        expect(store.isCollapsed("file.md", "heading-2")).toBe(false);
    });

    it("clearForFile does not affect other files", () => {
        store.setCollapsed("file-a.md", "heading-1", true);
        store.setCollapsed("file-b.md", "heading-1", true);
        store.clearForFile("file-a.md");
        expect(store.isCollapsed("file-b.md", "heading-1")).toBe(true);
    });

    it("clearForFile is safe when no entries exist", () => {
        expect(() => store.clearForFile("nonexistent.md")).not.toThrow();
    });

    it("migrate moves every collapsed section to the new path", () => {
        store.setCollapsed("old.md", "heading-1", true);
        store.setCollapsed("old.md", "heading-2", true);

        store.migrate("old.md", "new.md");

        expect(store.isCollapsed("new.md", "heading-1")).toBe(true);
        expect(store.isCollapsed("new.md", "heading-2")).toBe(true);
        expect(store.isCollapsed("old.md", "heading-1")).toBe(false);
        expect(store.isCollapsed("old.md", "heading-2")).toBe(false);
    });

    it("migrate carries the index over, so a later clearForFile on the new path cleans up", () => {
        store.setCollapsed("old.md", "heading-1", true);

        store.migrate("old.md", "new.md");
        store.clearForFile("new.md");

        expect(store.isCollapsed("new.md", "heading-1")).toBe(false);
    });

    it("migrate carries an explicitly expanded section over", () => {
        store.setCollapsed("old.md", "properties", false);

        store.migrate("old.md", "new.md");

        expect(store.collapsedOr("new.md", "properties", true)).toBe(false);
    });

    it("migrate is safe when the file has no collapsed sections", () => {
        expect(() => store.migrate("old.md", "new.md")).not.toThrow();
    });

    it("addToIndex does not duplicate keys on repeated setCollapsed(true)", () => {
        store.setCollapsed("file.md", "heading-1", true);
        store.setCollapsed("file.md", "heading-1", true); // second call, same key
        // clearForFile should still clean up correctly
        store.clearForFile("file.md");
        expect(store.isCollapsed("file.md", "heading-1")).toBe(false);
    });

    it("clearForFile also drops explicitly expanded sections", () => {
        store.setCollapsed("file.md", "key-a", false);

        store.clearForFile("file.md");

        expect(store.collapsedOr("file.md", "key-a", true)).toBe(true);
    });

    it("readIndex returns [] when stored index value is not an array", () => {
        // Manually inject a non-array value into the index key
        app.saveLocalStorage("collapse-idx:file.md", "bad-value");
        // clearForFile iterates the index — should not throw
        expect(() => store.clearForFile("file.md")).not.toThrow();
    });

    it("uses vault-scoped storage keys with 'collapse:' prefix", () => {
        store.setCollapsed("notes/2025-01-01.md", "intro", true);
        const sectionCall = app.saveLocalStorage.mock.calls.find((c) => c[0].startsWith("collapse:"));
        expect(sectionCall?.[0]).toBe("collapse:notes/2025-01-01.md:intro");
    });

    it("uses 'collapse-idx:' prefix for the index key", () => {
        store.setCollapsed("notes/2025-01-01.md", "intro", true);
        const indexCall = app.saveLocalStorage.mock.calls.find((c) => c[0].startsWith("collapse-idx:"));
        expect(indexCall?.[0]).toBe("collapse-idx:notes/2025-01-01.md");
    });

    it("multiple files maintain independent state", () => {
        store.setCollapsed("a.md", "section", true);
        store.setCollapsed("b.md", "section", true);
        store.clearForFile("a.md");
        expect(store.isCollapsed("a.md", "section")).toBe(false);
        expect(store.isCollapsed("b.md", "section")).toBe(true);
    });
});
