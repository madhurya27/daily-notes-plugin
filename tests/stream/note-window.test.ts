import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Component, TFile } from "obsidian";
import { NoteWindowManager, ESTIMATED_NOTE_HEIGHT_PX } from "../../src/stream/note-window";
import { SCROLL_IDLE_MS, ScrollAnchor } from "../../src/stream/scroll-anchor";
import { NoteHeights } from "../../src/stream/note-heights";
import { HOLD_LIMIT_MS, SETTLE_MS } from "../../src/stream/height-hold";

/**
 * The two observers, by the rootMargin they were constructed with: the render
 * one reaches less far than the unload one, which is the hysteresis.
 */
interface Observers {
    render: IntersectionObserverCallback;
    unload: IntersectionObserverCallback;
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    margins: string[];
}

let observers: Observers;

function stubObservers(): void {
    const callbacks: IntersectionObserverCallback[] = [];
    observers = {
        render: () => {},
        unload: () => {},
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
        margins: [],
    };
    vi.stubGlobal(
        "IntersectionObserver",
        // A regular function, so it can be called with `new`.
        vi.fn(function (cb: IntersectionObserverCallback, init?: IntersectionObserverInit) {
            callbacks.push(cb);
            observers.margins.push(init?.rootMargin ?? "");
            observers.render = callbacks[0]!;
            observers.unload = callbacks[1] ?? callbacks[0]!;
            return {
                observe: observers.observe,
                unobserve: observers.unobserve,
                disconnect: observers.disconnect,
            };
        })
    );
}

/** Every ResizeObserver's callback, so a test can report a block resized. */
let resizeCallbacks: ResizeObserverCallback[];
/** What the last ResizeObserver constructed was told to watch. */
let lastResizeObserve: ReturnType<typeof vi.fn>;

function stubResizeObservers(): void {
    resizeCallbacks = [];
    vi.stubGlobal(
        "ResizeObserver",
        vi.fn(function (cb: ResizeObserverCallback) {
            resizeCallbacks.push(cb);
            lastResizeObserve = vi.fn();
            return { observe: lastResizeObserve, unobserve: vi.fn(), disconnect: vi.fn() };
        })
    );
}

/** Reports `block` resized to every ResizeObserver. */
function resize(block: HTMLElement): void {
    const entries = [{ target: block } as unknown as ResizeObserverEntry];
    for (const cb of resizeCallbacks) cb(entries, {} as ResizeObserver);
}

