import { describe, it, expect, beforeEach, vi } from "vitest";
import { DailyNotesStreamView } from "../src/ui/stream-view";
import { TFile, WorkspaceLeaf } from "./mocks/obsidian";
import { asApp, makeApp, makePlugin, makeService, makeStubbedView, makeViewSetup } from "./stream-view-fixture";

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

describe("DailyNotesStreamView — hover parent", () => {
    // Page preview hangs its popover on the view, and unloads it with the view.
    it("starts with no popover", () => {
        const { view } = makeStubbedView(makeApp());
        expect(view.hoverPopover).toBeNull();
    });
});
