import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Platform } from "obsidian";
import { ScrollAnchor, SCROLL_IDLE_MS } from "../../src/stream/scroll-anchor";

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
 * the stream does; a block given as a list holds elements of those heights.
 * jsdom lays nothing out, so each rect is computed from the heights above it,
 * the scroll, and the content's transform.
 */
function makePane(layout: (number | number[])[]) {
    const pane = document.createElement("div");
    let scrollTop = 0;
    Object.defineProperty(pane, "scrollTop", {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => (scrollTop = value),
    });
    /** The pane's height, which the anchor looks for text starting in. */
    const PANE_HEIGHT = 600;
    /** Where the pane sits in the window: a phone turned hides its status bar. */
    let paneTop = 0;
    pane.getBoundingClientRect = () => ({ top: paneTop, bottom: paneTop + PANE_HEIGHT }) as DOMRect;
    const movePane = (top: number) => (paneTop = top);
    let width = 400;
    Object.defineProperty(pane, "clientWidth", { configurable: true, get: () => width });
    /** The pane turned wider, as a phone on its side. */
    const turn = () => (width = 700);
    const content = pane.createDiv();
    Object.defineProperty(pane, "clientHeight", { configurable: true, get: () => PANE_HEIGHT });
    Object.defineProperty(pane, "scrollHeight", { configurable: true, get: () => heightOf(content) });

    /** A parent is as tall as its children, or the height it is held at. */
    const heightOf = (el: Element): number =>
        el.children.length > 0
            ? Math.max(
                  Array.from(el.children).reduce((sum, child) => sum + heightOf(child), 0),
                  Number((el as HTMLElement).dataset.heldAt ?? 0)
              )
            : Number((el as HTMLElement).dataset.height ?? (el as HTMLElement).dataset.heldAt);
    const topOf = (el: Element): number => {
        if (el === content) return paneTop - scrollTop + shift(content);
        const parent = el.parentElement!;
        const before = Array.from(parent.children).slice(0, Array.from(parent.children).indexOf(el));
        return before.reduce((top, sibling) => top + heightOf(sibling), topOf(parent));
    };
    /** Appends an element `height` tall to `parent`, laid out as the rest. */
    const add = (parent: HTMLElement, height?: number) => {
        const el = parent.createDiv();
        if (height !== undefined) el.dataset.height = String(height);
        el.getBoundingClientRect = () => {
            const top = topOf(el);
            const height = heightOf(el);
            return { top, height, bottom: top + height } as DOMRect;
        };
        return el;
    };

    const blocks = layout.map((spec) => {
        if (!Array.isArray(spec)) return add(content, spec);
        const block = add(content);
        for (const height of spec) add(block, height);
        return block;
    });
    /** What is drawn at `y`, topmost first: the deepest element there, then its ancestors. */
    const drawnAt = (y: number): Element[] => {
        const hits: Element[] = [];
        if (y < paneTop) return hits;
        for (let level: Element | undefined = content; level;) {
            // By the layout's own arithmetic: a test counts what the anchor reads.
            level = Array.from(level.children).find((child) => {
                const top = topOf(child);
                return top <= y && y < top + heightOf(child);
            });
            if (level) hits.unshift(level);
        }
        return [...hits, content, pane];
    };
    vi.spyOn(document, "elementsFromPoint").mockImplementation((_x, y) => drawnAt(y));
    const resize = (el: Element, height: number) => ((el as HTMLElement).dataset.height = String(height));
    /** A Base in `parent`, drawn into a child of it as `NoteBases` draws. */
    const addBase = (parent: HTMLElement) => {
        const base = add(parent);
        base.addClass("daily-note-base");
        /** Replaces what is drawn with elements of `heights`. */
        const draw = (...heights: number[]) => {
            base.empty();
            const drawn = add(base);
            for (const height of heights) add(drawn, height);
            return drawn;
        };
        /** Holds it open at `height`, as `NoteBases` holds a redrawn Base. */
        const holdAt = (height: number) => {
            base.dataset.heldAt = String(height);
            base.style.setProperty("--daily-note-held-height", `${height}px`);
        };
        return { base, draw, holdAt };
    };
    return { pane, content, blocks, resize, add, addBase, turn, movePane };
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
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    /** Blocks observed and first reported, the way ResizeObserver opens. */
    function watch(heights: (number | number[])[], scrollTop: number) {
        const layout = makePane(heights);
        anchor.attach(layout.pane);
        for (const block of layout.blocks) anchor.observe(block);
        observer().resized(...layout.blocks);
        layout.pane.scrollTop = scrollTop;
        anchor.onScroll();
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

    // A phone turned on its side hides the status bar: the pane moves up, and
    // everything in it with the pane.
    it("owes nothing for the pane itself moving", () => {
        const { pane, content, blocks, turn, movePane } = watch([400, 400, 400], 900);

        movePane(-47);
        turn();
        observer().resized(...blocks);
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(shift(content)).toBe(0);
        expect(pane.scrollTop).toBe(900);
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

    // Back lays the stream out and scrolls to the place in one task; the
    // growth that scroll accounts for is reported a frame later.
    it("owes nothing for a change the scroll was set to a place after", () => {
        const { pane, content, blocks, resize } = watch([400, 400, 400], 0);

        resize(blocks[0]!, 1300);
        pane.scrollTop = 1800;
        anchor.placed();
        observer().resized(blocks[0]!);
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(shift(content)).toBe(0);
        expect(pane.scrollTop).toBe(1800);
    });

    it("drops what it owed when the scroll is set to a place", () => {
        const { pane, content, blocks, resize } = watch([400, 400, 400], 900);
        resize(blocks[0]!, 1300);
        observer().resized(blocks[0]!);

        anchor.placed();
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(shift(content)).toBe(0);
        expect(pane.scrollTop).toBe(900);
    });

    it("holds the place again for a change after it was set", () => {
        const { content, blocks, resize } = watch([400, 400, 400], 900);
        anchor.placed();

        resize(blocks[0]!, 500);
        observer().resized(blocks[0]!);

        expect(shift(content)).toBe(-100);
    });

    it("has nothing to set a place for before it is attached", () => {
        expect(() => anchor.placed()).not.toThrow();
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

    // Nothing above the top of the pane is the reader's doing: they can only
    // touch what is on screen. So whatever moves the text there is undone.
    describe("at the text at the top of the pane", () => {
        /** The element in the first block that the pane's top crosses at 500. */
        const reading = (blocks: HTMLElement[]) => blocks[0]!.children[1]!;

        it("holds it when something above it grows inside the note reaching into the pane", () => {
            const { content, blocks, resize } = watch([[400, 400, 400], 400], 500);

            resize(blocks[0]!.children[0]!, 1000);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(-600);
            expect(reading(blocks).getBoundingClientRect().top).toBe(-100);
        });

        // A chevron tapped on screen changes what lies below the reader.
        it("leaves it alone when something below it in that note changes", () => {
            const { content, blocks, resize } = watch([[400, 400, 400], 400], 500);

            resize(blocks[0]!.children[2]!, 1000);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(0);
        });

        it("holds the text starting just below the pane's top when the pane's width changes", () => {
            const { content, blocks, resize, turn } = watch([[400, 400, 400], 400], 500);

            turn();
            resize(blocks[0]!.children[1]!, 200);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(200);
            expect(blocks[0]!.children[2]!.getBoundingClientRect().top).toBe(300);
        });

        // The text reflows over several frames, each reported apart.
        it("holds the text below the pane's top until the reflow is handed to the scroll", () => {
            const { pane, content, blocks, resize, turn } = watch([[400, 400, 400], 400], 500);

            turn();
            resize(blocks[0]!.children[1]!, 300);
            observer().resized(blocks[0]!);
            resize(blocks[0]!.children[1]!, 200);
            observer().resized(blocks[0]!);
            expect(blocks[0]!.children[2]!.getBoundingClientRect().top).toBe(300);

            vi.advanceTimersByTime(SCROLL_IDLE_MS);
            expect(pane.scrollTop).toBe(300);
            resize(blocks[0]!.children[1]!, 1000);
            observer().resized(blocks[0]!);
            expect(shift(content)).toBe(0);
        });

        it("holds the block below text crossing the pane's top, not a span inside that text", () => {
            const { pane, content, blocks, resize, add, turn } = watch([[400, 400, 400], 400], 0);
            const text = blocks[0]!.children[1] as HTMLElement;
            add(text, 200).style.display = "inline";
            const after = add(text, 200);
            pane.scrollTop = 500;
            anchor.onScroll();

            turn();
            resize(after, 100);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(100);
            expect(blocks[0]!.children[2]!.getBoundingClientRect().top).toBe(300);
        });

        it("climbs past what sits beside the text crossing the pane's top, as cards in a row", () => {
            const { pane, content, blocks, resize, add, turn } = watch([[400, 400, 400], 400], 0);
            const row = blocks[0]!.children[1] as HTMLElement;
            const card = add(row, 200);
            add(row, 200).getBoundingClientRect = () => card.getBoundingClientRect();
            pane.scrollTop = 500;
            anchor.onScroll();

            turn();
            resize(card, 100);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(100);
        });

        // A collapsed section's body is display: none, drawn at no place.
        it("passes over what takes up no space to the block after it", () => {
            const { content, blocks, resize, turn } = watch([[400, 400, 0, 400], 400], 500);
            blocks[0]!.children[2]!.getBoundingClientRect = () => ({ top: 0, height: 0, bottom: 0 }) as DOMRect;
            anchor.onScroll();

            turn();
            resize(blocks[0]!.children[1]!, 200);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(200);
        });

        it("holds the text crossing the pane's top when nothing starts below it in the pane", () => {
            const { content, blocks, resize, turn } = watch([[400, 1200, 400]], 500);

            turn();
            resize(blocks[0]!.children[1]!, 1300);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(0);
        });

        it("follows the reader as they scroll", () => {
            const { pane, content, blocks, resize } = watch([[400, 400, 400], 400], 500);

            pane.scrollTop = 900;
            anchor.onScroll();
            resize(blocks[0]!.children[1]!, 500);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(-100);
        });

        // A note re-rendered replaces what it held: its own top still stands.
        it("holds the note's top when the text there was replaced", () => {
            const { content, blocks, resize, add } = watch([400, [400, 400]], 500);
            blocks[1]!.empty();
            for (const height of [400, 400]) add(blocks[1]!, height);

            resize(blocks[0]!, 500);
            observer().resized(blocks[0]!, blocks[1]!);

            expect(shift(content)).toBe(-100);
        });

        // A script sets the scroll between a scroll event and the next resize
        // report, as Back and a glide do: that move is no resize's.
        it("owes nothing for a scroll since it last looked", () => {
            const { pane, content, blocks, resize } = watch([[400, 400, 400], 400], 500);

            pane.scrollTop = 700;
            resize(blocks[1]!, 500);
            observer().resized(blocks[1]!);

            expect(shift(content)).toBe(0);
        });

        // A note renders between frames; the next frame's scroll event comes
        // before the resize report, and the layout it reads holds the growth.
        it("owes a change the scroll hears of before a resize reports it", () => {
            const { pane, content, blocks, resize } = watch([[400, 400, 400], 400], 500);

            resize(blocks[0]!.children[0]!, 1000);
            pane.scrollTop = 450;
            anchor.onScroll();
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(-600);
        });

        it("owes a change made since it last looked before handing over", () => {
            const { pane, blocks, resize } = watch([[400, 400, 400], 400], 500);
            resize(blocks[0]!.children[0]!, 500);
            observer().resized(blocks[0]!);

            resize(blocks[0]!.children[0]!, 600);
            vi.advanceTimersByTime(SCROLL_IDLE_MS);

            expect(pane.scrollTop).toBe(700);
        });

        // Cards and a table list the same entries in the same order, so the
        // reader lands as far through the one as they were through the other.
        it("keeps how far the pane's top was through a Base redrawn under it", () => {
            const { pane, content, blocks, addBase } = makePane([[400], 400]);
            const { base, draw } = addBase(blocks[0]!);
            draw(...Array<number>(10).fill(100));
            anchor.attach(pane);
            for (const block of blocks) anchor.observe(block);
            observer().resized(...blocks);
            pane.scrollTop = 900;
            anchor.onScroll();

            draw(400);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(300);
            expect(base.getBoundingClientRect().top).toBe(-200);
        });

        // A phone's log: turned, the cards re-flow wider before the Base is
        // redrawn, and a card below the pane's top says nothing of the place.
        it("keeps how far the pane's top was through a Base whose cards re-flow as the width changes", () => {
            const { pane, content, blocks, addBase, turn, resize } = makePane([[400], 400]);
            const { base, draw } = addBase(blocks[0]!);
            const drawn = draw(...Array<number>(10).fill(100));
            anchor.attach(pane);
            for (const block of blocks) anchor.observe(block);
            observer().resized(...blocks);
            pane.scrollTop = 900;
            anchor.onScroll();

            turn();
            for (const card of Array.from(drawn.children)) resize(card, 40);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(300);
            expect(base.getBoundingClientRect().top).toBe(-200);
        });

        it("keeps the pane's top in a Base, not the heading starting below it, as the width changes", () => {
            const { pane, content, blocks, add, addBase, turn, resize } = makePane([[400], 400]);
            const { base, draw } = addBase(blocks[0]!);
            const drawn = draw(...Array<number>(10).fill(100));
            add(blocks[0]!, 200);
            anchor.attach(pane);
            for (const block of blocks) anchor.observe(block);
            observer().resized(...blocks);
            pane.scrollTop = 1350;
            anchor.onScroll();

            turn();
            for (const card of Array.from(drawn.children)) resize(card, 40);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(570);
            expect(base.getBoundingClientRect().top).toBe(-380);
        });

        // Held open at the cards' height, the Base shows the table at its top
        // and nothing under it: the reader is held in what is drawn.
        it("holds the pane's top in what a held Base draws, not the space held for it", () => {
            const { pane, blocks, add, addBase } = makePane([[400], 400]);
            const { base, draw, holdAt } = addBase(blocks[0]!);
            draw(...Array<number>(10).fill(100));
            anchor.attach(pane);
            for (const block of blocks) anchor.observe(block);
            observer().resized(...blocks);
            pane.scrollTop = 900;
            anchor.onScroll();

            holdAt(1000);
            const drawn = draw(100);
            observer().resized(blocks[0]!);
            expect(base.getBoundingClientRect().top).toBe(-50);

            // Bases fills the table after drawing it.
            expect(observer().targets).toContain(drawn);
            add(drawn, 300);
            observer().resized(drawn);
            expect(base.getBoundingClientRect().top).toBe(-200);
        });

        // Between emptying a Base and Bases drawing into it, only the held box is there.
        it("holds the pane's top as far through a held Base that draws nothing yet", () => {
            const { pane, blocks, addBase } = makePane([[400], 400]);
            const { base, draw, holdAt } = addBase(blocks[0]!);
            draw(...Array<number>(10).fill(100));
            anchor.attach(pane);
            for (const block of blocks) anchor.observe(block);
            observer().resized(...blocks);
            pane.scrollTop = 900;
            anchor.onScroll();

            holdAt(1000);
            base.empty();
            observer().resized(blocks[0]!);

            expect(base.getBoundingClientRect().top).toBe(-500);
        });

        it("stops hearing a Base once the pane's top leaves it", () => {
            const { pane, blocks, addBase } = makePane([[400], 400]);
            const drawn = addBase(blocks[0]!).draw(...Array<number>(10).fill(100));
            anchor.attach(pane);
            for (const block of blocks) anchor.observe(block);
            observer().resized(...blocks);
            pane.scrollTop = 900;
            anchor.onScroll();
            expect(observer().targets).toContain(drawn);

            pane.scrollTop = 1500;
            anchor.onScroll();

            expect(observer().targets).not.toContain(drawn);
        });

        // Little lies below a note jumped to: the stream shrinks by more, and
        // the browser clamps the scroll to its new end.
        it("counts a scroll clamped to the stream's end as no scroll of the reader's", () => {
            const { pane, blocks, addBase } = makePane([[400], 200]);
            const { base, draw } = addBase(blocks[0]!);
            draw(...Array<number>(10).fill(100));
            anchor.attach(pane);
            for (const block of blocks) anchor.observe(block);
            observer().resized(...blocks);
            pane.scrollTop = 900;
            anchor.onScroll();

            draw(400);
            pane.scrollTop = pane.scrollHeight - pane.clientHeight;
            observer().resized(blocks[0]!);

            expect(base.getBoundingClientRect().top).toBe(-200);
        });

        // Back restores a place measured against a note's full layout; held,
        // the note is still filling, and the text at the top is not yet its own.
        it("anchors at a note still held, not at text still settling inside it", () => {
            const { pane, content, blocks, resize } = watch([[400, 400, 400], 400], 0);
            blocks[0]!.style.setProperty("--daily-note-held-height", "1200px");
            pane.scrollTop = 500;
            anchor.onScroll();

            resize(blocks[0]!.children[0]!, 1000);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(0);
        });

        it("asks what is drawn there, reading only it and what starts after it", () => {
            const long = Array.from({ length: 100 }, () => 40);
            const { blocks } = watch([400, long], 500);
            const reads = [...blocks[1]!.children].map((el) => vi.spyOn(el, "getBoundingClientRect"));

            anchor.onScroll();

            expect(reads.filter((read) => read.mock.calls.length > 0)).toHaveLength(2);
        });

        it("looks past anything drawn over the stream, as the search bar is", () => {
            const { pane, content, blocks, resize } = watch([[400, 400, 400], 400], 0);
            const hit = vi.mocked(document.elementsFromPoint);
            const drawn = hit.getMockImplementation()!;
            hit.mockImplementation((x, y) => [document.body, ...drawn(x, y)]);
            pane.scrollTop = 500;
            anchor.onScroll();

            resize(blocks[0]!.children[0]!, 1000);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(-600);
        });

        // Between two notes, or before the stream has laid out.
        it("finds the note under the pane's top when nothing of it is drawn there", () => {
            const { pane, content, blocks, resize } = watch([400, 400, 400], 0);
            vi.mocked(document.elementsFromPoint).mockReturnValue([]);
            pane.scrollTop = 900;
            anchor.onScroll();

            resize(blocks[0]!, 500);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(-100);
        });

        it("holds nothing with the pane's top past every note", () => {
            const { pane, content, blocks, resize } = watch([400, 400], 0);
            pane.scrollTop = 1000;
            anchor.onScroll();

            resize(blocks[0]!, 500);
            observer().resized(blocks[0]!);

            expect(shift(content)).toBe(0);
        });

        it("picks it anew once the change is handed over", () => {
            const { pane, blocks, resize } = watch([[400, 400, 400], 400], 500);
            resize(blocks[0]!.children[0]!, 1000);
            observer().resized(blocks[0]!);
            vi.advanceTimersByTime(SCROLL_IDLE_MS);

            resize(blocks[0]!.children[0]!, 1100);
            observer().resized(blocks[0]!);
            vi.advanceTimersByTime(SCROLL_IDLE_MS);

            expect(pane.scrollTop).toBe(1200);
        });

        it("reports each rendered element of a note, whose change a held note hides", () => {
            const { blocks } = watch([[400, 400]], 0);

            anchor.observeContent(blocks[0]!.children[0]!);
            expect(observer().targets.has(blocks[0]!.children[0]!)).toBe(true);

            anchor.unobserveContent(blocks[0]!.children[0]!);
            expect(observer().targets.has(blocks[0]!.children[0]!)).toBe(false);
        });

        it("has nothing to hold in a pane holding no notes", () => {
            const { pane, content } = makePane([]);
            anchor.attach(pane);

            anchor.onScroll();

            expect(shift(content)).toBe(0);
        });
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
        anchor.onScroll();
        resize(blocks[0]!, 1300);
        observer().resized(blocks[0]!);
        pane.scrollTop = 0;
        anchor.onScroll();
        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(pane.scrollTop).toBe(900);
    });

    // A write, even of the same value, stops a glide under way: a title tapped
    // just after a hand-over was due never left the spot.
    it("leaves the scroll alone when what it owed came back to nothing", () => {
        const { pane, blocks, resize } = watch([400, 400, 400], 900);
        resize(blocks[0]!, 1300);
        observer().resized(blocks[0]!);
        resize(blocks[0]!, 400);
        observer().resized(blocks[0]!);
        const writes = vi.fn();
        Object.defineProperty(pane, "scrollTop", { get: () => 900, set: writes });

        vi.advanceTimersByTime(SCROLL_IDLE_MS);

        expect(writes).not.toHaveBeenCalled();
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
        anchor.onScroll();

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
