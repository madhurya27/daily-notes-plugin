import { describe, it, expect, beforeEach, vi } from "vitest";
import { SearchHighlighter } from "../src/render/search-highlights";
import { NoteRenderer } from "../src/render/note-renderer";
import { Component, MarkdownRenderer, MarkdownView, TFile } from "obsidian";
import type { Menu } from "./mocks/obsidian";
import { CollapsibleManager } from "../src/render/collapsible";
import { CollapsibleStateStore } from "../src/render/collapse-store";
import type { DailyNotesStreamSettings } from "../src/settings";
import { asApp } from "./stream-view-fixture";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(opts: { readResult?: string; fileCache?: unknown; leaves?: unknown[] } = {}) {
    const { readResult = "", fileCache = null, leaves = [] } = opts;
    const mockOpenFile = vi.fn().mockResolvedValue(undefined);
    // One leaf serves both uses: opening a note, and hosting a search pane.
    const searchView = { setQuery: vi.fn() };
    const mockLeaf = {
        openFile: mockOpenFile,
        view: searchView,
        setViewState: vi.fn().mockResolvedValue(undefined),
    };
    const openGlobalSearch = vi.fn();
    return {
        vault: { cachedRead: vi.fn().mockResolvedValue(readResult) },
        metadataCache: { getFileCache: vi.fn().mockReturnValue(fileCache) },
        internalPlugins: { getPluginById: vi.fn().mockReturnValue({ instance: { openGlobalSearch } }) },
        _openGlobalSearch: openGlobalSearch,
        workspace: {
            getLeavesOfType: vi.fn().mockReturnValue(leaves),
            getLeaf: vi.fn().mockReturnValue(mockLeaf),
            revealLeaf: vi.fn().mockResolvedValue(undefined),
            trigger: vi.fn(),
        },
        _mockLeaf: mockLeaf,
        _searchLeaf: mockLeaf,
    };
}

