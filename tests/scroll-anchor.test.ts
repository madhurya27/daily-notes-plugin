import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Platform } from "obsidian";
import { ScrollAnchor, SCROLL_IDLE_MS } from "../src/stream/scroll-anchor";

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    disconnected = false;
    readonly targets = new Set<Element>();
    constructor(readonly callback: (entries: { target: Element }[]) => void) {
        FakeResizeObserver.instances.push(this);
    }
    observe(target: Element) {
        this.targets.add(target);
    }
    unobserve(target: Element) {
        this.targets.delete(target);
    }
    disconnect() {
        this.disconnected = true;
    }
    /** Reports `targets` as resized, in the order given. */
    resized(...targets: Element[]) {
        this.callback(targets.map((target) => ({ target })));
    }
}

const observer = () => FakeResizeObserver.instances[0]!;

/** How far styles.css draws `el` from where it lies, through the custom property. */
const shift = (el: HTMLElement) =>
    el.hasClass("is-scroll-shifted") ? parseFloat(el.style.getPropertyValue("--daily-notes-scroll-shift")) : 0;

/**
 * A pane stacking blocks one under the other inside the stream's content, as
 * the stream does. jsdom lays nothing out, so each block's rect is computed
 * from the heights above it, the scroll, and the content's transform.
 */
function makePane(heights: number[]) {
    const pane = document.createElement("div");
    let scrollTop = 0;
    Object.defineProperty(pane, "scrollTop", {
        get: () => scrollTop,
        set: (value: number) => (scrollTop = value),
    });
    pane.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;

    const content = pane.createDiv();
    const blocks = heights.map((height) => {
        const block = content.createDiv();
        block.dataset.height = String(height);
        return block;
    });
    for (const [index, block] of blocks.entries()) {
        block.getBoundingClientRect = () => {
            const above = blocks.slice(0, index).reduce((sum, b) => sum + Number(b.dataset.height), 0);
            return { top: above - scrollTop + shift(content), height: Number(block.dataset.height) } as DOMRect;
        };
    }
    const resize = (block: HTMLElement, height: number) => (block.dataset.height = String(height));
    return { pane, content, blocks, resize };
}

