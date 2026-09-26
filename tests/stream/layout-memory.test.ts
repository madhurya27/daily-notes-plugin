import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAYOUT_MEMORY_KEY, LayoutMemory, SAVE_DELAY_MS } from "../../src/stream/layout-memory";
import { asApp } from "../stream-view-fixture";

function makeApp(saved: unknown = null) {
    return {
        loadLocalStorage: vi.fn((_key: string): unknown => saved),
        saveLocalStorage: vi.fn((_key: string, _value: unknown) => {}),
    };
}

describe("LayoutMemory", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("comes back with the heights a last session saved", () => {
        const app = makeApp({ version: 1, notes: [["600:16px", [["a.md", 300]]]] });
        const memory = new LayoutMemory(asApp(app));

        expect(app.loadLocalStorage).toHaveBeenCalledWith(LAYOUT_MEMORY_KEY);
        expect(memory.notes.heightOf("600:16px", "a.md")).toBe(300);
    });

    it("comes back with what Bases measured in a last session", () => {
        const memory = new LayoutMemory(asApp(makeApp({ version: 1, notes: [], bases: [["k", { height: 240 }]] })));
        expect(memory.bases.heightOf("k")).toBe(240);
    });

    it("starts empty from another version's save", () => {
        const memory = new LayoutMemory(asApp(makeApp({ version: 0, notes: [["600:16px", [["a.md", 300]]]] })));
        expect(memory.notes.toJSON()).toEqual([]);
        expect(memory.bases.toJSON()).toEqual([]);
        expect(new LayoutMemory(asApp(makeApp())).notes.toJSON()).toEqual([]);
    });

    // A scroll measures note after note: one write a second, not one per note.
    it("saves a burst of changes once, a moment after the first", () => {
        const app = makeApp();
        const memory = new LayoutMemory(asApp(app));
        memory.notes.keep("600:16px", "a.md", 300);
        memory.notes.keep("600:16px", "b.md", 200);
        memory.bases.markTooWide("k");
        expect(app.saveLocalStorage).not.toHaveBeenCalled();

        vi.advanceTimersByTime(SAVE_DELAY_MS);
        expect(app.saveLocalStorage).toHaveBeenCalledTimes(1);
        expect(app.saveLocalStorage).toHaveBeenCalledWith(LAYOUT_MEMORY_KEY, {
            version: 1,
            notes: [
                [
                    "600:16px",
                    [
                        ["a.md", 300],
                        ["b.md", 200],
                    ],
                ],
            ],
            bases: [["k", { tooWide: true }]],
        });
    });

    it("saves what is pending at once when the plugin unloads", () => {
        const app = makeApp();
        const memory = new LayoutMemory(asApp(app));
        memory.flush();
        expect(app.saveLocalStorage).not.toHaveBeenCalled();

        memory.notes.keep("600:16px", "a.md", 300);
        memory.flush();
        expect(app.saveLocalStorage).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(SAVE_DELAY_MS);
        expect(app.saveLocalStorage).toHaveBeenCalledTimes(1);
    });
});
