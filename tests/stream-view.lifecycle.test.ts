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

    it("is navigable, so the status bar stops describing the last note while the stream has focus", () => {
        expect(view.navigation).toBe(true);
    });

    it("hands Obsidian's history its place in the stream", () => {
        const place = { path: "Notes/2025-01-05.md", offset: -150 };
        vi.spyOn(view["stream"], "place").mockReturnValue(place);

        expect(view.getEphemeralState()).toEqual({ place });
    });

    it("hands Obsidian's history nothing for an empty stream", () => {
        vi.spyOn(view["stream"], "place").mockReturnValue(null);

        expect(view.getEphemeralState()).toEqual({});
    });

    it("returns to the place Obsidian's history hands back", () => {
        const restorePlace = vi.spyOn(view["stream"], "restorePlace").mockResolvedValue();
        const place = { path: "Notes/2025-01-05.md", offset: -150 };

        view.setEphemeralState({ place });

        expect(restorePlace).toHaveBeenCalledWith(place);
    });

    it.each([undefined, {}, { place: "top" }, { place: { path: 3, offset: 0 } }, { place: { path: "a.md" } }])(
        "ignores a state it did not write: %o",
        (state) => {
            const restorePlace = vi.spyOn(view["stream"], "restorePlace");

            view.setEphemeralState(state);

            expect(restorePlace).not.toHaveBeenCalled();
        }
    );

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

describe("DailyNotesStreamView — scroll", () => {
    // Unloads wait for the scroll to stop, so the window has to hear every one.
    it("tells the window the stream scrolled", async () => {
        const { view } = await makeViewSetup();
        view.contentEl.dispatchEvent(new Event("scroll"));
        expect(view["stream"]["window"].onScroll).toHaveBeenCalled();
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
