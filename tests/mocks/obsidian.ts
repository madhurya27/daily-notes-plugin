// Mock moment
class MockMoment {
    date: Date;
    _isValid: boolean;

    constructor(dateStr?: string, format?: string, strict?: boolean) {
        if (!dateStr) {
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

export class ItemView {
    contentEl: any;
    app: any;
    constructor(leaf: WorkspaceLeaf) {
        this.app = leaf.app;
        this.contentEl = new MockHTMLElement();
    }
    registerEvent() {}
    register() {}
    registerDomEvent(el: any, type: string, cb: any) {
        el.addEventListener(type, cb);
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

export class Component {}

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

export class Setting {
    /** Every Setting built since the last reset, in construction order. */
    static created: Setting[] = [];
    static reset() {
        Setting.created = [];
    }

    name = "";
    desc = "";
    toggles: ToggleComponent[] = [];

    constructor(containerEl: HTMLElement) {
        containerEl.createDiv({ cls: "setting-item" });
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
