import { describe, it, expect, beforeEach, vi } from "vitest";
import { NoteRenderer } from "../src/NoteRenderer";
import { Component, MarkdownView, TFile } from "obsidian";
import { CollapsibleManager } from "../src/CollapsibleManager";
import { CollapsibleStateStore } from "../src/CollapsibleStateStore";
import type { DailyNotesStreamSettings } from "../src/settings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(opts: { readResult?: string; fileCache?: any; leaves?: any[] } = {}) {
    const { readResult = "", fileCache = null, leaves = [] } = opts;
    const mockOpenFile = vi.fn().mockResolvedValue(undefined);
    const mockLeaf = { openFile: mockOpenFile };
    return {
        vault: { cachedRead: vi.fn().mockResolvedValue(readResult) },
        metadataCache: { getFileCache: vi.fn().mockReturnValue(fileCache) },
        workspace: {
            getLeavesOfType: vi.fn().mockReturnValue(leaves),
            getLeaf: vi.fn().mockReturnValue(mockLeaf),
            revealLeaf: vi.fn().mockResolvedValue(undefined),
        },
        _mockLeaf: mockLeaf,
    };
}

/** A markdown leaf view; `instanceof` rules out deferred (unloaded) views. */
function makeMarkdownView(file: { path: string } | null): MarkdownView {
    const view = new MarkdownView();
    view.file = file as any;
    return view;
}

function makeStore() {
    const storage = new Map<string, unknown>();
    return {
        loadLocalStorage: vi.fn((key: string) => storage.get(key) ?? null),
        saveLocalStorage: vi.fn((key: string, value: unknown) => {
            if (value === null) storage.delete(key);
            else storage.set(key, value);
        }),
    };
}

/** A real manager (the properties panel uses its toggle) with rendering stubbed. */
/** The component role the view plays: it owns the delegated listeners. */
const delegateComponent = {
    registerDomEvent: (el: HTMLElement, type: string, cb: EventListener) => el.addEventListener(type, cb),
} as any;

/** The two-step API the window manager drives: build the block, then fill it. */
async function renderNote(renderer: NoteRenderer, file: TFile): Promise<HTMLElement> {
    const block = renderer.createBlock(file);
    await renderer.renderInto(block, file);
    return block;
}

/** The manager the renderer under test was built with, so mount() can wire it. */
let lastCollapsible: CollapsibleManager | null = null;

/** Puts a rendered note under a delegated root, the way the stream container is. */
function mount(renderer: NoteRenderer, el: HTMLElement): HTMLElement {
    const root = document.createElement("div");
    renderer.delegate(delegateComponent, root);
    lastCollapsible?.delegate(delegateComponent, root);
    root.appendChild(el);
    document.body.appendChild(root);
    return el;
}

function makeCollapsible(store = makeStore()): CollapsibleManager {
    const manager = new CollapsibleManager(new CollapsibleStateStore(store as any));
    vi.spyOn(manager, "makeCollapsible").mockImplementation(() => {});
    lastCollapsible = manager;
    return manager;
}

function makeSettings(overrides: Partial<DailyNotesStreamSettings> = {}): () => DailyNotesStreamSettings {
    const settings = { showProperties: false, propertiesCollapsed: false, ...overrides };
    return () => settings;
}

// ---------------------------------------------------------------------------
// renderInto
// ---------------------------------------------------------------------------

