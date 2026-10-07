import { describe, it, expect, beforeEach } from "vitest";
import { Component } from "obsidian";
import { fitWideEquations } from "../../src/render/wide-equations";
import { FakeWidths } from "./fake-widths";

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

let content: HTMLElement;
let component: Component;
let noteWidth: number;
let widths: FakeWidths;

beforeEach(() => {
    widths = new FakeWidths();
    content = document.createElement("div");
    noteWidth = 400;
    setWidth(content, "clientWidth", () => noteWidth);
    component = new Component();
    component.load();
});

describe("fitWideEquations", () => {
    it("shrinks an equation wider than the note to the note's width", () => {
        const math = equation(800);

        fitWideEquations(content, component, widths);

        expect(zoom(math)).toBe("0.5");
    });

    // MathJax 4 pads a display equation's container 2px each side.
    it("shrinks an equation to fit inside its container's padding", () => {
        const math = equation(800);
        math.parentElement!.style.padding = "4.8px 2px";

        fitWideEquations(content, component, widths);

        expect(zoom(math)).toBe("0.495");
    });

    it("leaves an equation that fits at its own size", () => {
        const math = equation(300);

        fitWideEquations(content, component, widths);

        expect(zoom(math)).toBe("");
    });

    // A shrunk equation is exactly as wide as the note, which would say it fits.
    it("measures a shrunk equation at its own size", () => {
        const math = equation(800);
        fitWideEquations(content, component, widths);

        noteWidth = 200;
        widths.resize(content, 200);

        expect(zoom(math)).toBe("0.25");
    });

    it("re-fits when the note's width changes", () => {
        const math = equation(800);
        fitWideEquations(content, component, widths);

        noteWidth = 1000;
        widths.resize(content, 1000);

        expect(zoom(math)).toBe("");
    });

    it("leaves inline math to the line it sits in", () => {
        const container = content.createEl("mjx-container" as keyof HTMLElementTagNameMap);
        const math = container.createEl("mjx-math" as keyof HTMLElementTagNameMap);
        setWidth(math, "offsetWidth", () => 800);

        fitWideEquations(content, component, widths);

        expect(zoom(math)).toBe("");
    });

    it("stops watching once the note unloads", () => {
        equation(300);
        fitWideEquations(content, component, widths);

        component.unload();

        expect(widths.watching(content)).toBe(0);
    });

    it("watches nothing in a note without an equation", () => {
        fitWideEquations(content, component, widths);

        expect(widths.watching(content)).toBe(0);
    });
});
