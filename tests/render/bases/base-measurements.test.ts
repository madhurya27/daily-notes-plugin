import { describe, expect, it, vi } from "vitest";
import { BaseMeasurements } from "../../../src/render/bases/base-measurements";

describe("BaseMeasurements", () => {
    it("keeps the height a Base held still at", () => {
        const measured = new BaseMeasurements();
        measured.keepHeight("a", 300);

        expect(measured.heightOf("a")).toBe(300);
        expect(measured.heightOf("b")).toBeUndefined();
    });

    it("keeps which Bases were too wide for a table", () => {
        const measured = new BaseMeasurements();
        measured.markTooWide("a");

        expect(measured.isTooWide("a")).toBe(true);
        expect(measured.isTooWide("b")).toBe(false);
    });

    it("keeps a Base's height and width answer as one measurement", () => {
        const measured = new BaseMeasurements(undefined, 2);
        measured.keepHeight("a", 300);
        measured.markTooWide("a");
        measured.keepHeight("b", 200);

        expect(measured.heightOf("a")).toBe(300);
        expect(measured.isTooWide("a")).toBe(true);
    });

    // Every pane width a Base is drawn at is a key of its own.
    it("forgets the Base used longest ago, past its limit", () => {
        const measured = new BaseMeasurements(undefined, 2);
        measured.keepHeight("a", 300);
        measured.markTooWide("b");
        measured.heightOf("a");
        measured.keepHeight("c", 100);

        expect(measured.isTooWide("b")).toBe(false);
        expect(measured.heightOf("a")).toBe(300);
        expect(measured.heightOf("c")).toBe(100);
    });

    it("says when it changed, and only then", () => {
        const changed = vi.fn();
        const measured = new BaseMeasurements(changed);
        measured.keepHeight("a", 300);
        measured.keepHeight("a", 300);
        measured.markTooWide("a");
        measured.markTooWide("a");
        measured.heightOf("a");

        expect(changed).toHaveBeenCalledTimes(2);
    });

    it("comes back from what it saved, oldest Base still first to go", () => {
        const saved = new BaseMeasurements(undefined, 2);
        saved.keepHeight("a", 300);
        saved.markTooWide("b");
        saved.heightOf("a");

        const restored = new BaseMeasurements(undefined, 2);
        restored.restore(JSON.parse(JSON.stringify(saved.toJSON())));
        restored.keepHeight("c", 100);

        expect(restored.isTooWide("b")).toBe(false);
        expect(restored.heightOf("a")).toBe(300);
    });

    it("restores nothing from what it did not save", () => {
        const measured = new BaseMeasurements();
        for (const junk of [
            null,
            {},
            [["a"]],
            [[1, {}]],
            [["a", null]],
            [["a", { height: "1" }]],
            [["a", { tooWide: 1 }]],
        ]) {
            measured.restore(junk);
            expect(measured.toJSON()).toEqual([]);
        }
    });
});
