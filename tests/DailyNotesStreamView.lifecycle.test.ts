import { describe, it, expect, beforeEach, vi } from "vitest";
import { DailyNotesStreamView } from "../src/DailyNotesStreamView";
import { TFile, WorkspaceLeaf } from "./mocks/obsidian";
import { flushPromises, makeApp, makePlugin, makeStubbedView, makeViewSetup } from "./streamViewFixture";

describe("DailyNotesStreamView — view API", () => {
    let view: DailyNotesStreamView;

    beforeEach(async () => {
        ({ view } = await makeViewSetup());
    });

    it("getViewType returns 'daily-notes-stream-view'", () => {
        expect(view.getViewType()).toBe("daily-notes-stream-view");
    });

    it("getDisplayText returns 'Daily notes stream'", () => {
        expect(view.getDisplayText()).toBe("Daily notes stream");
    });

    it("getIcon returns 'calendar-days'", () => {
        expect(view.getIcon()).toBe("calendar-days");
    });

    it("onClose calls scroll.detach", async () => {
        await view.onClose();
        expect((view as any).scroll.detach).toHaveBeenCalled();
    });

    it("gives the renderer a live view of the plugin settings", async () => {
        const plugin = makePlugin();
        const app = makeApp();
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({ frontmatter: { mood: "happy" } });
        const freshView = new DailyNotesStreamView(new WorkspaceLeaf(app) as any, plugin);

        plugin.settings = { showProperties: true, propertiesCollapsed: false }; // as loadSettings() would
        const file = new TFile("Notes/2025-01-01.md");
        const renderer = (freshView as any).renderer;
        const el = renderer.createBlock(file);
        await renderer.renderInto(el, file);

        expect(el.querySelector(".metadata-container")).not.toBeNull();
    });
});

describe("DailyNotesStreamView — onResize", () => {
    // Obsidian calls onResize when the pane is dragged; the render and unload
    // margins are viewports, so a new height means new margins.
    it("recomputes the window margins", async () => {
        const { view } = await makeViewSetup();
        view.onResize();
        expect((view as any).window.refreshMargins).toHaveBeenCalled();
    });
});

describe("DailyNotesStreamView — onOpen error path", () => {
    let view: DailyNotesStreamView;

    beforeEach(() => {
        let plugin;
        ({ view, plugin } = makeStubbedView());
        plugin.service.initialize = vi.fn().mockImplementation(() => {
            throw new Error("vault not ready");
        });
    });

    it("resolves without throwing when service.initialize() throws", async () => {
        await expect(view.onOpen()).resolves.toBeUndefined();
    });

    it("does not attach scroll observer when service.initialize() throws", async () => {
        await view.onOpen();
        expect((view as any).scroll.attach).not.toHaveBeenCalled();
    });
});

describe("DailyNotesStreamView — scroll.attach callbacks", () => {
    it("scroll.attach callback in onOpen delegates to loadMoreNotes", async () => {
        const { view, plugin } = await makeViewSetup();
        (view as any).streamContainerEl = document.createElement("div");
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        // Retrieve the callback registered with scroll.attach during onOpen
        const attachCalls: any[][] = (view as any).scroll.attach.mock.calls;
        const loadMoreCb = attachCalls[attachCalls.length - 1]?.[2] as () => Promise<void>;
        expect(typeof loadMoreCb).toBe("function");
        await loadMoreCb();
        expect(plugin.service.getBatch).toHaveBeenCalled();
    });

    it("scroll.attach callback in refresh delegates to loadMoreNotes", async () => {
        const { view, plugin, state } = await makeViewSetup();
        (view as any).contentEl = document.createElement("div");
        (view as any).streamContainerEl = document.createElement("div");
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        state.reset([]);
        await (view as any).refresh();
        // The most recent attach call is from refresh
        const attachCalls: any[][] = (view as any).scroll.attach.mock.calls;
        const loadMoreCb = attachCalls[attachCalls.length - 1]?.[2] as () => Promise<void>;
        expect(typeof loadMoreCb).toBe("function");
        await loadMoreCb();
        expect(plugin.service.getBatch).toHaveBeenCalled();
    });
});

describe("DailyNotesStreamView — internal-link click handler", () => {
    let view: DailyNotesStreamView;
    let app: ReturnType<typeof makeApp>;
    let registerDomEventSpy: ReturnType<typeof vi.spyOn>;

    /** Opens a view on `app` with a real DOM contentEl, so click listeners register. */
    async function openClickableView() {
        ({ view } = makeStubbedView(app));
        (view as any).contentEl = document.createElement("div");
        registerDomEventSpy = vi.spyOn(view as any, "registerDomEvent");
        await view.onOpen();
        return (view as any).streamContainerEl as HTMLElement;
    }

    function appendInternalLink(parent: HTMLElement, href?: string) {
        const link = document.createElement("a");
        link.classList.add("internal-link");
        if (href !== undefined) link.setAttribute("data-href", href);
        parent.appendChild(link);
        return link;
    }

    beforeEach(() => {
        app = makeApp();
    });

    it("registers the click listener through registerDomEvent so Obsidian cleans it up", async () => {
        const container = await openClickableView();
        expect(registerDomEventSpy).toHaveBeenCalledWith(container, "click", expect.any(Function));
    });

    it("calls openLinkText when an .internal-link element is clicked", async () => {
        const container = await openClickableView();
        appendInternalLink(container, "TargetNote").click();
        expect(app.workspace.openLinkText).toHaveBeenCalledWith("TargetNote", "", false);
    });

    it("does not call openLinkText for regular (non-internal-link) clicks", async () => {
        const container = await openClickableView();
        container.appendChild(document.createElement("div")).click();
        expect(app.workspace.openLinkText).not.toHaveBeenCalled();
    });

    it("does not call openLinkText when data-href attribute is absent", async () => {
        const container = await openClickableView();
        appendInternalLink(container).click();
        expect(app.workspace.openLinkText).not.toHaveBeenCalled();
    });

    it("uses sourcePath from the nearest .daily-note-block ancestor", async () => {
        const container = await openClickableView();
        const block = container.appendChild(document.createElement("div"));
        block.classList.add("daily-note-block");
        block.dataset.sourcePath = "Notes/2025-01-01.md";
        appendInternalLink(block, "SomeNote").click();
        expect(app.workspace.openLinkText).toHaveBeenCalledWith("SomeNote", "Notes/2025-01-01.md", false);
    });

    it("openLinkText .catch handler logs error when link open fails", async () => {
        app.workspace.openLinkText = vi.fn().mockRejectedValue(new Error("link open failed"));
        const container = await openClickableView();
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        appendInternalLink(container, "SomeNote").click();
        await flushPromises();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
