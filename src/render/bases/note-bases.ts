import { App, Component, type Debouncer, MarkdownRenderer, TAbstractFile, TFile, debounce, setIcon } from "obsidian";
import type { BaseMeasurements } from "./base-measurements";
import { asCards, BASE_SLOT_CLASS, type BaseSource } from "./bases-as-cards";
import { fitBaseToWidth, tableWidth } from "./bases-fit";
import { narrowestTableWidth, type HeaderMetrics } from "./bases-width";

/**
 * How long a redrawn Base holds the height it last laid out at, if it never
 * refills it: it may have lost rows since.
 */
const HOLD_MS = 2000;

/** How long a Base's height is unchanged before it is kept: Bases gives no sign it is done. */
export const BASE_SETTLE_MS = 300;

/**
 * A note's Bases, each drawn into its own placeholder as a table or, when the
 * table is wider than the note, as cards — the rule a Markdown table follows
 * (docs/decisions.md, 2026-09-24). Cards come straight away when the headers
 * alone overrun the note; otherwise the table is drawn, measured on its first
 * layout, and redrawn alone. A measured answer is kept per note and width, so
 * a note that unloads and comes back is drawn once.
 *
 * Bases fills a view after it is drawn, so a redraw holds the height the Base
 * last laid out at until it refills it: without it, everything below jumps and
 * returns, and iOS has no scroll anchoring to hide that.
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
            const base = source.kind === "embed" ? this.resolveBase(source.link, file) : null;
            const definition = base
                ? await this.app.vault.cachedRead(base)
                : source.kind === "block"
                  ? source.definition
                  : null;
            const slot = new BaseSlot(this.app, contentEl, placeholder, file, noteComponent, source, definition, (s) =>
                this.remember(s)
            );
            this.slots.set(placeholder, slot);
            if (base) this.track(base.path, slot, noteComponent);
            slots.push(slot);
            await this.draw(slot, this.wantsCards(slot, width) ? "cards" : "table");
        }
        // A Base resizes as Bases fills it, or its rows change: its height is
        // kept once the whole note holds still, never mid-fill or at unload. A
        // Base alone can sit still, empty, while Bases fetches its rows.
        const observer = new ResizeObserver(() => {
            for (const slot of slots) slot.keepOnceStill();
            if (contentEl.clientWidth === width) return;
            width = contentEl.clientWidth;
            for (const slot of slots) void this.recheck(slot, width);
        });
        observer.observe(contentEl);
        for (const slot of slots) observer.observe(slot.placeholder);
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

    /** Redraws `slot`, held at the height it shows now, or else the one it last held still at. */
    private async draw(slot: BaseSlot, mode: "table" | "cards"): Promise<void> {
        await slot.draw(mode, slot.shownHeight ?? this.measured.heightOf(slot.key(slot.contentWidth)));
    }

    /** Keeps the height `slot` is laid out at now, unless held to an older one. */
    private remember(slot: BaseSlot): void {
        const height = slot.placeholder.getBoundingClientRect().height;
        if (height > 0 && slot.heldHeight === undefined) this.measured.keepHeight(slot.key(slot.contentWidth), height);
    }

    private wantsCards(slot: BaseSlot, width: number): boolean {
        if (!slot.cards) return false;
        if (this.measured.isTooWide(slot.key(width))) return true;
        return this.headers ? narrowestTableWidth(slot.definition!, slot.view, this.headers) > width : false;
    }

    /**
     * A Base file changed. A copy drawn as cards cannot save, and nothing else
     * redraws it (docs/decisions.md, 2026-09-24); a real embed redraws itself.
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
    private component: Component | null = null;
    /** Restarted by each resize, and by a hold let go, which no resize may follow. */
    readonly keepOnceStill: Debouncer<[], void>;

    constructor(
        private readonly app: App,
        private readonly contentEl: HTMLElement,
        readonly placeholder: HTMLElement,
        private readonly file: TFile,
        private readonly noteComponent: Component,
        private readonly source: BaseSource,
        public definition: string | null,
        /** Its height has held still for `BASE_SETTLE_MS`. */
        onStill: (slot: BaseSlot) => void
    ) {
        this.view = source.kind === "embed" ? source.view : undefined;
        this.redefine(definition);
        this.keepOnceStill = debounce(() => onStill(this), BASE_SETTLE_MS, true);
        // Left before it held still, a Base keeps the height it had before.
        noteComponent.register(() => this.keepOnceStill.cancel());
    }

    /** Takes the Base as its file now defines it. */
    redefine(definition: string | null): void {
        this.definition = definition;
        const cards = definition === null ? null : asCards(definition, this.view);
        this.cards = cards === null ? null : ["```base", cards, "```"].join("\n");
    }

    /** The width of the note it sits in. */
    get contentWidth(): number {
        return this.contentEl.clientWidth;
    }

    key(width: number): string {
        return [this.file.path, width, this.source.markdown, this.definition].join("\n");
    }

    /** The earlier height a redraw is holding the placeholder at; undefined when none is. */
    get heldHeight(): number | undefined {
        const held = parseFloat(this.placeholder.style.getPropertyValue("--daily-note-base-held-height"));
        return held > 0 ? held : undefined;
    }

    /** The height it is held at, else laid out at; undefined when it is not laid out. */
    get shownHeight(): number | undefined {
        if (this.heldHeight !== undefined) return this.heldHeight;
        const height = this.placeholder.getBoundingClientRect().height;
        return height > 0 ? height : undefined;
    }

    /**
     * Replaces what the Base drew with `mode`, freeing what the last draw
     * registered, and holds `height` until the new draw fills it.
     */
    async draw(mode: "table" | "cards", height: number | undefined): Promise<void> {
        if (this.component) this.noteComponent.removeChild(this.component);
        this.placeholder.empty();
        this.mode = mode;
        const component = (this.component = this.noteComponent.addChild(new Component()));
        const hold = height ? this.hold(height, component) : null;
        const markdown = mode === "cards" ? this.cards! : this.source.markdown;
        await MarkdownRenderer.render(this.app, markdown, this.placeholder, this.file.path, component);
        // The hold keeps the placeholder still: only what was drawn in it grows.
        const drawn = this.placeholder.lastElementChild;
        if (hold && drawn) hold.observe(drawn);
    }

    /** Holds the placeholder at `height` until what is drawn in it reaches that, or for `HOLD_MS`. */
    private hold(height: number, component: Component): ResizeObserver {
        const placeholder = this.placeholder;
        placeholder.style.setProperty("--daily-note-base-held-height", `${height}px`);
        const observer = new ResizeObserver((entries) => {
            if (entries.some((entry) => entry.target.getBoundingClientRect().height >= height - 1)) settle();
        });
        const timer = window.setTimeout(() => settle(), HOLD_MS);
        const release = () => {
            placeholder.style.removeProperty("--daily-note-base-held-height");
            observer.disconnect();
            window.clearTimeout(timer);
        };
        const settle = () => {
            release();
            this.keepOnceStill();
        };
        // Unloaded mid-hold, it is not done filling: nothing to keep.
        component.register(release);
        return observer;
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
