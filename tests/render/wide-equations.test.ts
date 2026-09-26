import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Component } from "obsidian";
import { fitWideEquations } from "../../src/render/wide-equations";

/** jsdom lays nothing out, so each test sets the widths it needs. */
function setWidth(el: HTMLElement, prop: "offsetWidth" | "clientWidth", width: () => number): void {
    Object.defineProperty(el, prop, { configurable: true, get: width });
}

/** A display equation as MathJax draws it: the math inside a block-wide container. */
function equation(naturalWidth: number): HTMLElement {
    const container = content.createEl("mjx-container" as keyof HTMLElementTagNameMap);
    container.setAttribute("display", "true");
    setWidth(container, "clientWidth", () => noteWidth);
    const math = container.createEl("mjx-math" as keyof HTMLElementTagNameMap);
    // Zoom shrinks what offsetWidth reports, as it does in a browser.
    setWidth(math, "offsetWidth", () => naturalWidth * Number(zoom(math) || 1));
    return math;
}

/** The zoom the stylesheet applies, from the custom property the fit sets. */
function zoom(math: HTMLElement): string {
    return math.style.getPropertyValue("--daily-note-equation-zoom");
}

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observed: Element[] = [];
    disconnected = false;
    constructor(readonly callback: () => void) {
        FakeResizeObserver.instances.push(this);
    }
    observe(el: Element) {
        this.observed.push(el);
    }
    disconnect() {
        this.disconnected = true;
    }
}

let content: HTMLElement;
let component: Component;
let noteWidth: number;

beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    content = document.createElement("div");
    noteWidth = 400;
    setWidth(content, "clientWidth", () => noteWidth);
    component = new Component();
    component.load();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fitWideEquations", () => {
    it("shrinks an equation wider than the note to the note's width", () => {
        const math = equation(800);

        fitWideEquations(content, component);

        expect(zoom(math)).toBe("0.5");
    });

    it("leaves an equation that fits at its own size", () => {
        const math = equation(300);

        fitWideEquations(content, component);

        expect(zoom(math)).toBe("");
    });

    // A shrunk equation is exactly as wide as the note, which would say it fits.
    it("measures a shrunk equation at its own size", () => {
        const math = equation(800);
        fitWideEquations(content, component);

        noteWidth = 200;
        FakeResizeObserver.instances[0]!.callback();

        expect(zoom(math)).toBe("0.25");
    });

    it("re-fits when the note's width changes", () => {
        const math = equation(800);
        fitWideEquations(content, component);

        noteWidth = 1000;
        FakeResizeObserver.instances[0]!.callback();

        expect(FakeResizeObserver.instances[0]!.observed).toEqual([content]);
        expect(zoom(math)).toBe("");
    });

    // A height change reports too, and measuring then is wasted layout.
    it("ignores a resize that keeps the width", () => {
        const math = equation(300);
        fitWideEquations(content, component);

        setWidth(math, "offsetWidth", () => 800);
        FakeResizeObserver.instances[0]!.callback();

        expect(zoom(math)).toBe("");
    });

    it("leaves inline math to the line it sits in", () => {
        const container = content.createEl("mjx-container" as keyof HTMLElementTagNameMap);
        const math = container.createEl("mjx-math" as keyof HTMLElementTagNameMap);
        setWidth(math, "offsetWidth", () => 800);

        fitWideEquations(content, component);

        expect(zoom(math)).toBe("");
    });

    it("stops watching once the note unloads", () => {
        equation(300);
        fitWideEquations(content, component);

        component.unload();

        expect(FakeResizeObserver.instances[0]!.disconnected).toBe(true);
    });

    it("watches nothing in a note without an equation", () => {
        fitWideEquations(content, component);

        expect(FakeResizeObserver.instances).toEqual([]);
    });
});
