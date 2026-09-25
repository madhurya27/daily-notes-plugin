import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import DailyNotesStreamPlugin from "../src/main";
import { DailyNotesStreamView, VIEW_TYPE_DAILY_NOTES_STREAM } from "../src/ui/stream-view";
import { DEFAULT_SETTINGS } from "../src/settings";
import { CollapsibleStateStore } from "../src/render/collapse-store";
import { TFile, WorkspaceLeaf, type PluginManifest, type WorkspaceLeaf as Leaf } from "./mocks/obsidian";
import { asApp, makeService } from "./stream-view-fixture";
import { __mockMarkdownFiles, __setMockNotes, __setMockSettings } from "./mocks/daily-notes-interface";

function makeApp() {
    return {
        vault: {
            on: vi.fn().mockReturnValue({}),
            cachedRead: vi.fn().mockResolvedValue(""),
            getMarkdownFiles: __mockMarkdownFiles,
        },
        workspace: {
            on: vi.fn().mockReturnValue({}),
            getLeavesOfType: vi.fn().mockReturnValue([]),
            getLeaf: vi.fn(),
            getMostRecentLeaf: vi.fn().mockReturnValue(null),
            revealLeaf: vi.fn().mockResolvedValue(undefined),
        },
        metadataCache: { on: vi.fn().mockReturnValue({}), getFileCache: vi.fn().mockReturnValue(null) },
        loadLocalStorage: vi.fn().mockReturnValue(null),
        saveLocalStorage: vi.fn(),
    };
}

/** A leaf that records the view state it was asked to open. */
function makeLeaf(app: ReturnType<typeof makeApp>) {
    return { app, setViewState: vi.fn().mockResolvedValue(undefined) };
}

async function loadPlugin(data: unknown = null) {
    const app = makeApp();
    const plugin = new DailyNotesStreamPlugin(asApp(app), { id: "daily-notes-stream" } as PluginManifest);
    plugin.data = data;
    await plugin.onload();
    return { plugin, app };
}

/** A leaf whose view is not the stream, for callers that only need a leaf back. */
const leafWithoutStream = { view: {} } as unknown as Leaf;