describe("ScrollAnchor", () => {
    let anchor: ScrollAnchor;

    beforeEach(() => {
        vi.useFakeTimers();
        FakeResizeObserver.instances = [];
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        vi.stubGlobal("CSS", { supports: () => false });
        anchor = new ScrollAnchor();
    });

    afterEach(() => {
        anchor.detach();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    /** Blocks observed and first reported, the way ResizeObserver opens. */
    function watch(heights: number[], scrollTop: number) {
        const layout = makePane(heights);
        anchor.attach(layout.pane);
        for (const block of layout.blocks) anchor.observe(block);
        observer().resized(...layout.blocks);
        layout.pane.scrollTop = scrollTop;
        return layout;
    }

    /** Where the third block is drawn: under the pane's top, whatever moved above it. */
    const readerTop = (blocks: HTMLElement[]) => blocks[2]!.getBoundingClientRect().top;

    // iOS owns the scroll mid-glide: a write then is dropped or undone, and
    // plain writes jumped on a phone. So a change is drawn as a shift first.
    it("holds the reader's place when a block above the pane grows, by shifting the content", () => {
        const { pane, content, blocks, resize } = watch([400, 400, 400], 900);

        resize(blocks[0]!, 1300);
        observer().resized(blocks[0]!);

        expect(pane.scrollTop).toBe(900);
        expect(shift(content)).toBe(-900);
        expect(readerTop(blocks)).toBe(-100);
    });

    it("holds it when a block above shrinks", () => {
        const { content, blocks, resize } = watch([400, 400, 400], 900);

        resize(blocks[1]!, 100);
        observer().resized(blocks[1]!);

        expect(shift(content)).toBe(300);
        expect(readerTop(blocks)).toBe(-100);
    });

    it("adds up several blocks above, reported together or apart", () => {
        const { content, blocks, resize } = watch([400, 400, 400], 900);

        resize(blocks[0]!, 500);
        resize(blocks[1]!, 600);
        observer().resized(blocks[0]!, blocks[1]!);
        resize(blocks[0]!, 600);
        observer().resized(blocks[0]!);

        expect(shift(content)).toBe(-400);
        expect(readerTop(blocks)).toBe(-100);
    });

    // A chevron tapped in the note at the top of the pane grows it below the
    // tap; moving the scroll would carry the note away from the reader.
    it("leaves the place alone when a block reaching into the pane changes", () => {
        const { pane, content, blocks, resize } = watch([400, 400, 400], 300);

        resize(blocks[0]!, 1000);
        observer().resized(blocks[0]!);
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(shift(content)).toBe(0);
        expect(pane.scrollTop).toBe(300);
    });

    it("leaves it alone when a block below the pane's top changes", () => {
        const { pane, content, blocks, resize } = watch([400, 400, 400], 300);

        resize(blocks[2]!, 1000);
        observer().resized(blocks[2]!);
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(shift(content)).toBe(0);
        expect(pane.scrollTop).toBe(300);
    });

    // The first report is a block's size, not a change: a stream restored far
    // down would otherwise be pushed by every block above it.
    it("takes a block's first report as its height, not a change", () => {
        const { pane, content, blocks } = makePane([400, 400, 400]);
        pane.scrollTop = 900;
        anchor.attach(pane);
        for (const block of blocks) anchor.observe(block);

        observer().resized(...blocks);

        expect(shift(content)).toBe(0);
    });

    it("hands the shift to the scroll once the scroll is still, in one step", () => {
        const { pane, content, blocks, resize } = watch([400, 400, 400], 900);
        resize(blocks[0]!, 1300);
        observer().resized(blocks[0]!);

        vi.advanceTimersByTime(SCROLL_IDLE_MS - 1);
        expect(pane.scrollTop).toBe(900);

        vi.advanceTimersByTime(1);
        expect(pane.scrollTop).toBe(1800);
        expect(content.hasClass("is-scroll-shifted")).toBe(false);
        expect(content.style.getPropertyValue("--daily-notes-scroll-shift")).toBe("");
        expect(readerTop(blocks)).toBe(-100);
    });

    it("waits for a scroll to stop before handing it over", () => {
        const { pane, blocks, resize } = watch([400, 400, 400], 900);
        resize(blocks[0]!, 1300);
        observer().resized(blocks[0]!);

        vi.advanceTimersByTime(SCROLL_IDLE_MS - 1);
        anchor.onScroll();
        vi.advanceTimersByTime(SCROLL_IDLE_MS - 1);
        expect(pane.scrollTop).toBe(900);

        vi.advanceTimersByTime(1);
        expect(pane.scrollTop).toBe(1800);
    });

    // Nothing lies above the top, so what grew above the reader on the way
    // up is owed to no one: handing it over would stop short of the top.
    it("lands a scroll headed for the top at the top", () => {
        const { pane, content, blocks, resize } = watch([400, 400, 400], 900);
        anchor.headForTop();
        resize(blocks[0]!, 1300);
        observer().resized(blocks[0]!);

        pane.scrollTop = 0;
        anchor.onScroll();
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(pane.scrollTop).toBe(0);
        expect(shift(content)).toBe(0);
    });

    it("hands over as usual when the reader stops the scroll short of the top", () => {
        const { pane, blocks, resize } = watch([400, 400, 400], 900);
        anchor.headForTop();
        resize(blocks[0]!, 1300);
        observer().resized(blocks[0]!);

        pane.scrollTop = 500;
        anchor.onScroll();
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(pane.scrollTop).toBe(1400);
    });

    it("forgets the top once a scroll has settled", () => {
        const { pane, blocks, resize } = watch([400, 400, 400], 900);
        anchor.headForTop();
        resize(blocks[0]!, 1300);
        observer().resized(blocks[0]!);
        pane.scrollTop = 500;
        anchor.onScroll();
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        // The block above grows again, and the reader scrolls up by hand.
        resize(blocks[0]!, 1400);
        observer().resized(blocks[0]!);
        pane.scrollTop = 0;
        anchor.onScroll();
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(pane.scrollTop).toBe(100);
    });

    it("forgets the top once a scroll arrives there owing nothing", () => {
        const { pane, blocks, resize } = watch([400, 400, 400], 900);
        anchor.headForTop();
        pane.scrollTop = 0;
        anchor.onScroll();

        // The reader scrolls down, then back up by hand past a block that grew.
        pane.scrollTop = 900;
        resize(blocks[0]!, 1300);
        observer().resized(blocks[0]!);
        pane.scrollTop = 0;
        anchor.onScroll();
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(pane.scrollTop).toBe(900);
    });

    it("sets no timer for a scroll with nothing owed", () => {
        watch([400, 400, 400], 900);

        anchor.onScroll();

        expect(vi.getTimerCount()).toBe(0);
    });

    it("drops the shift, and the wait, on detach", () => {
        const { pane, content, blocks, resize } = watch([400, 400, 400], 900);
        resize(blocks[0]!, 1300);
        observer().resized(blocks[0]!);

        anchor.detach();
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(shift(content)).toBe(0);
        expect(content.style.getPropertyValue("--daily-notes-scroll-shift")).toBe("");
        expect(pane.scrollTop).toBe(900);
    });

    it("stops watching a block unobserved, and everything on detach", () => {
        const { blocks } = watch([400, 400], 0);

        anchor.unobserve(blocks[0]!);
        expect([...observer().targets]).toEqual([blocks[1]]);

        anchor.detach();
        expect(observer().disconnected).toBe(true);
    });

    it("drops the old watch when attached again", () => {
        const { pane } = watch([400, 400], 0);

        anchor.attach(pane);

        expect(observer().disconnected).toBe(true);
        expect(FakeResizeObserver.instances).toHaveLength(2);
    });

    // A platform anchoring after all would correct a second time.
    it("turns the platform's own anchoring off while it anchors", () => {
        const { pane } = watch([400], 0);
        expect(pane.hasClass("is-scroll-anchored")).toBe(true);

        anchor.detach();
        expect(pane.hasClass("is-scroll-anchored")).toBe(false);
    });

    it("leaves the anchoring to a platform that has its own", () => {
        const supports = vi.fn(() => true);
        vi.stubGlobal("CSS", { supports });
        const { pane, blocks } = makePane([400]);

        anchor.attach(pane);
        anchor.observe(blocks[0]!);

        expect(supports).toHaveBeenCalledWith("overflow-anchor", "auto");
        expect(FakeResizeObserver.instances).toEqual([]);
        expect(pane.hasClass("is-scroll-anchored")).toBe(false);
    });

    // iOS WebKit parses overflow-anchor and anchors nothing: a trace from a
    // phone showed the anchor never switched on, and the text jumped.
    it("anchors in the iOS app, whatever CSS.supports claims", () => {
        vi.stubGlobal("CSS", { supports: () => true });
        Platform.isIosApp = true;
        try {
            anchor.attach(makePane([]).pane);
        } finally {
            Platform.isIosApp = false;
        }

        expect(FakeResizeObserver.instances).toHaveLength(1);
    });
});
