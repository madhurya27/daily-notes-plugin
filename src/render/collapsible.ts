import { Component, TFile, setIcon } from "obsidian";
import { CollapsibleStateStore } from "./collapse-store";

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

/** Reserved key for the properties panel; a heading slug can never contain ":". */
export const PROPERTIES_SECTION_KEY = ":properties";

/**
 * How long a note must go unwritten before a section missing from it counts as
 * removed: sooner, a heading being retyped would lose its state.
 */
const SETTLED_AFTER_MS = 24 * 60 * 60 * 1000;

/** A section whose collapsed state is persisted per note. */
export interface CollapsibleSection {
    filePath: string;
    sectionKey: string;
    /** Used until the user toggles the section for the first time. */
    defaultCollapsed: boolean;
    /** Applies the state to the DOM. */
    apply(collapsed: boolean): void;
    /** Whether collapsing the section hides `node`. */
    hides(node: Node): boolean;
}

/** A collapsed section, as search sees it. */
interface Fold {
    hides(node: Node): boolean;
    /** Expands the section without saving it. */
    open(): void;
}

/** Chevrons of collapsed sections carry this, so a query finds them. */
const COLLAPSED_CHEVRON = '.collapse-indicator[aria-expanded="false"]';

/** Adds collapse chevrons to headers and list items, persisting state per note. */
export class CollapsibleManager {
    constructor(private readonly store: CollapsibleStateStore) {}

    /** Element → its toggle. Weak, so elements dropped by a re-render are collectable. */
    private readonly toggles = new WeakMap<HTMLElement, () => void>();
    /** Chevron → its section. */
    private readonly sections = new WeakMap<Element, Fold>();

    /**
     * One listener pair for the whole stream. Chevrons are rebuilt on every
     * re-render, so registering per chevron would pile registrations on the
     * component until it unloads.
     */
    delegate(component: Component, root: HTMLElement): void {
        component.registerDomEvent(root, "click", (evt) => {
            const toggle = this.toggleFor(evt.target);
            if (!toggle) return;
            evt.stopPropagation();
            toggle();
        });

        component.registerDomEvent(root, "keydown", (evt) => {
            if (evt.key !== "Enter" && evt.key !== " ") return;
            const toggle = this.toggleFor(evt.target);
            if (!toggle) return;
            evt.preventDefault(); // Space would scroll the stream
            evt.stopPropagation();
            toggle();
        });
    }

    /**
     * Makes a second element toggle the same section — the properties heading
     * row, whose chevron Obsidian hides unless hovered, so a phone would have
     * nothing to tap.
     */
    attachCollapseHost(host: HTMLElement, toggle: () => void): void {
        this.toggles.set(host, toggle);
    }

    /**
     * The toggle of the nearest element an event landed in, if it has one.
     * Walking up finds the chevron before the row that also hosts it, so a
     * click on either runs the toggle exactly once.
     */
    private toggleFor(target: EventTarget | null): (() => void) | undefined {
        let el = target as HTMLElement | null;
        while (el) {
            const toggle = this.toggles.get(el);
            if (toggle) return toggle;
            el = el.parentElement;
        }
        return undefined;
    }

    /**
     * Binds the toggle to the chevron alone: a click on heading text or a link
     * inside it must not collapse. Returns the toggle, for binding extra hosts.
     */
    attachCollapseToggle(host: HTMLElement, section: CollapsibleSection): () => void {
        const indicator = document.createElement("span");
        indicator.addClass("collapse-indicator");
        indicator.setAttribute("role", "button");
        indicator.setAttribute("tabindex", "0");
        setIcon(indicator, "chevron-right");
        host.prepend(indicator);

        let collapsed = this.store.collapsedOr(section.filePath, section.sectionKey, section.defaultCollapsed);
        // The DOM starts expanded; an expand pass would reveal content hidden
        // by a collapsed ancestor.
        if (collapsed) section.apply(true);
        indicator.setAttribute("aria-expanded", String(!collapsed));

        const set = (next: boolean) => {
            collapsed = next;
            section.apply(collapsed);
            indicator.setAttribute("aria-expanded", String(!collapsed));
        };
        const toggle = () => {
            set(!collapsed);
            this.store.setCollapsed(section.filePath, section.sectionKey, collapsed);
        };

        this.toggles.set(indicator, toggle);
        this.sections.set(indicator, { hides: (node) => section.hides(node), open: () => set(false) });
        return toggle;
    }

    /** Whether a collapsed section hides `node`. */
    folds(node: Node): boolean {
        return this.foldsAround(node).length > 0;
    }

    /**
     * Expands every collapsed section hiding `node`, unsaved, as Obsidian's
     * reading view does for a search match (docs/decisions.md, 2026-09-23).
     */
    unfold(node: Node): void {
        for (const fold of this.foldsAround(node)) fold.open();
    }

    private foldsAround(node: Node): Fold[] {
        const root = node.getRootNode() as ParentNode;
        return Array.from(root.querySelectorAll(COLLAPSED_CHEVRON))
            .map((chevron) => this.sections.get(chevron))
            .filter((fold): fold is Fold => fold !== undefined && fold.hides(node));
    }

