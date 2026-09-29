import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { DailyNotesStreamView } from "../../src/ui/stream-view";
import { Platform, TFile, WorkspaceLeaf } from "../mocks/obsidian";
import {
    asApp,
    flushPromises,
    makeApp,
    makePlugin,
    makeService,
    makeStubbedView,
    makeViewSetup,
} from "../stream-view-fixture";

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

    // The plugin remembers heights now (ADR 0010); a history entry from before still holds them.
    it("returns to a place an earlier version kept heights with", () => {
        const restorePlace = vi.spyOn(view["stream"], "restorePlace").mockResolvedValue();
        const place = { path: "a.md", offset: 0, layout: { width: 700, heights: { "a.md": 540 } } };

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

    it("getIcon returns 'gallery-vertical-end'", () => {
        expect(view.getIcon()).toBe("gallery-vertical-end");
    });

    // Back rebuilds the view: what its Bases measured must outlive it.
    it("draws Bases from the measurements the plugin keeps for every view", () => {
        const plugin = makePlugin();
        const freshView = new DailyNotesStreamView(new WorkspaceLeaf(asApp(makeApp())), plugin, makeService());

        expect(freshView["renderer"]["bases"]["measured"]).toBe(plugin.layoutMemory.bases);
    });

    // Back rebuilds the view, and the app restarts: what notes measured outlives both.
    it("reserves the heights the plugin keeps for every view", () => {
        const plugin = makePlugin();
        const freshView = new DailyNotesStreamView(new WorkspaceLeaf(asApp(makeApp())), plugin, makeService());

        expect(freshView["stream"]["window"]["heights"]).toBe(plugin.layoutMemory.notes);
    });

    it("gives the renderer a live view of the plugin settings", async () => {
        const plugin = makePlugin();
        const app = makeApp();
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({ frontmatter: { mood: "happy" } });
        const freshView = new DailyNotesStreamView(new WorkspaceLeaf(asApp(app)), plugin, makeService());

        plugin.settings = {
            showProperties: true,
            propertiesCollapsed: false,
            showLinkedMentions: false,
            linkedMentionsCollapsed: false,
            hideEmptyNotes: false,
        }; // as loadSettings() would
        const file = new TFile("Notes/2025-01-01.md");
        const renderer = freshView["renderer"];
        const el = renderer.createBlock(file);
        await renderer.renderInto(el, file);

        expect(el.querySelector(".metadata-container")).not.toBeNull();
    });
});

describe("DailyNotesStreamView — onResize", () => {
    // Obsidian calls onResize when the pane is dragged or the device turns.
    it("passes the resize on to the window", async () => {
        const { view } = await makeViewSetup();
        view.onResize();
        expect(view["stream"]["window"].onResize).toHaveBeenCalled();
    });
});

describe("DailyNotesStreamView — scroll", () => {
    // Unloads wait for the scroll to stop, so the window has to hear every one.
    it("tells the window the stream scrolled", async () => {
        const { view } = await makeViewSetup();
        view.contentEl.dispatchEvent(new Event("scroll"));
        expect(view["stream"]["window"].onScroll).toHaveBeenCalled();
    });

    // A touch is the reader's own change to a note: nothing may hold it.
    it("tells the window what the reader touched", async () => {
        const { view } = await makeViewSetup();
        const touched = view.contentEl.createDiv();
        touched.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        expect(view["stream"]["window"].onTouch).toHaveBeenCalledWith(touched);
    });

    // A search holds its match until the reader moves the pane.
    it("tells the stream the reader wheeled", async () => {
        const { view } = await makeViewSetup();
        const onWheel = vi.spyOn(view["stream"], "onWheel");
        view.contentEl.dispatchEvent(new Event("wheel"));
        expect(onWheel).toHaveBeenCalled();
    });
});

describe("DailyNotesStreamView — header title", () => {
    /** A view whose header carries the title Obsidian draws there, opened. */
    async function withTitle() {
        const setup = makeStubbedView();
        const titleEl = document.createElement("div");
        Object.assign(setup.view, { titleEl });
        await setup.view.onOpen();
        return { ...setup, titleEl };
    }

    afterEach(() => {
        Platform.isMobile = false;
    });

    // iOS apps scroll to the top on a tap of the title bar.
    it("scrolls the stream to its top on a tap of the title, on mobile", async () => {
        Platform.isMobile = true;
        const { view, titleEl } = await withTitle();

        titleEl.click();

        expect(view["stream"]["window"].scrollToTop).toHaveBeenCalledOnce();
    });

    it("scrolls the stream to its top on the command's call", async () => {
        const { view } = await withTitle();

        view.scrollToTop();

        expect(view["stream"]["window"].scrollToTop).toHaveBeenCalledOnce();
    });

    it("leaves the title alone on desktop", async () => {
        const { view, titleEl } = await withTitle();

        titleEl.click();

        expect(view["stream"]["window"].scrollToTop).not.toHaveBeenCalled();
    });

    it("opens without a title to tap", async () => {
        Platform.isMobile = true;
        const { view } = makeStubbedView();
        await expect(view.onOpen()).resolves.toBeUndefined();
    });
});

describe("DailyNotesStreamView — onOpen", () => {
    // Its first batch must already leave out the hidden notes (ADR 0011).
    it("opens the stream only once the service has listed its notes", async () => {
        const { view, service } = makeStubbedView();
        let listed!: () => void;
        vi.mocked(service.initialize).mockReturnValue(new Promise((resolve) => (listed = resolve)));

        const opened = view.onOpen();
        await flushPromises();
        expect(view["stream"]["scroll"].attach).not.toHaveBeenCalled();

        listed();
        await opened;
        expect(view["stream"]["scroll"].attach).toHaveBeenCalled();
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
