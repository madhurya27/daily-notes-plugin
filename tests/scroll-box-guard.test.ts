import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ScrollBoxGuard } from "../src/stream/scroll-box-guard";
import { SCROLL_IDLE_MS } from "../src/stream/note-window";

const still = () => vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS);

let container: HTMLElement;
let guard: ScrollBoxGuard;

/** An element that would be a scroll container, as Obsidian's CSS makes some. */
function scrollBox(overflow = "auto"): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("style", `overflow-y: ${overflow}`);
    return el;
}

/** The width of every `.bases-view`; jsdom lays nothing out. */
let viewWidth: number;

/** A `.bases-view` around a table Bases laid out `tableWidth` wide. */
function baseView(tableWidth: string): { view: HTMLElement; thead: HTMLElement } {
    const view = document.createElement("div");
    view.addClass("bases-view");
    Object.defineProperty(view, "clientWidth", { get: () => viewWidth });
    const thead = view.createDiv({ cls: "bases-thead" });
    thead.setAttribute("style", `width: ${tableWidth}`);
    return { view, thead };
}

const cap = (view: HTMLElement) => view.style.getPropertyValue("--bases-table-column-max-width");

beforeEach(() => {
    vi.useFakeTimers();
    viewWidth = 300;
    container = document.createElement("div");
    document.body.appendChild(container);
    guard = new ScrollBoxGuard();
    guard.attach(container);
});

afterEach(() => {
    guard.detach();
    container.remove();
    vi.useRealTimers();
});

describe("ScrollBoxGuard safety net", () => {
    it.each(["auto", "scroll", "hidden"])("clips an added %s box once the scroll is still", async (overflow) => {
        const box = container.appendChild(scrollBox(overflow));

        await still();

        expect(box.classList.contains("is-scroll-clipped")).toBe(true);
    });

    it("clips a box nested in what was added", async () => {
        const note = document.createElement("div");
        const box = note.appendChild(scrollBox());
        container.appendChild(note);

        await still();

        expect(box.classList.contains("is-scroll-clipped")).toBe(true);
        expect(note.classList.contains("is-scroll-clipped")).toBe(false);
    });

    // Reading styles mid-glide forces a page-wide recalc right before a stall.
    it("waits while the stream scrolls", async () => {
        const box = container.appendChild(scrollBox());
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS - 1);

        guard.onScroll();
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS - 1);

        expect(box.classList.contains("is-scroll-clipped")).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(box.classList.contains("is-scroll-clipped")).toBe(true);
    });

    it("leaves a box that does not scroll alone", async () => {
        const box = container.appendChild(scrollBox("visible"));

        await still();

        expect(box.classList.contains("is-scroll-clipped")).toBe(false);
    });

    // An SVG's overflow is how far it paints, not a scroll box.
    it("skips SVG", async () => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("style", "overflow: hidden");
        container.appendChild(svg);

        await still();

        expect(svg.classList.contains("is-scroll-clipped")).toBe(false);
    });

    // The stylesheet clips everything in a Base already.
    it("skips what is added inside a Base", async () => {
        const embed = container.appendChild(document.createElement("div"));
        embed.addClass("bases-embed");
        await still();

        const box = embed.appendChild(scrollBox());
        await still();

        expect(box.classList.contains("is-scroll-clipped")).toBe(false);
    });

    it("skips a box removed before the scroll was still", async () => {
        const box = container.appendChild(scrollBox());
        await Promise.resolve();
        box.remove();

        await still();

        expect(box.classList.contains("is-scroll-clipped")).toBe(false);
    });

    it("checks each addition once", async () => {
        const box = container.appendChild(scrollBox());
        await still();
        box.removeClass("is-scroll-clipped");

        guard.onScroll();
        await still();

        expect(box.classList.contains("is-scroll-clipped")).toBe(false);
    });

    it("stops watching once detached", async () => {
        guard.detach();
        const box = container.appendChild(scrollBox());

        await still();

        expect(box.classList.contains("is-scroll-clipped")).toBe(false);
    });

    it("drops a pending check once detached", async () => {
        const box = container.appendChild(scrollBox());
        await Promise.resolve();

        guard.detach();
        await still();

        expect(box.classList.contains("is-scroll-clipped")).toBe(false);
    });

    it("watches only the container it was last attached to", async () => {
        const other = document.createElement("div");
        guard.attach(other);
        const box = container.appendChild(scrollBox());

        await still();

        expect(box.classList.contains("is-scroll-clipped")).toBe(false);
    });
});

describe("ScrollBoxGuard Bases", () => {
    it("fits a Base as it renders", async () => {
        const embed = document.createElement("div");
        embed.addClass("bases-embed");
        const { view } = baseView("600px");
        embed.appendChild(view);

        container.appendChild(embed);
        await Promise.resolve();

        expect(cap(view)).toBe("150px");
    });

    it("refits a Base when its rows change", async () => {
        const { view, thead } = baseView("300px");
        container.appendChild(view);
        await Promise.resolve();

        thead.setAttribute("style", "width: 600px");
        view.createDiv({ cls: "bases-tr" });
        await Promise.resolve();

        expect(cap(view)).toBe("150px");
    });

    // Bases sets the table's width on its header row when it lays out.
    it("refits a Base when its table widens", async () => {
        const { view, thead } = baseView("300px");
        container.appendChild(view);
        await Promise.resolve();

        thead.setAttribute("style", "width: 600px");
        await Promise.resolve();

        expect(cap(view)).toBe("150px");
    });

    // The cap is a style write on the view itself; reacting to it would loop.
    it("ignores other style changes in a Base", async () => {
        const { view } = baseView("300px");
        container.appendChild(view);
        await Promise.resolve();

        viewWidth = 150;
        view.setAttribute("style", "color: red");
        await Promise.resolve();

        expect(cap(view)).toBe("");
    });

    it("ignores changes outside a Base", async () => {
        const { view } = baseView("300px");
        container.appendChild(view);
        await Promise.resolve();

        viewWidth = 150;
        container.appendChild(document.createElement("p"));
        await Promise.resolve();

        expect(cap(view)).toBe("");
    });
});
