/**
 * Extends jsdom's HTMLElement prototype with Obsidian's custom DOM helpers
 * so that code calling .addClass(), .createDiv(), etc. works in tests.
 */

const proto = HTMLElement.prototype;

proto.addClass = function (this: HTMLElement, ...classes: string[]) {
    for (const cls of classes) {
        for (const c of cls.trim().split(/\s+/).filter(Boolean)) {
            this.classList.add(c);
        }
    }
    return this;
};

proto.removeClass = function (this: HTMLElement, ...classes: string[]) {
    for (const cls of classes) this.classList.remove(cls);
    return this;
};

proto.toggleClass = function (this: HTMLElement, cls: string, value?: boolean) {
    this.classList.toggle(cls, value);
    return this;
};

proto.hasClass = function (this: HTMLElement, cls: string): boolean {
    return this.classList.contains(cls);
};

proto.getText = function (this: HTMLElement) {
    return this.textContent ?? "";
};

proto.setText = function (this: HTMLElement, text: string) {
    this.textContent = text;
    return this;
};

proto.empty = function (this: HTMLElement) {
    while (this.firstChild) this.removeChild(this.firstChild);
    return this;
};

proto.createDiv = function (this: HTMLElement, params?: { cls?: string; text?: string }) {
    const el = document.createElement("div");
    if (params?.cls) el.addClass(params.cls);
    if (params?.text) el.setText(params.text);
    this.appendChild(el);
    return el;
};

proto.createEl = function <K extends keyof HTMLElementTagNameMap>(
    this: HTMLElement,
    tag: K,
    params?: { cls?: string; text?: string; href?: string; type?: string; placeholder?: string }
) {
    const el = document.createElement(tag);
    if (params?.cls) el.addClass(params.cls);
    if (params?.text) el.setText(params.text);
    if (params?.href) el.setAttribute("href", params.href);
    if (params?.type) el.setAttribute("type", params.type);
    if (params?.placeholder) el.setAttribute("placeholder", params.placeholder);
    this.appendChild(el);
    return el;
};

proto.createSpan = function (this: HTMLElement, params?: { cls?: string; text?: string }) {
    return this.createEl("span", params);
};

/** jsdom implements no scrolling; Obsidian runs on Chromium, which does. */
proto.scrollIntoView ??= function () {};

proto.onClickEvent = function (this: HTMLElement, handler: (e: MouseEvent) => void) {
    this.addEventListener("click", handler);
};

proto.prepend =
    proto.prepend ??
    function (this: HTMLElement, node: Node) {
        this.insertBefore(node, this.firstChild);
    };

/**
 * jsdom ships no CSS object; Obsidian runs on Chromium, which has CSS.escape.
 * Escapes every character outside [A-Za-z0-9_-] — stricter than the CSSOM
 * algorithm, and valid wherever the result is used (identifier or quoted value).
 */
const jsdomGaps = globalThis as { CSS?: Partial<typeof CSS>; Highlight?: typeof Highlight };

jsdomGaps.CSS ??= {
    escape: (value: string): string => value.replace(/[^\w-]/g, (c) => `\\${c}`),
};

/**
 * jsdom ships no CSS Custom Highlight API; Chromium does. A highlight is a
 * set of ranges, and the registry a map of them by name.
 */
jsdomGaps.Highlight ??= class Highlight extends Set<AbstractRange> {} as unknown as typeof Highlight;
jsdomGaps.CSS.highlights ??= new Map() as unknown as HighlightRegistry;