    /** Adds a chevron to every header and nested list; returns their section keys. */
    makeCollapsible(contentEl: HTMLElement, filePath: string): string[] {
        // Shared across headers and lists so every key in a note is unique.
        const seenKeys = new Map<string, number>();
        return [
            ...this.processHeaders(contentEl, filePath, seenKeys),
            ...this.processLists(contentEl, filePath, seenKeys),
        ];
    }

    /**
     * Drops the saved state of sections `file` no longer has, once it has gone
     * a day unwritten. The properties panel's state stays: with the panel
     * hidden, its key is missing from every render.
     */
    forgetRemovedSections(file: TFile, sectionKeys: readonly string[]): void {
        if (Date.now() - file.stat.mtime < SETTLED_AFTER_MS) return;
        this.store.retainOnly(file.path, new Set([...sectionKeys, PROPERTIES_SECTION_KEY]));
    }

    /**
     * Same-text headings would share one stored state. The first occurrence keeps
     * the bare key, so state saved before this disambiguation still applies.
     */
    private uniqueKey(key: string, seenKeys: Map<string, number>): string {
        const occurrence = (seenKeys.get(key) ?? 0) + 1;
        seenKeys.set(key, occurrence);
        return occurrence === 1 ? key : `${key}-${occurrence}`;
    }

    private processHeaders(contentEl: HTMLElement, filePath: string, seenKeys: Map<string, number>): string[] {
        const headers = Array.from(contentEl.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
        return headers
            .filter((header) => header.parentElement?.tagName !== "LI")
            .map((header) => {
                header.addClass("is-collapsible");

                const sectionKey = this.uniqueKey(slugify(header.getText()), seenKeys);
                this.attachCollapseToggle(header, {
                    filePath,
                    sectionKey,
                    defaultCollapsed: false,
                    apply: (collapsed) => {
                        header.toggleClass("is-collapsed", collapsed);
                        this.applyHeaderCollapse(header, collapsed);
                    },
                    hides: (node) => this.sectionBody(header).some((el) => el.contains(node)),
                });
                return sectionKey;
            });
    }

    private processLists(contentEl: HTMLElement, filePath: string, seenKeys: Map<string, number>): string[] {
        const listItems = Array.from(contentEl.querySelectorAll<HTMLElement>("li"));
        return listItems
            .filter((li) => li.querySelector("ul, ol"))
            .map((li) => {
                const depth = this.getListDepth(li);
                li.addClass("is-collapsible");

                const sectionKey = this.uniqueKey(`li-${depth}-${slugify(this.ownText(li))}`, seenKeys);
                this.attachCollapseToggle(li, {
                    filePath,
                    sectionKey,
                    defaultCollapsed: false,
                    apply: (collapsed) => li.toggleClass("is-collapsed", collapsed),
                    hides: (node) =>
                        Array.from(li.children).some((el) => /^(UL|OL)$/.test(el.tagName) && el.contains(node)),
                });
                return sectionKey;
            });
    }

    private applyHeaderCollapse(header: HTMLElement, isCollapsed: boolean): void {
        // A nested collapsed heading keeps its content hidden: skip siblings
        // until a heading at that level or higher.
        let collapsedNestedLevel: number | null = null;
        for (const el of this.sectionBody(header)) {
            const level = this.headingLevel(el);
            if (level !== null && collapsedNestedLevel !== null && level <= collapsedNestedLevel) {
                collapsedNestedLevel = null;
            }
            if (collapsedNestedLevel === null) {
                el.toggleClass("is-hidden", isCollapsed);
                if (!isCollapsed && level !== null && el.hasClass("is-collapsed")) collapsedNestedLevel = level;
            }
        }
    }

    /** The siblings a heading's section holds: up to a heading at its level or higher. */
    private sectionBody(header: HTMLElement): Element[] {
        const level = parseInt(header.tagName.substring(1));
        const body: Element[] = [];
        for (let el = header.nextElementSibling; el; el = el.nextElementSibling) {
            const nextLevel = this.headingLevel(el);
            if (nextLevel !== null && nextLevel <= level) break;
            body.push(el);
        }
        return body;
    }

    private headingLevel(el: Element): number | null {
        return /^H[1-6]$/.test(el.tagName) ? parseInt(el.tagName.substring(1)) : null;
    }

    /**
     * Own text, excluding nested sub-lists: a stable collapse key. A positional
     * index would shift and desync saved state on every edit elsewhere.
     */
    private ownText(li: HTMLElement): string {
        let text = "";
        for (const node of Array.from(li.childNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test((node as HTMLElement).tagName)) continue;
            text += node.textContent;
        }
        return text;
    }

    private getListDepth(li: HTMLElement): number {
        let depth = 0;
        let el: HTMLElement | null = li.parentElement;
        while (el) {
            if (el.tagName === "UL" || el.tagName === "OL") depth++;
            el = el.parentElement;
        }
        return depth;
    }
}
