/**
 * Extends jsdom's HTMLElement prototype with Obsidian's custom DOM helpers
 * so that code calling .addClass(), .createDiv(), etc. works in tests.
 */

const proto = HTMLElement.prototype as any;

proto.addClass = function (...classes: string[]) {
    for (const cls of classes) {
        for (const c of cls.trim().split(/\s+/).filter(Boolean)) {
            this.classList.add(c);
        }
    }
    return this;
};

proto.removeClass = function (...classes: string[]) {
    for (const cls of classes) this.classList.remove(cls);
    return this;
};

proto.toggleClass = function (cls: string, value?: boolean) {
    this.classList.toggle(cls, value);
    return this;
};

proto.hasClass = function (cls: string): boolean {
    return this.classList.contains(cls);
};

proto.setText = function (text: string) {
    this.textContent = text;
    return this;
};

proto.empty = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
    return this;
};

proto.createDiv = function (params?: { cls?: string; text?: string }) {
    const el = document.createElement("div");
    if (params?.cls) el.addClass(params.cls);
    if (params?.text) el.setText(params.text);
    this.appendChild(el);
    return el;
};

proto.createEl = function (tag: string, params?: { cls?: string; text?: string; href?: string }) {
    const el = document.createElement(tag);
    if (params?.cls) el.addClass(params.cls);
    if (params?.text) el.setText(params.text);
    if (params?.href) el.setAttribute("href", params.href);
    this.appendChild(el);
    return el;
};

proto.createSpan = function (params?: { cls?: string; text?: string }) {
    return this.createEl("span", params);
};

proto.onClickEvent = function (handler: (e: MouseEvent) => void) {
    this.addEventListener("click", handler);
};

proto.prepend = proto.prepend ?? function (node: Node) {
    this.insertBefore(node, this.firstChild);
};

/**
 * jsdom ships no CSS object; Obsidian runs on Chromium, which has CSS.escape.
 * Escapes every character outside [A-Za-z0-9_-] — stricter than the CSSOM
 * algorithm, and valid wherever the result is used (identifier or quoted value).
 */
(globalThis as any).CSS ??= {
    escape: (value: string): string => value.replace(/[^\w-]/g, c => `\\${c}`),
};
