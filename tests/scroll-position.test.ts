import { describe, it, expect, beforeEach, vi } from "vitest";
import { captureAnchor, restoreAnchor, scrollIntoPlace } from "../src/stream/scroll-position";
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

        const findElement = (f: TFile) => (f.path === "Notes/a.md" ? elA : elB);
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

        const result = captureAnchor(files, {} as HTMLElement, scrollEl, (f) => (f.path === "Notes/a.md" ? elA : elB));

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
            get scrollTop() {
                return scrollTop;
            },
            set scrollTop(v: number) {
                scrollTop = v;
            },
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
            get scrollTop() {
                return scrollTop;
            },
            set scrollTop(v: number) {
                scrollTop = v;
            },
        } as unknown as HTMLElement;

        restoreAnchor(snapshot, scrollEl, () => null);

        expect(scrollTop).toBe(100); // unchanged
    });
});

describe("scrollIntoPlace", () => {
    /** The pane the block is scrolled onto, its top at 0. */
    const pane = Object.assign(makeEl({ top: 0, bottom: 800 }), { scrollTop: 0 });

    /** Scrolls the pane, unless it is `stuck` as far as it goes. */
    const scrolling = (stuck: boolean) =>
        vi.fn(() => {
            if (!stuck) pane.scrollTop += 100;
        });

    /** A block whose top follows `tops`, holding the last value afterwards. */
    function blockMoving(tops: number[], { stuck = false } = {}) {
        const block = document.createElement("div");
        block.scrollIntoView = scrolling(stuck);
        let pass = 0;
        block.getBoundingClientRect = vi.fn(() => ({ top: tops[Math.min(pass++, tops.length - 1)] }) as DOMRect);
        return block;
    }

    /** A layout whose change count follows `counts`, read twice per pass. */
    function layoutCounting(counts: number[] = [0]) {
        let read = 0;
        return {
            layoutChanges: () => counts[Math.min(read++, counts.length - 1)]!,
            drain: vi.fn().mockResolvedValue(undefined),
        };
    }

    it("stops after one pass when the block lands at the top of a quiet stream", async () => {
        const block = blockMoving([0]);
        const layout = layoutCounting();

        await scrollIntoPlace(block, "start", pane, layout);

        expect(block.scrollIntoView).toHaveBeenCalledOnce();
        expect(block.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
        expect(layout.drain).toHaveBeenCalledOnce();
    });

    it("scrolls again while renders above the block keep pushing it down", async () => {
        // Each render above it moves the block; the third pass lands it.
        const block = blockMoving([300, 80, 1]);

        await scrollIntoPlace(block, "start", pane, layoutCounting());

        expect(block.scrollIntoView).toHaveBeenCalledTimes(3);
    });

    it("keeps scrolling while the stream is still rendering, top or not", async () => {
        // At the top from the first pass — but notes are still being rendered,
        // and each one above the block will move it again. Three passes see
        // the count move, the fourth sees it hold.
        const block = blockMoving([0]);

        await scrollIntoPlace(block, "start", pane, layoutCounting([0, 1, 1, 2, 2, 3, 3, 3]));

        expect(block.scrollIntoView).toHaveBeenCalledTimes(4);
    });

    it("gives up rather than chase a block that never arrives", async () => {
        // Scrolled every pass, and pushed away again every pass.
        const block = blockMoving([500]);

        await scrollIntoPlace(block, "start", pane, layoutCounting());

        expect(block.scrollIntoView).toHaveBeenCalledTimes(8); // MAX_SCROLL_PASSES
    });

    /** An element 20px tall whose centre follows `centres`. */
    function elementCentredAt(centres: number[]) {
        const el = document.createElement("span");
        el.scrollIntoView = scrolling(false);
        let pass = 0;
        el.getBoundingClientRect = vi.fn(() => {
            const centre = centres[Math.min(pass++, centres.length - 1)]!;
            return { top: centre - 10, bottom: centre + 10 } as DOMRect;
        });
        return el;
    }

    it("centres an element on the pane", async () => {
        const el = elementCentredAt([400]);

        await scrollIntoPlace(el, "center", pane, layoutCounting());

        expect(el.scrollIntoView).toHaveBeenCalledOnce();
        expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    });

    it("centres it again once the stream around it shifts it", async () => {
        const el = elementCentredAt([1400, 400]);

        await scrollIntoPlace(el, "center", pane, layoutCounting());

        expect(el.scrollIntoView).toHaveBeenCalledTimes(2);
    });

    // A note too short to reach the top of a tall pane: the scroll moves
    // nothing, so no observer has anything new to report.
    it("stops once a scroll moves nothing on a quiet stream", async () => {
        const block = blockMoving([500], { stuck: true });

        await scrollIntoPlace(block, "start", pane, layoutCounting());

        expect(block.scrollIntoView).toHaveBeenCalledTimes(2);
    });

    it("keeps waiting on a stuck scroll while renders are still landing", async () => {
        // A render lands between the first two passes; the third sees none.
        const block = blockMoving([500], { stuck: true });

        await scrollIntoPlace(block, "start", pane, layoutCounting([0, 1, 2, 2, 2, 2]));

        expect(block.scrollIntoView).toHaveBeenCalledTimes(3);
    });
});
