import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import DailyNotesStreamPlugin from "../src/main";
import { DailyNotesStreamView, VIEW_TYPE_DAILY_NOTES_STREAM } from "../src/DailyNotesStreamView";
import { DEFAULT_SETTINGS } from "../src/settings";
import { DailyNoteService } from "../src/DailyNoteService";
import { CollapsibleStateStore } from "../src/CollapsibleStateStore";
import { WorkspaceLeaf } from "./mocks/obsidian";
import { __setMockNotes, __setMockSettings } from "./mocks/daily-notes-interface";

function makeApp() {
    return {
        vault: { on: vi.fn().mockReturnValue({}), cachedRead: vi.fn().mockResolvedValue("") },
        workspace: {
            on: vi.fn().mockReturnValue({}),
            getLeavesOfType: vi.fn().mockReturnValue([]),
            getLeaf: vi.fn(),
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
    const plugin = new DailyNotesStreamPlugin(app as any, { id: "daily-notes-stream" } as any);
    plugin.data = data;
    await plugin.onload();
    return { plugin, app };
}

/** Flushes microtasks so the .catch() on a fire-and-forget promise runs. */
function flushPromises(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

let errorSpy: ReturnType<typeof vi.spyOn>;

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
        const view = factory(new WorkspaceLeaf(app as any));

        expect(view).toBeInstanceOf(DailyNotesStreamView);
    });

    it("registers the ribbon icon, command and settings tab", async () => {
        const { plugin } = await loadPlugin();

        expect(plugin.ribbonIcons).toEqual([
            { icon: "calendar-days", title: "Open daily notes stream", callback: expect.any(Function) },
        ]);
        expect(plugin.commands.map((c) => c.id)).toEqual(["open-stream", "jump-to-date"]);
        expect(plugin.settingTabs).toHaveLength(1);
    });

    it("leaves the service uninitialized — the vault is not ready at load time", async () => {
        __setMockNotes(["Notes/2026-08-28.md", "Notes/2026-08-27.md"]);

        const { plugin } = await loadPlugin();

        expect(plugin.service).toBeInstanceOf(DailyNoteService);
        expect(plugin.service.length).toBe(0);
    });

    it("builds a collapse store bound to the app", async () => {
        const { plugin } = await loadPlugin();
        expect(plugin.collapseStore).toBeInstanceOf(CollapsibleStateStore);
    });
});

describe.each([
    ["ribbon icon", (p: DailyNotesStreamPlugin) => p.ribbonIcons[0]!.callback(new MouseEvent("click"))],
    ["command", (p: DailyNotesStreamPlugin) => p.commands[0]!.callback()],
])("DailyNotesStreamPlugin — %s", (_label, trigger) => {
    it("activates the view", async () => {
        const { plugin } = await loadPlugin();
        const activate = vi.spyOn(plugin, "activateView").mockResolvedValue(undefined);

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
    const trigger = (p: DailyNotesStreamPlugin) => p.commands.find((c) => c.id === "jump-to-date")!.callback();

    /** A leaf holding a stream view, without standing up the real one. */
    function makeViewLeaf() {
        const view = Object.create(DailyNotesStreamView.prototype) as DailyNotesStreamView;
        view.promptJumpToDate = vi.fn();
        return { leaf: { view } as any, view };
    }

    it("prompts on the view it activated", async () => {
        const { plugin } = await loadPlugin();
        const { leaf, view } = makeViewLeaf();
        vi.spyOn(plugin, "activateView").mockResolvedValue(leaf);

        trigger(plugin);
        await flushPromises();

        expect(view.promptJumpToDate).toHaveBeenCalledTimes(1);
    });

    it("prompts nothing when no stream view came back", async () => {
        const { plugin } = await loadPlugin();
        vi.spyOn(plugin, "activateView").mockResolvedValue(null);

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
    it("hands back the leaf it revealed, for callers that drive the view", async () => {
        const { plugin, app } = await loadPlugin();
        const leaf = makeLeaf(app);
        app.workspace.getLeavesOfType.mockReturnValue([leaf]);

        expect(await plugin.activateView()).toBe(leaf);
    });

    it("opens a new leaf when no stream view is open", async () => {
        const { plugin, app } = await loadPlugin();
        const leaf = makeLeaf(app);
        app.workspace.getLeaf.mockReturnValue(leaf);

        await plugin.activateView();

        expect(app.workspace.getLeaf).toHaveBeenCalledWith(true);
        expect(leaf.setViewState).toHaveBeenCalledWith({
            type: VIEW_TYPE_DAILY_NOTES_STREAM,
            active: true,
        });
        expect(app.workspace.revealLeaf).toHaveBeenCalledWith(leaf);
    });

    it("reveals the existing leaf instead of opening a second one", async () => {
        const { plugin, app } = await loadPlugin();
        const leaf = makeLeaf(app);
        app.workspace.getLeavesOfType.mockReturnValue([leaf]);

        await plugin.activateView();

        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
        expect(leaf.setViewState).not.toHaveBeenCalled();
        expect(app.workspace.revealLeaf).toHaveBeenCalledWith(leaf);
    });

    it("reveals nothing when the leaf list is populated but holds no leaf", async () => {
        const { plugin, app } = await loadPlugin();
        app.workspace.getLeavesOfType.mockReturnValue([undefined]);

        await plugin.activateView();

        expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
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
        const view = new DailyNotesStreamView(new WorkspaceLeaf(app as any), plugin);
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
        const view = new DailyNotesStreamView(new WorkspaceLeaf(app as any), plugin);
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
