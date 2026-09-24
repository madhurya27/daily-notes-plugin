import { vi } from "vitest";
import { DailyNotesStreamView } from "../src/ui/stream-view";
import type DailyNotesStreamPlugin from "../src/main";
import type { DailyNoteService } from "../src/notes/daily-note-service";
import type { NoteRenderer } from "../src/render/note-renderer";
import type { CollapsibleManager } from "../src/render/collapsible";
import type { NoteWindowManager } from "../src/stream/note-window";
import type { InfiniteScrollController } from "../src/stream/infinite-scroll";
import { Component, WorkspaceLeaf, type App, type EventRef, type TFile } from "./mocks/obsidian";
import { __setMockNotes, __setMockSettings } from "./mocks/daily-notes-interface";
import { CollapsibleStateStore } from "../src/render/collapse-store";

/** A stand-in for `T`, holding only the members a test reaches. */
export function fake<T>(members: Partial<T>): T {
    return members as T;
}

/** An app stub, handed to code typed against the real `App`. */
export function asApp(stub: object): App {
    return stub as App;
}

/** A service stub holding no notes. */
export function makeService(): DailyNoteService {
    return fake<DailyNoteService>({
        getBatch: vi.fn().mockReturnValue([]),
        initialize: vi.fn(),
        refreshIfSettingsChanged: vi.fn().mockReturnValue(false),
        insertSorted: vi.fn().mockReturnValue(-1),
        removeSorted: vi.fn().mockReturnValue(-1),
        indexForDate: vi.fn().mockReturnValue(-1),
        dates: vi.fn().mockReturnValue([]),
        formatDate: vi.fn().mockReturnValue(""),
        parseNoteDate: vi.fn().mockReturnValue(null),
        length: 0,
    });
}

/** Minimal plugin stub — satisfies DailyNotesStreamView's constructor needs. */
export function makePlugin(): DailyNotesStreamPlugin {
    const app = makeApp();
    return fake<DailyNotesStreamPlugin>({
        settings: { showProperties: false, propertiesCollapsed: false },
        collapseStore: new CollapsibleStateStore(asApp(app)),
    });
}

/** An event source's `on`, recording each callback for the test to fire. */
const events = () => vi.fn((_name: string, _callback: (...args: unknown[]) => unknown): EventRef => ({}));

/** Minimal App stub — satisfies what the view and NoteRenderer access. */
export function makeApp() {
    return {
        vault: {
            configDir: ".obsidian",
            on: events(),
            cachedRead: vi.fn((_file: TFile) => Promise.resolve("")),
        },
        workspace: {
            on: events(),
            openLinkText: vi.fn().mockResolvedValue(undefined),
            getLeaf: vi.fn().mockReturnValue({ openFile: vi.fn().mockResolvedValue(undefined) }),
        },
        metadataCache: {
            getFileCache: vi.fn().mockReturnValue({ frontmatter: null }),
            on: events(),
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
    const service = makeService();
    const view = new DailyNotesStreamView(new WorkspaceLeaf(asApp(app)), plugin, service);
    view["renderer"] = fake<NoteRenderer>({
        createBlock: vi.fn(() => document.createElement("div")),
        renderInto: vi.fn().mockResolvedValue(new Component()),
        discard: vi.fn(),
        delegate: vi.fn(),
        onBaseModified: vi.fn().mockResolvedValue(undefined),
    });
    // The window manager hands back placeholders; rendering is its business.
    view["stream"]["window"] = fake<NoteWindowManager>({
        attach: vi.fn(),
        detach: vi.fn(),
        add: vi.fn(() => document.createElement("div")),
        remove: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
        heightOf: vi.fn().mockReturnValue(undefined),
        render: vi.fn(),
        refreshMargins: vi.fn(),
        onScroll: vi.fn(),
        layoutChanges: 0,
    });
    view["collapsible"] = fake<CollapsibleManager>({ delegate: vi.fn() });
    view["stream"]["scroll"] = fake<InfiniteScrollController>({
        attach: vi.fn(),
        detach: vi.fn(),
        recheck: vi.fn(),
        getSentinel: vi.fn().mockReturnValue(null),
    });
    return { view, plugin, service };
}

/** A stubbed view, opened. */
export async function makeViewSetup(app: object = makeApp()) {
    const setup = makeStubbedView(app);
    await setup.view.onOpen();
    return setup;
}
