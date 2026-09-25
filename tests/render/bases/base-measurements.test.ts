import { describe, expect, it } from "vitest";
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
        const measured = new BaseMeasurements(2);
        measured.keepHeight("a", 300);
        measured.markTooWide("a");
        measured.keepHeight("b", 200);

        expect(measured.heightOf("a")).toBe(300);
        expect(measured.isTooWide("a")).toBe(true);
    });

    // Every pane width a Base is drawn at is a key of its own.
    it("forgets the Base used longest ago, past its limit", () => {
        const measured = new BaseMeasurements(2);
        measured.keepHeight("a", 300);
        measured.markTooWide("b");
        measured.heightOf("a");
        measured.keepHeight("c", 100);

        expect(measured.isTooWide("b")).toBe(false);
        expect(measured.heightOf("a")).toBe(300);
        expect(measured.heightOf("c")).toBe(100);
    });
});
