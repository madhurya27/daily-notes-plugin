import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { Component, MarkdownRenderer, TFile } from "obsidian";
import { BaseMeasurements } from "../../../src/render/bases/base-measurements";
import { NoteBases, measureHeaderMetrics } from "../../../src/render/bases/note-bases";
import { HOLD_LIMIT_MS, SETTLE_MS } from "../../../src/stream/height-hold";
import { extractBases } from "../../../src/render/bases/bases-as-cards";
import type { HeaderMetrics } from "../../../src/render/bases/bases-width";
import { asApp } from "../../stream-view-fixture";

const lines = (...l: string[]) => l.join("\n");

/** Three columns; the fake metrics below make its headers 3 × 100px. */
const TABLE = lines(
    "views:",
    "  - type: table",
    "    name: T",
    "    order:",
    "      - aaa",
    "      - bbb",
    "      - ccc"
);
const BLOCK = lines("```base", TABLE, "```");
const CARDS_ONLY = lines("```base", "views:", "  - type: cards", "    name: C", "```");

/** Each header draws 100px: 66 of text and 34 of padding, icon and gap. */
const metrics: HeaderMetrics = { chrome: 34, textWidth: () => 65 };

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    disconnected = false;
    readonly targets: Element[] = [];
    constructor(readonly callback: (entries: { target: Element }[]) => void) {
        FakeResizeObserver.instances.push(this);
    }
    observe(target: Element) {
        this.targets.push(target);
    }
    /** Reports every observed element as resized. */
    resized() {
        this.callback(this.targets.map((target) => ({ target })));
    }
    /** Reports `target` alone as resized, if it is observed. */
    resizedOnly(target: Element) {
        if (this.targets.includes(target)) this.callback([{ target }]);
    }
    disconnect() {
        this.disconnected = true;
    }
}

const note = new TFile("Notes/2025-01-01.md");
let app: {
    vault: { cachedRead: ReturnType<typeof vi.fn> };
    metadataCache: { getFirstLinkpathDest: ReturnType<typeof vi.fn> };
};
let render: MockInstance<typeof MarkdownRenderer.render>;
let measure: ReturnType<typeof vi.fn<(host: HTMLElement) => HeaderMetrics | null>>;
let bases: NoteBases;
let noteWidth: number;

/** A note's content element holding `markdown`'s Bases, rendered. */
async function renderNote(markdown: string, component = loaded()): Promise<HTMLElement> {
    const { markdown: body, bases: sources } = extractBases(markdown);
    const content = document.createElement("div");
    Object.defineProperty(content, "clientWidth", { get: () => noteWidth });
    for (const line of body.split("\n")) {
        if (line.includes("daily-note-base")) content.createDiv({ cls: "daily-note-base" });
    }
    await bases.render(content, note, component, sources);
    return content;
}

function loaded(): Component {
    const component = new Component();
    component.load();
    return component;
}

/** What the Base in `slot` was last drawn from. */
const drawn = (slot: Element) => render.mock.calls.filter((call) => call[2] === slot).at(-1)?.[1];

/** Lays a table out in `slot` as Bases does: its width on the header row. */
function layOut(slot: Element, tableWidth: number, viewWidth = noteWidth): HTMLElement {
    const view = slot.createDiv({ cls: "bases-view" });
    Object.defineProperty(view, "clientWidth", { get: () => viewWidth });
    view.createDiv({ cls: "bases-thead" }).setAttribute("style", `width: ${tableWidth}px`);
    return view;
}

const slotOf = (content: HTMLElement, i = 0) => content.querySelectorAll(".daily-note-base")[i]!;
const cap = (view: HTMLElement) => view.style.getPropertyValue("--bases-table-column-max-width");

beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    app = {
        vault: { cachedRead: vi.fn().mockResolvedValue(TABLE) },
        metadataCache: { getFirstLinkpathDest: vi.fn().mockReturnValue(new TFile("Bases/Views.base")) },
    };
    render = vi.spyOn(MarkdownRenderer, "render").mockResolvedValue();
    measure = vi.fn().mockReturnValue(metrics);
    bases = new NoteBases(asApp(app), new BaseMeasurements(), measure);
    noteWidth = 400;
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("NoteBases drawing a note's Bases", () => {
    it("draws a Base whose headers fit as the table it is", async () => {
        const content = await renderNote(BLOCK);

        expect(render).toHaveBeenCalledWith(app, BLOCK, slotOf(content), note.path, expect.any(Component));
    });

    it("draws a Base straight as cards when its headers alone overrun the note", async () => {
        noteWidth = 299;

        const content = await renderNote(BLOCK);

        expect(drawn(slotOf(content))).toMatch(/^```base\n[\s\S]*type: cards[\s\S]*\n```$/);
    });

    it("draws each Base into its own placeholder", async () => {
        const content = await renderNote(lines(BLOCK, "", CARDS_ONLY));

        expect(drawn(slotOf(content, 0))).toBe(BLOCK);
        expect(drawn(slotOf(content, 1))).toBe(CARDS_ONLY);
    });

    // Resolved as Obsidian resolves the embed: from the note.
    it("draws an embedded Base from its file, its named view first", async () => {
        noteWidth = 50;
        app.vault.cachedRead.mockResolvedValue(
            lines(TABLE, "  - type: table", "    name: Second", "    order:", "      - aaa")
        );

        const content = await renderNote("![[Views.base#Second]]");

        expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("Views.base", note.path);
        expect(drawn(slotOf(content))).toMatch(/views:\n {2}- type: cards\n {4}name: Second/);
    });

    // A table-drawn embed stays an embed: its toolbar edits save to its file.
    it("draws an embed that fits as the embed it is", async () => {
        const content = await renderNote("![[Views.base]]");

        expect(drawn(slotOf(content))).toBe("![[Views.base]]");
    });

    it.each([
        ["a missing file", null],
        ["a file that is not a Base", new TFile("Views.base.md")],
    ])("draws an embed of %s as written", async (_case, dest) => {
        noteWidth = 100;
        app.metadataCache.getFirstLinkpathDest.mockReturnValue(dest);

        const content = await renderNote("![[Views.base]]");

        expect(drawn(slotOf(content))).toBe("![[Views.base]]");
        expect(app.vault.cachedRead).not.toHaveBeenCalled();
    });

    it("draws a Base with no table as written", async () => {
        noteWidth = 10;

        const content = await renderNote(CARDS_ONLY);

        expect(drawn(slotOf(content))).toBe(CARDS_ONLY);
    });

    // Headers are measured with a style read, so once, not per note.
    it("measures headers once", async () => {
        await renderNote(BLOCK);
        await renderNote(BLOCK);

        expect(measure).toHaveBeenCalledOnce();
    });

    it("measures nothing and watches nothing for a note without Bases", async () => {
        await renderNote("Just text");

        expect(measure).not.toHaveBeenCalled();
        expect(FakeResizeObserver.instances).toEqual([]);
    });

    it("draws the table when headers cannot be measured", async () => {
        measure.mockReturnValue(null);
        noteWidth = 10;

        const content = await renderNote(BLOCK);

        expect(drawn(slotOf(content))).toBe(BLOCK);
    });

    it("frees a Base with its note", async () => {
        const component = loaded();
        await renderNote(BLOCK, component);
        const base = render.mock.calls[0]![4];

        component.unload();

        expect((base as unknown as { loaded: boolean }).loaded).toBe(false);
        expect(FakeResizeObserver.instances[0]!.disconnected).toBe(true);
    });
});

