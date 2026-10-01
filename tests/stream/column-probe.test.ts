import { describe, expect, it } from "vitest";
import { probeBeside } from "../../src/stream/column-probe";

describe("probeBeside", () => {
    it("copies the column beside it in its pane, as wide, unseen", () => {
        const pane = document.body.createDiv();
        const column = pane.createDiv({ cls: "daily-notes-stream-container" });
        Object.defineProperty(column, "offsetWidth", { value: 612 });

        const probe = probeBeside(column)!;

        expect(probe.parentElement).toBe(pane);
        expect(probe.classList).toContain("daily-notes-stream-container");
        expect(probe.classList).toContain("daily-notes-stream-probe");
        expect(probe.style.getPropertyValue("--daily-notes-probe-width")).toBe("612px");
        pane.remove();
    });

    it("makes none for a column in no pane", () => {
        expect(probeBeside(document.createElement("div"))).toBeNull();
    });
});
