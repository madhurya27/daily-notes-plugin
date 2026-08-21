import { describe, it, expect, beforeEach, vi } from "vitest";
import { DailyNotesStreamView } from "../src/DailyNotesStreamView";
import { TFile, WorkspaceLeaf } from "./mocks/obsidian";
import { __setMockNotes, __setMockSettings } from "./mocks/daily-notes-interface";
import { CollapsibleStateStore } from "../src/CollapsibleStateStore";
import { StreamState } from "../src/StreamState";

// -------------------------------------------------------------------------
// Minimal plugin stub — satisfies DailyNotesStreamView's constructor needs
// -------------------------------------------------------------------------
function makePlugin() {
    const app = makeApp();
    return {
        settings: { showProperties: false, propertiesCollapsed: false },
        service: {
            getBatch: vi.fn().mockReturnValue([]),
            initialize: vi.fn(),
            insertSorted: vi.fn().mockReturnValue(-1),
            removeSorted: vi.fn().mockReturnValue(-1),
        },
        collapseStore: new CollapsibleStateStore(app as any),
    } as any;
}

// -------------------------------------------------------------------------
// Minimal App stub — satisfies what the view and NoteRenderer access
// -------------------------------------------------------------------------
function makeApp() {
    return {
        vault: {
            on: vi.fn().mockReturnValue({}),
            read: vi.fn().mockResolvedValue(""),
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
function flushPromises(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/** Shared setup: creates a fully-stubbed view and returns view, plugin, state. */
async function makeViewSetup() {
    __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
    __setMockNotes([]);
    const p = makePlugin();
    const l = new WorkspaceLeaf(makeApp());
    const v = new DailyNotesStreamView(l, p);
    (v as any).renderer = {
        createNoteElement: vi.fn().mockResolvedValue(document.createElement("div")),
    };
    (v as any).scroll = {
        attach: vi.fn(), detach: vi.fn(), recheck: vi.fn(),
        getSentinel: vi.fn().mockReturnValue(null),
    };
    (v as any).insertElementAt = vi.fn();
    (v as any).findNoteElement = vi.fn().mockReturnValue(null);
    (v as any).findNoteElementByPath = vi.fn().mockReturnValue(null);
    await v.onOpen();
    const s = (v as any).state as StreamState;
    return { view: v, plugin: p, state: s };
}

describe("DailyNotesStreamView — vault event handlers", () => {
    let plugin: ReturnType<typeof makePlugin>;
    let leaf: any;
    let view: DailyNotesStreamView;
    let state: StreamState;

    beforeEach(async () => {
        __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
        __setMockNotes([]);

        plugin = makePlugin();
        leaf = new WorkspaceLeaf(makeApp());
        view = new DailyNotesStreamView(leaf, plugin);

        // Stub renderer so no real DOM rendering happens
        (view as any).renderer = {
            createNoteElement: vi.fn().mockResolvedValue(document.createElement("div")),
        };

        // Stub scroll controller so it never tries to mix mock and real DOM nodes
        (view as any).scroll = {
            attach: vi.fn(),
            detach: vi.fn(),
            recheck: vi.fn(),
            getSentinel: vi.fn().mockReturnValue(null),
        };

        // Stub DOM insertion — tests only care about state changes, not DOM
        (view as any).insertElementAt = vi.fn();
        // Also stub findNoteElement so delete/modify don't touch real DOM
        (view as any).findNoteElement = vi.fn().mockReturnValue(null);
        (view as any).findNoteElementByPath = vi.fn().mockReturnValue(null);

        await view.onOpen();

        state = (view as any).state as StreamState;
    });

    // -----------------------------------------------------------------------
    // onFileCreate
    //
    // insertSorted() is the single source of truth: it both updates the
    // service's cache (keeping it aligned with the loaded range) and reports where the
    // file lands in the full sorted order. The view only renders/tracks it
    // locally when that position falls within the currently loaded range.
    // -----------------------------------------------------------------------
    describe("onFileCreate", () => {
        it("does nothing for a non-TFile argument", () => {
            expect(() => view.onFileCreate({ path: "not-a-tfile" } as any)).not.toThrow();
            expect(plugin.service.insertSorted).not.toHaveBeenCalled();
        });

        it("ignores files that are not daily notes (insertSorted returns -1)", async () => {
            plugin.service.insertSorted = vi.fn().mockReturnValue(-1);
            const file = new TFile("Notes/Template.md");

            view.onFileCreate(file);
            await flushPromises();

            expect(state.length).toBe(0);
            expect((view as any).renderer.createNoteElement).not.toHaveBeenCalled();
        });

        it("renders and inserts the note at its global index when within the loaded range", async () => {
            state.reset([new TFile("Notes/2025-01-04.md"), new TFile("Notes/2025-01-03.md")]);
            plugin.service.insertSorted = vi.fn().mockReturnValue(0);
            const file = new TFile("Notes/2025-01-05.md");

            view.onFileCreate(file);
            await flushPromises();

            expect(plugin.service.insertSorted).toHaveBeenCalledWith(file);
            expect((view as any).renderer.createNoteElement).toHaveBeenCalledWith(file);
            expect(state.notes[0]).toBe(file);
            expect(state.length).toBe(3);
        });

        it("updates the cache but does not render when the global index is beyond the loaded range", async () => {
            state.reset([new TFile("Notes/2025-01-04.md"), new TFile("Notes/2025-01-03.md")]);
            plugin.service.insertSorted = vi.fn().mockReturnValue(2);
            const file = new TFile("Notes/2025-01-01.md");

            view.onFileCreate(file);
            await flushPromises();

            expect((view as any).renderer.createNoteElement).not.toHaveBeenCalled();
            expect(state.length).toBe(2);
        });

        it("rechecks the sentinel when the note lands beyond the loaded range", async () => {
            state.reset([new TFile("Notes/2025-01-04.md"), new TFile("Notes/2025-01-03.md")]);
            plugin.service.insertSorted = vi.fn().mockReturnValue(2);

            view.onFileCreate(new TFile("Notes/2025-01-01.md"));
            await flushPromises();

            expect((view as any).scroll.recheck).toHaveBeenCalledOnce();
        });

        it("derives the loaded range from state.length, so the next batch starts after the insert", async () => {
            state.reset([new TFile("Notes/2025-01-04.md"), new TFile("Notes/2025-01-03.md")]);
            plugin.service.insertSorted = vi.fn().mockReturnValue(0);

            view.onFileCreate(new TFile("Notes/2025-01-05.md"));
            await flushPromises();

            expect(state.length).toBe(3);
            await view.loadMoreNotes();
            expect(plugin.service.getBatch).toHaveBeenCalledWith(3, 10);
        });

        it("inserts two rapidly created notes in order, each seeing the previous insert", async () => {
            const existing = new TFile("Notes/2025-01-01.md");
            state.reset([existing]);
            const newer = new TFile("Notes/2025-01-03.md");
            const middle = new TFile("Notes/2025-01-02.md");
            plugin.service.insertSorted = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(1);

            view.onFileCreate(newer);
            view.onFileCreate(middle);
            await flushPromises();

            expect(state.notes).toEqual([newer, middle, existing]);
        });

        it("rechecks the sentinel for the first note created into an empty stream", async () => {
            plugin.service.insertSorted = vi.fn().mockReturnValue(0);

            view.onFileCreate(new TFile("Notes/2025-01-01.md"));
            await flushPromises();

            expect((view as any).renderer.createNoteElement).not.toHaveBeenCalled();
            expect((view as any).scroll.recheck).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // onFileDelete
    //
    // removeSorted() reports the file's previous global index — used both to
    // keep the cache aligned and to decide whether the file was
    // currently rendered (global index within the loaded range).
    // -----------------------------------------------------------------------
    describe("onFileDelete", () => {
        it("does nothing for a non-TFile argument", () => {
            expect(() => view.onFileDelete({ path: "not-a-tfile" } as any)).not.toThrow();
            expect(plugin.service.removeSorted).not.toHaveBeenCalled();
        });

        it("removes from state and DOM when within the loaded range", async () => {
            const note = new TFile("Notes/2025-01-01.md");
            state.reset([note]);
            plugin.service.removeSorted = vi.fn().mockReturnValue(0);
            const mockEl = { remove: vi.fn() };
            (view as any).findNoteElementByPath = vi.fn().mockReturnValue(mockEl);

            view.onFileDelete(note);
            await flushPromises();

            expect(plugin.service.removeSorted).toHaveBeenCalledWith(note.path);
            expect(mockEl.remove).toHaveBeenCalled();
            expect(state.length).toBe(0);
        });

        it("removes the DOM element without touching state when beyond the loaded range", async () => {
            plugin.service.removeSorted = vi.fn().mockReturnValue(3);
            const note = new TFile("Notes/2025-01-10.md");
            const mockEl = { remove: vi.fn() };
            (view as any).findNoteElementByPath = vi.fn().mockReturnValue(mockEl);

            view.onFileDelete(note);
            await flushPromises();

            expect(mockEl.remove).toHaveBeenCalled();
            expect(state.length).toBe(0);
        });

        it("clears collapse state for the file's path regardless of whether it was cached", async () => {
            plugin.service.removeSorted = vi.fn().mockReturnValue(-1);
            const note = new TFile("Notes/nonexistent.md");
            const clearSpy = vi.spyOn(plugin.collapseStore, "clearForFile");

            view.onFileDelete(note);
            await flushPromises();

            expect(clearSpy).toHaveBeenCalledWith(note.path);
        });
    });

    // -----------------------------------------------------------------------
    // onFileRename
    //
    // Obsidian mutates the TFile in place on rename, so `file.path` is already
    // the new path by the time the handler runs — but the rendered DOM element's
    // data-source-path was set to the *old* path at render time. `oldPath` (the
    // event's second argument) is therefore needed to find/remove that element.
    // -----------------------------------------------------------------------
    describe("onFileRename", () => {
        it("does nothing for a non-TFile argument", () => {
            expect(() => view.onFileRename({ path: "x" } as any, "old.md")).not.toThrow();
        });

        it("looks up the old DOM element by oldPath, removes it from the cache by the new path, and re-creates", async () => {
            const file = new TFile("Notes/2025-01-05.md");
            plugin.service.removeSorted = vi.fn().mockReturnValue(-1);
            plugin.service.insertSorted = vi.fn().mockReturnValue(-1);
            const mockEl = { remove: vi.fn() };
            const findSpy = vi.fn().mockReturnValue(mockEl);
            (view as any).findNoteElementByPath = findSpy;

            view.onFileRename(file, "Notes/2025-01-01.md");
            await flushPromises();

            expect(findSpy).toHaveBeenCalledWith("Notes/2025-01-01.md");
            expect(mockEl.remove).toHaveBeenCalled();
            expect(plugin.service.removeSorted).toHaveBeenCalledWith(file.path);
            expect(plugin.service.insertSorted).toHaveBeenCalledWith(file);
        });

        it("re-inserts the renamed file at its new sorted position when within the loaded range", async () => {
            state.reset([new TFile("Notes/2025-01-02.md")]);
            plugin.service.removeSorted = vi.fn().mockReturnValue(-1);
            plugin.service.insertSorted = vi.fn().mockReturnValue(0);
            (view as any).findNoteElementByPath = vi.fn().mockReturnValue(null);

            const file = new TFile("Notes/2025-01-05.md");
            view.onFileRename(file, "Notes/2025-01-01.md");
            await flushPromises();

            expect(state.notes[0]).toBe(file);
            expect(state.length).toBe(2);
        });

        it("migrates collapse state to the new path", async () => {
            const migrateSpy = vi.spyOn(plugin.collapseStore, "migrate");
            const file = new TFile("Notes/2025-01-05.md");

            view.onFileRename(file, "Notes/2025-01-01.md");
            await flushPromises();

            expect(migrateSpy).toHaveBeenCalledWith("Notes/2025-01-01.md", file.path);
        });
    });
});

// ---------------------------------------------------------------------------
// View API
// ---------------------------------------------------------------------------

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
});

// ---------------------------------------------------------------------------
// onOpen — error path
// ---------------------------------------------------------------------------

describe("DailyNotesStreamView — onOpen error path", () => {
    beforeEach(() => {
        __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
        __setMockNotes([]);
    });

    it("resolves without throwing when service.initialize() throws", async () => {
        const errorPlugin = makePlugin();
        errorPlugin.service.initialize = vi.fn().mockImplementation(() => {
            throw new Error("vault not ready");
        });
        const errorView = new DailyNotesStreamView(new WorkspaceLeaf(makeApp()), errorPlugin);
        (errorView as any).scroll = {
            attach: vi.fn(), detach: vi.fn(),
            getSentinel: vi.fn().mockReturnValue(null),
        };
        await expect(errorView.onOpen()).resolves.toBeUndefined();
    });

    it("does not attach scroll observer when service.initialize() throws", async () => {
        const errorPlugin = makePlugin();
        errorPlugin.service.initialize = vi.fn().mockImplementation(() => {
            throw new Error("vault not ready");
        });
        const errorView = new DailyNotesStreamView(new WorkspaceLeaf(makeApp()), errorPlugin);
        const scrollStub = {
            attach: vi.fn(), detach: vi.fn(),
            getSentinel: vi.fn().mockReturnValue(null),
        };
        (errorView as any).scroll = scrollStub;
        await errorView.onOpen();
        expect(scrollStub.attach).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// onFileModify
// ---------------------------------------------------------------------------

describe("DailyNotesStreamView — onFileModify", () => {
    let view: DailyNotesStreamView;

    beforeEach(async () => {
        ({ view } = await makeViewSetup());
    });

    it("does nothing for a non-TFile argument", () => {
        expect(() => view.onFileModify({ path: "not-a-tfile" } as any)).not.toThrow();
        expect((view as any).renderer.createNoteElement).not.toHaveBeenCalled();
    });

    it("does nothing when the note element is not in the DOM", () => {
        (view as any).findNoteElement = vi.fn().mockReturnValue(null);
        (view as any).findNoteElementByPath = vi.fn().mockReturnValue(null);
        view.onFileModify(new TFile("Notes/2025-01-01.md"));
        expect((view as any).renderer.createNoteElement).not.toHaveBeenCalled();
    });

    it("replaces existing DOM element in-place when found", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        const existingEl = document.createElement("div");
        const newEl = document.createElement("div");
        const container = document.createElement("div");
        container.appendChild(existingEl);
        (view as any).streamContainerEl = container;
        (view as any).findNoteElement = vi.fn().mockReturnValue(existingEl);
        (view as any).renderer.createNoteElement = vi.fn().mockResolvedValue(newEl);

        view.onFileModify(file);
        await flushPromises();

        expect(container.contains(newEl)).toBe(true);
        expect(container.contains(existingEl)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// onFileRename — extended
// ---------------------------------------------------------------------------

describe("DailyNotesStreamView — onFileRename extended", () => {
    let view: DailyNotesStreamView;
    let state: StreamState;

    beforeEach(async () => {
        ({ view, state } = await makeViewSetup());
    });

    it("does nothing for a non-TFile argument", () => {
        expect(() => view.onFileRename({ path: "x" } as any, "old.md")).not.toThrow();
    });

    it("always removes the old entry (by oldPath) and re-creates under the new path — regardless of whether either name is a valid daily note", async () => {
        const file = new TFile("Notes/Template.md");
        state.reset([]);
        const removeSpy = vi.spyOn(view as any, "removeNote");
        const createSpy = vi.spyOn(view, "onFileCreate");

        view.onFileRename(file, "Notes/2025-01-01.md");
        await flushPromises();

        expect(removeSpy).toHaveBeenCalledWith(file, "Notes/2025-01-01.md");
        expect(createSpy).toHaveBeenCalledWith(file);
    });
});

// ---------------------------------------------------------------------------
// loadMoreNotes
// ---------------------------------------------------------------------------

describe("DailyNotesStreamView — loadMoreNotes", () => {
    let view: DailyNotesStreamView;
    let plugin: ReturnType<typeof makePlugin>;

    beforeEach(async () => {
        ({ view, plugin } = await makeViewSetup());
        // Use real DOM container so appendChild/insertBefore work correctly
        (view as any).streamContainerEl = document.createElement("div");
    });

    it("returns early without calling getBatch when already loading", async () => {
        (view as any).loadPending = true;
        await (view as any).loadMoreNotes();
        expect(plugin.service.getBatch).not.toHaveBeenCalled();
    });

    it("resets loadPending to false after completion", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        await (view as any).loadMoreNotes();
        expect((view as any).loadPending).toBe(false);
    });

    it("appends empty-state div when the batch is empty, nothing is loaded, and there is no sentinel", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        await (view as any).loadMoreNotes();
        expect(container.querySelector(".daily-notes-empty-state")).not.toBeNull();
    });

    it("inserts empty-state before sentinel when the batch is empty and nothing is loaded", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        const container = document.createElement("div");
        const sentinel = document.createElement("div");
        container.appendChild(sentinel);
        (view as any).streamContainerEl = container;
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(sentinel);
        await (view as any).loadMoreNotes();
        const emptyState = container.querySelector(".daily-notes-empty-state");
        expect(emptyState).not.toBeNull();
        const children = Array.from(container.children);
        expect(children.indexOf(emptyState!)).toBeLessThan(children.indexOf(sentinel));
    });

    it("adds no empty-state div when the batch is empty but notes are already loaded", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        (view as any).state.reset([new TFile("Notes/2025-01-01.md")]);
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        await (view as any).loadMoreNotes();
        expect(container.querySelector(".daily-notes-empty-state")).toBeNull();
    });

    it("renders each file in batch and appends them to state", async () => {
        const files = [new TFile("Notes/2025-01-03.md"), new TFile("Notes/2025-01-01.md")];
        plugin.service.getBatch = vi.fn().mockReturnValue(files);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        await (view as any).loadMoreNotes();
        expect((view as any).renderer.createNoteElement).toHaveBeenCalledTimes(2);
        expect((view as any).state.length).toBe(2);
    });

    it("does not double-load when the observer fires again while a load is in flight", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([new TFile("Notes/2025-01-03.md")]);

        const first = (view as any).loadMoreNotes();
        const second = (view as any).loadMoreNotes();
        await Promise.all([first, second]);

        expect(plugin.service.getBatch).toHaveBeenCalledTimes(1);
    });

    it("keeps a note deleted mid-load out of state and the DOM", async () => {
        const kept = new TFile("Notes/2025-01-03.md");
        const doomed = new TFile("Notes/2025-01-02.md");
        plugin.service.getBatch = vi.fn().mockReturnValue([kept, doomed]);
        const doomedEl = document.createElement("div");
        (view as any).renderer.createNoteElement = vi.fn(async (f: TFile) =>
            f === doomed ? doomedEl : document.createElement("div"));
        (view as any).findNoteElementByPath = vi.fn((path: string) =>
            path === doomed.path ? doomedEl : null);
        plugin.service.removeSorted = vi.fn().mockReturnValue(1);
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;

        const loading = (view as any).loadMoreNotes();
        view.onFileDelete(doomed);
        await loading;
        await flushPromises();

        expect((view as any).state.notes).toEqual([kept]);
        expect(container.contains(doomedEl)).toBe(false);
    });

    it("inserts each rendered note before sentinel when one exists", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        plugin.service.getBatch = vi.fn().mockReturnValue([file]);
        const container = document.createElement("div");
        const sentinel = document.createElement("div");
        container.appendChild(sentinel);
        (view as any).streamContainerEl = container;
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(sentinel);
        await (view as any).loadMoreNotes();
        const children = Array.from(container.children);
        // Sentinel must remain last
        expect(children[children.length - 1]).toBe(sentinel);
    });

    it("removes a stale empty-state div once notes exist", async () => {
        const container = document.createElement("div");
        container.createDiv({ cls: "daily-notes-empty-state", text: "No daily notes found." });
        (view as any).streamContainerEl = container;
        plugin.service.getBatch = vi.fn().mockReturnValue([new TFile("Notes/2025-01-01.md")]);

        await (view as any).loadMoreNotes();

        expect(container.querySelector(".daily-notes-empty-state")).toBeNull();
    });

    it("never appends a second empty-state div on repeated empty loads", async () => {
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        plugin.service.getBatch = vi.fn().mockReturnValue([]);

        await (view as any).loadMoreNotes();
        await (view as any).loadMoreNotes();

        expect(container.querySelectorAll(".daily-notes-empty-state").length).toBe(1);
    });

    it("rechecks the sentinel after a non-empty batch so a short batch keeps loading", async () => {
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        plugin.service.getBatch = vi.fn().mockReturnValue([new TFile("Notes/2025-01-01.md")]);

        await (view as any).loadMoreNotes();

        expect((view as any).scroll.recheck).toHaveBeenCalledOnce();
    });

    it("does not recheck after an empty batch (would loop forever)", async () => {
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        plugin.service.getBatch = vi.fn().mockReturnValue([]);

        await (view as any).loadMoreNotes();

        expect((view as any).scroll.recheck).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

describe("DailyNotesStreamView — refresh", () => {
    let view: DailyNotesStreamView;
    let state: StreamState;

    beforeEach(async () => {
        ({ view, state } = await makeViewSetup());
        // Real DOM so getBoundingClientRect() and empty() are available
        (view as any).contentEl = document.createElement("div");
        (view as any).streamContainerEl = document.createElement("div");
    });

    it("detaches scroll, re-renders all notes, re-attaches scroll, and restores state", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        state.reset([file]);
        await (view as any).refresh();
        expect((view as any).scroll.detach).toHaveBeenCalled();
        expect((view as any).scroll.attach).toHaveBeenCalled();
        expect(state.notes.length).toBe(1);
        expect(state.notes[0]?.basename).toBe("2025-01-01");
    });

    it("calls createNoteElement once per note", async () => {
        state.reset([new TFile("Notes/2025-01-03.md"), new TFile("Notes/2025-01-01.md")]);
        await (view as any).refresh();
        expect((view as any).renderer.createNoteElement).toHaveBeenCalledTimes(2);
    });

    it("calls restoreAnchor when a scroll anchor was captured", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        state.reset([file]);

        // Return an element with non-zero bottom so captureAnchor captures a snapshot
        const anchorEl = document.createElement("div");
        anchorEl.getBoundingClientRect = () =>
            ({ top: 100, bottom: 200, left: 0, right: 0, width: 0, height: 0 } as DOMRect);
        (view as any).findNoteElement = vi.fn().mockReturnValue(anchorEl);

        // Should not throw — restoreAnchor will run with the captured snapshot
        await expect((view as any).refresh()).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Internal-link click handler (requires real DOM for addEventListener)
// ---------------------------------------------------------------------------

describe("DailyNotesStreamView — internal-link click handler", () => {
    let realView: DailyNotesStreamView;
    let realApp: ReturnType<typeof makeApp>;

    beforeEach(async () => {
        __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
        __setMockNotes([]);
        realApp = makeApp();
        const p = makePlugin();
        const l = new WorkspaceLeaf(realApp);
        realView = new DailyNotesStreamView(l, p);
        // Real DOM so addEventListener registers properly
        (realView as any).contentEl = document.createElement("div");
        (realView as any).renderer = {
            createNoteElement: vi.fn().mockResolvedValue(document.createElement("div")),
        };
        (realView as any).scroll = {
            attach: vi.fn(), detach: vi.fn(),
            getSentinel: vi.fn().mockReturnValue(null),
        };
        (realView as any).insertElementAt = vi.fn();
        (realView as any).findNoteElement = vi.fn().mockReturnValue(null);
        (realView as any).findNoteElementByPath = vi.fn().mockReturnValue(null);
        await realView.onOpen();
    });

    it("calls openLinkText when an .internal-link element is clicked", () => {
        const container = (realView as any).streamContainerEl as HTMLElement;
        const link = document.createElement("a");
        link.classList.add("internal-link");
        link.setAttribute("data-href", "TargetNote");
        container.appendChild(link);
        link.click();
        expect(realApp.workspace.openLinkText).toHaveBeenCalledWith("TargetNote", "", false);
    });

    it("does not call openLinkText for regular (non-internal-link) clicks", () => {
        const container = (realView as any).streamContainerEl as HTMLElement;
        const div = document.createElement("div");
        container.appendChild(div);
        div.click();
        expect(realApp.workspace.openLinkText).not.toHaveBeenCalled();
    });

    it("does not call openLinkText when data-href attribute is absent", () => {
        const container = (realView as any).streamContainerEl as HTMLElement;
        const link = document.createElement("a");
        link.classList.add("internal-link");
        // no data-href set
        container.appendChild(link);
        link.click();
        expect(realApp.workspace.openLinkText).not.toHaveBeenCalled();
    });

    it("uses sourcePath from the nearest .daily-note-content ancestor", () => {
        const container = (realView as any).streamContainerEl as HTMLElement;
        const noteContent = document.createElement("div");
        noteContent.classList.add("daily-note-content");
        noteContent.dataset.sourcePath = "Notes/2025-01-01.md";
        const link = document.createElement("a");
        link.classList.add("internal-link");
        link.setAttribute("data-href", "SomeNote");
        noteContent.appendChild(link);
        container.appendChild(noteContent);
        link.click();
        expect(realApp.workspace.openLinkText).toHaveBeenCalledWith(
            "SomeNote",
            "Notes/2025-01-01.md",
            false
        );
    });
});

// ---------------------------------------------------------------------------
// findNoteElement — real implementation (lines 242–246)
// ---------------------------------------------------------------------------

describe("DailyNotesStreamView — findNoteElement", () => {
    let view: DailyNotesStreamView;

    beforeEach(async () => {
        ({ view } = await makeViewSetup());
        delete (view as any).findNoteElement; // expose real implementation
        delete (view as any).findNoteElementByPath; // ...and the lookup it delegates to
    });

    it("returns the .daily-note-block ancestor when a matching element exists", () => {
        const container = document.createElement("div");
        const block = document.createElement("div");
        block.classList.add("daily-note-block");
        const content = document.createElement("div");
        content.classList.add("daily-note-content");
        content.dataset.sourcePath = "Notes/2025-01-01.md";
        block.appendChild(content);
        container.appendChild(block);
        (view as any).streamContainerEl = container;

        const result = (view as any).findNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(result).toBe(block);
    });

    it("matches paths containing CSS selector metacharacters", () => {
        const path = 'Notes/2025-01-01 [a\\b"c].md';
        const container = document.createElement("div");
        const block = document.createElement("div");
        block.classList.add("daily-note-block");
        const content = document.createElement("div");
        content.classList.add("daily-note-content");
        content.dataset.sourcePath = path;
        block.appendChild(content);
        container.appendChild(block);
        (view as any).streamContainerEl = container;

        expect((view as any).findNoteElement(new TFile(path))).toBe(block);
    });

    it("returns null when no matching element exists in the container", () => {
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;

        const result = (view as any).findNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// insertElementAt — real implementation (lines 248–277)
// ---------------------------------------------------------------------------

describe("DailyNotesStreamView — insertElementAt", () => {
    let view: DailyNotesStreamView;
    let state: StreamState;
    let container: HTMLElement;

    beforeEach(async () => {
        ({ view, state } = await makeViewSetup());
        delete (view as any).insertElementAt; // expose real implementation
        container = document.createElement("div");
        (view as any).streamContainerEl = container;
    });

    it("index 0 with existing first child → inserts before first child", () => {
        const existing = document.createElement("div");
        container.appendChild(existing);
        const el = document.createElement("div");
        (view as any).insertElementAt(el, 0);
        expect(container.firstChild).toBe(el);
        expect(container.children[1]).toBe(existing);
    });

    it("index 0 with empty container → appends to container", () => {
        const el = document.createElement("div");
        (view as any).insertElementAt(el, 0);
        expect(container.firstChild).toBe(el);
    });

    it("index >= notes.length with sentinel → inserts before sentinel", () => {
        state.reset([new TFile("Notes/a.md")]);
        const sentinel = document.createElement("div");
        container.appendChild(sentinel);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(sentinel);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1); // 1 >= notes.length (1)
        expect(container.lastChild).toBe(sentinel);
        expect(container.firstChild).toBe(el);
    });

    it("index >= notes.length, no sentinel → appends to container", () => {
        state.reset([new TFile("Notes/a.md")]);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1);
        expect(container.lastChild).toBe(el);
    });

    it("middle index, nextEl found → inserts before next element", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        const fileB = new TFile("Notes/2025-01-01.md");
        state.reset([fileA, fileB]);

        const blockB = document.createElement("div");
        container.appendChild(blockB);
        (view as any).findNoteElement = vi.fn().mockReturnValue(blockB);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1); // 0 < 1 < 2
        const children = Array.from(container.children);
        expect(children.indexOf(el)).toBeLessThan(children.indexOf(blockB));
    });

    it("middle index, nextEl not found, sentinel exists → inserts before sentinel", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        const fileB = new TFile("Notes/2025-01-01.md");
        state.reset([fileA, fileB]);

        const sentinel = document.createElement("div");
        container.appendChild(sentinel);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(sentinel);
        (view as any).findNoteElement = vi.fn().mockReturnValue(null);
        (view as any).findNoteElementByPath = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1);
        const children = Array.from(container.children);
        expect(children.indexOf(el)).toBeLessThan(children.indexOf(sentinel));
        expect(container.lastChild).toBe(sentinel);
    });

    it("middle index, nextEl not found, no sentinel → appends", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        const fileB = new TFile("Notes/2025-01-01.md");
        state.reset([fileA, fileB]);

        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);
        (view as any).findNoteElement = vi.fn().mockReturnValue(null);
        (view as any).findNoteElementByPath = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1);
        expect(container.lastChild).toBe(el);
    });

    it("middle index, nextFile is undefined in notes array (covers ternary false branch at line 266)", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        state.reset([fileA, fileA]); // length = 2 so else branch is reached at index 1
        // Make notes[1] return undefined via a spy on the getter
        vi.spyOn(state, "notes", "get").mockReturnValue([fileA, undefined as any] as any);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1);
        // nextFile is undefined → findNoteElement is not called → falls through to append
        expect(container.lastChild).toBe(el);
    });
});

// ---------------------------------------------------------------------------
// Error catch paths — onFileModify (line 101) and onFileCreate (line 133)
// ---------------------------------------------------------------------------

describe("DailyNotesStreamView — error catch paths", () => {
    let view: DailyNotesStreamView;
    let plugin: ReturnType<typeof makePlugin>;

    beforeEach(async () => {
        ({ view, plugin } = await makeViewSetup());
    });

    it("onFileModify logs error when createNoteElement rejects", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const file = new TFile("Notes/2025-01-01.md");
        const existingEl = document.createElement("div");
        const cont = document.createElement("div");
        cont.appendChild(existingEl);
        (view as any).streamContainerEl = cont;
        (view as any).findNoteElement = vi.fn().mockReturnValue(existingEl);
        (view as any).renderer.createNoteElement = vi.fn().mockRejectedValue(new Error("render failed"));

        view.onFileModify(file);
        await flushPromises();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it("onFileCreate logs error when createNoteElement rejects", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        (view as any).state.reset([new TFile("Notes/2025-01-04.md")]);
        plugin.service.insertSorted = vi.fn().mockReturnValue(0);
        (view as any).renderer.createNoteElement = vi.fn().mockRejectedValue(new Error("create failed"));

        const newer = new TFile("Notes/2025-01-05.md");
        view.onFileCreate(newer);
        await flushPromises();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// Callback wiring — covers arrow function wrappers registered with vault.on
// and scroll.attach (improves function coverage)
// ---------------------------------------------------------------------------

describe("DailyNotesStreamView — callback wiring", () => {
    /** Build a view whose vault.on captures all registered callbacks. */
    async function makeWiredView() {
        __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
        __setMockNotes([]);

        const capturedCallbacks: Record<string, (f: any, oldPath?: any) => void> = {};
        const capturingVault = {
            on: vi.fn((event: string, cb: (f: any, oldPath?: any) => void) => {
                capturedCallbacks[event] = cb;
                return {};
            }),
            read: vi.fn().mockResolvedValue(""),
        };
        const capturingCache = {
            getFileCache: vi.fn().mockReturnValue({ frontmatter: null }),
            on: vi.fn((event: string, cb: (f: any) => void) => {
                capturedCallbacks[event] = cb;
                return {};
            }),
        };
        const app = {
            ...makeApp(),
            vault: capturingVault,
            metadataCache: capturingCache,
        };
        const p = makePlugin();
        const l = new WorkspaceLeaf(app);
        const v = new DailyNotesStreamView(l, p as any);
        (v as any).renderer = {
            createNoteElement: vi.fn().mockResolvedValue(document.createElement("div")),
        };
        (v as any).scroll = {
            attach: vi.fn(), detach: vi.fn(), recheck: vi.fn(),
            getSentinel: vi.fn().mockReturnValue(null),
        };
        (v as any).insertElementAt = vi.fn();
        (v as any).findNoteElement = vi.fn().mockReturnValue(null);
        (v as any).findNoteElementByPath = vi.fn().mockReturnValue(null);
        await v.onOpen();
        return { view: v, callbacks: capturedCallbacks, app, vault: capturingVault };
    }

    it("metadataCache 'changed' callback delegates to onFileModify", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view, "onFileModify");
        const file = new TFile("Notes/2025-01-01.md");
        callbacks["changed"]?.(file);
        expect(spy).toHaveBeenCalledWith(file);
    });

    // vault 'modify' fires before metadataCache catches up, so re-rendering on
    // it strips frontmatter at a stale offset.
    it("does not re-render on vault 'modify'", async () => {
        const { vault } = await makeWiredView();
        const events = vault.on.mock.calls.map(([event]: [string]) => event);
        expect(events).not.toContain("modify");
    });

    it("vault 'create' callback delegates to onFileCreate", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view, "onFileCreate");
        const file = new TFile("Notes/2025-01-01.md");
        callbacks["create"]?.(file);
        expect(spy).toHaveBeenCalledWith(file);
    });

    it("vault 'delete' callback delegates to onFileDelete", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view, "onFileDelete");
        const file = new TFile("Notes/2025-01-01.md");
        callbacks["delete"]?.(file);
        expect(spy).toHaveBeenCalledWith(file);
    });

    it("vault 'rename' callback delegates to onFileRename with the old path", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view, "onFileRename");
        const file = new TFile("Notes/2025-01-01.md");
        callbacks["rename"]?.(file, "Notes/old-name.md");
        expect(spy).toHaveBeenCalledWith(file, "Notes/old-name.md");
    });

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
        const { view, state } = await makeViewSetup();
        (view as any).contentEl = document.createElement("div");
        (view as any).streamContainerEl = document.createElement("div");
        const plugin = (view as any).plugin;
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

    it("openLinkText .catch handler logs error when link open fails (line 69)", async () => {
        __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
        __setMockNotes([]);
        const rejectingApp = {
            ...makeApp(),
            workspace: {
                on: vi.fn().mockReturnValue({}),
                openLinkText: vi.fn().mockRejectedValue(new Error("link open failed")),
                getLeaf: vi.fn().mockReturnValue({ openFile: vi.fn().mockResolvedValue(undefined) }),
            },
        };
        const p = makePlugin();
        const l = new WorkspaceLeaf(rejectingApp);
        const v = new DailyNotesStreamView(l, p as any);
        (v as any).contentEl = document.createElement("div");
        (v as any).renderer = {
            createNoteElement: vi.fn().mockResolvedValue(document.createElement("div")),
        };
        (v as any).scroll = {
            attach: vi.fn(), detach: vi.fn(), recheck: vi.fn(),
            getSentinel: vi.fn().mockReturnValue(null),
        };
        (v as any).insertElementAt = vi.fn();
        (v as any).findNoteElement = vi.fn().mockReturnValue(null);
        (v as any).findNoteElementByPath = vi.fn().mockReturnValue(null);
        await v.onOpen();

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const container = (v as any).streamContainerEl as HTMLElement;
        const link = document.createElement("a");
        link.classList.add("internal-link");
        link.setAttribute("data-href", "SomeNote");
        container.appendChild(link);
        link.click();
        await flushPromises();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
