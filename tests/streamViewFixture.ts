import { vi } from "vitest";
import { DailyNotesStreamView } from "../src/DailyNotesStreamView";
import { Component, WorkspaceLeaf } from "./mocks/obsidian";
import { __setMockNotes, __setMockSettings } from "./mocks/daily-notes-interface";
import { CollapsibleStateStore } from "../src/CollapsibleStateStore";
import { StreamState } from "../src/StreamState";

/** Minimal plugin stub — satisfies DailyNotesStreamView's constructor needs. */
export function makePlugin() {
    const app = makeApp();
    return {
        settings: { showProperties: false, propertiesCollapsed: false },
        service: {
            getBatch: vi.fn().mockReturnValue([]),
            initialize: vi.fn(),
            refreshIfSettingsChanged: vi.fn().mockReturnValue(false),
            insertSorted: vi.fn().mockReturnValue(-1),
            removeSorted: vi.fn().mockReturnValue(-1),
        },
        collapseStore: new CollapsibleStateStore(app as any),
    } as any;
}

/** Minimal App stub — satisfies what the view and NoteRenderer access. */
export function makeApp() {
    return {
        vault: {
            configDir: ".obsidian",
            on: vi.fn().mockReturnValue({}),
            cachedRead: vi.fn().mockResolvedValue(""),
        },
        workspace: {
            on: vi.fn().mockReturnValue({}),
            openLinkText: vi.fn().mockResolvedValue(undefined),
            getLeaf: vi.fn().mockReturnValue({ openFile: vi.fn().mockResolvedValue(undefined) }),
        },
        metadataCache: {
            getFileCache: vi.fn().mockReturnValue({ frontmatter: null }),
            on: vi.fn().mockReturnValue({}),
        },
        loadLocalStorage: vi.fn().mockReturnValue(null),
        saveLocalStorage: vi.fn(),
    };
}

/** Flushes all pending microtasks so .then() callbacks fire. */
export function flushPromises(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A view whose renderer, scroll controller and DOM lookups are stubbed, not
 * yet opened — for tests that must act between construction and onOpen.
 */
export function makeStubbedView(app: object = makeApp()) {
    __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
    __setMockNotes([]);
    const plugin = makePlugin();
    const view = new DailyNotesStreamView(new WorkspaceLeaf(app), plugin);
    (view as any).renderer = {
        createBlock: vi.fn(() => document.createElement("div")),
        renderInto: vi.fn().mockResolvedValue(new Component()),
        discard: vi.fn(),
        delegate: vi.fn(),
    };
    // The window manager hands back placeholders; rendering is its business.
    (view as any).window = {
        attach: vi.fn(),
        detach: vi.fn(),
        add: vi.fn(() => document.createElement("div")),
        remove: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
        heightOf: vi.fn().mockReturnValue(undefined),
    };
    (view as any).collapsible = { delegate: vi.fn() };
    (view as any).scroll = {
        attach: vi.fn(),
        detach: vi.fn(),
        recheck: vi.fn(),
        getSentinel: vi.fn().mockReturnValue(null),
    };
    (view as any).insertElementAt = vi.fn();
    (view as any).findNoteElement = vi.fn().mockReturnValue(null);
    (view as any).findNoteElementByPath = vi.fn().mockReturnValue(null);
    return { view, plugin };
}

/** A stubbed view, opened. */
export async function makeViewSetup(app: object = makeApp()) {
    const { view, plugin } = makeStubbedView(app);
    await view.onOpen();
    const state = (view as any).state as StreamState;
    return { view, plugin, state };
}
