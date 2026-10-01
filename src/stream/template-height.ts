import type { TFile } from "obsidian";
import type { NoteRenderer } from "../render/note-renderer";
import type { NoteHeights } from "./note-heights";
import { probeBeside } from "./column-probe";

/**
 * Measures the daily-notes template rendered as a note: the floor a note never
 * measured is estimated up from, since every note shown is its template plus
 * writing (ADR 0011). Once per layout a session, in a copy of the column no
 * one sees, kept with the heights (ADR 0010).
 */
export class TemplateHeight {
    /** Layouts measured this session, or queued to be. */
    private readonly asked = new Set<string>();

    constructor(
        private readonly renderer: NoteRenderer,
        /** Renders run through the stream's queue (ADR 0004). */
        private readonly enqueue: (task: () => Promise<void>) => unknown,
        private readonly templates: NoteHeights,
        private readonly template: () => TFile | null,
        /** jsdom lays nothing out, so measurement is the one seam tests replace. */
        private readonly measure: (el: HTMLElement) => number = (el) => el.getBoundingClientRect().height
    ) {}

    /** Queues a measurement at `layout`, the layout `column` is in, unless one was already. */
    measureAt(column: HTMLElement, layout: string): void {
        if (this.asked.has(layout)) return;
        this.asked.add(layout);
        this.enqueue(async () => {
            const file = this.template();
            const height = file ? await this.heightOf(file, column) : 0;
            // Nothing to render, or nothing laid out in a hidden tab: the next ask tries again.
            if (file && height > 0) this.templates.keep(layout, file.path, height);
            else this.asked.delete(layout);
        });
    }

    /** `file` rendered as a note beside `column`, then gone: its block's height. */
    private async heightOf(file: TFile, column: HTMLElement): Promise<number> {
        const probe = probeBeside(column);
        if (!probe) return 0;
        try {
            const block = probe.appendChild(this.renderer.createBlock(file));
            const { component } = await this.renderer.renderInto(block, file);
            const height = this.measure(block);
            this.renderer.discard(component);
            return height;
        } finally {
            probe.remove();
        }
    }
}
