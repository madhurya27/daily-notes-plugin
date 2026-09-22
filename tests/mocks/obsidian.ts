// Mock moment
class MockMoment {
    date: Date;
    _isValid: boolean;

    constructor(dateStr?: string, format?: string, strict?: boolean) {
        if (dateStr === undefined) {
            this.date = new Date();
            this._isValid = true;
        } else {
            // Simple parsing for YYYY-MM-DD or YYYY/MM/DD
            const parts = dateStr.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
            // Simple parsing for YYYYMMDD
            const compact = dateStr.match(/(\d{4})(\d{2})(\d{2})/);

            if (parts) {
                this.date = new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]));
                this._isValid = true;
            } else if (compact) {
                this.date = new Date(parseInt(compact[1]), parseInt(compact[2]) - 1, parseInt(compact[3]));
                this._isValid = true;
            } else {
                this.date = new Date("Invalid");
                this._isValid = false;
            }
        }
    }

    isValid() {
        return this._isValid;
    }
    clone() {
        const copy = new MockMoment();
        copy.date = new Date(this.date.getTime());
        copy._isValid = this._isValid;
        return copy;
    }
    /** Only "day" — the sole granularity the plugin truncates to. */
    startOf(_unit: "day") {
        this.date.setHours(0, 0, 0, 0);
        return this;
    }
    add(amount: number, unit: "hours" | "days") {
        const ms = unit === "hours" ? 3600_000 : 86_400_000;
        this.date = new Date(this.date.getTime() + amount * ms);
        return this;
    }
    isAfter(other: MockMoment) {
        return this.date.getTime() > other.date.getTime();
    }
    isBefore(other: MockMoment) {
        return this.date.getTime() < other.date.getTime();
    }
    valueOf() {
        return this.date.getTime();
    }
    format(fmt: string) {
        const pad = (n: number) => String(n).padStart(2, "0");
        return fmt
            .replace(/YYYY/g, String(this.date.getFullYear()))
            .replace(/MM/g, pad(this.date.getMonth() + 1))
            .replace(/DD/g, pad(this.date.getDate()));
    }
}

export function moment(inp?: string, fmt?: string, strict?: boolean) {
    return new MockMoment(inp, fmt, strict);
}

export function normalizePath(path: string): string {
    return path
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/")
        .replace(/^\/+|\/+$/g, "");
}

export class TAbstractFile {
    path: string;
    parent: any;
    name: string;
    vault: any;
    constructor(path: string) {
        this.path = path;
        this.name = path.split("/").pop() || "";
    }
}

export class TFile extends TAbstractFile {
    basename: string;
    extension: string;
    stat: any;
    constructor(path: string) {
        super(path);
        // split on the last dot; files without one get extension ""
        const dot = this.name.lastIndexOf(".");
        this.basename = dot > 0 ? this.name.slice(0, dot) : this.name;
        this.extension = dot > 0 ? this.name.slice(dot + 1) : "";
    }
}

export class WorkspaceLeaf {
    view: any;
    app: any;
    constructor(app: any) {
        this.app = app;
    }
    setViewState() {}
    openFile() {
        return Promise.resolve();
    }
}

// Mock DOM elements for Node environment
class MockHTMLElement {
    classList = {
        add: () => {},
        toggle: () => {},
        remove: () => {},
    };
    style = {};
    dataset = {};
    children: MockHTMLElement[] = [];
    parentNode: MockHTMLElement | null = null;

    createDiv(params?: any) {
        const div = new MockHTMLElement();
        this.appendChild(div);
        return div;
    }
    createEl(tag: string, params?: any) {
        const el = new MockHTMLElement();
        this.appendChild(el);
        return el;
    }
    createSpan(params?: any) {
        const span = new MockHTMLElement();
        this.appendChild(span);
        return span;
    }
    appendChild(child: any) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }
    insertBefore(newNode: any, referenceNode: any) {
        const index = this.children.indexOf(referenceNode);
        if (index >= 0) {
            this.children.splice(index, 0, newNode);
        } else {
            this.children.push(newNode);
        }
        newNode.parentNode = this;
        return newNode;
    }
    removeChild(child: any) {
        const index = this.children.indexOf(child);
        if (index >= 0) {
            this.children.splice(index, 1);
            child.parentNode = null;
        }
    }
    remove() {
        if (this.parentNode) {
            this.parentNode.removeChild(this);
        }
    }
    addEventListener() {}
    querySelector() {
        return null;
    } // Simple mock
    closest() {
        return null;
    }
    setText() {}
    toggleClass() {}
    onClickEvent() {}
    get firstChild() {
        return this.children[0] || null;
    }
}

