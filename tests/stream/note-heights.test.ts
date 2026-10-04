import { describe, expect, it, vi } from "vitest";
import { NoteHeights } from "../../src/stream/note-heights";

describe("NoteHeights", () => {
    it("keeps a note's last height, per layout", () => {
        const heights = new NoteHeights();
        heights.keep("600:16px", "a.md", 300);
        heights.keep("600:16px", "a.md", 320);

        expect(heights.heightOf("600:16px", "a.md")).toBe(320);
        expect(heights.heightOf("400:16px", "a.md")).toBeUndefined();
        expect(heights.heightOf("600:16px", "b.md")).toBeUndefined();
    });

    // Sub-pixel digits cost a third of an entry; half a pixel is nothing to reserve.
    it("keeps a height in whole pixels", () => {
        const changed = vi.fn();
        const heights = new NoteHeights(changed);
        heights.keep("600:16px", "a.md", 933.8515625);
        heights.keep("600:16px", "a.md", 934.2);

        expect(heights.heightOf("600:16px", "a.md")).toBe(934);
        expect(changed).toHaveBeenCalledOnce();
    });

    it("estimates a layout's unmeasured note as the median of its measured ones", () => {
        const heights = new NoteHeights();
        expect(heights.estimate("600:16px")).toBeUndefined();

        heights.keep("600:16px", "a.md", 100);
        heights.keep("600:16px", "b.md", 900);
        heights.keep("600:16px", "c.md", 300);
        expect(heights.estimate("600:16px")).toBe(300);

        // Every placeholder of a batch asks: the median is sorted once per change.
        const sort = vi.spyOn(Array.prototype, "sort");
        expect(heights.estimate("600:16px")).toBe(300);
        expect(sort).not.toHaveBeenCalled();
        sort.mockRestore();

        heights.keep("600:16px", "d.md", 50);
        heights.keep("600:16px", "e.md", 60);
        expect(heights.estimate("600:16px")).toBe(100);
        expect(heights.estimate("400:16px")).toBeUndefined();
    });

    it("forgets a deleted note, and notes no longer in the vault", () => {
        const heights = new NoteHeights();
        heights.keep("a", "x.md", 1);
        heights.keep("a", "y.md", 2);
        heights.keep("b", "z.md", 3);
        heights.forget("x.md");
        expect(heights.heightOf("a", "x.md")).toBeUndefined();

        heights.retainOnly(new Set(["z.md"]));
        expect(heights.heightOf("a", "y.md")).toBeUndefined();
        expect(heights.heightOf("b", "z.md")).toBe(3);
        expect(heights.estimate("a")).toBeUndefined();
    });

    it("says when it changed, and only then", () => {
        const changed = vi.fn();
        const heights = new NoteHeights(changed);
        heights.keep("a", "x.md", 1);
        heights.keep("a", "x.md", 1);
        heights.heightOf("a", "x.md");
        heights.rename("absent.md", "y.md");
        heights.forget("absent.md");
        heights.retainOnly(new Set(["x.md"]));
        expect(changed).toHaveBeenCalledTimes(1);

        heights.rename("x.md", "y.md");
        heights.forget("y.md");
        heights.keep("a", "z.md", 1);
        heights.retainOnly(new Set());
        expect(changed).toHaveBeenCalledTimes(5);
    });

    // An estimate reads other layouts; that is no use of them, and they still go first.
    it("lists what it holds, by note and by layout, without counting as a use", () => {
        const heights = new NoteHeights(undefined, undefined, 2);
        heights.keep("a", "x.md", 1);
        heights.keep("a", "y.md", 2);
        heights.keep("b", "x.md", 3);

        expect(heights.heightsOf("x.md")).toEqual([
            ["a", 1],
            ["b", 3],
        ]);
        expect(heights.layouts()).toEqual(["a", "b"]);
        expect(heights.entries("a")).toEqual([
            ["x.md", 1],
            ["y.md", 2],
        ]);
        expect(heights.entries("c")).toEqual([]);

        heights.keep("c", "z.md", 4);
        expect(heights.layouts()).toEqual(["b", "c"]);
    });

    // What is learned from every height is recomputed only once one changed.
    it("counts its changes", () => {
        const heights = new NoteHeights();
        const start = heights.revision;
        heights.keep("a", "x.md", 1);
        heights.keep("a", "x.md", 1);
        expect(heights.revision).toBe(start + 1);

        heights.restore([]);
        expect(heights.revision).toBe(start + 2);
    });

    it("comes back from what it saved, oldest layout still first to go", () => {
        const saved = new NoteHeights(undefined, undefined, 2);
        saved.keep("a", "x.md", 1);
        saved.keep("b", "y.md", 2);
        saved.heightOf("a", "x.md");

        const restored = new NoteHeights(undefined, undefined, 2);
        restored.restore(JSON.parse(JSON.stringify(saved.toJSON())));
        restored.keep("c", "z.md", 3);

        expect(restored.heightOf("a", "x.md")).toBe(1);
        expect(restored.heightOf("b", "y.md")).toBeUndefined();
        expect(restored.estimate("a")).toBe(1);
    });

    // Edited on another device, or while the plugin was off: re-estimated from its text, not held at its old height.
    describe("with each note's mtime", () => {
        function setup() {
            const mtimes = new Map([
                ["x.md", 1],
                ["y.md", 1],
                ["gone.md", 1],
            ]);
            const heights = new NoteHeights(undefined, (path) => mtimes.get(path));
            heights.keep("a", "x.md", 100);
            heights.keep("b", "x.md", 200);
            heights.keep("a", "y.md", 300);
            heights.keep("a", "gone.md", 400);
            return { mtimes, heights };
        }

        it("forgets a note changed since it was measured, as it forgets one deleted", () => {
            const { mtimes, heights } = setup();
            mtimes.set("x.md", 2);
            mtimes.delete("gone.md");

            heights.retainOnly(new Set(["x.md", "y.md"]));

            expect(heights.heightsOf("x.md")).toEqual([]);
            expect(heights.heightOf("a", "y.md")).toBe(300);
            expect(heights.heightOf("a", "gone.md")).toBeUndefined();
        });

        it("keeps when each note was measured through a save", () => {
            const { mtimes, heights } = setup();
            const restored = new NoteHeights(undefined, (path) => mtimes.get(path));
            restored.restore(JSON.parse(JSON.stringify(heights.toJSON())));
            mtimes.set("x.md", 2);

            restored.retainOnly(new Set(["x.md", "y.md", "gone.md"]));

            expect(restored.heightsOf("x.md")).toEqual([]);
            expect(restored.heightOf("a", "y.md")).toBe(300);
        });

        it("carries a note's mtime across a rename, and forgets a deleted note's", () => {
            const { mtimes, heights } = setup();
            heights.rename("x.md", "moved.md");
            mtimes.set("moved.md", 1);
            heights.forget("y.md");
            heights.keep("a", "y.md", 300);

            heights.retainOnly(new Set(["moved.md", "y.md"]));

            expect(heights.heightOf("a", "moved.md")).toBe(100);
            expect(heights.heightOf("a", "y.md")).toBe(300);
        });

        it("comes back empty from a save of another shape", () => {
            const { heights } = setup();
            heights.restore({ heights: [["a", [["x.md", 100]]]] });
            expect(heights.heightOf("a", "x.md")).toBeUndefined();
        });
    });
});
