import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { keepInPlace, readPlace, scrollBlockTo, scrollIntoPlace } from "../../src/stream/scroll-position";
import { SETTLE_MS } from "../../src/stream/height-hold";
/** Creates a minimal HTMLElement stub with controllable getBoundingClientRect. */
function makeEl(rect: { top: number; bottom: number }): HTMLElement {
    return {
        getBoundingClientRect: () => ({ top: rect.top, bottom: rect.bottom, left: 0, right: 0, width: 0, height: 0 }),
    } as unknown as HTMLElement;
}

describe("readPlace", () => {
    /** A pane from `top` to 800, holding blocks at `rects` and a sentinel after them. */
    function streamIn(top: number, ...rects: [path: string, top: number, bottom: number][]) {
        const pane = makeEl({ top, bottom: 800 });
        const stream = document.createElement("div");
        for (const [path, blockTop, bottom] of rects) {
            const block = stream.createDiv();
            block.dataset.sourcePath = path;
            block.getBoundingClientRect = () => ({ top: blockTop, bottom }) as DOMRect;
        }
        const last = rects.at(-1)?.[2] ?? 0;
        stream.createDiv().getBoundingClientRect = () => ({ top: last, bottom: last + 1 }) as DOMRect;
        return { pane, stream };
    }

    it("is the first note reaching into the pane, and how far above the pane's top it starts", () => {
        const { pane, stream } = streamIn(200, ["Notes/a.md", 0, 100], ["Notes/b.md", 100, 300]);

        expect(readPlace(stream, pane)).toEqual({ path: "Notes/b.md", offset: -100 });
    });

    it("is the first note when the stream starts inside the pane", () => {
        const { pane, stream } = streamIn(0, ["Notes/a.md", 10, 200], ["Notes/b.md", 200, 400]);

        expect(readPlace(stream, pane)).toEqual({ path: "Notes/a.md", offset: 10 });
    });

    it("is nowhere once the pane is past every note, or in an empty stream", () => {
        expect(readPlace(streamIn(500, ["Notes/a.md", 0, 100]).stream, makeEl({ top: 500, bottom: 800 }))).toBeNull();
        expect(readPlace(streamIn(0).stream, makeEl({ top: 0, bottom: 800 }))).toBeNull();
    });
});

describe("scrollBlockTo", () => {
    it("scrolls by however far the block moved from the offset", () => {
        const scrollEl = { getBoundingClientRect: () => ({ top: 0, bottom: 500 }), scrollTop: 200 } as HTMLElement;

        scrollBlockTo(makeEl({ top: 80, bottom: 300 }), 50, scrollEl);

        expect(scrollEl.scrollTop).toBe(230);
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

    /** An element 20px tall whose center follows `centers`. */
    function elementCenteredAt(centers: number[]) {
        const el = document.createElement("span");
        el.scrollIntoView = scrolling(false);
        let pass = 0;
        el.getBoundingClientRect = vi.fn(() => {
            const center = centers[Math.min(pass++, centers.length - 1)]!;
            return { top: center - 10, bottom: center + 10 } as DOMRect;
        });
        return el;
    }

    it("centers an element on the pane", async () => {
        const el = elementCenteredAt([400]);

        await scrollIntoPlace(el, "center", pane, layoutCounting());

        expect(el.scrollIntoView).toHaveBeenCalledOnce();
        expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    });

    it("centers it again once the stream around it shifts it", async () => {
        const el = elementCenteredAt([1400, 400]);

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

describe("keepInPlace", () => {
    class FakeResizeObserver {
        static last: FakeResizeObserver;
        disconnected = false;
        readonly observed = new Set<Element>();
        constructor(readonly callback: () => void) {
            FakeResizeObserver.last = this;
        }
        observe(el: Element) {
            this.observed.add(el);
        }
        disconnect() {
            this.disconnected = true;
            this.observed.clear();
        }
    }
    // A real observer reports only what it observes, and nothing once disconnected.
    const resized = (el: Element = stream) =>
        FakeResizeObserver.last.observed.has(el) && FakeResizeObserver.last.callback();

    const pane = document.createElement("div");
    pane.getBoundingClientRect = () => ({ top: 0, bottom: 800 }) as DOMRect;
    const stream = document.createElement("div");
    pane.appendChild(stream);
    document.body.appendChild(pane);

    /** A match 20px tall, centered at `center.at`, which a test moves. */
    function match(center: { at: number }) {
        const el = document.createElement("span");
        stream.appendChild(el);
        el.scrollIntoView = vi.fn();
        el.getBoundingClientRect = () => ({ top: center.at - 10, bottom: center.at + 10 }) as DOMRect;
        return el;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    // A Base above the match fills in after it was centered.
    it("centers it again when the stream grows above it", () => {
        const center = { at: 400 };
        const el = match(center);
        keepInPlace(el, "center", pane, stream);

        center.at = 6400;
        resized();

        expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    });

    // A remembered note is held at its full height: a Base filling in inside
    // it moves the match, and resizes nothing outside the note.
    it("centers it again when a Base above it in its note fills in", () => {
        const center = { at: 400 };
        const block = stream.createDiv({ cls: "daily-note-block" });
        const section = block.createDiv();
        const base = section.createDiv();
        const heading = section.createDiv().createEl("h3");
        heading.scrollIntoView = vi.fn();
        heading.getBoundingClientRect = () => ({ top: center.at - 10, bottom: center.at + 10 }) as DOMRect;
        keepInPlace(heading, "center", pane, stream);

        center.at = 1300;
        resized(base);

        expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    });

    it("leaves it alone while it is still in place", () => {
        const el = match({ at: 401 });
        keepInPlace(el, "center", pane, stream);

        resized();

        expect(el.scrollIntoView).not.toHaveBeenCalled();
    });

    it("lets go once the stream is still", () => {
        keepInPlace(match({ at: 400 }), "center", pane, stream);

        vi.advanceTimersByTime(SETTLE_MS);

        expect(FakeResizeObserver.last.disconnected).toBe(true);
    });

    it("keeps holding while the stream keeps resizing", () => {
        keepInPlace(match({ at: 400 }), "center", pane, stream);

        vi.advanceTimersByTime(SETTLE_MS - 1);
        resized();
        vi.advanceTimersByTime(SETTLE_MS - 1);

        expect(FakeResizeObserver.last.disconnected).toBe(false);
    });

    it("lets go when stopped", () => {
        const stop = keepInPlace(match({ at: 400 }), "center", pane, stream);

        stop();

        expect(FakeResizeObserver.last.disconnected).toBe(true);
    });

    it("lets go of an element no longer in the stream", () => {
        const center = { at: 400 };
        const el = match(center);
        keepInPlace(el, "center", pane, stream);

        el.remove();
        center.at = 6400;
        resized();

        expect(el.scrollIntoView).not.toHaveBeenCalled();
        expect(FakeResizeObserver.last.disconnected).toBe(true);
    });
});