describe("NoteBases measuring a drawn table", () => {
    it("redraws a table wider than its note as cards, alone", async () => {
        const content = await renderNote(lines(BLOCK, "", BLOCK));
        const first = render.mock.calls[0]![4] as unknown as { loaded: boolean };

        bases.onLayout(layOut(slotOf(content), 900));

        expect(drawn(slotOf(content, 0))).toContain("type: cards");
        expect(drawn(slotOf(content, 1))).toBe(BLOCK);
        expect(first.loaded).toBe(false);
        expect(slotOf(content).querySelector(".bases-view")).toBeNull();
    });

    // A note comes back after unloading; the double draw happens once.
    it("draws it straight as cards next time, at that width", async () => {
        bases.onLayout(layOut(slotOf(await renderNote(BLOCK)), 900));

        const again = await renderNote(BLOCK);

        expect(drawn(slotOf(again))).toContain("type: cards");
    });

    // Back rebuilds the stream's view, and its NoteBases with it.
    it("draws it straight as cards in a view sharing what this one measured", async () => {
        const measured = new BaseMeasurements();
        bases = new NoteBases(asApp(app), measured, measure);
        bases.onLayout(layOut(slotOf(await renderNote(BLOCK)), 900));
        bases = new NoteBases(asApp(app), measured, measure);

        const again = await renderNote(BLOCK);

        expect(drawn(slotOf(again))).toContain("type: cards");
    });

    it("measures again at another width", async () => {
        bases.onLayout(layOut(slotOf(await renderNote(BLOCK)), 900));
        noteWidth = 800;

        const again = await renderNote(BLOCK);

        expect(drawn(slotOf(again))).toBe(BLOCK);
    });

    it("keeps a table that fits, unfitted", async () => {
        const content = await renderNote(BLOCK);
        const view = layOut(slotOf(content), 400);

        bases.onLayout(view);

        expect(render).toHaveBeenCalledOnce();
        expect(cap(view)).toBe("");
    });

    it.each([
        ["cannot become cards", CARDS_ONLY],
        ["is cards already", BLOCK],
    ])("fits a Base that %s", async (_case, markdown) => {
        noteWidth = markdown === BLOCK ? 200 : 400;
        const content = await renderNote(markdown);
        const view = layOut(slotOf(content), 900);

        bases.onLayout(view);

        expect(render).toHaveBeenCalledOnce();
        expect(cap(view)).not.toBe("");
    });

    // An embedded note's Base, or one inside a callout: not extracted.
    it("fits a Base it did not draw", () => {
        const view = layOut(document.createElement("div"), 900, 400);

        bases.onLayout(view);

        expect(cap(view)).not.toBe("");
    });
});

describe("NoteBases when the note's width changes", () => {
    const resize = (width: number) => {
        noteWidth = width;
        FakeResizeObserver.instances.forEach((observer) => observer.resized());
    };

    it("redraws cards as a table when the table may fit", async () => {
        noteWidth = 200;
        const content = await renderNote(BLOCK);

        resize(800);

        expect(drawn(slotOf(content))).toBe(BLOCK);
    });

    it("keeps cards where the table was measured too wide", async () => {
        const content = await renderNote(BLOCK);
        bases.onLayout(layOut(slotOf(content), 900));
        resize(800);
        bases.onLayout(layOut(slotOf(content), 900, 800));
        const draws = render.mock.calls.length;

        resize(400);

        expect(render).toHaveBeenCalledTimes(draws);
        expect(drawn(slotOf(content))).toContain("type: cards");
    });

    it("keeps cards while the headers still overrun", async () => {
        noteWidth = 200;
        await renderNote(BLOCK);

        resize(250);

        expect(render).toHaveBeenCalledOnce();
    });

    it("redraws a table that no longer fits as cards", async () => {
        noteWidth = 800;
        const content = await renderNote(BLOCK);
        layOut(slotOf(content), 600, 800);

        resize(400);

        expect(drawn(slotOf(content))).toContain("type: cards");
    });

    it("leaves a table that still fits, or is not laid out yet", async () => {
        noteWidth = 800;
        const content = await renderNote(lines(BLOCK, "", BLOCK));
        layOut(slotOf(content), 300, 800);

        resize(400);

        expect(render).toHaveBeenCalledTimes(2);
    });

    // A height change reports too.
    it("ignores a resize that keeps the width", async () => {
        noteWidth = 200;
        await renderNote(BLOCK);

        resize(200);

        expect(render).toHaveBeenCalledOnce();
    });
});

