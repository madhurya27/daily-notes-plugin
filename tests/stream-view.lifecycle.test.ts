import { describe, it, expect, beforeEach, vi } from "vitest";
import { DailyNotesStreamView } from "../src/ui/stream-view";
import { TFile, WorkspaceLeaf } from "./mocks/obsidian";
import {
    asApp,
    flushPromises,
    makeApp,
    makePlugin,
    makeService,
    makeStubbedView,
    makeViewSetup,
} from "./stream-view-fixture";

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

    it("gives the renderer a live view of the plugin settings", async () => {
        const plugin = makePlugin();
        const app = makeApp();
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({ frontmatter: { mood: "happy" } });
        const freshView = new DailyNotesStreamView(new WorkspaceLeaf(asApp(app)), plugin, makeService());

        plugin.settings = { showProperties: true, propertiesCollapsed: false }; // as loadSettings() would
        const file = new TFile("Notes/2025-01-01.md");
        const renderer = freshView["renderer"];
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
        expect(view["stream"]["window"].refreshMargins).toHaveBeenCalled();
    });
});

describe("DailyNotesStreamView — refresh", () => {
    // The plugin calls it when its own settings change; the rebuild is note-stream.test.ts's.
    it("rebuilds the stream", async () => {
        const { view } = await makeViewSetup();
        const rebuild = vi.spyOn(view["stream"], "refresh");

        await view.refresh();

        expect(rebuild).toHaveBeenCalledOnce();
    });
});

describe("DailyNotesStreamView — internal-link click handler", () => {
    let view: DailyNotesStreamView;
    let app: ReturnType<typeof makeApp>;
    let registerDomEventSpy: ReturnType<typeof vi.spyOn>;

    /** Opens a view on `app`, so click listeners register. */
    async function openClickableView() {
        ({ view } = makeStubbedView(app));
        registerDomEventSpy = vi.spyOn(view, "registerDomEvent");
        await view.onOpen();
        return view["stream"]["blocks"].el;
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