describe("NoteRenderer.renderInto", () => {
    let app: ReturnType<typeof makeApp>;
    let renderer: NoteRenderer;

    beforeEach(() => {
        app = makeApp();
        renderer = new NoteRenderer(app as any, new Component(), makeCollapsible(), makeSettings());
    });

    it("returns element with .daily-note-block class", async () => {
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.classList.contains("daily-note-block")).toBe(true);
    });

    it("includes .daily-note-title with the file basename as text", async () => {
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".daily-note-title")?.textContent).toBe("2025-01-01");
    });

    it("sets dataset.sourcePath on the block, which outlives its content", () => {
        const block = renderer.createBlock(new TFile("Notes/2025-01-01.md"));
        expect(block.dataset.sourcePath).toBe("Notes/2025-01-01.md");
    });

    it("strips frontmatter using frontmatterPosition offset", async () => {
        app.vault.cachedRead = vi.fn().mockResolvedValue("---\ntitle: Test\n---\nBody text");
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
            frontmatterPosition: { end: { offset: 23 } },
        });
        // MarkdownRenderer.render is a no-op mock; just ensure no throw
        await expect(renderNote(renderer, new TFile("Notes/2025-01-01.md"))).resolves.toBeDefined();
    });

    it("reads through the cache — the view only displays notes", async () => {
        await renderNote(renderer, new TFile("Notes/2025-01-01.md"));
        expect(app.vault.cachedRead).toHaveBeenCalledOnce();
    });

    it("reads the settings on each render, so a reloaded settings object is picked up", async () => {
        let settings: DailyNotesStreamSettings = { showProperties: false, propertiesCollapsed: false };
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({ frontmatter: { title: "Test" } });
        renderer = new NoteRenderer(app as any, new Component(), makeCollapsible(), () => settings);

        settings = { showProperties: true, propertiesCollapsed: false }; // as loadSettings() would
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));

        expect(el.querySelector(".metadata-container")).not.toBeNull();
    });

    it("calls makeCollapsible after rendering content", async () => {
        const collapsible = makeCollapsible();
        renderer = new NoteRenderer(app as any, new Component(), collapsible, makeSettings());
        await renderNote(renderer, new TFile("Notes/2025-01-01.md"));
        expect(collapsible.makeCollapsible).toHaveBeenCalledOnce();
    });

    it("shows 'Error rendering note' text when the read rejects", async () => {
        app.vault.cachedRead = vi.fn().mockRejectedValue(new Error("read failed"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".daily-note-content")?.textContent).toBe("Error rendering note");
    });
});

// ---------------------------------------------------------------------------
// Per-note component lifetime
// ---------------------------------------------------------------------------

describe("NoteRenderer component lifetime", () => {
    it("createBlock returns an empty .daily-note-block", () => {
        const renderer = new NoteRenderer(makeApp() as any, new Component(), makeCollapsible(), makeSettings());
        const block = renderer.createBlock(new TFile("Notes/2025-01-01.md"));
        expect(block.classList.contains("daily-note-block")).toBe(true);
        expect(block.childElementCount).toBe(0);
    });

    it("renders into a child component of the view, not the view itself", async () => {
        const owner = new Component();
        const renderer = new NoteRenderer(makeApp() as any, owner, makeCollapsible(), makeSettings());
        const file = new TFile("Notes/2025-01-01.md");

        const child = await renderer.renderInto(renderer.createBlock(file), file);

        expect(owner.children).toContain(child);
        expect(child.loaded).toBe(true);
    });

    // Detaching the DOM alone leaves what MarkdownRenderer.render() registered
    // alive on the view until the view unloads — the leak unloading exists to fix.
    it("discard unloads the note's component and drops it from the view", async () => {
        const owner = new Component();
        const renderer = new NoteRenderer(makeApp() as any, owner, makeCollapsible(), makeSettings());
        const file = new TFile("Notes/2025-01-01.md");
        const child = await renderer.renderInto(renderer.createBlock(file), file);

        renderer.discard(child);

        expect(owner.children).not.toContain(child);
        expect(child.loaded).toBe(false);
    });

    it("a failed render still yields a component the caller can discard", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const app = makeApp();
        app.vault.cachedRead = vi.fn().mockRejectedValue(new Error("read failed"));
        const owner = new Component();
        const renderer = new NoteRenderer(app as any, owner, makeCollapsible(), makeSettings());
        const file = new TFile("Notes/2025-01-01.md");

        const child = await renderer.renderInto(renderer.createBlock(file), file);
        renderer.discard(child);

        expect(owner.children).not.toContain(child);
    });
});

// ---------------------------------------------------------------------------
// Title click — revealLeaf vs openFile
// ---------------------------------------------------------------------------

describe("NoteRenderer title link", () => {
    it("is keyboard focusable and does not navigate", async () => {
        const app = makeApp({ leaves: [] });
        const renderer = new NoteRenderer(app as any, new Component(), makeCollapsible(), makeSettings());
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        const link = el.querySelector(".daily-note-title") as HTMLAnchorElement;

        expect(link.getAttribute("href")).toBe("#");

        const event = new MouseEvent("click", { bubbles: true, cancelable: true });
        link.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });
});

