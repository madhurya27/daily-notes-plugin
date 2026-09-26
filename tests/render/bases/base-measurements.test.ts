import { describe, expect, it, vi } from "vitest";
import { BaseMeasurements, baseDigest, type BaseKey } from "../../../src/render/bases/base-measurements";

const key = (path: string, base = "b1", layout = "600:16px"): BaseKey => ({ layout, path, base });

describe("BaseMeasurements", () => {
    it("keeps the height a Base held still at, per layout", () => {
        const measured = new BaseMeasurements();
        measured.keepHeight(key("a.md"), 300);

        expect(measured.heightOf(key("a.md"))).toBe(300);
        expect(measured.heightOf(key("a.md", "b2"))).toBeUndefined();
        expect(measured.heightOf(key("a.md", "b1", "400:16px"))).toBeUndefined();
    });

    it("keeps which Bases were too wide for a table", () => {
        const measured = new BaseMeasurements();
        measured.markTooWide(key("a.md"));

        expect(measured.isTooWide(key("a.md"))).toBe(true);
        expect(measured.isTooWide(key("b.md"))).toBe(false);
    });

    it("keeps a Base's height and width answer as one measurement", () => {
        const measured = new BaseMeasurements();
        measured.keepHeight(key("a.md"), 300);
        measured.markTooWide(key("a.md"));

        expect(measured.toJSON()).toEqual([["600:16px", [["a.md\nb1", { height: 300, tooWide: true }]]]]);
    });

    // The notes' rule (ADR 0010): nothing to tune per vault, however many Bases.
    it("forgets the layout used longest ago, past its limit", () => {
        const measured = new BaseMeasurements(undefined, 2);
        measured.keepHeight(key("a.md", "b1", "a"), 300);
        measured.markTooWide(key("a.md", "b1", "b"));
        measured.heightOf(key("a.md", "b1", "a"));
        measured.keepHeight(key("a.md", "b1", "c"), 100);

        expect(measured.isTooWide(key("a.md", "b1", "b"))).toBe(false);
        expect(measured.heightOf(key("a.md", "b1", "a"))).toBe(300);
    });

    it("carries a note's Bases across a rename, and forgets a deleted note's", () => {
        const measured = new BaseMeasurements();
        measured.keepHeight(key("old.md"), 300);
        measured.keepHeight(key("gone.md"), 200);
        measured.keepHeight(key("stale.md"), 100);

        measured.rename("old.md", "new.md");
        measured.forget("gone.md");
        measured.retainOnly(new Set(["new.md"]));

        expect(measured.toJSON()).toEqual([["600:16px", [["new.md\nb1", { height: 300 }]]]]);
    });

    it("says when it changed, and only then", () => {
        const changed = vi.fn();
        const measured = new BaseMeasurements(changed);
        measured.keepHeight(key("a.md"), 300);
        measured.keepHeight(key("a.md"), 300);
        measured.markTooWide(key("a.md"));
        measured.markTooWide(key("a.md"));
        measured.heightOf(key("a.md"));

        expect(changed).toHaveBeenCalledTimes(2);
    });

    it("comes back from what it saved", () => {
        const saved = new BaseMeasurements();
        saved.keepHeight(key("a.md"), 300);
        saved.markTooWide(key("b.md"));

        const restored = new BaseMeasurements();
        restored.restore(JSON.parse(JSON.stringify(saved.toJSON())));

        expect(restored.heightOf(key("a.md"))).toBe(300);
        expect(restored.isTooWide(key("b.md"))).toBe(true);
    });

    it("restores nothing from what it did not save", () => {
        const measured = new BaseMeasurements();
        for (const junk of [
            null,
            [["k", { height: 1 }]],
            [["l", [["k", null]]]],
            [["l", [["k", { height: "1" }]]]],
            [["l", [["k", { tooWide: 1 }]]]],
        ]) {
            measured.restore(junk);
            expect(measured.toJSON()).toEqual([]);
        }
    });
});

describe("baseDigest", () => {
    // A key holding a whole .base file ran to kilobytes a Base.
    it("stands for a Base's source in a few characters", () => {
        const definition = "views:\n" + "  - type: table\n".repeat(200);

        expect(baseDigest("![[Reading.base]]", definition)).toMatch(/^[0-9a-z]{1,11}$/);
        expect(baseDigest("![[Reading.base]]", definition)).toBe(baseDigest("![[Reading.base]]", definition));
        expect(baseDigest("![[Reading.base]]", definition)).not.toBe(baseDigest("![[Reading.base#Two]]", definition));
        expect(baseDigest("![[Reading.base]]", definition)).not.toBe(baseDigest("![[Reading.base]]", null));
    });
});
