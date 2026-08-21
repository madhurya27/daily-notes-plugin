import { describe, it, expect, beforeEach, vi } from "vitest";
import { NoteRenderer } from "../src/NoteRenderer";
import { MarkdownView, TFile } from "obsidian";
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
function makeCollapsible(store = makeStore()): CollapsibleManager {
    const manager = new CollapsibleManager(new CollapsibleStateStore(store as any));
    vi.spyOn(manager, "makeCollapsible").mockImplementation(() => {});
    return manager;
}

function makeSettings(overrides: Partial<DailyNotesStreamSettings> = {}): () => DailyNotesStreamSettings {
    const settings = { showProperties: false, propertiesCollapsed: false, ...overrides };
    return () => settings;
}

// ---------------------------------------------------------------------------
// createNoteElement
// ---------------------------------------------------------------------------

describe("NoteRenderer.createNoteElement", () => {
    let app: ReturnType<typeof makeApp>;
    let renderer: NoteRenderer;

    beforeEach(() => {
        app = makeApp();
        renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings());
    });

    it("returns element with .daily-note-block class", async () => {
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.classList.contains("daily-note-block")).toBe(true);
    });

    it("includes .daily-note-title with the file basename as text", async () => {
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".daily-note-title")?.textContent).toBe("2025-01-01");
    });

    it("sets dataset.sourcePath on .daily-note-content", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const el = await renderer.createNoteElement(file);
        const content = el.querySelector(".daily-note-content") as HTMLElement;
        expect(content.dataset.sourcePath).toBe("Notes/2025-01-01.md");
    });

    it("strips frontmatter using frontmatterPosition offset", async () => {
        app.vault.cachedRead = vi.fn().mockResolvedValue("---\ntitle: Test\n---\nBody text");
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
            frontmatterPosition: { end: { offset: 23 } },
        });
        // MarkdownRenderer.render is a no-op mock; just ensure no throw
        await expect(renderer.createNoteElement(new TFile("Notes/2025-01-01.md"))).resolves.toBeDefined();
    });

    it("reads through the cache — the view only displays notes", async () => {
        await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(app.vault.cachedRead).toHaveBeenCalledOnce();
    });

    it("reads the settings on each render, so a reloaded settings object is picked up", async () => {
        let settings: DailyNotesStreamSettings = { showProperties: false, propertiesCollapsed: false };
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({ frontmatter: { title: "Test" } });
        renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), () => settings);

        settings = { showProperties: true, propertiesCollapsed: false }; // as loadSettings() would
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));

        expect(el.querySelector(".metadata-container")).not.toBeNull();
    });

    it("calls makeCollapsible after rendering content", async () => {
        const collapsible = makeCollapsible();
        renderer = new NoteRenderer(app as any, {} as any, collapsible, makeSettings());
        await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(collapsible.makeCollapsible).toHaveBeenCalledOnce();
    });

    it("shows 'Error rendering note' text when the read rejects", async () => {
        app.vault.cachedRead = vi.fn().mockRejectedValue(new Error("read failed"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".daily-note-content")?.textContent).toBe("Error rendering note");
    });
});

// ---------------------------------------------------------------------------
// Title click — revealLeaf vs openFile
// ---------------------------------------------------------------------------

