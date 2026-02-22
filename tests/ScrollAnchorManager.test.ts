import { describe, it, expect, beforeEach } from "vitest";
import { captureAnchor, restoreAnchor } from "../src/ScrollAnchorManager";
import { TFile } from "obsidian";

function makeFile(path: string): TFile {
    return new TFile(path);
}

/** Creates a minimal HTMLElement stub with controllable getBoundingClientRect. */
function makeEl(rect: { top: number; bottom: number }): HTMLElement {
    return {
        getBoundingClientRect: () => ({ top: rect.top, bottom: rect.bottom, left: 0, right: 0, width: 0, height: 0 }),
    } as unknown as HTMLElement;
}

describe("captureAnchor", () => {
    it("returns null when no notes are visible", () => {
        const scrollEl = makeEl({ top: 500, bottom: 900 });
        const result = captureAnchor([], {} as HTMLElement, scrollEl, () => null);
        expect(result).toBeNull();
    });

    it("returns null when findElement returns null for all notes", () => {
        const files = [makeFile("Notes/a.md")];
        const scrollEl = makeEl({ top: 0, bottom: 500 });
        const result = captureAnchor(files, {} as HTMLElement, scrollEl, () => null);
        expect(result).toBeNull();
    });

    it("skips elements whose bottom is at or above the scroll container top", () => {
        const files = [makeFile("Notes/a.md"), makeFile("Notes/b.md")];
        const scrollEl = makeEl({ top: 200, bottom: 700 });

        // 'a' is fully above the scroll container (bottom=100, scrollRect.top=200 → elBottom=-100)
        const elA = makeEl({ top: 0, bottom: 100 });
        // 'b' is partially visible (bottom=300, scrollRect.top=200 → elBottom=100 > 0)
        const elB = makeEl({ top: 150, bottom: 300 });

        const findElement = (f: TFile) => f.path === "Notes/a.md" ? elA : elB;
        const result = captureAnchor(files, {} as HTMLElement, scrollEl, findElement);

        expect(result).not.toBeNull();
        expect(result!.file.path).toBe("Notes/b.md");
        // relativeTopPx = elB.top(150) - scrollRect.top(200) = -50
        expect(result!.relativeTopPx).toBe(-50);
    });

    it("picks the first note with a positive elBottom", () => {
        const files = [makeFile("Notes/a.md"), makeFile("Notes/b.md")];
        const scrollEl = makeEl({ top: 0, bottom: 500 });

        const elA = makeEl({ top: 10, bottom: 200 });
        const elB = makeEl({ top: 210, bottom: 400 });

        const result = captureAnchor(files, {} as HTMLElement, scrollEl, (f) =>
            f.path === "Notes/a.md" ? elA : elB
        );

        expect(result!.file.path).toBe("Notes/a.md");
        expect(result!.relativeTopPx).toBe(10); // 10 - 0
    });
});

describe("restoreAnchor", () => {
    it("adjusts scrollTop by the delta between old and new relative top", () => {
        const file = makeFile("Notes/a.md");
        const snapshot = { file, relativeTopPx: 50 };

        let scrollTop = 200;
        const scrollEl = {
            getBoundingClientRect: () => ({ top: 0, bottom: 500 }),
            get scrollTop() { return scrollTop; },
            set scrollTop(v: number) { scrollTop = v; },
        } as unknown as HTMLElement;

        // After re-render the element is now at top=80 (relative=80)
        const el = makeEl({ top: 80, bottom: 300 });

        restoreAnchor(snapshot, scrollEl, () => el);

        // delta = currentRelativeTop(80) - snapshot.relativeTopPx(50) = 30
        // new scrollTop = 200 + 30 = 230
        expect(scrollTop).toBe(230);
    });

    it("does nothing when findElement returns null", () => {
        const file = makeFile("Notes/a.md");
        const snapshot = { file, relativeTopPx: 50 };

        let scrollTop = 100;
        const scrollEl = {
            getBoundingClientRect: () => ({ top: 0, bottom: 500 }),
            get scrollTop() { return scrollTop; },
            set scrollTop(v: number) { scrollTop = v; },
        } as unknown as HTMLElement;

        restoreAnchor(snapshot, scrollEl, () => null);

        expect(scrollTop).toBe(100); // unchanged
    });
});