/**
 * Obsidian's parent/child lifecycle, which is what frees a note's rendered
 * subtree: `children` and `loaded` are the mock's window onto it.
 */
export class Component {
    children: Component[] = [];
    loaded = false;

    load() {
        if (this.loaded) return;
        this.loaded = true;
        for (const child of this.children) child.load();
    }

    unload() {
        if (!this.loaded) return;
        this.loaded = false;
        while (this.children.length) this.removeChild(this.children[0]!);
    }

    addChild<T extends Component>(child: T): T {
        this.children.push(child);
        if (this.loaded) child.load();
        return child;
    }

    removeChild<T extends Component>(child: T): T {
        const index = this.children.indexOf(child);
        if (index !== -1) this.children.splice(index, 1);
        child.unload();
        return child;
    }

    registerDomEvent(el: HTMLElement, type: string, cb: EventListener) {
        el.addEventListener(type, cb);
    }
}

/** A view is a Component: it owns what its notes register. */
export class ItemView extends Component {
    contentEl: any;
    app: any;
    /** View actions, recorded so tests can invoke what onOpen() wired up. */
    actions: { icon: string; title: string; callback: (_evt: any) => any }[] = [];
    constructor(leaf: WorkspaceLeaf) {
        super();
        this.app = leaf.app;
        this.contentEl = new MockHTMLElement();
        this.load();
    }
    registerEvent() {}
    register() {}
    addAction(icon: string, title: string, callback: (_evt: any) => any) {
        this.actions.push({ icon, title, callback });
        return document.createElement("div");
    }
}

/** Records every notice raised, so tests can assert on the message. */
export class Notice {
    static shown: string[] = [];
    static reset() {
        Notice.shown = [];
    }
    constructor(message: string) {
        Notice.shown.push(message);
    }
}

/** Obsidian's keymap scope: the modal owns it, so it needs no teardown. */
export class Scope {
    registered: { modifiers: string[]; key: string; callback: () => unknown }[] = [];
    register(modifiers: string[], key: string, callback: () => unknown) {
        this.registered.push({ modifiers, key, callback });
        return callback;
    }
    /** Fires what `register` bound to `key`, as a hotkey press would. */
    press(key: string) {
        for (const h of this.registered) if (h.key === key) h.callback();
    }
}

export class Modal {
    app: any;
    scope = new Scope();
    contentEl: HTMLElement = document.createElement("div");
    titleEl: HTMLElement = document.createElement("div");
    constructor(app: any) {
        this.app = app;
    }
    setTitle(title: string) {
        this.titleEl.textContent = title;
        return this;
    }
    open() {
        (this as any).onOpen?.();
    }
    close() {
        (this as any).onClose?.();
    }
}

export const MarkdownRenderer = {
    render: () => Promise.resolve(),
};

export const setIcon = (el: any, iconName: string) => {
    // Record the icon so tests can assert on it; the real setIcon injects SVG.
    el.dataset.icon = iconName;
};

export class MarkdownView {
    file: any = null;
}

/** Obsidian's own modifier reading: Cmd/Ctrl or middle-click opens a tab. */
export class Keymap {
    static isModEvent(evt?: any): "tab" | "split" | "window" | boolean {
        if (!evt) return false;
        const mod = evt.ctrlKey || evt.metaKey;
        if (mod && evt.altKey && evt.shiftKey) return "window";
        if (mod && evt.altKey) return "split";
        if (mod || evt.button === 1) return "tab";
        return false;
    }
}

export function debounce<T extends unknown[]>(cb: (...args: T) => unknown, timeout = 0, resetTimer = false) {
    let handle: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: T;
    const debounced = (...args: T) => {
        lastArgs = args;
        if (handle !== null) {
            if (!resetTimer) return debounced;
            clearTimeout(handle);
        }
        handle = setTimeout(() => {
            handle = null;
            cb(...lastArgs);
        }, timeout);
        return debounced;
    };
    debounced.cancel = () => {
        if (handle !== null) clearTimeout(handle);
        handle = null;
        return debounced;
    };
    debounced.run = () => {
        if (handle !== null) {
            clearTimeout(handle);
            handle = null;
            cb(...lastArgs);
        }
        return undefined;
    };
    return debounced;
}

