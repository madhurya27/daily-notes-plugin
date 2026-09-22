import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Component, TFile } from "obsidian";
import { NoteWindowManager, ESTIMATED_NOTE_HEIGHT_PX } from "../src/NoteWindowManager";

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

function makeManager(renderer = makeRenderer(), measure = () => 500, scrollRoot = makeScrollRoot(800)) {
    const manager = new NoteWindowManager(renderer as never, makeQueue(), measure);
    manager.attach(scrollRoot);
    return { manager, renderer, scrollRoot };
}

/** Settles the render promise chain. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const FILE = new TFile("Notes/2025-01-01.md");

/** The reserved height, which styles.css turns into a real one. */
const placeholderHeight = (block: HTMLElement) => block.style.getPropertyValue("--daily-note-placeholder-height");

beforeEach(() => stubObservers());
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

describe("NoteWindowManager measurement", () => {
    it("measures the laid-out box by default", () => {
        const manager = new NoteWindowManager(makeRenderer() as never, makeQueue());
        manager.attach(document.createElement("div"));
        const block = manager.add(FILE);
        block.getBoundingClientRect = () => ({ height: 321 }) as DOMRect;
        document.body.appendChild(block);

        fire(observers.render, block, true);
        return settle().then(() => {
            fire(observers.unload, block, false);
            expect(manager.heightOf(block)).toBe(321);
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

    it("honours a known height, so a rebuilt stream keeps its scroll extent", () => {
        const { manager } = makeManager();
        expect(placeholderHeight(manager.add(FILE, 812))).toBe("812px");
    });

    it("observes the block with both observers", () => {
        const { manager } = makeManager();
        const block = manager.add(FILE);
        expect(observers.observe).toHaveBeenCalledWith(block);
        expect(observers.observe).toHaveBeenCalledTimes(2);
    });
});

// ---------------------------------------------------------------------------
// Estimating an unseen note
// ---------------------------------------------------------------------------

/**
 * A fixed constant cannot be right for two vaults, or for one vault at two
 * window widths: the fixture's notes measure ~709px against an estimate of 400.
 */
describe("NoteWindowManager estimates", () => {
    /** Renders, then unloads, a block measuring `px` — one measurement. */
    async function observeHeight(manager: NoteWindowManager, px: number, heights: number[]) {
        const block = manager.add(new TFile(`Notes/2025-01-${px}.md`));
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();
        heights.push(px);
        fire(observers.unload, block, false);
    }

    /** A manager whose measurement returns each queued height in turn. */
    function makeMeasuring() {
        const heights: number[] = [];
        const { manager } = makeManager(makeRenderer(), () => heights[heights.length - 1] ?? 0);
        return { manager, heights };
    }

    it("falls back to the constant before anything has been measured", () => {
        const { manager } = makeManager();
        expect(placeholderHeight(manager.add(FILE))).toBe(`${ESTIMATED_NOTE_HEIGHT_PX}px`);
    });

    it("reserves what notes in this vault actually measured", async () => {
        const { manager, heights } = makeMeasuring();
        await observeHeight(manager, 700, heights);

        expect(placeholderHeight(manager.add(FILE))).toBe("700px");
    });

    // The median, not the mean: one enormous note should not stretch every
    // placeholder after it.
    it("is not dragged off by a single outlier", async () => {
        const { manager, heights } = makeMeasuring();
        for (const px of [700, 720, 680, 9000, 710]) await observeHeight(manager, px, heights);

        expect(placeholderHeight(manager.add(FILE))).toBe("710px");
    });

    // Resizing the window changes every note's height, so the estimate has to
    // age out what it learned at the old width rather than averaging forever.
    it("forgets measurements older than its window", async () => {
        const { manager, heights } = makeMeasuring();
        for (let i = 0; i < 50; i++) await observeHeight(manager, 900, heights);
        for (let i = 0; i < 26; i++) await observeHeight(manager, 300, heights);

        expect(placeholderHeight(manager.add(FILE))).toBe("300px");
    });

    it("keeps an explicit height ahead of the estimate", async () => {
        const { manager, heights } = makeMeasuring();
        await observeHeight(manager, 700, heights);

        expect(placeholderHeight(manager.add(FILE, 120))).toBe("120px");
    });

    it("ignores a measurement of nothing, so an unlaid-out block sets no floor", async () => {
        const { manager, heights } = makeMeasuring();
        await observeHeight(manager, 0, heights);

        expect(placeholderHeight(manager.add(FILE))).toBe(`${ESTIMATED_NOTE_HEIGHT_PX}px`);
    });

    it("keeps the height it reserved when the block it unloads measures nothing", async () => {
        const { manager, heights } = makeMeasuring();
        await observeHeight(manager, 700, heights);
        const block = manager.add(FILE);
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();

        heights.push(0);
        fire(observers.unload, block, false);

        expect(placeholderHeight(block)).toBe("700px");
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
        const manager = new NoteWindowManager(makeRenderer() as never, makeQueue(), () => 0);
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

        expect(block.childElementCount).toBe(0);
        expect(placeholderHeight(block)).toBe("640px");
        expect(block.classList.contains("is-unloaded")).toBe(true);
    });

    it("discards the note's component, not just its DOM", async () => {
        const { renderer, block } = await rendered();
        fire(observers.unload, block, false);
        expect(renderer.discard).toHaveBeenCalledTimes(1);
    });

    it("keeps the measured height for the next placeholder rebuild", async () => {
        const { manager, block } = await rendered(() => 640);
        fire(observers.unload, block, false);
        expect(manager.heightOf(block)).toBe(640);
    });

    // Its stored height is whatever it last unloaded at — the estimate, here.
    it("measures a block that is still rendered rather than trusting the estimate", async () => {
        const { manager, block } = await rendered(() => 640);
        expect(manager.heightOf(block)).toBe(640);
    });

    it("has no height for a block it does not own", () => {
        const { manager } = makeManager();
        expect(manager.heightOf(document.createElement("div"))).toBeUndefined();
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

    const settleSlow = () => new Promise((resolve) => setTimeout(resolve, 50));

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
        expect(manager.heightOf(block)).toBeDefined();
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
    it("unloads a block that left while its markdown was in flight", async () => {
        const renderer = makeSlowRenderer();
        const { manager } = makeManager(renderer);
        const block = manager.add(FILE);
        document.body.appendChild(block);

        fire(observers.render, block, true);
        await new Promise((resolve) => setTimeout(resolve, 1)); // into the render
        fire(observers.unload, block, false);
        await settleSlow();

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
        await new Promise((resolve) => setTimeout(resolve, 1)); // into the render
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
        const { manager } = makeManager(renderer);
        const block = manager.add(FILE);
        document.body.appendChild(block);
        fire(observers.render, block, true);
        await settle();

        manager.remove(block);

        expect(observers.unobserve).toHaveBeenCalledWith(block);
        expect(renderer.discard).toHaveBeenCalledTimes(1);
        expect(manager.heightOf(block)).toBeUndefined();
    });

    it("remove frees an unloaded block without discarding anything", () => {
        const { manager, renderer } = makeManager();
        const block = manager.add(FILE);

        manager.remove(block);

        expect(renderer.discard).not.toHaveBeenCalled();
        expect(manager.heightOf(block)).toBeUndefined();
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
        const manager = new NoteWindowManager(makeRenderer() as never, makeQueue(), () => 0);
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

        expect(manager.layoutChanges).toBe(before + 1);
    });
});
