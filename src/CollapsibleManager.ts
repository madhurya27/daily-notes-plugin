import { setIcon } from "obsidian";
import { CollapsibleStateStore } from "./CollapsibleStateStore";

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

/** A section whose collapsed state is persisted per note. */
export interface CollapsibleSection {
    filePath: string;
    sectionKey: string;
    /** Used until the user toggles the section for the first time. */
    defaultCollapsed: boolean;
    /** Applies the state to the DOM. */
    apply(collapsed: boolean): void;
}

/** Adds collapse chevrons to headers and list items, persisting state per note. */
export class CollapsibleManager {
    constructor(private readonly store: CollapsibleStateStore) {}

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

        const toggle = () => {
            collapsed = !collapsed;
            section.apply(collapsed);
            indicator.setAttribute("aria-expanded", String(!collapsed));
            this.store.setCollapsed(section.filePath, section.sectionKey, collapsed);
        };

        indicator.onClickEvent((e) => {
            e.stopPropagation();
            toggle();
        });

        indicator.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault(); // Space would scroll the stream
            e.stopPropagation();
            toggle();
        });

        return toggle;
    }

    makeCollapsible(contentEl: HTMLElement, filePath: string): void {
        // Shared across headers and lists so every key in a note is unique.
        const seenKeys = new Map<string, number>();
        this.processHeaders(contentEl, filePath, seenKeys);
        this.processLists(contentEl, filePath, seenKeys);
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

    private processHeaders(contentEl: HTMLElement, filePath: string, seenKeys: Map<string, number>): void {
        const headers = contentEl.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
        headers.forEach((header) => {
            if (header.parentElement?.tagName === "LI") return;
            header.addClass("is-collapsible");

            this.attachCollapseToggle(header, {
                filePath,
                sectionKey: this.uniqueKey(slugify(header.textContent ?? ""), seenKeys),
                defaultCollapsed: false,
                apply: (collapsed) => {
                    header.toggleClass("is-collapsed", collapsed);
                    this.applyHeaderCollapse(header, collapsed);
                },
            });
        });
    }

    private processLists(contentEl: HTMLElement, filePath: string, seenKeys: Map<string, number>): void {
        const listItems = contentEl.querySelectorAll<HTMLElement>("li");
        listItems.forEach((li) => {
            if (!li.querySelector("ul, ol")) return;

            const depth = this.getListDepth(li);
            li.addClass("is-collapsible");

            this.attachCollapseToggle(li, {
                filePath,
                sectionKey: this.uniqueKey(`li-${depth}-${slugify(this.ownText(li))}`, seenKeys),
                defaultCollapsed: false,
                apply: (collapsed) => li.toggleClass("is-collapsed", collapsed),
            });
        });
    }

    private applyHeaderCollapse(header: HTMLElement, isCollapsed: boolean): void {
        const level = parseInt(header.tagName.substring(1));
        // A nested collapsed heading keeps its content hidden: skip siblings
        // until a heading at that level or higher.
        let collapsedNestedLevel: number | null = null;
        let nextEl = header.nextElementSibling as HTMLElement | null;
        while (nextEl) {
            const nextLevel = this.headingLevel(nextEl);
            if (nextLevel !== null) {
                if (nextLevel <= level) break;
                if (collapsedNestedLevel !== null && nextLevel <= collapsedNestedLevel) collapsedNestedLevel = null;
            }
            if (collapsedNestedLevel === null) {
                nextEl.toggleClass("is-hidden", isCollapsed);
                if (!isCollapsed && nextLevel !== null && nextEl.hasClass("is-collapsed")) {
                    collapsedNestedLevel = nextLevel;
                }
            }
            nextEl = nextEl.nextElementSibling as HTMLElement | null;
        }
    }

    private headingLevel(el: HTMLElement): number | null {
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