describe("NoteBases when an embedded Base's file changes", () => {
    const base = new TFile("Bases/Views.base");
    const oneColumn = lines("views:", "  - type: table", "    name: One", "    order:", "      - aaa");

    beforeEach(() => app.metadataCache.getFirstLinkpathDest.mockReturnValue(base));

    // A cards copy cannot save, so nothing else would bring it up to date.
    it("redraws a cards copy from the file as it now is", async () => {
        noteWidth = 200;
        const content = await renderNote("![[Views.base]]");
        app.vault.cachedRead.mockResolvedValue(TABLE.replace("name: T", "name: Changed"));

        await bases.onBaseModified(base);

        expect(drawn(slotOf(content))).toMatch(/type: cards\n {4}name: Changed/);
    });

    it("redraws a copy that now fits as the embed it is", async () => {
        noteWidth = 200;
        const content = await renderNote("![[Views.base]]");
        app.vault.cachedRead.mockResolvedValue(oneColumn);

        await bases.onBaseModified(base);

        expect(drawn(slotOf(content))).toBe("![[Views.base]]");
    });

    // Obsidian redraws a real embed when its file changes.
    it("leaves an embed drawn as a table to redraw itself", async () => {
        await renderNote("![[Views.base]]");

        await bases.onBaseModified(base);

        expect(render).toHaveBeenCalledOnce();
    });

    it.each([
        ["another Base", new TFile("Bases/Other.base")],
        ["a note", new TFile("Bases/Views.md")],
    ])("ignores %s changing", async (_case, file) => {
        noteWidth = 200;
        await renderNote("![[Views.base]]");

        await bases.onBaseModified(file);

        expect(render).toHaveBeenCalledOnce();
    });

    it("keeps redrawing the copies in notes still rendered", async () => {
        noteWidth = 200;
        const gone = loaded();
        await renderNote("![[Views.base]]", gone);
        const content = await renderNote("![[Views.base]]");
        gone.unload();
        const draws = render.mock.calls.length;

        await bases.onBaseModified(base);

        expect(render).toHaveBeenCalledTimes(draws + 1);
        expect(render.mock.calls.at(-1)![2]).toBe(slotOf(content));
    });

    it("forgets a copy once its note unloads", async () => {
        noteWidth = 200;
        const component = loaded();
        await renderNote("![[Views.base]]", component);
        component.unload();

        await bases.onBaseModified(base);

        expect(render).toHaveBeenCalledOnce();
    });
});

/**
 * Bases fills a view after drawing it, and refills it on a live update: a Base
 * is held at the height it showed until what is drawn in it holds still.
 */
