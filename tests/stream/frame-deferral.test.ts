import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FrameDeferral } from "../../src/stream/frame-deferral";
import { SCROLL_IDLE_MS } from "../../src/stream/scroll-anchor";

const PAGE = "https://www.youtube.com/embed/aqz-KE-bpKQ";

/** Lets the mutation observer report what was added. */
const observed = () => Promise.resolve();
const still = () => vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS);

let container: HTMLElement;
let frames: FrameDeferral;

function frame(src = PAGE): HTMLIFrameElement {
    const el = document.createElement("iframe");
    el.setAttribute("src", src);
    return el;
}

beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    frames = new FrameDeferral();
    frames.attach(container);
});

afterEach(() => {
    frames.detach();
    container.remove();
    vi.useRealTimers();
});

describe("FrameDeferral", () => {
    it("holds back the page of a frame added to the stream", async () => {
        const added = container.appendChild(frame());

        await observed();

        expect(added.hasAttribute("src")).toBe(false);
    });

    it("holds back a frame nested in what was added", async () => {
        const note = document.createElement("div");
        const nested = note.appendChild(frame());
        container.appendChild(note);

        await observed();

        expect(nested.hasAttribute("src")).toBe(false);
    });

    it("holds back a frame added among text", async () => {
        const added = frame();
        const fragment = document.createDocumentFragment();
        fragment.append("Wider than a phone:", added);
        container.appendChild(fragment);

        await observed();

        expect(added.hasAttribute("src")).toBe(false);
    });

    // The stylesheet draws a placeholder in its place meanwhile.
    it("marks a frame held back", async () => {
        const added = container.appendChild(frame());

        await observed();

        expect(added.classList.contains("is-frame-held")).toBe(true);
    });

    it("loads the page once the scroll is still, and unmarks the frame", async () => {
        const added = container.appendChild(frame());
        await observed();

        await still();

        expect(added.getAttribute("src")).toBe(PAGE);
        expect(added.classList.contains("is-frame-held")).toBe(false);
    });

    it("waits out a scroll before loading", async () => {
        const added = container.appendChild(frame());
        await observed();
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS - 1);

        frames.onScroll();
        await vi.advanceTimersByTimeAsync(SCROLL_IDLE_MS - 1);

        expect(added.hasAttribute("src")).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(added.getAttribute("src")).toBe(PAGE);
    });

    it("leaves a frame with no page alone", async () => {
        const blank = document.createElement("iframe");
        container.appendChild(blank);

        await observed();
        await still();

        expect(blank.hasAttribute("src")).toBe(false);
    });

    it("loads nothing into a frame its note dropped meanwhile", async () => {
        const added = container.appendChild(frame());
        await observed();

        added.remove();
        await still();

        expect(added.hasAttribute("src")).toBe(false);
    });

    it("holds back nothing once detached, and loads nothing it held", async () => {
        const held = container.appendChild(frame());
        await observed();

        frames.detach();
        const later = container.appendChild(frame());
        await observed();
        await still();

        expect(held.hasAttribute("src")).toBe(false);
        expect(later.getAttribute("src")).toBe(PAGE);
    });
});