/** A markdown leaf view; `instanceof` rules out deferred (unloaded) views. */
function makeMarkdownView(file: TFile | null): MarkdownView {
    const view = new MarkdownView();
    view.file = file;
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
const delegateComponent = new Component();

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
    const manager = new CollapsibleManager(new CollapsibleStateStore(asApp(store)));
    vi.spyOn(manager, "makeCollapsible").mockReturnValue([]);
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

async function renderWithProperties(app: ReturnType<typeof makeApp>) {
    const renderer = new NoteRenderer(
        asApp(app),
        new Component(),
        makeCollapsible(),
        makeSettings({ showProperties: true }),
        new SearchHighlighter()
    );
    return mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
}

describe("NoteRenderer.renderInto", () => {
    let app: ReturnType<typeof makeApp>;
    let renderer: NoteRenderer;

    beforeEach(() => {
        app = makeApp();
        renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
    });

    it("includes .daily-note-title with the file basename as text", async () => {
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".daily-note-title")?.textContent).toBe("2025-01-01");
    });

    it("sets dataset.sourcePath on the block, which outlives its content", () => {
        const block = renderer.createBlock(new TFile("Notes/2025-01-01.md"));
        expect(block.dataset.sourcePath).toBe("Notes/2025-01-01.md");
    });

    it("renders the body without its frontmatter", async () => {
        const render = vi.spyOn(MarkdownRenderer, "render");
        app.vault.cachedRead = vi.fn().mockResolvedValue("---\ntitle: Test\n---\nBody text");
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
            frontmatterPosition: { end: { offset: 19 } },
        });
        await renderNote(renderer, new TFile("Notes/2025-01-01.md"));
        expect(render).toHaveBeenCalledWith(
            app,
            "Body text",
            expect.anything(),
            "Notes/2025-01-01.md",
            expect.anything()
        );
    });

    it("reads through the cache — the view only displays notes", async () => {
        await renderNote(renderer, new TFile("Notes/2025-01-01.md"));
        expect(app.vault.cachedRead).toHaveBeenCalledOnce();
    });

    it("reads the settings on each render, so a reloaded settings object is picked up", async () => {
        let settings: DailyNotesStreamSettings = { showProperties: false, propertiesCollapsed: false };
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({ frontmatter: { title: "Test" } });
        renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            () => settings,
            new SearchHighlighter()
        );

        settings = { showProperties: true, propertiesCollapsed: false }; // as loadSettings() would
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));

        expect(el.querySelector(".metadata-container")).not.toBeNull();
    });

    it("calls makeCollapsible after rendering content", async () => {
        const collapsible = makeCollapsible();
        renderer = new NoteRenderer(asApp(app), new Component(), collapsible, makeSettings(), new SearchHighlighter());
        await renderNote(renderer, new TFile("Notes/2025-01-01.md"));
        expect(collapsible.makeCollapsible).toHaveBeenCalledOnce();
    });

    it("forgets the sections the rendered note no longer has", async () => {
        const collapsible = makeCollapsible();
        vi.mocked(collapsible.makeCollapsible).mockReturnValue(["meeting"]);
        const forget = vi.spyOn(collapsible, "forgetRemovedSections").mockImplementation(() => {});
        renderer = new NoteRenderer(asApp(app), new Component(), collapsible, makeSettings(), new SearchHighlighter());
        const file = new TFile("Notes/2025-01-01.md");

        await renderNote(renderer, file);

        expect(forget).toHaveBeenCalledWith(file, ["meeting"]);
    });

    it("forgets nothing when the note failed to render: no section was seen", async () => {
        app.vault.cachedRead = vi.fn().mockRejectedValue(new Error("read failed"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const collapsible = makeCollapsible();
        const forget = vi.spyOn(collapsible, "forgetRemovedSections");
        renderer = new NoteRenderer(asApp(app), new Component(), collapsible, makeSettings(), new SearchHighlighter());

        await renderNote(renderer, new TFile("Notes/2025-01-01.md"));

        expect(forget).not.toHaveBeenCalled();
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
        const renderer = new NoteRenderer(
            asApp(makeApp()),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const block = renderer.createBlock(new TFile("Notes/2025-01-01.md"));
        expect(block.classList.contains("daily-note-block")).toBe(true);
        expect(block.childElementCount).toBe(0);
    });

    it("renders into a child component of the view, not the view itself", async () => {
        const owner = new Component();
        const renderer = new NoteRenderer(
            asApp(makeApp()),
            owner,
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const file = new TFile("Notes/2025-01-01.md");

        const child = await renderer.renderInto(renderer.createBlock(file), file);

        expect(owner.children).toContain(child);
        expect(child.loaded).toBe(true);
    });

    // Detaching the DOM alone leaves what MarkdownRenderer.render() registered
    // alive on the view until the view unloads — the leak unloading exists to fix.
    it("discard unloads the note's component and drops it from the view", async () => {
        const owner = new Component();
        const renderer = new NoteRenderer(
            asApp(makeApp()),
            owner,
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const file = new TFile("Notes/2025-01-01.md");
        const child = await renderer.renderInto(renderer.createBlock(file), file);

        renderer.discard(child);

        expect(owner.children).not.toContain(child);
        expect(child.loaded).toBe(false);
    });

    // Tracked once the note is complete, so the title and body are searched,
    // and forgotten with the component, so an unloaded note keeps no ranges.
    it("highlights the search in the rendered note until it is discarded", async () => {
        const app = makeApp();
        app.vault.cachedRead = vi.fn().mockResolvedValue("body");
        const highlighter = new SearchHighlighter();
        highlighter.setQuery("2025");
        const renderer = new NoteRenderer(asApp(app), new Component(), makeCollapsible(), makeSettings(), highlighter);
        const file = new TFile("Notes/2025-01-01.md");
        const block = renderer.createBlock(file);

        const child = await renderer.renderInto(block, file);
        expect(highlighter.rangesIn(block).map((r) => r.toString())).toEqual(["2025"]);

        renderer.discard(child);
        expect(highlighter.rangesIn(block)).toEqual([]);
    });

    it("a failed render still yields a component the caller can discard", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const app = makeApp();
        app.vault.cachedRead = vi.fn().mockRejectedValue(new Error("read failed"));
        const owner = new Component();
        const renderer = new NoteRenderer(
            asApp(app),
            owner,
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
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
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
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
        const existingLeaf = { view: makeMarkdownView(file) };
        const app = makeApp({ leaves: [existingLeaf] });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, file));
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    });

    it("opens file in a new leaf when no matching leaf exists", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const app = makeApp({ leaves: [] });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, file));
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.getLeaf).toHaveBeenCalledWith(false);
    });

    it("opens in new leaf when leaves exist but none match the file path", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const otherLeaf = { view: makeMarkdownView(new TFile("Notes/2025-01-02.md")) };
        const app = makeApp({ leaves: [otherLeaf] });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, file));
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
        expect(app.workspace.getLeaf).toHaveBeenCalled();
    });

    it("opens in a new leaf when the markdown leaf is deferred (not a MarkdownView)", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const deferredLeaf = { view: { file: { path: file.path } } };
        const app = makeApp({ leaves: [deferredLeaf] });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, file));
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
        expect(app.workspace.getLeaf).toHaveBeenCalled();
    });

    it("handles leaf.view.file being null without throwing", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const nullFileLeaf = { view: makeMarkdownView(null) };
        const app = makeApp({ leaves: [nullFileLeaf] });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
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
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, file));
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});

