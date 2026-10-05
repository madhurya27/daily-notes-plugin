import { App, Component, type Debouncer, MarkdownRenderer, TAbstractFile, TFile, debounce, setIcon } from "obsidian";
import { HeightHold, SETTLE_MS } from "../../stream/height-hold";
import { baseDigest, type BaseKey, type BaseMeasurements } from "./base-measurements";
import { layoutOf } from "../../stream/layout-memory";
import { asCards, BASE_SLOT_CLASS, type BaseSource } from "./bases-as-cards";
import { fitBaseToWidth, tableWidth } from "./bases-fit";
import { narrowestTableWidth, type HeaderMetrics } from "./bases-width";
import type { WidthWatch } from "../note-widths";

/**
 * A note's Bases, each drawn into its own placeholder as a table or, when the
 * table is wider than the note, as cards — the rule a Markdown table follows
 * (D-033). Cards come straight away when the headers
 * alone overrun the note; otherwise the table is drawn, measured on its first
 * layout, and redrawn alone. A measured answer is kept per note and layout, so
 * a note that unloads and comes back is drawn once.
 *
 * Bases fills a view after drawing it, and refills it on a live update, so a
 * Base is held at the height it showed until it settles; otherwise the text
 * below jumps and returns. A Base coming back into view is held by its note.
 */
export class NoteBases {
    /** Undefined until the first Base; null when nothing could be measured. */
    private headers: HeaderMetrics | null | undefined;
    private readonly slots = new WeakMap<Element, BaseSlot>();
    /** Embedded Bases in rendered notes, by the path of the file they copy. */
    private readonly copies = new Map<string, Set<BaseSlot>>();

    constructor(
        private readonly app: App,
        private readonly measured: BaseMeasurements,
        private readonly widths: WidthWatch,
        /** jsdom lays nothing out, so measuring is the one seam tests replace. */
        private readonly measureHeaders: (host: HTMLElement) => HeaderMetrics | null = measureHeaderMetrics
    ) {}

    /** Draws each of `sources` into the placeholder `extractBases` left for it. */
    async render(contentEl: HTMLElement, file: TFile, noteComponent: Component, sources: BaseSource[]): Promise<void> {
        const placeholders = Array.from(contentEl.querySelectorAll<HTMLElement>(`.${BASE_SLOT_CLASS}`));
        if (placeholders.length === 0) return;
        if (this.headers === undefined) this.headers = this.measureHeaders(contentEl);

        const slots: BaseSlot[] = [];
        const width = contentEl.clientWidth;
        for (const [i, placeholder] of placeholders.entries()) {
            const source = sources[i]!;
            const base = source.kind === "embed" ? this.resolveBase(source.link, file) : null;
            const definition = base
                ? await this.app.vault.cachedRead(base)
                : source.kind === "block"
                  ? source.definition
                  : null;
            const slot = new BaseSlot(this.app, contentEl, placeholder, file, noteComponent, source, definition);
            this.slots.set(placeholder, slot);
            if (base) this.track(base.path, slot, noteComponent);
            slots.push(slot);
            await this.draw(slot, this.wantsCards(slot, width) ? "cards" : "table");
        }
        this.widths.watch(contentEl, noteComponent, (width) => {
            for (const slot of slots) void this.recheck(slot, width);
        });
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
            if (!this.wantsCards(slot, width)) await this.draw(slot, "table");
            return;
        }
        const view = slot.placeholder.querySelector<HTMLElement>(".bases-view");
        if (slot.cards && view && tableWidth(view) > width) await this.showCards(slot, width);
    }

    private showCards(slot: BaseSlot, width: number): Promise<void> {
        this.measured.markTooWide(slot.key(width));
        return this.draw(slot, "cards");
    }

    private async draw(slot: BaseSlot, mode: "table" | "cards"): Promise<void> {
        await slot.draw(mode);
    }

    private wantsCards(slot: BaseSlot, width: number): boolean {
        if (!slot.cards) return false;
        if (this.measured.isTooWide(slot.key(width))) return true;
        return this.headers ? narrowestTableWidth(slot.definition!, slot.view, this.headers) > width : false;
    }

    /**
     * A Base file changed. A copy drawn as cards cannot save, and nothing else
     * redraws it (D-033); a real embed redraws itself.
     */
    async onBaseModified(file: TAbstractFile): Promise<void> {
        const slots = this.copies.get(file.path);
        if (!slots || !(file instanceof TFile)) return;
        const definition = await this.app.vault.cachedRead(file);
        for (const slot of slots) {
            slot.redefine(definition);
            if (slot.mode === "cards")
                await this.draw(slot, this.wantsCards(slot, slot.contentWidth) ? "cards" : "table");
        }
    }

    private track(path: string, slot: BaseSlot, noteComponent: Component): void {
        const slots = this.copies.get(path) ?? new Set<BaseSlot>();
        this.copies.set(path, slots.add(slot));
        noteComponent.register(() => {
            slots.delete(slot);
            if (slots.size === 0) this.copies.delete(path);
        });
    }

    /** The Base file an embed in `note` links to, or null when it is not one. */
    private resolveBase(linkpath: string, note: TFile): TFile | null {
        const base = this.app.metadataCache.getFirstLinkpathDest(linkpath, note.path);
        return base?.extension === "base" ? base : null;
    }
}

