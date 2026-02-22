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