describe("NoteRenderer title open targets", () => {
    async function renderTitle(app: ReturnType<typeof makeApp>) {
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const file = new TFile("Notes/2025-01-01.md");
        const el = mount(renderer, await renderNote(renderer, file));
        return { file, title: el.querySelector(".daily-note-title") as HTMLElement };
    }

    it("opens a new tab on mod-click, even when the note is already open", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const app = makeApp({ leaves: [{ view: makeMarkdownView(file) }] });
        const { title } = await renderTitle(app);

        title.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));

        expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
        expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
        expect(app._mockLeaf.openFile).toHaveBeenCalledWith(file);
    });

    it("opens a split on mod-alt-click", async () => {
        const app = makeApp();
        const { title } = await renderTitle(app);

        title.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true, altKey: true }));

        expect(app.workspace.getLeaf).toHaveBeenCalledWith("split");
    });

    it("opens a new tab on middle-click", async () => {
        // A middle button fires auxclick, never click.
        const app = makeApp();
        const { title } = await renderTitle(app);

        const event = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
        title.dispatchEvent(event);

        expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
        expect(event.defaultPrevented).toBe(true);
    });

    it("leaves other auxiliary buttons alone", async () => {
        const app = makeApp();
        const { title } = await renderTitle(app);

        title.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 2 }));

        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    });

    it("ignores a middle-click that missed a title", async () => {
        const app = makeApp();
        const { title } = await renderTitle(app);

        title.parentElement!.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));

        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    });
});

