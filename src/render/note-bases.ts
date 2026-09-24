import { App, Component, MarkdownRenderer, TFile, setIcon } from "obsidian";
import { asCards, BASE_SLOT_CLASS, type BaseSource } from "./bases-as-cards";
import { fitBaseToWidth, tableWidth } from "./bases-fit";
import { narrowestTableWidth, type HeaderMetrics } from "./bases-width";

/**
 * A note's Bases, each drawn into its own placeholder as a table or, when the
 * table is wider than the note, as cards — the rule a Markdown table follows
 * (docs/decisions.md, 2026-09-24). Cards come straight away when the headers
 * alone overrun the note; otherwise the table is drawn, measured on its first
 * layout, and redrawn alone. A measured answer is kept per note and width, so
 * a note that unloads and comes back is drawn once.
 */
export class NoteBases {
    /** Undefined until the first Base; null when nothing could be measured. */
    private headers: HeaderMetrics | null | undefined;
    /** Bases measured too wide, keyed by note, width and source. */
    private readonly tooWide = new Set<string>();
    private readonly slots = new WeakMap<Element, BaseSlot>();

    constructor(
        private readonly app: App,
        /** jsdom lays nothing out, so measuring is the one seam tests replace. */
        private readonly measureHeaders: (host: HTMLElement) => HeaderMetrics | null = measureHeaderMetrics
    ) {}

    /** Draws each of `sources` into the placeholder `extractBases` left for it. */
    async render(contentEl: HTMLElement, file: TFile, noteComponent: Component, sources: BaseSource[]): Promise<void> {
        const placeholders = Array.from(contentEl.querySelectorAll<HTMLElement>(`.${BASE_SLOT_CLASS}`));
        if (placeholders.length === 0) return;
        if (this.headers === undefined) this.headers = this.measureHeaders(contentEl);

        const slots: BaseSlot[] = [];
        let width = contentEl.clientWidth;
        for (const [i, placeholder] of placeholders.entries()) {
            const source = sources[i]!;
            const definition = source.kind === "block" ? source.definition : await this.readBase(source.link, file);
            const slot = new BaseSlot(this.app, contentEl, placeholder, file, noteComponent, source, definition);
            this.slots.set(placeholder, slot);
            slots.push(slot);
            await slot.draw(this.wantsCards(slot, width) ? "cards" : "table");
        }

        const observer = new ResizeObserver(() => {
            if (contentEl.clientWidth === width) return;
            width = contentEl.clientWidth;
            for (const slot of slots) void this.recheck(slot, width);
        });
        observer.observe(contentEl);
        noteComponent.register(() => observer.disconnect());
    }

    /**
     * Bases laid a table out: one of the note's Bases too wide for it becomes
     * cards; any other Base is fitted to its width instead.
     */
    onLayout(view: HTMLElement): void {
        const placeholder = view.closest(`.${BASE_SLOT_CLASS}`);
        const slot = placeholder ? this.slots.get(placeholder) : undefined;
        if (!slot?.cards || slot.mode === "cards") {
            fitBaseToWidth(view);
            return;
        }
        if (tableWidth(view) > view.clientWidth) void this.showCards(slot, slot.contentWidth);
    }

    private async recheck(slot: BaseSlot, width: number): Promise<void> {
        if (slot.mode === "cards") {
            if (!this.wantsCards(slot, width)) await slot.draw("table");
            return;
        }
        const view = slot.placeholder.querySelector<HTMLElement>(".bases-view");
        if (slot.cards && view && tableWidth(view) > width) await this.showCards(slot, width);
    }

    private showCards(slot: BaseSlot, width: number): Promise<void> {
        this.tooWide.add(slot.key(width));
        return slot.draw("cards");
    }

    private wantsCards(slot: BaseSlot, width: number): boolean {
        if (!slot.cards) return false;
        if (this.tooWide.has(slot.key(width))) return true;
        return this.headers ? narrowestTableWidth(slot.definition!, slot.view, this.headers) > width : false;
    }

    /** The definition an embed in `note` links to, or null when it is not a Base. */
    private async readBase(linkpath: string, note: TFile): Promise<string | null> {
        const base = this.app.metadataCache.getFirstLinkpathDest(linkpath, note.path);
        return base?.extension === "base" ? this.app.vault.cachedRead(base) : null;
    }
}

/** One Base in a note: where it draws, from what, and how it is drawn now. */
class BaseSlot {
    mode: "table" | "cards" = "table";
    /** The Base drawn as cards, or null when it has no table to convert. */
    readonly cards: string | null;
    readonly view: string | undefined;
    private component: Component | null = null;

    constructor(
        private readonly app: App,
        private readonly contentEl: HTMLElement,
        readonly placeholder: HTMLElement,
        private readonly file: TFile,
        private readonly noteComponent: Component,
        private readonly source: BaseSource,
        readonly definition: string | null
    ) {
        this.view = source.kind === "embed" ? source.view : undefined;
        const cards = definition === null ? null : asCards(definition, this.view);
        this.cards = cards === null ? null : ["```base", cards, "```"].join("\n");
    }

    /** The width of the note it sits in. */
    get contentWidth(): number {
        return this.contentEl.clientWidth;
    }

    key(width: number): string {
        return [this.file.path, width, this.source.markdown].join("\n");
    }

    /** Replaces what the Base drew with `mode`, freeing what the last draw registered. */
    async draw(mode: "table" | "cards"): Promise<void> {
        if (this.component) this.noteComponent.removeChild(this.component);
        this.placeholder.empty();
        this.mode = mode;
        this.component = this.noteComponent.addChild(new Component());
        const markdown = mode === "cards" ? this.cards! : this.source.markdown;
        await MarkdownRenderer.render(this.app, markdown, this.placeholder, this.file.path, this.component);
    }
}

/**
 * How wide Bases draws a header, read once from a hidden copy of one: the
 * name's font, and the padding, icon and gap around it. Null when nothing is
 * laid out to read.
 */
export function measureHeaderMetrics(host: HTMLElement): HeaderMetrics | null {
    // Built whole, then attached: one insertion for the page, and for observers.
    const probe = document.createElement("div");
    probe.addClass("daily-note-bases-probe", "block-language-base", "bases-embed");
    const label = probe
        .createDiv({ cls: "bases-view" })
        .createDiv({ cls: "bases-thead" })
        .createDiv({ cls: "bases-tr" })
        .createDiv({ cls: "bases-td" })
        .createDiv({ cls: "bases-table-header" })
        .createDiv({ cls: "bases-table-header-label" });
    setIcon(label.createDiv({ cls: "bases-table-header-icon" }), "text");
    const name = label.createDiv({ cls: "bases-table-header-name", text: "M" });
    host.appendChild(probe);

    const font = getComputedStyle(name).font;
    const chrome = label.scrollWidth - name.scrollWidth;
    probe.remove();
    if (!font || chrome <= 0) return null;

    const context = document.createElement("canvas").getContext("2d");
    if (!context) return null;
    context.font = font;
    return { chrome, textWidth: (text) => context.measureText(text).width };
}