describe("NoteRenderer title click", () => {
    it("calls revealLeaf when file is already open in a markdown leaf", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const existingLeaf = { view: makeMarkdownView({ path: file.path }) };
        const app = makeApp({ leaves: [existingLeaf] });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings());
        const el = await renderer.createNoteElement(file);
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    });

    it("opens file in a new leaf when no matching leaf exists", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const app = makeApp({ leaves: [] });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings());
        const el = await renderer.createNoteElement(file);
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.getLeaf).toHaveBeenCalledWith(false);
    });

    it("opens in new leaf when leaves exist but none match the file path", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const otherLeaf = { view: makeMarkdownView({ path: "Notes/2025-01-02.md" }) };
        const app = makeApp({ leaves: [otherLeaf] });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings());
        const el = await renderer.createNoteElement(file);
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
        expect(app.workspace.getLeaf).toHaveBeenCalled();
    });

    it("opens in a new leaf when the markdown leaf is deferred (not a MarkdownView)", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const deferredLeaf = { view: { file: { path: file.path } } };
        const app = makeApp({ leaves: [deferredLeaf] });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings());
        const el = await renderer.createNoteElement(file);
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
        expect(app.workspace.getLeaf).toHaveBeenCalled();
    });

    it("handles leaf.view.file being null without throwing", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const nullFileLeaf = { view: makeMarkdownView(null) };
        const app = makeApp({ leaves: [nullFileLeaf] });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings());
        const el = await renderer.createNoteElement(file);
        expect(() => (el.querySelector(".daily-note-title") as HTMLElement).click()).not.toThrow();
        expect(app.workspace.getLeaf).toHaveBeenCalled();
    });

    it("logs error when openFile rejects", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const file = new TFile("Notes/2025-01-01.md");
        const failLeaf = { openFile: vi.fn().mockRejectedValue(new Error("open failed")) };
        const app = makeApp({ leaves: [] });
        app.workspace.getLeaf = vi.fn().mockReturnValue(failLeaf);
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings());
        const el = await renderer.createNoteElement(file);
        (el.querySelector(".daily-note-title") as HTMLElement).click();
        await new Promise(resolve => setTimeout(resolve, 0));
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
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: false }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders nothing when fileCache is null", async () => {
        const app = makeApp({ fileCache: null });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders nothing when frontmatter is null", async () => {
        const app = makeApp({ fileCache: { frontmatter: null } });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders nothing when frontmatter has only the 'position' key", async () => {
        const app = makeApp({ fileCache: { frontmatter: { position: {} } } });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".metadata-container")).toBeNull();
    });

    it("renders .metadata-container when showProperties is true and frontmatter has keys", async () => {
        const app = makeApp({ fileCache: { frontmatter: { mood: "happy" } } });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".metadata-container")).not.toBeNull();
    });

    it("renders array values as comma-separated string", async () => {
        const app = makeApp({ fileCache: { frontmatter: { tags: ["work", "daily"] } } });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("work, daily");
    });

    it("renders object values as JSON string", async () => {
        const app = makeApp({ fileCache: { frontmatter: { meta: { key: "val" } } } });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe('{"key":"val"}');
    });

    it("renders boolean values as strings", async () => {
        const app = makeApp({ fileCache: { frontmatter: { published: true } } });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("true");
    });

    it("renders number values as strings", async () => {
        const app = makeApp({ fileCache: { frontmatter: { priority: 3 } } });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("3");
    });

    it("starts collapsed when propertiesCollapsed is true", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true, propertiesCollapsed: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".metadata-container")!.classList.contains("is-collapsed")).toBe(true);
    });

    it("remembers an expanded panel across re-renders, overriding the setting", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const collapsible = makeCollapsible();
        const renderer = new NoteRenderer(app as any, {} as any, collapsible, makeSettings({ showProperties: true, propertiesCollapsed: true }));
        const file = new TFile("Notes/2025-01-01.md");

        const first = await renderer.createNoteElement(file);
        (first.querySelector(".metadata-properties-heading") as HTMLElement).click();

        const second = await renderer.createNoteElement(file);
        expect(second.querySelector(".metadata-container")!.classList.contains("is-collapsed")).toBe(false);
    });

    it("toggles from the chevron as well as the heading row", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));

        (el.querySelector(".metadata-properties-heading > .collapse-indicator") as HTMLElement).click();

        expect(el.querySelector(".metadata-container")!.classList.contains("is-collapsed")).toBe(true);
    });

    it("heading click toggles collapsed state", async () => {
        const app = makeApp({ fileCache: { frontmatter: { x: 1 } } });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        const heading = el.querySelector(".metadata-properties-heading") as HTMLElement;
        const container = el.querySelector(".metadata-container")!;
        heading.click();
        expect(container.classList.contains("is-collapsed")).toBe(true);
        heading.click();
        expect(container.classList.contains("is-collapsed")).toBe(false);
    });

    async function renderIcons(frontmatter: Record<string, unknown>): Promise<(string | undefined)[]> {
        const app = makeApp({ fileCache: { frontmatter } });
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        return Array.from(el.querySelectorAll<HTMLElement>(".metadata-property-icon")).map(i => i.dataset.icon);
    }

    it("uses the 'tags' icon for 'tags', 'tag', and 'aliases' keys", async () => {
        expect(await renderIcons({ tags: ["a"], tag: "b", aliases: ["c"] })).toEqual(["tags", "tags", "tags"]);
    });

    it("uses the 'calendar' icon for date/time/created/updated keys", async () => {
        expect(await renderIcons({ startDate: "x", bedtime: "x", created: "x", updated: "x" }))
            .toEqual(["calendar", "calendar", "calendar", "calendar"]);
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
        const renderer = new NoteRenderer(app as any, {} as any, makeCollapsible(), makeSettings({ showProperties: true }));
        const el = await renderer.createNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(el.querySelector(".metadata-property-value-text")?.textContent).toBe("");
    });
});