describe("NoteBases holding a Base while it refills", () => {
    /** Lays `slot` out at `height`, as a drawn Base would. */
    const tall = (slot: Element, height: number) => {
        slot.getBoundingClientRect = () => ({ height }) as DOMRect;
    };
    const resized = () => FakeResizeObserver.instances.forEach((observer) => observer.resized());
    /** `slot` lays out at `height`, and the observers say so. */
    const layOutAt = (slot: Element, height: number) => {
        tall(slot, height);
        resized();
    };

    // Draws an element, as the real renderer does, for the hold to watch.
    beforeEach(() => {
        vi.useFakeTimers();
        render.mockImplementation(async (_app, _markdown, el) => {
            el.createDiv();
        });
    });
    afterEach(() => vi.useRealTimers());
    const held = (slot: Element) => (slot as HTMLElement).style.getPropertyValue("--daily-note-held-height");

    it("holds a table redrawn as cards at the table's height", async () => {
        const content = await renderNote(BLOCK);
        tall(slotOf(content), 112);

        bases.onLayout(layOut(slotOf(content), 900));

        expect(held(slotOf(content))).toBe("112px");
    });

    // A live update empties the view and refills it: the dip is never drawn.
    it("holds a Base that shrinks by itself at the height it had", async () => {
        const content = await renderNote(BLOCK);
        layOutAt(slotOf(content), 300);

        layOutAt(slotOf(content), 40);

        expect(held(slotOf(content))).toBe("300px");
    });

    it("lets a Base grow unheld", async () => {
        const content = await renderNote(BLOCK);
        layOutAt(slotOf(content), 300);

        layOutAt(slotOf(content), 500);

        expect(held(slotOf(content))).toBe("");
    });

    it("lets go once what is drawn holds still", async () => {
        const content = await renderNote(BLOCK);
        layOutAt(slotOf(content), 300);
        layOutAt(slotOf(content), 40);

        vi.advanceTimersByTime(SETTLE_MS - 100);
        resized();
        vi.advanceTimersByTime(SETTLE_MS - 1);
        expect(held(slotOf(content))).toBe("300px");

        vi.advanceTimersByTime(1);
        expect(held(slotOf(content))).toBe("");
    });

    // It lost rows: once let go, the shorter height is the one it has.
    it("holds no shrink it was let go into", async () => {
        const content = await renderNote(BLOCK);
        layOutAt(slotOf(content), 300);
        layOutAt(slotOf(content), 40);
        vi.advanceTimersByTime(SETTLE_MS);

        resized();

        expect(held(slotOf(content))).toBe("");
    });

    // A Base updating live never holds still.
    it("lets go after a while regardless, and holds no shrink that follows", async () => {
        const content = await renderNote(BLOCK);
        layOutAt(slotOf(content), 300);
        layOutAt(slotOf(content), 40);

        for (let t = 0; t < HOLD_LIMIT_MS; t += SETTLE_MS / 2) {
            resized();
            vi.advanceTimersByTime(SETTLE_MS / 2);
        }
        expect(held(slotOf(content))).toBe("");

        resized();
        expect(held(slotOf(content))).toBe("");
    });

    it("keeps the height it holds at through a redraw while held", async () => {
        const content = await renderNote(BLOCK);
        layOutAt(slotOf(content), 300);
        layOutAt(slotOf(content), 50);

        bases.onLayout(layOut(slotOf(content), 900));

        expect(held(slotOf(content))).toBe("300px");
    });

    it("watches what it drew, which moves under the hold", async () => {
        const content = await renderNote(BLOCK);
        tall(slotOf(content), 112);

        bases.onLayout(layOut(slotOf(content), 900));
        await vi.advanceTimersByTimeAsync(0);

        const drawnView = slotOf(content).lastElementChild!;
        expect(FakeResizeObserver.instances.some((observer) => observer.targets.includes(drawnView))).toBe(true);
    });

    it("stops watching a Base unloaded while held", async () => {
        const component = loaded();
        const content = await renderNote(BLOCK, component);
        tall(slotOf(content), 112);
        bases.onLayout(layOut(slotOf(content), 900));

        component.unload();

        expect(FakeResizeObserver.instances.every((observer) => observer.disconnected)).toBe(true);
        expect(held(slotOf(content))).toBe("");
    });

    it("holds nothing it never saw laid out", async () => {
        const content = await renderNote(BLOCK);

        bases.onLayout(layOut(slotOf(content), 900));

        expect(held(slotOf(content))).toBe("");
    });

    // The note holds a Base coming back: a Base's own height is never kept.
    it("keeps no height across renders", async () => {
        const component = loaded();
        const content = await renderNote(BLOCK, component);
        layOutAt(slotOf(content), 300);
        vi.advanceTimersByTime(SETTLE_MS);
        tall(slotOf(content), 0);
        component.unload();

        const again = await renderNote(BLOCK);

        expect(held(slotOf(again))).toBe("");
    });
});

describe("measureHeaderMetrics", () => {
    it("measures nothing where nothing is laid out", () => {
        expect(measureHeaderMetrics(document.createElement("div"))).toBeNull();
    });

    // A header is its name's text, in Bases' font, plus what surrounds it.
    it("reads Bases' header font and what surrounds the name", () => {
        const host = document.body.createDiv();
        vi.spyOn(window, "getComputedStyle").mockReturnValue({ font: "14px Inter" } as CSSStyleDeclaration);
        vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
            return this.hasClass("bases-table-header-label") ? 50 : this.hasClass("bases-table-header-name") ? 16 : 0;
        });
        const context = { font: "", measureText: (text: string) => ({ width: text.length * 7 }) };
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            context as unknown as CanvasRenderingContext2D
        );

        const measured = measureHeaderMetrics(host)!;

        expect(context.font).toBe("14px Inter");
        expect(measured.chrome).toBe(34);
        expect(measured.textWidth("mood")).toBe(28);
        // The probe leaves nothing behind.
        expect(host.children).toHaveLength(0);
        host.remove();
    });

    it("measures nothing without a canvas", () => {
        vi.spyOn(window, "getComputedStyle").mockReturnValue({ font: "14px Inter" } as CSSStyleDeclaration);
        vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
            return this.hasClass("bases-table-header-label") ? 50 : 16;
        });
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

        expect(measureHeaderMetrics(document.createElement("div"))).toBeNull();
    });
});
