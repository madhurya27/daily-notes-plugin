/**
 * Extends jsdom's HTMLElement prototype with Obsidian's custom DOM helpers
 * so that code calling .addClass(), .createDiv(), etc. works in tests.
 */

const proto = HTMLElement.prototype as any;

proto.addClass = function (...classes: string[]) {
    for (const cls of classes) this.classList.add(cls);
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

proto.createEl = function (tag: string, params?: { cls?: string; text?: string }) {
    const el = document.createElement(tag);
    if (params?.cls) el.addClass(params.cls);
    if (params?.text) el.setText(params.text);
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