/** One Base in a note: where it draws, from what, and how it is drawn now. */
class BaseSlot {
    mode: "table" | "cards" = "table";
    /** The Base drawn as cards, or null when it has no table to convert. */
    cards: string | null = null;
    readonly view: string | undefined;
    /** `baseDigest` of its markdown and definition. */
    private digest = "";
    private component: Component | null = null;
    /** The placeholder, and what is drawn in it: a held placeholder stops resizing, its contents do not. */
    private readonly resizes = new ResizeObserver(() => this.resized());
    private hold: HeightHold | null = null;
    /** Restarted by each resize while held. */
    private readonly letGoOnceStill: Debouncer<[], void>;
    /** The height it last laid out at unheld: a shrink from it is held there. */
    private laidOut = 0;

    constructor(
        private readonly app: App,
        private readonly contentEl: HTMLElement,
        readonly placeholder: HTMLElement,
        private readonly file: TFile,
        private readonly noteComponent: Component,
        private readonly source: BaseSource,
        public definition: string | null
    ) {
        this.view = source.kind === "embed" ? source.view : undefined;
        this.redefine(definition);
        this.letGoOnceStill = debounce(() => this.letGo(), SETTLE_MS, true);
        this.resizes.observe(placeholder);
        noteComponent.register(() => {
            this.resizes.disconnect();
            this.letGoOnceStill.cancel();
            this.hold?.release();
        });
    }

    /** Takes the Base as its file now defines it. */
    redefine(definition: string | null): void {
        this.definition = definition;
        this.digest = baseDigest(this.source.markdown, definition);
        const cards = definition === null ? null : asCards(definition, this.view);
        this.cards = cards === null ? null : ["```base", cards, "```"].join("\n");
    }

    /** The width of the note it sits in. */
    get contentWidth(): number {
        return this.contentEl.clientWidth;
    }

    key(width: number): BaseKey {
        return { layout: layoutOf(this.contentEl, width), path: this.file.path, base: this.digest };
    }

    /**
     * Replaces what the Base drew with `mode`, freeing what the last draw
     * registered, held at the height it shows now until it settles.
     */
    async draw(mode: "table" | "cards"): Promise<void> {
        const shown = this.hold?.holding ? this.laidOut : this.height();
        if (this.component) this.noteComponent.removeChild(this.component);
        this.placeholder.empty();
        this.mode = mode;
        if (shown > 0) this.holdAt(shown);
        const component = (this.component = this.noteComponent.addChild(new Component()));
        const markdown = mode === "cards" ? this.cards! : this.source.markdown;
        await MarkdownRenderer.render(this.app, markdown, this.placeholder, this.file.path, component);
        const drawn = this.placeholder.lastElementChild;
        if (drawn) this.resizes.observe(drawn);
    }

    /**
     * Held, a resize restarts the wait; released by the limit, the hold is over.
     * Unheld, a shrink is Bases refilling: it is held where it was.
     */
    private resized(): void {
        if (this.hold?.holding) {
            this.letGoOnceStill();
            return;
        }
        if (this.hold) {
            this.letGo();
            return;
        }
        const height = this.height();
        if (height < this.laidOut) this.holdAt(this.laidOut);
        else this.laidOut = height;
    }

    /** Holds the placeholder at `height`, which becomes what it laid out at. */
    private holdAt(height: number): void {
        this.hold?.release();
        this.laidOut = height;
        this.hold = new HeightHold(this.placeholder, height);
        this.letGoOnceStill();
    }

    /** Lets go, taking its unheld height as its own: shorter, it lost rows. */
    private letGo(): void {
        this.letGoOnceStill.cancel();
        this.hold?.release();
        this.hold = null;
        this.laidOut = this.height();
    }

    private height(): number {
        return this.placeholder.getBoundingClientRect().height;
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
