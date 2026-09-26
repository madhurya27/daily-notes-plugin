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

    // Every pane width and font size is a layout of its own.
    it("forgets the layout used longest ago, past its limit", () => {
        const heights = new NoteHeights(undefined, 2);
        heights.keep("a", "x.md", 1);
        heights.keep("b", "x.md", 2);
        heights.heightOf("a", "x.md");
        heights.keep("c", "x.md", 3);

        expect(heights.heightOf("b", "x.md")).toBeUndefined();
        expect(heights.heightOf("a", "x.md")).toBe(1);
        expect(heights.heightOf("c", "x.md")).toBe(3);
    });

    it("carries a note's heights across a rename, in every layout", () => {
        const heights = new NoteHeights();
        heights.keep("a", "old.md", 1);
        heights.keep("b", "old.md", 2);
        heights.keep("b", "other.md", 5);
        heights.rename("old.md", "new.md");

        expect(heights.heightOf("a", "old.md")).toBeUndefined();
        expect(heights.heightOf("a", "new.md")).toBe(1);
        expect(heights.heightOf("b", "new.md")).toBe(2);
        expect(heights.heightOf("b", "other.md")).toBe(5);
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

    it("comes back from what it saved, oldest layout still first to go", () => {
        const saved = new NoteHeights(undefined, 2);
        saved.keep("a", "x.md", 1);
        saved.keep("b", "y.md", 2);
        saved.heightOf("a", "x.md");

        const restored = new NoteHeights(undefined, 2);
        restored.restore(JSON.parse(JSON.stringify(saved.toJSON())));
        restored.keep("c", "z.md", 3);

        expect(restored.heightOf("a", "x.md")).toBe(1);
        expect(restored.heightOf("b", "y.md")).toBeUndefined();
        expect(restored.estimate("a")).toBe(1);
    });

    it("restores nothing from what it did not save", () => {
        const heights = new NoteHeights();
        for (const junk of [null, 3, {}, [["a"]], [["a", [["x.md", "1"]]]], [[1, []]], [["a", [[1, 1]]]], [["a", 5]]]) {
            heights.restore(junk);
            expect(heights.toJSON()).toEqual([]);
        }
    });
});