/** Drives one observer's callback for a block. */
function fire(cb: IntersectionObserverCallback, block: HTMLElement, isIntersecting: boolean): void {
    cb([{ target: block, isIntersecting } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
}

/** A renderer stub that records what it rendered and discarded. */
function makeRenderer(opts: { render?: (block: HTMLElement) => void | Promise<void> } = {}) {
    const discarded: Component[] = [];
    return {
        createBlock: vi.fn((file: TFile) => {
            const block = document.createElement("div");
            block.addClass("daily-note-block");
            block.dataset.sourcePath = file.path;
            return block;
        }),
        renderInto: vi.fn(async (block: HTMLElement, _file: TFile) => {
            await opts.render?.(block);
            block.createDiv({ cls: "daily-note-content" });
            return new Component();
        }),
        discard: vi.fn((component: Component) => {
            discarded.push(component);
        }),
        discarded,
    };
}

/** The view's queue: one task at a time, in arrival order (ADR 0004). */
function makeQueue() {
    let queue = Promise.resolve();
    return (task: () => Promise<void>) => {
        queue = queue.then(task);
    };
}

/** jsdom reports no layout, so a scroll root states its height outright. */
function makeScrollRoot(clientHeight: number): HTMLElement {
    const root = document.createElement("div");
    Object.defineProperty(root, "clientHeight", { value: clientHeight, configurable: true });
    return root;
}

/** The layout every manager here measures in, unless a test changes it. */
const LAYOUT = "600:16px";

function makeManager(
    renderer = makeRenderer(),
    measure = () => 500,
    scrollRoot = makeScrollRoot(800),
    heights = new NoteHeights()
) {
    const manager = new NoteWindowManager(renderer as never, makeQueue(), heights, () => LAYOUT, measure);
    manager.attach(scrollRoot);
    return { manager, renderer, scrollRoot, heights };
}

/** Settles the render promise chain. Timers are fake, so this only runs what is due. */
const settle = () => vi.advanceTimersByTimeAsync(0);

/** Lets the scroll be still long enough for waiting unloads to run. */
const still = () => vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS);

const FILE = new TFile("Notes/2025-01-01.md");

/** The reserved height, which styles.css turns into a real one. */
const placeholderHeight = (block: HTMLElement) => block.style.getPropertyValue("--daily-note-placeholder-height");

beforeEach(() => {
    stubObservers();
    stubResizeObservers();
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

describe("NoteWindowManager measurement", () => {
    it("measures the laid-out box by default", () => {
        const manager = new NoteWindowManager(makeRenderer() as never, makeQueue(), new NoteHeights(), () => LAYOUT);
        manager.attach(document.createElement("div"));
        const block = manager.add(FILE);
        block.getBoundingClientRect = () => ({ height: 321 }) as DOMRect;
        document.body.appendChild(block);

        fire(observers.render, block, true);
        return settle().then(async () => {
            fire(observers.unload, block, false);
            await still();
            expect(placeholderHeight(block)).toBe("321px");
        });
    });
});

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

describe("NoteWindowManager.add", () => {
    it("returns an unloaded block at the estimated height", () => {
        const { manager } = makeManager();
        const block = manager.add(FILE);
        expect(block.classList.contains("is-unloaded")).toBe(true);
        expect(placeholderHeight(block)).toBe(`${ESTIMATED_NOTE_HEIGHT_PX}px`);
        expect(block.childElementCount).toBe(0);
    });

    it("renders nothing itself — appending a batch stays O(1) DOM per note", () => {
        const { manager, renderer } = makeManager();
        manager.add(FILE);
        expect(renderer.renderInto).not.toHaveBeenCalled();
    });

    it("observes the block with both observers", () => {
        const { manager } = makeManager();
        const block = manager.add(FILE);
        expect(observers.observe).toHaveBeenCalledWith(block);
        expect(observers.observe).toHaveBeenCalledTimes(2);
    });
});

// ---------------------------------------------------------------------------
// Remembered heights
// ---------------------------------------------------------------------------

/**
 * A placeholder reserves what its note last measured, in this session or an
 * earlier one (ADR 0010); a note never measured, what its neighbours did.
 */
describe("NoteWindowManager remembered heights", () => {
    /** Renders a block for `file`, measuring `px`. */
    async function renderAt(px: number, file = FILE) {
        const setup = makeManager(makeRenderer(), () => px);
        const block = setup.manager.add(file);
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();
        return { ...setup, block };
    }

    it("reserves the height the note last measured", () => {
        const heights = new NoteHeights();
        heights.keep(LAYOUT, FILE.path, 812);
        heights.keep("400:16px", FILE.path, 1200);
        const { manager } = makeManager(undefined, undefined, undefined, heights);

        expect(placeholderHeight(manager.add(FILE))).toBe("812px");
    });

    it("reserves what the layout's notes measured for a note never measured", () => {
        const heights = new NoteHeights();
        for (const [path, px] of [
            ["a.md", 700],
            ["b.md", 9000],
            ["c.md", 710],
        ] as const)
            heights.keep(LAYOUT, path, px);
        const { manager } = makeManager(undefined, undefined, undefined, heights);

        expect(placeholderHeight(manager.add(FILE))).toBe("710px");
    });

    it("falls back to the constant before anything has been measured", () => {
        const { manager } = makeManager();
        expect(placeholderHeight(manager.add(FILE))).toBe(`${ESTIMATED_NOTE_HEIGHT_PX}px`);
    });

    // iOS ends an app without unloading the plugin: a note still on screen
    // has to be remembered before then.
    it("remembers a note's height once nothing in it has resized for a while", async () => {
        const { heights } = await renderAt(640);

        await vi.advanceTimersByTimeAsync(SETTLE_MS - 1);
        expect(heights.heightOf(LAYOUT, FILE.path)).toBeUndefined();
        await vi.advanceTimersByTimeAsync(1);
        expect(heights.heightOf(LAYOUT, FILE.path)).toBe(640);
    });

    // A Base filling, or an image loading, measures short until it is done.
    it("keeps the height it had while the note is still changing", async () => {
        const { heights, block } = await renderAt(640);
        heights.keep(LAYOUT, FILE.path, 700);

        await vi.advanceTimersByTimeAsync(SETTLE_MS - 100);
        resize(block);
        await vi.advanceTimersByTimeAsync(SETTLE_MS - 1);
        expect(heights.heightOf(LAYOUT, FILE.path)).toBe(700);

        await vi.advanceTimersByTimeAsync(1);
        expect(heights.heightOf(LAYOUT, FILE.path)).toBe(640);
    });

    it("keeps watching a rendered note when the pane's height changes", async () => {
        const { manager, scrollRoot, block } = await renderAt(640);
        const unrendered = manager.add(new TFile("Notes/2025-01-02.md"));

        Object.defineProperty(scrollRoot, "clientHeight", { value: 1600, configurable: true });
        manager.refreshMargins();

        expect(lastResizeObserve).toHaveBeenCalledWith(block);
        expect(lastResizeObserve).not.toHaveBeenCalledWith(unrendered);
    });

    it("reserves what an unsettled note unloads at, and remembers none of it", async () => {
        const { heights, block } = await renderAt(640);
        await vi.advanceTimersByTimeAsync(SETTLE_MS - 100);
        fire(observers.unload, block, false);
        resize(block);

        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS);
        expect(placeholderHeight(block)).toBe("640px");
        await vi.advanceTimersByTimeAsync(SETTLE_MS);
        expect(heights.heightOf(LAYOUT, FILE.path)).toBeUndefined();
    });

    it("remembers nothing of a block measuring nothing, and keeps what it reserved", async () => {
        const heights = new NoteHeights();
        heights.keep(LAYOUT, FILE.path, 700);
        const { manager } = makeManager(makeRenderer(), () => 0, undefined, heights);
        const block = manager.add(FILE);
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();

        await vi.advanceTimersByTimeAsync(SETTLE_MS);
        fire(observers.unload, block, false);
        await still();

        expect(heights.heightOf(LAYOUT, FILE.path)).toBe(700);
        expect(placeholderHeight(block)).toBe("700px");
    });

    // Reading the layout lays the stream out: a batch appends between adds.
    it("reads the layout once for a batch of placeholders", async () => {
        const layoutOf = vi.fn(() => LAYOUT);
        const manager = new NoteWindowManager(makeRenderer() as never, makeQueue(), new NoteHeights(), layoutOf);
        manager.attach(makeScrollRoot(800));

        for (let day = 1; day <= 3; day++) manager.add(new TFile(`Notes/2025-01-0${day}.md`));
        expect(layoutOf).toHaveBeenCalledOnce();

        await settle();
        manager.add(new TFile("Notes/2025-01-04.md"));
        expect(layoutOf).toHaveBeenCalledTimes(2);
    });
});

// ---------------------------------------------------------------------------
// Holding a note while it fills
// ---------------------------------------------------------------------------

/**
 * A note renders short and fills: Bases draw empty, images load late. Held at
 * a height it measured before, it never draws the dip (docs/decisions.md,
 * 2026-09-26).
 */
describe("NoteWindowManager holds a rendered note until it settles", () => {
    const heldHeight = (block: HTMLElement) => block.style.getPropertyValue("--daily-note-held-height");

    /** Renders a block for FILE, which measured `remembered` before, if anything. */
    async function renderRemembering(remembered: number | undefined, measure = () => 640) {
        const heights = new NoteHeights();
        if (remembered !== undefined) heights.keep(LAYOUT, FILE.path, remembered);
        const setup = makeManager(makeRenderer(), measure, undefined, heights);
        const block = setup.manager.add(FILE);
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();
        return { ...setup, block };
    }

    afterEach(() => document.body.empty());

    it("holds it at the height it measured before", async () => {
        const { block } = await renderRemembering(812);

        expect(heldHeight(block)).toBe("812px");
        expect(placeholderHeight(block)).toBe("");
    });

    // A guess held would leave a short note's gap on screen until it settles.
    it("holds nothing on a note never measured", async () => {
        const { block } = await renderRemembering(undefined);

        expect(heldHeight(block)).toBe("");
    });

    it("lets go once it settles, remembering what it measures without the hold", async () => {
        const { block, heights } = await renderRemembering(812, () =>
            block.style.getPropertyValue("--daily-note-held-height") ? 812 : 640
        );

        await vi.advanceTimersByTimeAsync(SETTLE_MS);

        expect(heldHeight(block)).toBe("");
        expect(heights.heightOf(LAYOUT, FILE.path)).toBe(640);
    });

    // Held, the block cannot shrink: only its contents report a dip.
    it("waits on its contents, which move under the hold", async () => {
        const { block } = await renderRemembering(812);

        await vi.advanceTimersByTimeAsync(SETTLE_MS - 100);
        resize(block.firstElementChild as HTMLElement);
        await vi.advanceTimersByTimeAsync(SETTLE_MS - 1);

        expect(heldHeight(block)).toBe("812px");
        expect(lastResizeObserve).toHaveBeenCalledWith(block.firstElementChild);
    });

    it("lets go of a note that never settles, and remembers nothing of it", async () => {
        const { block, heights } = await renderRemembering(812);

        for (let t = 0; t < HOLD_LIMIT_MS; t += SETTLE_MS / 2) {
            resize(block);
            await vi.advanceTimersByTimeAsync(SETTLE_MS / 2);
        }

        expect(heldHeight(block)).toBe("");
        expect(heights.heightOf(LAYOUT, FILE.path)).toBe(812);
    });

    // A note measured this session holds what it unloaded at.
    it("holds a note coming back at what it unloaded at", async () => {
        const { manager, block } = await renderRemembering(undefined);
        await vi.advanceTimersByTimeAsync(SETTLE_MS);
        fire(observers.unload, block, false);
        await still();

        manager.render(block);
        await settle();

        expect(heldHeight(block)).toBe("640px");
    });

    it("holds a note re-rendered in place at the height it showed", async () => {
        const { manager, block } = await renderRemembering(undefined);
        await vi.advanceTimersByTimeAsync(SETTLE_MS);

        await manager.refresh(block);

        expect(heldHeight(block)).toBe("640px");
    });

    // Collapsing a section is the reader's own change: holding it would leave a gap.
    it("lets go the moment the reader touches the note", async () => {
        const { manager, block } = await renderRemembering(812);

        manager.onTouch(block.firstElementChild);

        expect(heldHeight(block)).toBe("");
    });

    it("keeps holding through a touch elsewhere", async () => {
        const { manager, block } = await renderRemembering(812);

        manager.onTouch(document.body);
        manager.onTouch(null);

        expect(heldHeight(block)).toBe("812px");
    });

    it("unloads at what it measures without the hold", async () => {
        const { block } = await renderRemembering(812, () =>
            block.style.getPropertyValue("--daily-note-held-height") ? 812 : 640
        );

        fire(observers.unload, block, false);
        await still();

        expect(placeholderHeight(block)).toBe("640px");
    });
});

// ---------------------------------------------------------------------------
// Hysteresis
// ---------------------------------------------------------------------------

describe("NoteWindowManager margins", () => {
    const marginsPx = () => observers.margins.slice(-2).map((m) => parseInt(m, 10));

    it("unloads further out than it renders, so a block on the edge cannot thrash", () => {
        makeManager();
        const [render, unload] = marginsPx();
        expect(render).toBeLessThan(unload!);
    });

    // A margin in pixels means a different number of screenfuls on a phone
    // than on a tall monitor; what matters is how far ahead of the reader it is.
    it("measures both margins in viewports", () => {
        makeManager(makeRenderer(), () => 500, makeScrollRoot(1000));
        expect(marginsPx()).toEqual([1500, 4000]);
    });

    it("scales with a shorter scroll root", () => {
        makeManager(makeRenderer(), () => 500, makeScrollRoot(600));
        expect(marginsPx()).toEqual([900, 2400]);
    });

    // A pane dragged to nothing, or a root not laid out yet, would otherwise
    // render and unload the same block on every scroll.
    it("holds a floor under a scroll root with no height", () => {
        makeManager(makeRenderer(), () => 500, makeScrollRoot(0));
        expect(marginsPx()).toEqual([600, 1600]);
    });

    it("recomputes the margins when the pane is resized", () => {
        const root = makeScrollRoot(800);
        const { manager } = makeManager(makeRenderer(), () => 500, root);

        Object.defineProperty(root, "clientHeight", { value: 1600, configurable: true });
        manager.refreshMargins();

        expect(marginsPx()).toEqual([2400, 6400]);
    });

    it("leaves the observers alone when a resize did not change the height", () => {
        const { manager } = makeManager();
        observers.disconnect.mockClear();

        manager.refreshMargins();

        expect(observers.disconnect).not.toHaveBeenCalled();
    });

    it("ignores a resize before the view is attached", () => {
        const manager = new NoteWindowManager(
            makeRenderer() as never,
            makeQueue(),
            new NoteHeights(),
            () => LAYOUT,
            () => 0
        );
        expect(() => manager.refreshMargins()).not.toThrow();
        expect(observers.margins).toHaveLength(0);
    });

    it("leaves a block rendered between the two margins", async () => {
        const { manager, renderer } = makeManager();
        const block = manager.add(FILE);
        document.body.appendChild(block);

        fire(observers.render, block, true);
        await settle();
        // Past the render margin but not the unload margin: the render
        // observer stops intersecting, and nothing acts on that.
        fire(observers.render, block, false);
        await settle();

        expect(block.classList.contains("is-unloaded")).toBe(false);
        expect(renderer.discard).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Render and unload
// ---------------------------------------------------------------------------

describe("NoteWindowManager render", () => {
    it("fills the block and releases the fixed height", async () => {
        const { manager } = makeManager();
        const block = manager.add(FILE);
        document.body.appendChild(block);

        fire(observers.render, block, true);
        await settle();

        expect(block.querySelector(".daily-note-content")).not.toBeNull();
        expect(block.classList.contains("is-unloaded")).toBe(false);
        expect(placeholderHeight(block)).toBe("");
    });

    it("renders a block only once while it stays in view", async () => {
        const { manager, renderer } = makeManager();
        const block = manager.add(FILE);
        document.body.appendChild(block);

        fire(observers.render, block, true);
        fire(observers.render, block, true);
        await settle();

        expect(renderer.renderInto).toHaveBeenCalledTimes(1);
    });

    it("ignores an entry for a block it does not own", async () => {
        const { manager, renderer } = makeManager();
        manager.add(FILE);

        fire(observers.render, document.createElement("div"), true);
        await settle();

        expect(renderer.renderInto).not.toHaveBeenCalled();
    });

    // reload() and rerenderAll() empty the container mid-flight; the block that
    // comes back from the await may no longer be in the document.
    it("discards the component when the block was detached during the render", async () => {
        const renderer = makeRenderer({ render: (block) => void block.remove() });
        const { manager } = makeManager(renderer);
        const block = manager.add(FILE);
        document.body.appendChild(block);

        fire(observers.render, block, true);
        await settle();

        expect(renderer.discard).toHaveBeenCalledTimes(1);
        expect(block.classList.contains("is-unloaded")).toBe(true);
    });
});

describe("NoteWindowManager unload", () => {
    async function rendered(measure = () => 500) {
        const renderer = makeRenderer();
        const { manager } = makeManager(renderer, measure);
        const block = manager.add(FILE);
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();
        return { manager, renderer, block };
    }

    it("empties the block and pins its measured height", async () => {
        const { block } = await rendered(() => 640);

        fire(observers.unload, block, false);
        await still();

        expect(block.childElementCount).toBe(0);
        expect(placeholderHeight(block)).toBe("640px");
        expect(block.classList.contains("is-unloaded")).toBe(true);
    });

    it("discards the note's component, not just its DOM", async () => {
        const { renderer, block } = await rendered();
        fire(observers.unload, block, false);
        await still();
        expect(renderer.discard).toHaveBeenCalledTimes(1);
    });

    it("does nothing to an already unloaded block", async () => {
        const { manager, renderer } = makeManager();
        const block = manager.add(FILE);

        fire(observers.unload, block, false);

        expect(renderer.discard).not.toHaveBeenCalled();
        expect(placeholderHeight(block)).toBe(`${ESTIMATED_NOTE_HEIGHT_PX}px`);
    });

    it("ignores a still-intersecting entry", async () => {
        const { renderer, block } = await rendered();
        fire(observers.unload, block, true);
        expect(renderer.discard).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Unloading waits for a still scroll
// ---------------------------------------------------------------------------

/** On iOS an unload mid-glide ends the glide (docs/decisions.md, 2026-09-23). */
describe("NoteWindowManager.scrollToTop", () => {
    it("glides the pane to its top", () => {
        const { manager, scrollRoot } = makeManager();
        scrollRoot.scrollTo = vi.fn();

        manager.scrollToTop();

        expect(scrollRoot.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    });

    it("tells the anchor where the scroll is headed first", () => {
        const headForTop = vi.spyOn(ScrollAnchor.prototype, "headForTop");
        const { manager, scrollRoot } = makeManager();
        scrollRoot.scrollTo = vi.fn(() => expect(headForTop).toHaveBeenCalledOnce());

        manager.scrollToTop();

        expect(scrollRoot.scrollTo).toHaveBeenCalledOnce();
    });

    it("does nothing before the view is attached", () => {
        const manager = new NoteWindowManager(makeRenderer() as never, makeQueue(), new NoteHeights(), () => LAYOUT);
        expect(() => manager.scrollToTop()).not.toThrow();
    });
});

describe("NoteWindowManager while scrolling", () => {
    async function rendered() {
        const renderer = makeRenderer();
        const { manager } = makeManager(renderer);
        const block = manager.add(FILE);
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();
        return { manager, renderer, block };
    }

    const isRendered = (block: HTMLElement) => !block.classList.contains("is-unloaded");

    it("keeps a block that left the margin rendered until the scroll is still", async () => {
        const { block } = await rendered();

        fire(observers.unload, block, false);
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS - 1);
        expect(isRendered(block)).toBe(true);

        await vi.advanceTimersByTimeAsync(1);
        expect(isRendered(block)).toBe(false);
    });

    it("waits again after every scroll", async () => {
        const { manager, block } = await rendered();

        fire(observers.unload, block, false);
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS - 1);
        manager.onScroll();
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS - 1);
        expect(isRendered(block)).toBe(true);

        await vi.advanceTimersByTimeAsync(1);
        expect(isRendered(block)).toBe(false);
    });

    it("keeps a block that came back before the scroll stopped", async () => {
        const { renderer, block } = await rendered();

        fire(observers.unload, block, false);
        fire(observers.unload, block, true);
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS);

        expect(isRendered(block)).toBe(true);
        expect(renderer.discard).not.toHaveBeenCalled();
    });

    it("unloads every block that left, once the scroll is still", async () => {
        const renderer = makeRenderer();
        const { manager } = makeManager(renderer);
        const blocks = [FILE, new TFile("Notes/2025-01-02.md")].map((file) => manager.add(file));
        document.body.append(...blocks);
        for (const block of blocks) fire(observers.render, block, true);
        await settle();

        for (const block of blocks) fire(observers.unload, block, false);
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS);

        expect(blocks.map(isRendered)).toEqual([false, false]);
    });

    it("forgets a waiting block that was removed", async () => {
        const { manager, renderer, block } = await rendered();

        fire(observers.unload, block, false);
        manager.remove(block);
        renderer.discard.mockClear();
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS);

        expect(renderer.discard).not.toHaveBeenCalled();
    });

    it("stops waiting on detach", async () => {
        const { manager, renderer, block } = await rendered();

        fire(observers.unload, block, false);
        manager.detach();
        renderer.discard.mockClear();
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS);

        expect(renderer.discard).not.toHaveBeenCalled();
    });

    // A note saved while it waits re-renders; mid-refresh it has nothing to unload.
    it("unloads a block whose refresh was in flight on the next still scroll", async () => {
        const renderer = makeRenderer();
        const { manager } = makeManager(renderer);
        const block = manager.add(FILE);
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();

        fire(observers.unload, block, false);
        renderer.renderInto.mockImplementationOnce(async (el: HTMLElement) => {
            await new Promise((resolve) => setTimeout(resolve, SCROLL_IDLE_MS * 2));
            el.createDiv({ cls: "daily-note-content" });
            return new Component();
        });
        void manager.refresh(block);
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS * 2);
        expect(isRendered(block)).toBe(true);

        manager.onScroll();
        await still();
        expect(isRendered(block)).toBe(false);
    });

    it("sets no unload timer for a scroll with nothing waiting", async () => {
        const { manager } = await rendered();
        manager.onScroll();
        // The one timer remembers the rendered notes' heights.
        expect(vi.getTimerCount()).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Fast scrolling
// ---------------------------------------------------------------------------

/**
 * A flick can carry a block through both margins between two frames, so the
 * unload arrives while the render is still awaiting its markdown. An
 * IntersectionObserver reports changes, so that unload is the only one the
 * block will get until it comes back into view.
 */
describe("NoteWindowManager under a fast scroll", () => {
    /** Renders slowly enough that an observer entry can land mid-flight. */
    function makeSlowRenderer() {
        const renderer = makeRenderer();
        renderer.renderInto = vi.fn(async (block: HTMLElement) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            block.createDiv({ cls: "daily-note-content" });
            return new Component();
        });
        return renderer;
    }

    const settleSlow = () => vi.advanceTimersByTimeAsync(50);

    it("leaves no rendered note behind when a block flies past mid-render", async () => {
        const renderer = makeSlowRenderer();
        const { manager } = makeManager(renderer);
        const block = manager.add(FILE);
        document.body.appendChild(block);

        fire(observers.render, block, true);
        fire(observers.unload, block, false);
        await settleSlow();

        expect(block.classList.contains("is-unloaded")).toBe(true);
        expect(block.querySelector(".daily-note-content")).toBeNull();
        expect(placeholderHeight(block)).toBe(`${ESTIMATED_NOTE_HEIGHT_PX}px`);
    });

    // The queue is shared with every vault event (ADR 0004), so a flick must
    // not leave it working through notes nobody is looking at.
    it("skips the render outright when the block left before its turn came", async () => {
        const renderer = makeSlowRenderer();
        const { manager } = makeManager(renderer);
        const first = manager.add(FILE);
        const second = manager.add(new TFile("Notes/2025-01-02.md"));
        document.body.append(first, second);

        fire(observers.render, first, true);
        fire(observers.render, second, true);
        // Both blow past while the first one is still rendering.
        fire(observers.unload, second, false);
        await settleSlow();

        expect(renderer.renderInto).toHaveBeenCalledTimes(1);
        expect(second.classList.contains("is-unloaded")).toBe(true);
    });

    // The unload arrives after renderInto has started, not while it is queued:
    // the markdown is already on its way and cannot be skipped.
    it("unloads a block that left while its markdown was in flight, once the scroll is still", async () => {
        const renderer = makeSlowRenderer();
        const { manager } = makeManager(renderer);
        const block = manager.add(FILE);
        document.body.appendChild(block);

        fire(observers.render, block, true);
        await vi.advanceTimersByTimeAsync(1); // into the render
        fire(observers.unload, block, false);
        await settleSlow();
        expect(renderer.discard).not.toHaveBeenCalled();

        await still();
        expect(renderer.renderInto).toHaveBeenCalledTimes(1);
        expect(renderer.discard).toHaveBeenCalledTimes(1);
        expect(block.classList.contains("is-unloaded")).toBe(true);
    });

    // The observers only report a change, so a block left blank in the window
    // gets no second event: it would stay empty until the reader scrolls again.
    it("keeps a block that came back into view while its render was in flight", async () => {
        const renderer = makeSlowRenderer();
        const { manager } = makeManager(renderer);
        const block = manager.add(FILE);
        document.body.appendChild(block);

        fire(observers.render, block, true);
        await vi.advanceTimersByTimeAsync(1); // into the render
        fire(observers.unload, block, false);
        fire(observers.render, block, true);
        await settleSlow();

        expect(block.classList.contains("is-unloaded")).toBe(false);
        expect(block.querySelector(".daily-note-content")).not.toBeNull();
    });

    it("ignores an unload for a block it does not own", () => {
        makeManager();
        expect(() => fire(observers.unload, document.createElement("div"), false)).not.toThrow();
    });

    it("renders normally again once the block comes back", async () => {
        const renderer = makeSlowRenderer();
        const { manager } = makeManager(renderer);
        const block = manager.add(FILE);
        document.body.appendChild(block);

        fire(observers.render, block, true);
        fire(observers.unload, block, false);
        await settleSlow();

        fire(observers.render, block, true);
        await settleSlow();

        expect(block.classList.contains("is-unloaded")).toBe(false);
        expect(block.querySelector(".daily-note-content")).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Re-render on modify
// ---------------------------------------------------------------------------

describe("NoteWindowManager.refresh", () => {
    it("re-renders a loaded block from scratch", async () => {
        const renderer = makeRenderer();
        const { manager } = makeManager(renderer);
        const block = manager.add(FILE);
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();

        await manager.refresh(block);

        expect(renderer.renderInto).toHaveBeenCalledTimes(2);
        expect(renderer.discard).toHaveBeenCalledTimes(1);
        expect(block.querySelectorAll(".daily-note-content")).toHaveLength(1);
    });

    // An unloaded note renders from the current file on re-entry anyway.
    it("leaves an unloaded block alone", async () => {
        const { manager, renderer } = makeManager();
        const block = manager.add(FILE);

        await manager.refresh(block);

        expect(renderer.renderInto).not.toHaveBeenCalled();
    });

    it("does nothing for a block it does not own", async () => {
        const { manager, renderer } = makeManager();
        await manager.refresh(document.createElement("div"));
        expect(renderer.renderInto).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

describe("NoteWindowManager teardown", () => {
    it("remove stops observing and frees the note", async () => {
        const renderer = makeRenderer();
        const { manager, heights } = makeManager(renderer);
        const block = manager.add(FILE);
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();

        manager.remove(block);
        await vi.advanceTimersByTimeAsync(SETTLE_MS);

        expect(observers.unobserve).toHaveBeenCalledWith(block);
        expect(renderer.discard).toHaveBeenCalledTimes(1);
        expect(heights.toJSON()).toEqual([]);
    });

    it("remove frees an unloaded block without discarding anything", () => {
        const { manager, renderer } = makeManager();
        const block = manager.add(FILE);

        manager.remove(block);

        expect(renderer.discard).not.toHaveBeenCalled();
    });

    it("remove is harmless for an unknown block", () => {
        const { manager, renderer } = makeManager();
        expect(() => manager.remove(document.createElement("div"))).not.toThrow();
        expect(renderer.discard).not.toHaveBeenCalled();
    });

    it("detach disconnects both observers and frees every rendered note", async () => {
        const renderer = makeRenderer();
        const { manager } = makeManager(renderer);
        const first = manager.add(FILE);
        const second = manager.add(new TFile("Notes/2025-01-02.md"));
        document.body.append(first, second);
        fire(observers.render, first, true);
        fire(observers.render, second, true);
        await settle();

        manager.detach();

        expect(observers.disconnect).toHaveBeenCalledTimes(2);
        expect(renderer.discard).toHaveBeenCalledTimes(2);
    });

    it("re-attaching picks the existing blocks back up", () => {
        const { manager } = makeManager();
        const block = manager.add(FILE);
        observers.observe.mockClear();

        manager.attach(document.createElement("div"));

        expect(observers.observe).toHaveBeenCalledWith(block);
    });

    it("detach before attach is harmless", () => {
        const manager = new NoteWindowManager(
            makeRenderer() as never,
            makeQueue(),
            new NoteHeights(),
            () => LAYOUT,
            () => 0
        );
        expect(() => manager.detach()).not.toThrow();
    });

    it("re-attaching replaces the observers rather than stacking them", () => {
        const { manager } = makeManager();
        manager.attach(document.createElement("div"));
        expect(observers.disconnect).toHaveBeenCalledTimes(2);
        expect(observers.margins).toHaveLength(4);
    });
});

// ---------------------------------------------------------------------------
// Layout changes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Scroll anchoring, where the platform has none (iOS)
// ---------------------------------------------------------------------------

describe("NoteWindowManager scroll anchoring", () => {
    const resizeObserver = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };

    beforeEach(() => {
        for (const spy of Object.values(resizeObserver)) spy.mockClear();
        vi.stubGlobal("CSS", { supports: () => false });
        vi.stubGlobal(
            "ResizeObserver",
            vi.fn(function () {
                return resizeObserver;
            })
        );
    });

    it("watches every block's height from the moment it is added", () => {
        const { manager } = makeManager();

        const block = manager.add(FILE);

        expect(resizeObserver.observe).toHaveBeenCalledWith(block);
    });

    it("stops watching a removed block, and every block on detach", () => {
        const { manager } = makeManager();
        const block = manager.add(FILE);

        manager.remove(block);
        expect(resizeObserver.unobserve).toHaveBeenCalledWith(block);

        manager.detach();
        expect(resizeObserver.disconnect).toHaveBeenCalled();
    });

    it("tells the anchor the stream is scrolling", () => {
        const onScroll = vi.spyOn(ScrollAnchor.prototype, "onScroll");
        const { manager } = makeManager();

        manager.onScroll();

        expect(onScroll).toHaveBeenCalledOnce();
        onScroll.mockRestore();
    });

    it("tells the anchor the scroll was set to a place", () => {
        const placed = vi.spyOn(ScrollAnchor.prototype, "placed");
        const { manager } = makeManager();

        manager.placed();

        expect(placed).toHaveBeenCalledOnce();
        placed.mockRestore();
    });

    it("watches the existing blocks again when re-attached", () => {
        const { manager, scrollRoot } = makeManager();
        const block = manager.add(FILE);
        resizeObserver.observe.mockClear();

        manager.attach(scrollRoot);

        expect(resizeObserver.observe).toHaveBeenCalledWith(block);
    });
});

describe("NoteWindowManager.layoutChanges", () => {
    it("counts a render, so a caller can tell the stream is still settling", async () => {
        const { manager } = makeManager();
        const block = manager.add(FILE);
        document.body.appendChild(block);
        const before = manager.layoutChanges;

        fire(observers.render, block, true);
        await settle();

        expect(manager.layoutChanges).toBe(before + 1);
    });

    it("counts an unload: shedding a note's content moves everything below it", async () => {
        const { manager } = makeManager();
        const block = manager.add(FILE);
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();
        const before = manager.layoutChanges;

        fire(observers.unload, block, false);
        await still();

        expect(manager.layoutChanges).toBe(before + 1);
    });
});
