import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Component } from "obsidian";
import { stackWideTables } from "../../src/render/wide-tables";

/** jsdom lays nothing out, so each test sets the widths it needs. */
function setWidth(el: HTMLElement, prop: "offsetWidth" | "clientWidth", width: () => number): void {
    Object.defineProperty(el, prop, { configurable: true, get: width });
}

function table(headers: string[], rows: string[][]): HTMLTableElement {
    const el = document.createElement("table");
    const head = el.createEl("thead").createEl("tr");
    for (const text of headers) head.createEl("th", { text });
    const body = el.createEl("tbody");
    for (const row of rows) {
        const tr = body.createEl("tr");
        for (const text of row) tr.createEl("td", { text });
    }
    return el;
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

describe("stackWideTables", () => {
    it("names each body cell after its column", () => {
        const el = content.appendChild(table(["Day", " Pace "], [["1", "5:12"]]));

        stackWideTables(content, component);

        const cells = Array.from(el.querySelectorAll("td"));
        expect(cells.map((cell) => cell.dataset.column)).toEqual(["Day", "Pace"]);
    });

    it("leaves a cell with no header unnamed", () => {
        const el = content.appendChild(table(["Day", ""], [["1", "2", "3"]]));

        stackWideTables(content, component);

        const cells = Array.from(el.querySelectorAll("td"));
        expect(cells.map((cell) => cell.dataset.column)).toEqual(["Day", undefined, undefined]);
    });

    it("stacks a table wider than the note", () => {
        const el = content.appendChild(table(["A"], [["1"]]));
        setWidth(el, "offsetWidth", () => 600);

        stackWideTables(content, component);

        expect(el.classList.contains("is-stacked")).toBe(true);
    });

    it("keeps a table that fits as a grid", () => {
        const el = content.appendChild(table(["A"], [["1"]]));
        setWidth(el, "offsetWidth", () => 400);

        stackWideTables(content, component);

        expect(el.classList.contains("is-stacked")).toBe(false);
    });

    // A stacked table is exactly as wide as the note, which would say it fits.
    it("measures a stacked table as a grid", () => {
        const el = content.appendChild(table(["A"], [["1"]]));
        setWidth(el, "offsetWidth", () => (el.hasClass("is-stacked") ? 400 : 600));
        stackWideTables(content, component);

        FakeResizeObserver.instances[0]!.callback();
        noteWidth = 399;
        FakeResizeObserver.instances[0]!.callback();

        expect(el.classList.contains("is-stacked")).toBe(true);
    });

    it("re-checks when the note's width changes", () => {
        const el = content.appendChild(table(["A"], [["1"]]));
        setWidth(el, "offsetWidth", () => 600);
        stackWideTables(content, component);

        noteWidth = 800;
        FakeResizeObserver.instances[0]!.callback();

        expect(FakeResizeObserver.instances[0]!.observed).toEqual([content]);
        expect(el.classList.contains("is-stacked")).toBe(false);
    });

    // A height change reports too, and measuring then is wasted layout.
    it("ignores a resize that keeps the width", () => {
        const el = content.appendChild(table(["A"], [["1"]]));
        let natural = 300;
        setWidth(el, "offsetWidth", () => natural);
        stackWideTables(content, component);

        natural = 600;
        FakeResizeObserver.instances[0]!.callback();

        expect(el.classList.contains("is-stacked")).toBe(false);
    });

    it("stops watching once the note unloads", () => {
        content.appendChild(table(["A"], [["1"]]));
        stackWideTables(content, component);

        component.unload();

        expect(FakeResizeObserver.instances[0]!.disconnected).toBe(true);
    });

    it("watches nothing in a note without a table", () => {
        stackWideTables(content, component);

        expect(FakeResizeObserver.instances).toEqual([]);
    });
});