describe("NoteRenderer title menu", () => {
    async function rightClickTitle(app: ReturnType<typeof makeApp>) {
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const file = new TFile("Notes/2025-01-01.md");
        const el = mount(renderer, await renderNote(renderer, file));
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        el.querySelector(".daily-note-title")!.dispatchEvent(event);
        const menu = app.workspace.trigger.mock.calls[0]?.[1] as Menu | undefined;
        return { file, event, menu };
    }

    it("hands the note to Obsidian's file menu, shown where the click was", async () => {
        const app = makeApp();
        const { file, event, menu } = await rightClickTitle(app);

        expect(app.workspace.trigger).toHaveBeenCalledWith("file-menu", menu, file, "daily-notes-stream");
        expect(menu?.shownAt).toBe(event);
        expect(event.defaultPrevented).toBe(true);
    });

    it("leads with the places the note can open", async () => {
        const { menu } = await rightClickTitle(makeApp());

        expect(menu?.items.map((item) => [item.title, item.icon, item.section])).toEqual([
            ["Open in new tab", "file-plus", "open"],
            ["Open to the right", "separator-vertical", "open"],
        ]);
    });

    it.each([
        [0, "tab"],
        [1, "split"],
    ])("opens the note from item %i in a %s", async (index, target) => {
        const app = makeApp();
        const { file, menu } = await rightClickTitle(app);

        menu?.items[index]?.click();

        expect(app.workspace.getLeaf).toHaveBeenCalledWith(target);
        expect(app._mockLeaf.openFile).toHaveBeenCalledWith(file);
    });

    it("leaves a right-click off the title to the page", async () => {
        const app = makeApp();
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });

        el.dispatchEvent(event);

        expect(app.workspace.trigger).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// renderProperties
// ---------------------------------------------------------------------------

describe("NoteRenderer renderProperties", () => {
    it("renders nothing when showProperties is false", async () => {
        const app = makeApp({ fileCache: { frontmatter: { tags: ["daily"] } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: false }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders nothing when fileCache is null", async () => {
        const app = makeApp({ fileCache: null });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders nothing when frontmatter is null", async () => {
        const app = makeApp({ fileCache: { frontmatter: null } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders nothing when frontmatter has only the 'position' key", async () => {
        const app = makeApp({ fileCache: { frontmatter: { position: {} } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders .metadata-container when showProperties is true and frontmatter has keys", async () => {
        const app = makeApp({ fileCache: { frontmatter: { mood: "happy" } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")).not.toBeNull();
    });

    it("renders list values as Obsidian's pills, one per item", async () => {
        const app = makeApp({ fileCache: { frontmatter: { aliases: ["work", "daily"] } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        const pills = el.querySelectorAll(".metadata-property-value .multi-select-container .multi-select-pill");
        expect([...pills].map((p) => p.textContent)).toEqual(["work", "daily"]);
        expect(el.querySelector(".multi-select-pill > .multi-select-pill-content")).not.toBeNull();
    });

    // Obsidian colours a pill as a tag off the value's type, not its key.
    it("types a tags property so its pills take the tag colours", async () => {
        const app = makeApp({ fileCache: { frontmatter: { tags: ["work"], aliases: ["w"] } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        const values = el.querySelectorAll<HTMLElement>(".metadata-property-value");
        expect(values[0]?.dataset.propertyType).toBe("tags");
        expect(values[1]?.dataset.propertyType).toBeUndefined();
    });

    // Obsidian never splits a scalar: `tags: work, daily` is one pill, and no tag name.
    it("shows a scalar tags value as one invalid pill, as Obsidian does", async () => {
        const app = makeApp({ fileCache: { frontmatter: { tags: "work, daily" } } });
        const el = await renderWithProperties(app);
        const pills = [...el.querySelectorAll<HTMLElement>(".multi-select-pill")];
        expect(pills.map((p) => p.textContent)).toEqual(["work, daily"]);
        expect(pills[0]?.hasClass("is-invalid")).toBe(true);
        expect(pills[0]?.getAttribute("aria-label")).toBe("Invalid tag name");
    });

    it("marks only the tag pills that are no tag name invalid", async () => {
        const tags = ["work", "1a", "a/b", "-a_b", "é日本", "💡", "a，b", "123", "a b", "a.b", "a!", "a…", "a⸗b"];
        const app = makeApp({ fileCache: { frontmatter: { tags } } });
        const el = await renderWithProperties(app);
        const invalid = [...el.querySelectorAll(".multi-select-pill.is-invalid")].map((p) => p.textContent);
        expect(invalid).toEqual(["123", "a b", "a.b", "a!", "a…", "a⸗b"]);
    });

    it("drops a tag's leading # from its pill, but marks it invalid", async () => {
        const app = makeApp({ fileCache: { frontmatter: { tags: ["#work"] } } });
        const el = await renderWithProperties(app);
        const pill = el.querySelector<HTMLElement>(".multi-select-pill")!;
        expect(pill.textContent).toBe("work");
        expect(pill.hasClass("is-invalid")).toBe(true);
    });

    it("draws a 'tag' key as text, as Obsidian no longer reads it as tags", async () => {
        const app = makeApp({ fileCache: { frontmatter: { tag: "work" } } });
        const el = await renderWithProperties(app);
        expect(el.querySelector(".multi-select-pill")).toBeNull();
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("work");
    });

    it("never marks a pill invalid outside a tags property", async () => {
        const app = makeApp({ fileCache: { frontmatter: { aliases: ["a b"] } } });
        const el = await renderWithProperties(app);
        expect(el.querySelector(".multi-select-pill.is-invalid")).toBeNull();
    });

    it("renders object values as JSON string", async () => {
        const app = makeApp({ fileCache: { frontmatter: { meta: { key: "val" } } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe('{"key":"val"}');
    });

    it("renders boolean values as strings", async () => {
        const app = makeApp({ fileCache: { frontmatter: { published: true } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("true");
    });

    it("renders number values as strings", async () => {
        const app = makeApp({ fileCache: { frontmatter: { priority: 3 } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("3");
    });

    it("starts collapsed when propertiesCollapsed is true", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true, propertiesCollapsed: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-container")!.classList.contains("is-collapsed")).toBe(true);
    });

    it("unfolds a collapsed panel for a search match inside it, but not for its title", async () => {
        const app = makeApp({ fileCache: { frontmatter: { mood: "calm" } } });
        const collapsible = makeCollapsible();
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            collapsible,
            makeSettings({ showProperties: true, propertiesCollapsed: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        const value = el.querySelector(".metadata-property-value-text")!.firstChild!;
        const title = el.querySelector(".metadata-properties-title")!.firstChild!;

        expect(collapsible.folds(title)).toBe(false);
        collapsible.unfold(value);

        expect(el.querySelector(".metadata-container")!.classList.contains("is-collapsed")).toBe(false);
    });

    it("remembers an expanded panel across re-renders, overriding the setting", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const collapsible = makeCollapsible();
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            collapsible,
            makeSettings({ showProperties: true, propertiesCollapsed: true }),
            new SearchHighlighter()
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
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));

        (el.querySelector(".metadata-properties-heading > .collapse-indicator") as HTMLElement).click();

        expect(el.querySelector(".metadata-container")!.classList.contains("is-collapsed")).toBe(true);
    });

    it("toggles from the heading row, as Obsidian's own panel does", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        const container = el.querySelector(".metadata-container")!;

        // Obsidian hides this chevron unless the pointer is over the row and a
        // phone never hovers, so the row itself has to be the target.
        (el.querySelector(".metadata-properties-title") as HTMLElement).click();

        expect(container.classList.contains("is-collapsed")).toBe(true);
    });

    it("puts the heading outside the box, as Obsidian's own panel does", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        const heading = el.querySelector(".metadata-properties-heading")!;

        // The grey box is `.metadata-content`; the heading is its sibling above.
        expect(heading.parentElement!.className).toBe("metadata-container");
        expect(heading.nextElementSibling!.className).toBe("metadata-content");
    });

    it("leaves the heading unfocusable, so clicking it draws no focus ring", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));

        // Obsidian rings this heading on :focus, and a tabindex makes a click
        // focus it: the ring then sat around the row until something else took
        // focus. The chevron carries the keyboard affordance instead.
        expect(el.querySelector(".metadata-properties-heading")!.hasAttribute("tabindex")).toBe(false);
        expect(el.querySelector(".metadata-properties-heading > .collapse-indicator")!.getAttribute("tabindex")).toBe(
            "0"
        );
    });

    async function renderIcons(
        frontmatter: Record<string, unknown>,
        metadataTypeManager?: unknown
    ): Promise<(string | undefined)[]> {
        const app = { ...makeApp({ fileCache: { frontmatter } }), metadataTypeManager };
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        return Array.from(el.querySelectorAll<HTMLElement>(".metadata-property-icon")).map((i) => i.dataset.icon);
    }

    it("takes each icon off the property type Obsidian resolves for the key", async () => {
        const getTypeInfo = vi.fn((key: string) => ({
            expected: key === "created" ? { icon: "lucide-calendar" } : null,
            inferred: { icon: "lucide-text" },
        }));
        expect(await renderIcons({ created: "2026-09-22", note: "x" }, { getTypeInfo })).toEqual([
            "lucide-calendar",
            "lucide-text",
        ]);
        expect(getTypeInfo).toHaveBeenCalledWith("created", "2026-09-22");
    });

    // The key-name guesses below are the fallback, for a vault whose Obsidian
    // no longer exposes the type manager.
    it("uses the 'tags' icon for 'tags' and 'aliases' keys", async () => {
        expect(await renderIcons({ tags: ["a"], aliases: ["c"] })).toEqual(["tags", "tags"]);
    });

    // Obsidian 1.9.10 dropped `tag` for `tags`; it types `tag` as text now.
    it("gives a 'tag' key no tag icon", async () => {
        expect(await renderIcons({ tag: "b" })).toEqual(["file-text"]);
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

    it("renders a null value as empty text", async () => {
        const app = makeApp({ fileCache: { frontmatter: { nullField: null } } });
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings({ showProperties: true }),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("");
    });
});

describe("NoteRenderer — delegated listeners", () => {
    const delegateComponent = new Component();

    async function render(app: ReturnType<typeof makeApp>, delegate: boolean) {
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
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

describe("NoteRenderer tag click", () => {
    /** Inline tags come from MarkdownRenderer, mocked here; this is its output. */
    function addInlineTag(block: HTMLElement, tag: string): HTMLElement {
        const link = block.querySelector(".daily-note-content")!.createEl("a", { cls: "tag", text: tag });
        link.setAttribute("href", tag);
        return link;
    }

    it("searches for an inline tag the click landed on", async () => {
        const app = makeApp();
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));

        addInlineTag(el, "#work").click();

        expect(app._openGlobalSearch).toHaveBeenCalledWith("tag:#work");
    });

    it("keeps the href from navigating the view away", async () => {
        const app = makeApp();
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));

        const event = new MouseEvent("click", { bubbles: true, cancelable: true });
        addInlineTag(el, "#work").dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    it("searches for a tag pill in the properties panel", async () => {
        const app = makeApp({ fileCache: { frontmatter: { tags: ["work", "daily"] } } });
        const el = await renderWithProperties(app);

        (el.querySelectorAll(".multi-select-pill")[1] as HTMLElement).click();

        expect(app._openGlobalSearch).toHaveBeenCalledWith("tag:#daily");
    });

    it("does not search on an invalid tag pill", async () => {
        const app = makeApp({ fileCache: { frontmatter: { tags: "work, daily" } } });
        const el = await renderWithProperties(app);

        (el.querySelector(".multi-select-pill") as HTMLElement).click();

        expect(app._openGlobalSearch).not.toHaveBeenCalled();
    });

    it("leaves a pill of a property Obsidian does not type as a tag alone", async () => {
        const app = makeApp({ fileCache: { frontmatter: { aliases: ["w"] } } });
        const el = await renderWithProperties(app);

        (el.querySelector(".multi-select-pill") as HTMLElement).click();

        expect(app._openGlobalSearch).not.toHaveBeenCalled();
    });

    it("opens the search in a new tab when the tag is cmd-clicked", async () => {
        const app = makeApp();
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));

        addInlineTag(el, "#work").dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
        await Promise.resolve();

        expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
        expect(app._searchLeaf.setViewState).toHaveBeenCalledWith({ type: "search", active: true });
        expect(app._searchLeaf.view.setQuery).toHaveBeenCalledWith("tag:#work");
    });

    it("splits the pane when the tag is cmd-alt-clicked", async () => {
        const app = makeApp();
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));

        addInlineTag(el, "#work").dispatchEvent(
            new MouseEvent("click", { bubbles: true, metaKey: true, altKey: true })
        );

        expect(app.workspace.getLeaf).toHaveBeenCalledWith("split");
    });

    it("does not open the note when the click was on one of its tags", async () => {
        const app = makeApp();
        const renderer = new NoteRenderer(
            asApp(app),
            new Component(),
            makeCollapsible(),
            makeSettings(),
            new SearchHighlighter()
        );
        const el = mount(renderer, await renderNote(renderer, new TFile("Notes/2025-01-01.md")));

        addInlineTag(el, "#work").click();

        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    });
});