export class PluginSettingTab {
    app: any;
    containerEl: HTMLElement = document.createElement("div");
    constructor(app: any, _plugin: any) {
        this.app = app;
    }
}

/** Stands in for Obsidian's ToggleComponent; `change()` fires the bound handler. */
export class ToggleComponent {
    value = false;
    private handler: (_value: boolean) => unknown = () => {};
    setValue(value: boolean) {
        this.value = value;
        return this;
    }
    onChange(cb: (_value: boolean) => unknown) {
        this.handler = cb;
        return this;
    }
    async change(value: boolean) {
        this.value = value;
        await this.handler(value);
    }
}

/** Stands in for Obsidian's TextComponent. */
export class TextComponent {
    inputEl: HTMLInputElement = document.createElement("input");
    constructor(containerEl?: HTMLElement) {
        containerEl?.appendChild(this.inputEl);
    }
    get value() {
        return this.inputEl.value;
    }
    setValue(value: string) {
        this.inputEl.value = value;
        return this;
    }
}

/** Stands in for Obsidian's ButtonComponent; `click()` fires the handler. */
export class ButtonComponent {
    buttonEl: HTMLButtonElement = document.createElement("button");
    cta = false;
    setButtonText(text: string) {
        this.buttonEl.textContent = text;
        return this;
    }
    setCta() {
        this.cta = true;
        return this;
    }
    onClick(cb: (_evt: any) => unknown) {
        this.buttonEl.addEventListener("click", cb);
        return this;
    }
}

export class Setting {
    /** Every Setting built since the last reset, in construction order. */
    static created: Setting[] = [];
    static reset() {
        Setting.created = [];
    }

    name = "";
    desc = "";
    toggles: ToggleComponent[] = [];
    texts: TextComponent[] = [];
    buttons: ButtonComponent[] = [];
    readonly itemEl: HTMLElement;

    constructor(containerEl: HTMLElement) {
        this.itemEl = containerEl.createDiv({ cls: "setting-item" });
        Setting.created.push(this);
    }
    setName(name: string) {
        this.name = name;
        return this;
    }
    setDesc(desc: string) {
        this.desc = desc;
        return this;
    }
    addText(cb: (_text: TextComponent) => unknown) {
        const text = new TextComponent(this.itemEl);
        cb(text);
        this.texts.push(text);
        return this;
    }
    addButton(cb: (_button: ButtonComponent) => unknown) {
        const button = new ButtonComponent();
        this.itemEl.appendChild(button.buttonEl);
        cb(button);
        this.buttons.push(button);
        return this;
    }
    addToggle(cb: (_toggle: ToggleComponent) => unknown) {
        const toggle = new ToggleComponent();
        cb(toggle);
        this.toggles.push(toggle);
        return this;
    }
}

export class Plugin {
    app: any;
    manifest: any;
    /** Registrations recorded so tests can invoke what onload() wired up. */
    views: Record<string, (_leaf: any) => any> = {};
    ribbonIcons: { icon: string; title: string; callback: (_evt: any) => any }[] = [];
    commands: { id: string; name: string; callback: () => any }[] = [];
    settingTabs: any[] = [];
    data: unknown = null;

    constructor(app?: any, manifest?: any) {
        this.app = app;
        this.manifest = manifest;
    }
    loadData() {
        return Promise.resolve(this.data);
    }
    saveData(data: unknown) {
        this.data = data;
        return Promise.resolve();
    }
    registerView(type: string, cb: (_leaf: any) => any) {
        this.views[type] = cb;
    }
    addRibbonIcon(icon: string, title: string, callback: (_evt: any) => any) {
        this.ribbonIcons.push({ icon, title, callback });
        return document.createElement("div");
    }
    addCommand(cmd: { id: string; name: string; callback: () => any }) {
        this.commands.push(cmd);
        return cmd;
    }
    addSettingTab(tab: any) {
        this.settingTabs.push(tab);
    }
    registerEvent(_e: any) {}
}