/** Flushes microtasks so the .catch() on a fire-and-forget promise runs. */
function flushPromises(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

let errorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
    __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
    __setMockNotes([]);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("DailyNotesStreamPlugin — onload", () => {
    it("falls back to defaults when no settings are saved", async () => {
        const { plugin } = await loadPlugin(null);
        expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    it("merges saved settings over the defaults", async () => {
        const { plugin } = await loadPlugin({ showProperties: true });
        expect(plugin.settings).toEqual({ showProperties: true, propertiesCollapsed: false });
    });

    it("registers a view factory that builds a stream view", async () => {
        const { plugin, app } = await loadPlugin();

        const factory = plugin.views[VIEW_TYPE_DAILY_NOTES_STREAM]!;
        const view = factory(new WorkspaceLeaf(asApp(app)));

        expect(view).toBeInstanceOf(DailyNotesStreamView);
    });

    // Each view still owns its service (CLAUDE.md, Invariants); only the
    // parsed dates carry over, so a second open parses nothing it has seen.
    it("hands every view one date cache, so a later open parses no name again", async () => {
        __setMockNotes(["Notes/2025-01-01.md", "Notes/2025-01-02.md"]);
        const { plugin, app } = await loadPlugin();
        const open = () => {
            const view = plugin.views[VIEW_TYPE_DAILY_NOTES_STREAM]!(new WorkspaceLeaf(asApp(app)));
            (view as DailyNotesStreamView)["service"].initialize();
        };
        open();
        let reads = 0;
        for (const file of __mockMarkdownFiles()) {
            const { basename } = file;
            Object.defineProperty(file, "basename", { get: () => (reads++, basename) });
        }

        open();

        expect(reads).toBe(0);
    });

    it("lists the stream in Page preview's settings, previewing on Mod+hover like Obsidian's views", async () => {
        const { plugin } = await loadPlugin();

        expect(plugin.hoverLinkSources[VIEW_TYPE_DAILY_NOTES_STREAM]).toEqual({
            display: "Daily notes stream",
            defaultMod: true,
        });
    });

    it("registers the ribbon icon, command and settings tab", async () => {
        const { plugin } = await loadPlugin();

        expect(plugin.ribbonIcons.map(({ icon, title }) => ({ icon, title }))).toEqual([
            { icon: "gallery-vertical-end", title: "Open daily notes stream" },
        ]);
        expect(plugin.commands.map((c) => c.id)).toEqual(["open-stream", "jump-to-date", "scroll-to-top"]);
        expect(plugin.settingTabs).toHaveLength(1);
    });

    it("builds a collapse store bound to the app", async () => {
        const { plugin } = await loadPlugin();
        expect(plugin.collapseStore).toBeInstanceOf(CollapsibleStateStore);
    });
});

describe("DailyNotesStreamPlugin — ribbon icon", () => {
    it.each([
        ["a click", new MouseEvent("click"), false],
        ["a mod-click", new MouseEvent("click", { metaKey: true }), "tab"],
    ] as const)("opens the pane %s asks for", async (_label, evt, pane) => {
        const { plugin } = await loadPlugin();
        const activate = vi.spyOn(plugin, "activateView").mockResolvedValue(leafWithoutStream);

        plugin.ribbonIcons[0]!.callback(evt);

        expect(activate).toHaveBeenCalledWith(pane);
    });
});

describe.each([
    ["ribbon icon", (p: DailyNotesStreamPlugin) => p.ribbonIcons[0]!.callback(new MouseEvent("click"))],
    ["command", (p: DailyNotesStreamPlugin) => void p.commands[0]!.callback!()],
])("DailyNotesStreamPlugin — %s", (_label, trigger) => {
    it("activates the view", async () => {
        const { plugin } = await loadPlugin();
        const activate = vi.spyOn(plugin, "activateView").mockResolvedValue(leafWithoutStream);

        trigger(plugin);

        expect(activate).toHaveBeenCalledTimes(1);
    });

    it("logs when activation fails instead of leaving an unhandled rejection", async () => {
        const { plugin } = await loadPlugin();
        vi.spyOn(plugin, "activateView").mockRejectedValue(new Error("no leaf"));

        trigger(plugin);
        await flushPromises();

        expect(errorSpy).toHaveBeenCalledWith("DailyNotesStream: Failed to activate view", expect.any(Error));
    });
});

describe("DailyNotesStreamPlugin — jump-to-date command", () => {
    const trigger = (p: DailyNotesStreamPlugin) => void p.commands.find((c) => c.id === "jump-to-date")!.callback!();

    /** A leaf holding a stream view, without standing up the real one. */
    function makeViewLeaf() {
        const view = Object.create(DailyNotesStreamView.prototype) as DailyNotesStreamView;
        view.promptJumpToDate = vi.fn();
        // The mock ItemView is no View in the type world, though it is one to main.ts.
        return { leaf: { view } as unknown as Leaf, view };
    }

    it("prompts on the view it activated", async () => {
        const { plugin } = await loadPlugin();
        const { leaf, view } = makeViewLeaf();
        vi.spyOn(plugin, "activateView").mockResolvedValue(leaf);

        trigger(plugin);
        await flushPromises();

        expect(view.promptJumpToDate).toHaveBeenCalledTimes(1);
    });

    it("prompts nothing when the leaf holds no stream view", async () => {
        const { plugin } = await loadPlugin();
        vi.spyOn(plugin, "activateView").mockResolvedValue(leafWithoutStream);

        trigger(plugin);
        await flushPromises();

        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("logs when activation fails instead of leaving an unhandled rejection", async () => {
        const { plugin } = await loadPlugin();
        vi.spyOn(plugin, "activateView").mockRejectedValue(new Error("no leaf"));

        trigger(plugin);
        await flushPromises();

        expect(errorSpy).toHaveBeenCalledWith("DailyNotesStream: Failed to activate view", expect.any(Error));
    });
});

describe("DailyNotesStreamPlugin — activateView", () => {
    it("hands back the leaf it opened, for callers that drive the view", async () => {
        const { plugin, app } = await loadPlugin();
        const leaf = makeLeaf(app);
        app.workspace.getLeaf.mockReturnValue(leaf);

        expect(await plugin.activateView()).toBe(leaf);
    });

    it("opens in the current tab, as the graph does", async () => {
        const { plugin, app } = await loadPlugin();
        const leaf = makeLeaf(app);
        app.workspace.getLeaf.mockReturnValue(leaf);

        await plugin.activateView();

        expect(app.workspace.getLeaf).toHaveBeenCalledWith(false);
        expect(leaf.setViewState).toHaveBeenCalledWith({
            type: VIEW_TYPE_DAILY_NOTES_STREAM,
            active: true,
        });
        expect(app.workspace.revealLeaf).toHaveBeenCalledWith(leaf);
    });

    it("opens in the pane it is asked for", async () => {
        const { plugin, app } = await loadPlugin();
        app.workspace.getLeaf.mockReturnValue(makeLeaf(app));

        await plugin.activateView("tab");

        expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
    });

    it("opens in the current tab even when another tab holds a stream", async () => {
        const { plugin, app } = await loadPlugin();
        const other = makeLeaf(app);
        const current = makeLeaf(app);
        app.workspace.getLeavesOfType.mockReturnValue([other]);
        app.workspace.getLeaf.mockReturnValue(current);

        await plugin.activateView();

        expect(current.setViewState).toHaveBeenCalled();
        expect(other.setViewState).not.toHaveBeenCalled();
        expect(app.workspace.revealLeaf).toHaveBeenCalledWith(current);
    });
});

describe("DailyNotesStreamPlugin — saveSettings", () => {
    it("persists the settings", async () => {
        const { plugin } = await loadPlugin();
        plugin.settings.showProperties = true;

        await plugin.saveSettings();

        expect(plugin.data).toEqual({ showProperties: true, propertiesCollapsed: false });
    });

    it("refreshes every open stream view", async () => {
        const { plugin, app } = await loadPlugin();
        const view = new DailyNotesStreamView(new WorkspaceLeaf(asApp(app)), plugin, makeService());
        const refresh = vi.spyOn(view, "refresh").mockResolvedValue(undefined);
        app.workspace.getLeavesOfType.mockReturnValue([{ view }]);

        await plugin.saveSettings();

        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("skips leaves holding some other view", async () => {
        const { plugin, app } = await loadPlugin();
        const refresh = vi.fn();
        app.workspace.getLeavesOfType.mockReturnValue([{ view: { refresh } }]);

        await plugin.saveSettings();

        expect(refresh).not.toHaveBeenCalled();
    });

    it("logs when a refresh fails", async () => {
        const { plugin, app } = await loadPlugin();
        const view = new DailyNotesStreamView(new WorkspaceLeaf(asApp(app)), plugin, makeService());
        vi.spyOn(view, "refresh").mockRejectedValue(new Error("render blew up"));
        app.workspace.getLeavesOfType.mockReturnValue([{ view }]);

        await plugin.saveSettings();
        await flushPromises();

        expect(errorSpy).toHaveBeenCalledWith(
            "DailyNotesStream: Failed to refresh view on settings change",
            expect.any(Error)
        );
    });
});

describe("DailyNotesStreamPlugin — two open streams", () => {
    beforeEach(() => {
        const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
        vi.stubGlobal(
            "IntersectionObserver",
            vi.fn(function () {
                return observer;
            })
        );
    });
    afterEach(() => vi.unstubAllGlobals());

    /** Two views of one plugin, each opened with its first batch loaded. */
    async function openTwoViews() {
        const { plugin, app } = await loadPlugin();
        const factory = plugin.views[VIEW_TYPE_DAILY_NOTES_STREAM]!;
        const views = [factory(new WorkspaceLeaf(asApp(app))), factory(new WorkspaceLeaf(asApp(app)))];
        const streams = views.map((view) => (view as DailyNotesStreamView)["stream"]);
        for (const [i, view] of views.entries()) {
            await (view as DailyNotesStreamView).onOpen();
            await streams[i]!.loadMoreNotes();
        }
        return streams;
    }

    it("shows a created note in both, as Obsidian tells each", async () => {
        __setMockNotes(["Notes/2026-08-27.md"]);
        const streams = await openTwoViews();

        const created = new TFile("Notes/2026-08-28.md");
        __setMockNotes(["Notes/2026-08-27.md", created.path]);
        for (const stream of streams) stream.onFileCreate(created);
        await Promise.all(streams.map((stream) => stream.refresh()));

        expect(streams.map((stream) => stream.blockOf(created) !== null)).toEqual([true, true]);
    });

    it("drops a deleted note from both, so neither pages past a note", async () => {
        __setMockNotes(["Notes/2026-08-28.md", "Notes/2026-08-27.md"]);
        const streams = await openTwoViews();

        const deleted = streams[0]!["state"].notes[0]!;
        for (const stream of streams) stream.onFileDelete(deleted);
        await Promise.all(streams.map((stream) => stream.refresh()));

        expect(streams.map((stream) => stream["state"].notes.map((f) => f.path))).toEqual([
            ["Notes/2026-08-27.md"],
            ["Notes/2026-08-27.md"],
        ]);
    });
});

describe("DailyNotesStreamPlugin — scroll-to-top command", () => {
    const check = (p: DailyNotesStreamPlugin, checking: boolean) =>
        p.commands.find((c) => c.id === "scroll-to-top")!.checkCallback!(checking);

    it.each([
        ["no leaf", null],
        ["a leaf holding another view", leafWithoutStream],
    ])("is not offered with %s", async (_label, leaf) => {
        const { plugin, app } = await loadPlugin();
        app.workspace.getMostRecentLeaf.mockReturnValue(leaf);

        expect(check(plugin, true)).toBe(false);
    });

    it("scrolls the stream in the most recent leaf to the top", async () => {
        const { plugin, app } = await loadPlugin();
        const view = Object.create(DailyNotesStreamView.prototype) as DailyNotesStreamView;
        view.scrollToTop = vi.fn();
        app.workspace.getMostRecentLeaf.mockReturnValue({ view });

        expect(check(plugin, true)).toBe(true);
        expect(view.scrollToTop).not.toHaveBeenCalled();

        check(plugin, false);
        expect(view.scrollToTop).toHaveBeenCalledTimes(1);
    });
});