describe("NoteRenderer title click", () => {
    it("calls revealLeaf when file is already open in a markdown leaf", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const existingLeaf = { view: makeMarkdownView({ path: file.path }) };
        const app = makeApp({ leaves: [existingLeaf] });
        const renderer = new NoteRenderer(app as any, new Component(), makeCollapsible(), makeSettings());
        const el = mount(renderer, await renderNote(renderer, file));
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    });

    it("opens file in a new leaf when no matching leaf exists", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const app = makeApp({ leaves: [] });
        const renderer = new NoteRenderer(app as any, new Component(), makeCollapsible(), makeSettings());
        const el = mount(renderer, await renderNote(renderer, file));
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.getLeaf).toHaveBeenCalledWith(false);
    });

    it("opens in new leaf when leaves exist but none match the file path", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const otherLeaf = { view: makeMarkdownView({ path: "Notes/2025-01-02.md" }) };
        const app = makeApp({ leaves: [otherLeaf] });
        const renderer = new NoteRenderer(app as any, new Component(), makeCollapsible(), makeSettings());
        const el = mount(renderer, await renderNote(renderer, file));
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
        expect(app.workspace.getLeaf).toHaveBeenCalled();
    });

    it("opens in a new leaf when the markdown leaf is deferred (not a MarkdownView)", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const deferredLeaf = { view: { file: { path: file.path } } };
        const app = makeApp({ leaves: [deferredLeaf] });
        const renderer = new NoteRenderer(app as any, new Component(), makeCollapsible(), makeSettings());
        const el = mount(renderer, await renderNote(renderer, file));
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
        expect(app.workspace.getLeaf).toHaveBeenCalled();
    });

    it("handles leaf.view.file being null without throwing", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const nullFileLeaf = { view: makeMarkdownView(null) };
        const app = makeApp({ leaves: [nullFileLeaf] });
        const renderer = new NoteRenderer(app as any, new Component(), makeCollapsible(), makeSettings());
        const el = mount(renderer, await renderNote(renderer, file));
        expect(() => (el.querySelector(".daily-note-title") as HTMLElement).click()).not.toThrow();
        expect(app.workspace.getLeaf).toHaveBeenCalled();
    });

    it("logs error when openFile rejects", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const file = new TFile("Notes/2025-01-01.md");
        const failLeaf = { openFile: vi.fn().mockRejectedValue(new Error("open failed")) };
        const app = makeApp({ leaves: [] });
        app.workspace.getLeaf = vi.fn().mockReturnValue(failLeaf);
        const renderer = new NoteRenderer(app as any, new Component(), makeCollapsible(), makeSettings());
        const el = mount(renderer, await renderNote(renderer, file));
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// renderProperties
// ---------------------------------------------------------------------------

describe("NoteRenderer renderProperties", () => {
    it("renders nothing when showProperties is false", async () => {
        const app = makeApp({ fileCache: { frontmatter: { tags: ["daily"] } } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: false })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders nothing when fileCache is null", async () => {
        const app = makeApp({ fileCache: null });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders nothing when frontmatter is null", async () => {
        const app = makeApp({ fileCache: { frontmatter: null } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders nothing when frontmatter has only the 'position' key", async () => {
        const app = makeApp({ fileCache: { frontmatter: { position: {} } } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders .metadata-container when showProperties is true and frontmatter has keys", async () => {
        const app = makeApp({ fileCache: { frontmatter: { mood: "happy" } } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")).not.toBeNull();
    });

    it("renders array values as comma-separated string", async () => {
        const app = makeApp({ fileCache: { frontmatter: { tags: ["work", "daily"] } } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("work, daily");
    });

    it("renders object values as JSON string", async () => {
        const app = makeApp({ fileCache: { frontmatter: { meta: { key: "val" } } } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe('{"key":"val"}');
    });

    it("renders boolean values as strings", async () => {
        const app = makeApp({ fileCache: { frontmatter: { published: true } } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("true");
    });

    it("renders number values as strings", async () => {
        const app = makeApp({ fileCache: { frontmatter: { priority: 3 } } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("3");
    });

    it("starts collapsed when propertiesCollapsed is true", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true, propertiesCollapsed: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")!.classList.contains("is-collapsed")).toBe(true);
    });

    it("remembers an expanded panel across re-renders, overriding the setting", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const collapsible = makeCollapsible();
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            collapsible,
            makeSettings({ showProperties: true, propertiesCollapsed: true })
        );
        const file = new TFile("Notes/2025-01-01.md");

        const first = mount(renderer, await renderNote(renderer, file));
        (first.querySelector(".metadata-properties-heading > .collapse-indicator") as HTMLElement).click();

        const second = mount(renderer, await renderNote(renderer, file));
        expect(second.querySelector(".metadata-container")!.classList.contains("is-collapsed")).toBe(false);
    });

    it("toggles from the chevron", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));

        (el.querySelector(".metadata-properties-heading > .collapse-indicator") as HTMLElement).click();

        expect(el.querySelector(".metadata-container")!.classList.contains("is-collapsed")).toBe(true);
    });

    it("leaves the panel alone when the heading row itself is clicked", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        const container = el.querySelector(".metadata-container")!;

        // The chevron alone toggles, as it does for a heading or a list item.
        (el.querySelector(".metadata-properties-heading-label") as HTMLElement).click();

        expect(container.classList.contains("is-collapsed")).toBe(false);
    });

    async function renderIcons(frontmatter: Record<string, unknown>): Promise<(string | undefined)[]> {
        const app = makeApp({ fileCache: { frontmatter } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        return Array.from(el.querySelectorAll<HTMLElement>(".metadata-property-icon")).map((i) => i.dataset.icon);
    }

    it("uses the 'tags' icon for 'tags', 'tag', and 'aliases' keys", async () => {
        expect(await renderIcons({ tags: ["a"], tag: "b", aliases: ["c"] })).toEqual(["tags", "tags", "tags"]);
    });

    it("uses the 'calendar' icon for date/time/created/updated keys", async () => {
        expect(await renderIcons({ startDate: "x", bedtime: "x", created: "x", updated: "x" })).toEqual([
            "calendar",
            "calendar",
            "calendar",
            "calendar",
        ]);
    });

    it("uses the 'link' icon for 'link' and 'url' keys", async () => {
        expect(await renderIcons({ link: "http://a.com", url: "http://b.com" })).toEqual(["link", "link"]);
    });

    it("uses the 'image' icon for 'image' and 'cover' keys", async () => {
        expect(await renderIcons({ image: "img.jpg", cover: "bg.jpg" })).toEqual(["image", "image"]);
    });

    it("falls back to the 'file-text' icon for unknown keys", async () => {
        expect(await renderIcons({ customField: "value" })).toEqual(["file-text"]);
    });

    it("keeps the icon lookup case-insensitive", async () => {
        expect(await renderIcons({ Tags: ["a"] })).toEqual(["tags"]);
    });

    it("renders empty string when frontmatter value is null (covers false branch of string|number|boolean check)", async () => {
        // null is not array, not non-null object, not string/number/boolean → displayValue stays ""
        const app = makeApp({ fileCache: { frontmatter: { nullField: null } } });
        const renderer = new NoteRenderer(
            app as any,
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true })
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("");
    });
});

describe("NoteRenderer — delegated listeners", () => {
    const delegateComponent = {
        registerDomEvent: (el: HTMLElement, type: string, cb: EventListener) => el.addEventListener(type, cb),
    } as any;

    async function render(app: ReturnType<typeof makeApp>, delegate: boolean) {
        const renderer = new NoteRenderer(app as any, new Component(), makeCollapsible(), makeSettings());
        const root = document.createElement("div");
        document.body.appendChild(root);
        if (delegate) renderer.delegate(delegateComponent, root);
        root.appendChild(await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        return { root, link: root.querySelector(".daily-note-title") as HTMLElement };
    }

    it("binds nothing to the title itself", async () => {
        // One listener per note would pile up on the view across re-renders.
        const app = makeApp();
        const { root, link } = await render(app, false);
        link.click();
        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
        root.remove();
    });

    it("opens the note from a delegated click", async () => {
        const app = makeApp();
        const { root, link } = await render(app, true);
        link.click();
        expect(app._mockLeaf.openFile).toHaveBeenCalled();
        root.remove();
    });

    it("ignores a delegated click that missed a title", async () => {
        const app = makeApp();
        const { root } = await render(app, true);
        root.click();
        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
        root.remove();
    });
});
