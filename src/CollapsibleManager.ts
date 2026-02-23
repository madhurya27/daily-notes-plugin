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
        const headers = contentEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
        headers.forEach((header: HTMLElement) => {
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
        const listItems = contentEl.querySelectorAll("li");
        let index = 0;
        listItems.forEach((li: HTMLElement) => {
            const subList = li.querySelector("ul, ol");
            if (!subList) return;

            const depth = this.getListDepth(li);
            const sectionKey = `li-${depth}-${index++}`;

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
        let nextEl = header.nextElementSibling as HTMLElement | null;
        while (nextEl) {
            if (nextEl.tagName.match(/^H[1-6]$/)) {
                const nextLevel = parseInt(nextEl.tagName.substring(1));
                if (nextLevel <= level) break;
            }
            nextEl.toggleClass("is-hidden", isCollapsed);
            nextEl = nextEl.nextElementSibling as HTMLElement | null;
        }
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
