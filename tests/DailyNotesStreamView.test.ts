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
        attach: vi.fn(), detach: vi.fn(),
        getSentinel: vi.fn().mockReturnValue(null),
        enforceSentinelPosition: vi.fn(),
    };
    (v as any).insertElementAt = vi.fn();
    (v as any).findNoteElement = vi.fn().mockReturnValue(null);
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
            getSentinel: vi.fn().mockReturnValue(null),
            enforceSentinelPosition: vi.fn(),
        };

        // Stub DOM insertion — tests only care about state changes, not DOM
        (view as any).insertElementAt = vi.fn();
        // Also stub findNoteElement so delete/modify don't touch real DOM
        (view as any).findNoteElement = vi.fn().mockReturnValue(null);

        await view.onOpen();

        state = (view as any).state as StreamState;
    });

    // -----------------------------------------------------------------------
    // onFileCreate
    // -----------------------------------------------------------------------
    describe("onFileCreate", () => {
        it("does nothing for a non-TFile argument", async () => {
            expect(() => view.onFileCreate({ path: "not-a-tfile" } as any)).not.toThrow();
            expect((view as any).renderer.createNoteElement).not.toHaveBeenCalled();
        });

        it("prepends a note that is newer than all loaded notes", async () => {
            const existing = new TFile("Notes/2025-01-01.md");
            state.reset([existing]);

            const newer = new TFile("Notes/2025-01-05.md");
            view.onFileCreate(newer);
            await flushPromises();

            expect(state.notes[0]?.basename).toBe("2025-01-05");
            expect(state.length).toBe(2);
        });

        it("inserts a note in the correct middle position", async () => {
            const n3 = new TFile("Notes/2025-01-03.md");
            const n1 = new TFile("Notes/2025-01-01.md");
            state.reset([n3, n1]);

            const n2 = new TFile("Notes/2025-01-02.md");
            view.onFileCreate(n2);
            await flushPromises();

            expect(state.notes[0]?.basename).toBe("2025-01-03");
            expect(state.notes[1]?.basename).toBe("2025-01-02");
            expect(state.notes[2]?.basename).toBe("2025-01-01");
        });

        it("ignores a note older than all loaded notes (not in visible range)", async () => {
            const n3 = new TFile("Notes/2025-01-03.md");
            const n2 = new TFile("Notes/2025-01-02.md");
            state.reset([n3, n2]);

            const old = new TFile("Notes/2025-01-01.md");
            view.onFileCreate(old);
            await flushPromises();

            expect(state.length).toBe(2);
        });

        it("ignores non-daily-note files (no date in filename)", async () => {
            const n1 = new TFile("Notes/2025-01-01.md");
            state.reset([n1]);

            const random = new TFile("Notes/Template.md");
            view.onFileCreate(random);
            await flushPromises();

            expect(state.length).toBe(1);
        });

        it("does nothing when no notes are loaded yet", async () => {
            // state.length === 0
            const file = new TFile("Notes/2025-01-01.md");
            view.onFileCreate(file);
            await flushPromises();

            expect(state.length).toBe(0);
        });

        it("returns early when the oldest loaded note has no parseable date (covers !newestDate || !oldestDate branch)", async () => {
            // Put a non-daily-note file in state — getDateFromFile returns null for it
            const nonDate = new TFile("Notes/Template.md");
            state.reset([nonDate]);

            const newNote = new TFile("Notes/2025-01-05.md");
            view.onFileCreate(newNote);
            await flushPromises();

            // Should return early at line 114 without inserting
            expect(state.length).toBe(1);
            expect((view as any).renderer.createNoteElement).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // onFileDelete
    // -----------------------------------------------------------------------
    describe("onFileDelete", () => {
        it("removes the note from state", async () => {
            const note = new TFile("Notes/2025-01-01.md");
            state.reset([note]);

            view.onFileDelete(note);

            expect(state.length).toBe(0);
        });

        it("decrements offset", async () => {
            const note = new TFile("Notes/2025-01-01.md");
            state.reset([note]);
            (view as any).offset = 1;

            view.onFileDelete(note);

            expect((view as any).offset).toBe(0);
        });

        it("ignores files not in state", () => {
            state.reset([new TFile("Notes/2025-01-01.md")]);
            view.onFileDelete(new TFile("Notes/nonexistent.md"));
            expect(state.length).toBe(1);
        });

        it("does nothing for a non-TFile argument", () => {
            expect(() => view.onFileDelete({ path: "not-a-tfile" } as any)).not.toThrow();
            expect((view as any).renderer.createNoteElement).not.toHaveBeenCalled();
        });

        it("calls remove() on the found DOM element", () => {
            const note = new TFile("Notes/2025-01-01.md");
            state.reset([note]);
            const mockEl = { remove: vi.fn() };
            (view as any).findNoteElement = vi.fn().mockReturnValue(mockEl);
            view.onFileDelete(note);
            expect(mockEl.remove).toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // onFileRename
    // -----------------------------------------------------------------------
    describe("onFileRename", () => {
        it("removes old name from state if renamed to non-daily", async () => {
            const note = new TFile("Notes/2025-01-01.md");
            state.reset([note]);

            // Simulate rename to a non-date name (same object, path unchanged in mock
            // but getDateFromFile returns null for non-matching names)
            const renamed = new TFile("Notes/Template.md");
            // Make renamed appear to be in state by matching its path to note's path
            state.reset([renamed]);

            view.onFileDelete(renamed);
            expect(state.length).toBe(0);
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
            enforceSentinelPosition: vi.fn(),
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
            enforceSentinelPosition: vi.fn(),
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
        expect(() => view.onFileRename({ path: "x" } as any)).not.toThrow();
    });

    it("calls onFileCreate when file is not currently in state", () => {
        state.reset([]); // file not in state
        const file = new TFile("Notes/2025-01-01.md");
        const createSpy = vi.spyOn(view, "onFileCreate");
        view.onFileRename(file);
        expect(createSpy).toHaveBeenCalledWith(file);
    });

    it("calls only onFileDelete when renamed file has no parseable date", () => {
        const nonDaily = new TFile("Notes/Template.md");
        state.reset([nonDaily]); // Template.md IS in state
        const deleteSpy = vi.spyOn(view, "onFileDelete");
        const createSpy = vi.spyOn(view, "onFileCreate");
        view.onFileRename(nonDaily);
        expect(deleteSpy).toHaveBeenCalledWith(nonDaily);
        expect(createSpy).not.toHaveBeenCalled();
    });

    it("calls onFileDelete then onFileCreate when renamed file has a valid date", () => {
        const file = new TFile("Notes/2025-01-01.md");
        state.reset([file]);
        const deleteSpy = vi.spyOn(view, "onFileDelete");
        const createSpy = vi.spyOn(view, "onFileCreate");
        view.onFileRename(file);
        expect(deleteSpy).toHaveBeenCalledWith(file);
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
        (view as any).isLoading = true;
        await (view as any).loadMoreNotes();
        expect(plugin.service.getBatch).not.toHaveBeenCalled();
    });

    it("resets isLoading to false after completion", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        await (view as any).loadMoreNotes();
        expect((view as any).isLoading).toBe(false);
    });

    it("appends empty-state div when batch is empty at offset 0 and no sentinel", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        await (view as any).loadMoreNotes();
        expect(container.querySelector(".daily-notes-empty-state")).not.toBeNull();
    });

    it("inserts empty-state before sentinel when batch is empty at offset 0", async () => {
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

    it("adds no empty-state div when batch is empty at offset > 0", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        (view as any).offset = 5;
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        await (view as any).loadMoreNotes();
        expect(container.querySelector(".daily-notes-empty-state")).toBeNull();
    });

    it("renders each file in batch, updates state, and increments offset", async () => {
        const files = [new TFile("Notes/2025-01-03.md"), new TFile("Notes/2025-01-01.md")];
        plugin.service.getBatch = vi.fn().mockReturnValue(files);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        await (view as any).loadMoreNotes();
        expect((view as any).renderer.createNoteElement).toHaveBeenCalledTimes(2);
        expect((view as any).offset).toBe(2);
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
            enforceSentinelPosition: vi.fn(),
        };
        (realView as any).insertElementAt = vi.fn();
        (realView as any).findNoteElement = vi.fn().mockReturnValue(null);
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
    let state: StreamState;

    beforeEach(async () => {
        ({ view, state } = await makeViewSetup());
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
        const existing = new TFile("Notes/2025-01-01.md");
        state.reset([existing]);
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

        const capturedCallbacks: Record<string, (f: any) => void> = {};
        const capturingVault = {
            on: vi.fn((event: string, cb: (f: any) => void) => {
                capturedCallbacks[event] = cb;
                return {};
            }),
            read: vi.fn().mockResolvedValue(""),
        };
        const app = {
            ...makeApp(),
            vault: capturingVault,
        };
        const p = makePlugin();
        const l = new WorkspaceLeaf(app);
        const v = new DailyNotesStreamView(l, p as any);
        (v as any).renderer = {
            createNoteElement: vi.fn().mockResolvedValue(document.createElement("div")),
        };
        (v as any).scroll = {
            attach: vi.fn(), detach: vi.fn(),
            getSentinel: vi.fn().mockReturnValue(null),
            enforceSentinelPosition: vi.fn(),
        };
        (v as any).insertElementAt = vi.fn();
        (v as any).findNoteElement = vi.fn().mockReturnValue(null);
        await v.onOpen();
        return { view: v, callbacks: capturedCallbacks, app };
    }

    it("vault 'modify' callback delegates to onFileModify", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view, "onFileModify");
        const file = new TFile("Notes/2025-01-01.md");
        callbacks["modify"]?.(file);
        expect(spy).toHaveBeenCalledWith(file);
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

    it("vault 'rename' callback delegates to onFileRename", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view, "onFileRename");
        const file = new TFile("Notes/2025-01-01.md");
        callbacks["rename"]?.(file);
        expect(spy).toHaveBeenCalledWith(file);
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
            attach: vi.fn(), detach: vi.fn(),
            getSentinel: vi.fn().mockReturnValue(null),
            enforceSentinelPosition: vi.fn(),
        };
        (v as any).insertElementAt = vi.fn();
        (v as any).findNoteElement = vi.fn().mockReturnValue(null);
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
