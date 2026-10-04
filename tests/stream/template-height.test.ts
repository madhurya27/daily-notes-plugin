import { describe, expect, it, vi } from "vitest";
import { Component, TFile } from "obsidian";
import { TemplateHeight } from "../../src/stream/template-height";
import { NoteHeights } from "../../src/stream/note-heights";

const TEMPLATE = new TFile("Templates/Daily.md");
const LAYOUT = "600:16px";

/** A renderer that records where it rendered, and what it discarded. */
function makeRenderer(footer: Promise<void> = Promise.resolve()) {
    const rendered: HTMLElement[] = [];
    const discarded: Component[] = [];
    return {
        createBlock: vi.fn((file: TFile) => {
            const block = document.createElement("div");
            block.addClass("daily-note-block");
            block.dataset.sourcePath = file.path;
            return block;
        }),
        renderInto: vi.fn(async (block: HTMLElement, _file: TFile) => {
            rendered.push(block);
            block.createDiv({ cls: "daily-note-content" });
            return { component: new Component(), footer };
        }),
        discard: vi.fn((component: Component) => void discarded.push(component)),
        rendered,
        discarded,
    };
}

/** The view's queue, drained by awaiting what it returns. */
function makeQueue() {
    let queue = Promise.resolve();
    const enqueue = (task: () => Promise<void>) => (queue = queue.then(task));
    return { enqueue, drained: () => queue };
}

/** The stream's column, in its pane, `width` wide. */
function makeColumn(width = 600): HTMLElement {
    const pane = document.body.createDiv();
    const column = pane.createDiv({ cls: "daily-notes-stream-container" });
    Object.defineProperty(column, "offsetWidth", { value: width, configurable: true });
    return column;
}

function setup(opts: { template?: TFile | null; height?: number; footer?: Promise<void> } = {}) {
    const renderer = makeRenderer(opts.footer);
    const queue = makeQueue();
    const templates = new NoteHeights();
    const measure = vi.fn(() => opts.height ?? 360);
    const template = new TemplateHeight(
        renderer as never,
        queue.enqueue,
        templates,
        () => (opts.template === undefined ? TEMPLATE : opts.template),
        measure
    );
    return { renderer, queue, templates, measure, template };
}

describe("TemplateHeight", () => {
    it("keeps the template's height rendered as a note, at the column's width, out of sight", async () => {
        const { renderer, queue, templates, measure, template } = setup();
        const column = makeColumn(612);

        template.measureAt(column, LAYOUT);
        await queue.drained();

        const block = renderer.rendered[0]!;
        const copy = block.parentElement!;
        expect(renderer.renderInto).toHaveBeenCalledWith(block, TEMPLATE);
        expect(copy.classList).toContain("daily-notes-stream-container");
        expect(copy.classList).toContain("daily-notes-stream-probe");
        expect(copy.style.getPropertyValue("--daily-notes-probe-width")).toBe("612px");
        expect(measure).toHaveBeenCalledWith(block);
        expect(templates.heightOf(LAYOUT, TEMPLATE.path)).toBe(360);
        // Measured, then gone: nothing of it stays in the pane or the view.
        expect(copy.isConnected).toBe(false);
        expect(renderer.discarded).toHaveLength(1);
        column.parentElement!.remove();
    });

    it("measures the block as laid out", async () => {
        const { renderer, queue, templates } = setup();
        const template = new TemplateHeight(renderer as never, queue.enqueue, templates, () => TEMPLATE);
        const rect = vi
            .spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockReturnValue({ height: 362 } as DOMRect);

        template.measureAt(makeColumn(), LAYOUT);
        await queue.drained();

        expect(templates.heightOf(LAYOUT, TEMPLATE.path)).toBe(362);
        rect.mockRestore();
    });

    // The footer reads other notes; the queue every vault event shares does not wait on it.
    it("measures without waiting for the linked mentions", async () => {
        const { queue, templates, template } = setup({ footer: new Promise<void>(() => {}) });

        template.measureAt(makeColumn(), LAYOUT);
        await queue.drained();

        expect(templates.heightOf(LAYOUT, TEMPLATE.path)).toBe(360);
    });

    // Every turn and pane drag asks: once a layout a session, the template edited or not.
    it("measures once per layout a session", async () => {
        const { renderer, queue, template } = setup();
        const column = makeColumn();

        template.measureAt(column, LAYOUT);
        template.measureAt(column, LAYOUT);
        template.measureAt(column, "400:16px");
        await queue.drained();

        expect(renderer.renderInto).toHaveBeenCalledTimes(2);
    });

    it("measures a layout again once told its heights were forgotten", async () => {
        const { renderer, queue, template } = setup();
        const column = makeColumn();

        template.measureAt(column, LAYOUT);
        await queue.drained();
        template.forget();
        template.measureAt(column, LAYOUT);
        await queue.drained();

        expect(renderer.renderInto).toHaveBeenCalledTimes(2);
    });

    it("measures nothing without a template", async () => {
        const { renderer, queue, templates, template } = setup({ template: null });

        template.measureAt(makeColumn(), LAYOUT);
        await queue.drained();

        expect(renderer.renderInto).not.toHaveBeenCalled();
        expect(templates.toJSON().heights).toEqual([]);
    });

    // In a hidden tab nothing lays out: the next ask, once shown, measures.
    it("keeps nothing measured at zero, and measures on the next ask", async () => {
        const { renderer, queue, templates, measure, template } = setup();
        measure.mockReturnValueOnce(0);
        const column = makeColumn();

        template.measureAt(column, LAYOUT);
        await queue.drained();
        expect(templates.toJSON().heights).toEqual([]);

        template.measureAt(column, LAYOUT);
        await queue.drained();
        expect(renderer.renderInto).toHaveBeenCalledTimes(2);
        expect(templates.heightOf(LAYOUT, TEMPLATE.path)).toBe(360);
    });

    it("leaves nothing in the pane when the render fails", async () => {
        const { renderer, queue, templates, template } = setup();
        renderer.renderInto.mockRejectedValueOnce(new Error("gone"));
        const column = makeColumn();

        template.measureAt(column, LAYOUT);
        await expect(queue.drained()).rejects.toThrow("gone");

        expect(column.parentElement!.children).toHaveLength(1);
        expect(templates.toJSON().heights).toEqual([]);
        column.parentElement!.remove();
    });

    it("measures nothing for a column no longer in a pane", async () => {
        const { renderer, queue, template } = setup();

        template.measureAt(document.createElement("div"), LAYOUT);
        await queue.drained();

        expect(renderer.renderInto).not.toHaveBeenCalled();
    });
});
