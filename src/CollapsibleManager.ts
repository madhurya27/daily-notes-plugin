import { setIcon } from "obsidian";
import { CollapsibleStateStore } from "./CollapsibleStateStore";

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Post-processes a rendered markdown content element to add collapsible
 * chevrons to headers and list items.
 *
 * Reads initial collapsed state from CollapsibleStateStore and writes on toggle.
 */
export class CollapsibleManager {
    constructor(private readonly store: CollapsibleStateStore) {}

    makeCollapsible(contentEl: HTMLElement, filePath: string): void {
        this.processHeaders(contentEl, filePath);
        this.processLists(contentEl, filePath);
    }

    private processHeaders(contentEl: HTMLElement, filePath: string): void {
        const headers = contentEl.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
        headers.forEach((header) => {
            if (header.parentElement?.tagName === "LI") return;
            const sectionKey = slugify(header.textContent ?? "");
            header.addClass("is-collapsible");

            const indicator = document.createElement("span");
            indicator.addClass("collapse-indicator");
            setIcon(indicator, "chevron-right");
            header.prepend(indicator);

            const collapsed = this.store.isCollapsed(filePath, sectionKey);
            if (collapsed) {
                header.addClass("is-collapsed");
                this.applyHeaderCollapse(header, true);
            }

            header.onClickEvent(() => {
                const nowCollapsed = !header.hasClass("is-collapsed");
                header.toggleClass("is-collapsed", nowCollapsed);
                this.applyHeaderCollapse(header, nowCollapsed);
                this.store.setCollapsed(filePath, sectionKey, nowCollapsed);
            });
        });
    }

    private processLists(contentEl: HTMLElement, filePath: string): void {
        const listItems = contentEl.querySelectorAll<HTMLElement>("li");
        listItems.forEach((li) => {
            const subList = li.querySelector("ul, ol");
            if (!subList) return;

            const depth = this.getListDepth(li);
            const sectionKey = `li-${depth}-${slugify(this.ownText(li))}`;

            li.addClass("is-collapsible");

            const indicator = document.createElement("span");
            indicator.addClass("collapse-indicator");
            setIcon(indicator, "chevron-right");
            li.prepend(indicator);

            const collapsed = this.store.isCollapsed(filePath, sectionKey);
            if (collapsed) li.addClass("is-collapsed");

            indicator.onClickEvent((e) => {
                e.stopPropagation();
                const nowCollapsed = !li.hasClass("is-collapsed");
                li.toggleClass("is-collapsed", nowCollapsed);
                this.store.setCollapsed(filePath, sectionKey, nowCollapsed);
            });
        });
    }

    private applyHeaderCollapse(header: HTMLElement, isCollapsed: boolean): void {
        const level = parseInt(header.tagName.substring(1));
        // While expanding, a nested heading that is itself collapsed keeps its own
        // content hidden: skip siblings until a heading at that level or higher.
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
     * Text directly inside a list item, excluding nested sub-lists — used as a
     * stable collapse-state key so it survives edits elsewhere in the note
     * (a positional index would shift and desync saved state on every edit).
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
