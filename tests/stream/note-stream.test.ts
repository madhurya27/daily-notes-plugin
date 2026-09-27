import { describe, it, expect, beforeEach, afterEach, vi, type Mocked } from "vitest";
import { Notice, Platform, TAbstractFile, TFile, moment } from "../mocks/obsidian";
import { NoteStream } from "../../src/stream/note-stream";
import type { NoteRenderer } from "../../src/render/note-renderer";
import type { NoteWindowManager } from "../../src/stream/note-window";
import type { InfiniteScrollController } from "../../src/stream/infinite-scroll";
import type { ScrollBoxGuard } from "../../src/stream/scroll-box-guard";
import type { DailyNoteService } from "../../src/notes/daily-note-service";
import type { CollapsibleStateStore } from "../../src/render/collapse-store";
import { NoteHeights } from "../../src/stream/note-heights";
import { flushPromises, makePlugin, makeService } from "../stream-view-fixture";

/** What the stream constructed its window with, besides what it calls on it. */
type FakeWindow = Mocked<NoteWindowManager> & { memory: { heights: NoteHeights; layoutOf: () => string } };
type FakeScroll = Mocked<InfiniteScrollController>;
type FakeGuard = Mocked<ScrollBoxGuard>;

const fakes = vi.hoisted(() => ({
    windows: [] as FakeWindow[],
    scrolls: [] as FakeScroll[],
    guards: [] as FakeGuard[],
}));

// Both need a layout jsdom lacks, and have their own tests. The window
// manager hands back placeholders keyed as the renderer keys them.
vi.mock("../../src/stream/note-window", () => ({
    NoteWindowManager: class {
        attach = vi.fn();
        detach = vi.fn();
        remove = vi.fn();
        render = vi.fn();
        onResize = vi.fn();
        onScroll = vi.fn();
        onTouch = vi.fn();
        refresh = vi.fn().mockResolvedValue(undefined);
        placed = vi.fn();
        layoutChanges = 0;
        memory: unknown;
        add = vi.fn((file: { path: string }) => placeholder(file.path));
        constructor(
            _renderer: unknown,
            readonly enqueue: (task: () => Promise<void>) => Promise<void>,
            heights: NoteHeights,
            layoutOf: () => string
        ) {
            this.memory = { heights, layoutOf };
            fakes.windows.push(this as unknown as FakeWindow);
        }
    },
}));

vi.mock("../../src/stream/infinite-scroll", () => ({
    InfiniteScrollController: class {
        attach = vi.fn();
        detach = vi.fn();
        recheck = vi.fn();
        getSentinel = vi.fn().mockReturnValue(null);
        constructor() {
            fakes.scrolls.push(this as unknown as FakeScroll);
        }
    },
}));

// Reads computed styles and Bases' layout, and has its own tests.
vi.mock("../../src/stream/scroll-box-guard", () => ({
    ScrollBoxGuard: class {
        attach = vi.fn();
        detach = vi.fn();
        onScroll = vi.fn();
        onTouch = vi.fn();
        constructor(readonly onBaseLayout: (view: HTMLElement) => void) {
            fakes.guards.push(this as unknown as FakeGuard);
        }
    },
}));

function placeholder(path: string): HTMLElement {
    const block = document.createElement("div");
    block.dataset.sourcePath = path;
    return block;
}

const note = (date: string) => new TFile(`Notes/${date}.md`);

/** Obsidian renames the TFile in place before the event arrives. */
function renameInPlace(file: TFile, path: string): TFile {
    file.path = path;
    return file;
}

let service: Mocked<DailyNoteService>;
let collapseStore: CollapsibleStateStore;
let stream: NoteStream;
let pane: HTMLElement;
let container: HTMLElement;
let noteWindow: FakeWindow;
let infiniteScroll: FakeScroll;
let guard: FakeGuard;
let renderer: { onBaseLayout: ReturnType<typeof vi.fn> };
let heights: NoteHeights;

beforeEach(() => {
    Notice.reset();
    service = vi.mocked(makeService());
    collapseStore = makePlugin().collapseStore;
    renderer = { onBaseLayout: vi.fn() };
    heights = new NoteHeights();
    stream = new NoteStream(service, collapseStore, renderer as unknown as NoteRenderer, heights);
    noteWindow = fakes.windows.at(-1)!;
    infiniteScroll = fakes.scrolls.at(-1)!;
    guard = fakes.guards.at(-1)!;
    pane = document.createElement("div");
    container = pane.createDiv();
    stream.open(pane, container);
});

/** Loads `files` as the next batch, then forgets every call it took. */
async function load(...files: TFile[]) {
    service.getBatch.mockReturnValueOnce(files);
    await stream.loadMoreNotes();
    vi.clearAllMocks();
}

/** The paths of the stream's blocks, in order. */
const shown = () => [...container.querySelectorAll<HTMLElement>("[data-source-path]")].map((b) => b.dataset.sourcePath);

/** How many notes the stream holds: the offset its next batch starts at. */
async function loadedCount(): Promise<number> {
    service.getBatch.mockClear().mockReturnValueOnce([]);
    await stream.loadMoreNotes();
    return service.getBatch.mock.calls[0]![0];
}

const emptyState = () => container.querySelector(".daily-notes-empty-state");

describe("loading a batch", () => {
    it("places a block per note and holds them for the next batch", async () => {
        await load(note("2025-01-03"), note("2025-01-01"));

        expect(shown()).toEqual(["Notes/2025-01-03.md", "Notes/2025-01-01.md"]);
        expect(await loadedCount()).toBe(2);
    });

    it("shows the empty state when the first batch is empty", async () => {
        await load();
        expect(emptyState()).not.toBeNull();
    });

    it("shows no empty state when the stream simply ran out", async () => {
        await load(note("2025-01-01"));
        await load();
        expect(emptyState()).toBeNull();
    });

    it("clears the empty state once notes exist", async () => {
        await load();
        await load(note("2025-01-01"));
        expect(emptyState()).toBeNull();
    });

    it("does not double-load when the observer fires again while a load is in flight", async () => {
        service.getBatch.mockReturnValue([note("2025-01-03")]);

        await Promise.all([stream.loadMoreNotes(), stream.loadMoreNotes()]);

        expect(service.getBatch).toHaveBeenCalledTimes(1);
    });

    it("keeps a note deleted mid-load out of the stream", async () => {
        const kept = note("2025-01-03");
        const doomed = note("2025-01-02");
        service.getBatch.mockReturnValueOnce([kept, doomed]);
        service.removeSorted.mockReturnValue(1);

        const loading = stream.loadMoreNotes();
        stream.onFileDelete(doomed);
        await loading;
        await flushPromises();

        expect(shown()).toEqual([kept.path]);
        expect(await loadedCount()).toBe(1);
    });

    it("rechecks the sentinel after a non-empty batch so a short batch keeps loading", async () => {
        service.getBatch.mockReturnValueOnce([note("2025-01-01")]);
        await stream.loadMoreNotes();
        expect(infiniteScroll.recheck).toHaveBeenCalledOnce();
    });

    it("does not recheck after an empty batch (would loop forever)", async () => {
        await stream.loadMoreNotes();
        expect(infiniteScroll.recheck).not.toHaveBeenCalled();
    });

    it("arms the sentinel to load the next batch", async () => {
        const [, , onTrigger] = infiniteScroll.attach.mock.calls.at(-1)!;
        await onTrigger();
        expect(service.getBatch).toHaveBeenCalledWith(0, 10);
    });
});

describe("a note created", () => {
    it("does nothing for a non-TFile argument", async () => {
        stream.onFileCreate(new TAbstractFile("not-a-tfile"));
        await flushPromises();
        expect(service.insertSorted).not.toHaveBeenCalled();
    });

    it("ignores files that are not daily notes", async () => {
        service.insertSorted.mockReturnValue(-1);

        stream.onFileCreate(new TFile("Notes/Template.md"));
        await flushPromises();

        expect(shown()).toEqual([]);
        expect(await loadedCount()).toBe(0);
    });

    it("lands in its place within the loaded range, and the next batch starts after it", async () => {
        await load(note("2025-01-04"), note("2025-01-03"));
        service.insertSorted.mockReturnValue(0);

        stream.onFileCreate(note("2025-01-05"));
        await flushPromises();

        expect(shown()).toEqual(["Notes/2025-01-05.md", "Notes/2025-01-04.md", "Notes/2025-01-03.md"]);
        expect(await loadedCount()).toBe(3);
    });

    it("is left to the sentinel when it lands beyond the loaded range", async () => {
        await load(note("2025-01-04"), note("2025-01-03"));
        service.insertSorted.mockReturnValue(2);

        stream.onFileCreate(note("2025-01-01"));
        await flushPromises();

        expect(shown()).toEqual(["Notes/2025-01-04.md", "Notes/2025-01-03.md"]);
        expect(infiniteScroll.recheck).toHaveBeenCalledOnce();
    });

    it("inserts two rapidly created notes in order, each seeing the previous insert", async () => {
        await load(note("2025-01-01"));
        service.insertSorted.mockReturnValueOnce(0).mockReturnValueOnce(1);

        stream.onFileCreate(note("2025-01-03"));
        stream.onFileCreate(note("2025-01-02"));
        await flushPromises();

        expect(shown()).toEqual(["Notes/2025-01-03.md", "Notes/2025-01-02.md", "Notes/2025-01-01.md"]);
    });

    it("is left to the sentinel when it is the first note in an empty stream", async () => {
        service.insertSorted.mockReturnValue(0);

        stream.onFileCreate(note("2025-01-01"));
        await flushPromises();

        expect(shown()).toEqual([]);
        expect(infiniteScroll.recheck).toHaveBeenCalledOnce();
    });

    it("logs when its placeholder cannot be built", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        await load(note("2025-01-04"));
        service.insertSorted.mockReturnValue(0);
        noteWindow.add.mockImplementation(() => {
            throw new Error("create failed");
        });

        stream.onFileCreate(note("2025-01-05"));
        await flushPromises();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});

describe("a note deleted", () => {
    it("does nothing for a non-TFile argument", async () => {
        stream.onFileDelete(new TAbstractFile("not-a-tfile"));
        await flushPromises();
        expect(service.removeSorted).not.toHaveBeenCalled();
    });

    it("leaves the stream when it was loaded", async () => {
        const doomed = note("2025-01-01");
        await load(doomed);
        service.removeSorted.mockReturnValue(0);

        stream.onFileDelete(doomed);
        await flushPromises();

        expect(service.removeSorted).toHaveBeenCalledWith(doomed.path);
        expect(shown()).toEqual([]);
        expect(await loadedCount()).toBe(0);
    });

    it("leaves the loaded notes alone when it was beyond them", async () => {
        await load(note("2025-01-03"), note("2025-01-02"));
        service.removeSorted.mockReturnValue(5);
        Object.assign(service, { length: 5 });

        stream.onFileDelete(note("2024-12-01"));
        await flushPromises();

        expect(shown()).toEqual(["Notes/2025-01-03.md", "Notes/2025-01-02.md"]);
        expect(await loadedCount()).toBe(2);
    });

    it("shows the empty state when it was the vault's last daily note", async () => {
        const last = note("2025-01-01");
        await load(last);
        service.removeSorted.mockReturnValue(0);

        stream.onFileDelete(last);
        await flushPromises();

        expect(emptyState()).not.toBeNull();
    });

    it("shows no empty state while other daily notes remain", async () => {
        const doomed = note("2025-01-01");
        await load(doomed, note("2024-12-31"));
        service.removeSorted.mockReturnValue(0);
        Object.assign(service, { length: 1 });

        stream.onFileDelete(doomed);
        await flushPromises();

        expect(emptyState()).toBeNull();
    });

    it("clears its collapse state whether or not it was loaded", async () => {
        const clearSpy = vi.spyOn(collapseStore, "clearForFile");

        stream.onFileDelete(new TFile("Notes/nonexistent.md"));
        await flushPromises();

        expect(clearSpy).toHaveBeenCalledWith("Notes/nonexistent.md");
    });
});

describe("a note renamed", () => {
    it("does nothing for a non-TFile argument", async () => {
        const migrate = vi.spyOn(collapseStore, "migrate");
        stream.onFileRename(new TAbstractFile("x"), "old.md");
        await flushPromises();
        expect(migrate).not.toHaveBeenCalled();
        expect(service.removeSorted).not.toHaveBeenCalled();
    });

    // The block was keyed by the old path when it was placed.
    it("moves to its new sorted position, found by its old path", async () => {
        const renamed = note("2025-01-01");
        await load(note("2025-01-02"), renamed);
        service.removeSorted.mockReturnValue(1);
        service.insertSorted.mockReturnValue(0);

        stream.onFileRename(renameInPlace(renamed, "Notes/2025-01-05.md"), "Notes/2025-01-01.md");
        await flushPromises();

        expect(service.removeSorted).toHaveBeenCalledWith("Notes/2025-01-05.md");
        expect(shown()).toEqual(["Notes/2025-01-05.md", "Notes/2025-01-02.md"]);
        expect(await loadedCount()).toBe(2);
    });

    it("carries its collapse state to the new path", async () => {
        const migrateSpy = vi.spyOn(collapseStore, "migrate");

        stream.onFileRename(note("2025-01-05"), "Notes/2025-01-01.md");
        await flushPromises();

        expect(migrateSpy).toHaveBeenCalledWith("Notes/2025-01-01.md", "Notes/2025-01-05.md");
    });

    it("leaves the stream when renamed out of the daily-note format", async () => {
        const renamed = note("2025-01-01");
        await load(renamed);
        service.removeSorted.mockReturnValue(0);
        service.insertSorted.mockReturnValue(-1);

        stream.onFileRename(renameInPlace(renamed, "Notes/Template.md"), "Notes/2025-01-01.md");
        await flushPromises();

        expect(shown()).toEqual([]);
        expect(await loadedCount()).toBe(0);
    });
});

describe("a note modified", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("does nothing for a non-TFile argument", async () => {
        stream.onFileModify(new TAbstractFile("not-a-tfile"));
        await vi.runAllTimersAsync();
        expect(noteWindow.refresh).not.toHaveBeenCalled();
    });

    it("renders nothing until the window elapses", async () => {
        await load(note("2025-01-01"));
        stream.onFileModify(note("2025-01-01"));
        vi.advanceTimersByTime(299);
        expect(noteWindow.refresh).not.toHaveBeenCalled();
    });

    it("collapses a burst of saves into one re-render", async () => {
        const file = note("2025-01-01");
        await load(file);
        for (let i = 0; i < 5; i++) {
            stream.onFileModify(file);
            vi.advanceTimersByTime(100);
        }
        await vi.runAllTimersAsync();
        expect(noteWindow.refresh).toHaveBeenCalledTimes(1);
    });

    it("re-renders every file touched during the window", async () => {
        await load(note("2025-01-02"), note("2025-01-01"));
        stream.onFileModify(note("2025-01-01"));
        stream.onFileModify(note("2025-01-02"));
        await vi.runAllTimersAsync();
        expect(noteWindow.refresh).toHaveBeenCalledTimes(2);
    });

    it("drops a pending re-render when the stream closes", async () => {
        await load(note("2025-01-01"));
        stream.onFileModify(note("2025-01-01"));
        stream.close();
        await vi.runAllTimersAsync();
        expect(noteWindow.refresh).not.toHaveBeenCalled();
    });

    it("does nothing for a note that is not loaded", async () => {
        stream.onFileModify(note("2025-01-01"));
        await vi.runAllTimersAsync();
        expect(noteWindow.refresh).not.toHaveBeenCalled();
    });

    // The block stays: only its content is rebuilt, so the path stays
    // resolvable and an unloaded note is left for its re-entry to render.
    it("refreshes the note's own block rather than replacing it", async () => {
        const file = note("2025-01-01");
        await load(file);
        const block = stream.blockOf(file);

        stream.onFileModify(file);
        await vi.runAllTimersAsync();

        expect(noteWindow.refresh).toHaveBeenCalledWith(block);
        expect(stream.blockOf(file)).toBe(block);
    });

    it("logs when the re-render rejects", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        await load(note("2025-01-01"));
        noteWindow.refresh.mockRejectedValue(new Error("render failed"));

        stream.onFileModify(note("2025-01-01"));
        await vi.runAllTimersAsync();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});

describe("refresh", () => {
    it("rebuilds a placeholder for every loaded note, keeping them loaded", async () => {
        const files = [note("2025-01-03"), note("2025-01-01")];
        await load(...files);
        const before = files.map((f) => stream.blockOf(f));

        await stream.refresh();

        expect(shown()).toEqual(files.map((f) => f.path));
        expect(files.map((f) => stream.blockOf(f))).not.toContain(before[0]);
        expect(await loadedCount()).toBe(2);
    });

    // Rebuilt placeholders reserve what the store remembers, or the stream's
    // scroll extent collapses the moment a refresh runs.
    it("rebuilds each placeholder at the height the store remembers", async () => {
        const file = note("2025-01-03");
        await load(file);
        noteWindow.add.mockClear();

        await stream.refresh();

        expect(noteWindow.add).toHaveBeenCalledExactlyOnceWith(file);
    });

    it("keeps the note at the top of the pane where it was", async () => {
        const file = note("2025-01-01");
        await load(file);
        pane.getBoundingClientRect = () => ({ top: 0, bottom: 800 }) as DOMRect;
        stream.blockOf(file)!.getBoundingClientRect = () => ({ top: 100, bottom: 200 }) as DOMRect;
        noteWindow.add.mockImplementationOnce((f: TFile) => {
            const rebuilt = placeholder(f.path);
            rebuilt.getBoundingClientRect = () => ({ top: 150, bottom: 250 }) as DOMRect;
            return rebuilt;
        });
        pane.scrollTop = 0;

        await stream.refresh();

        expect(pane.scrollTop).toBe(50);
    });

    it("re-arms the sentinel against the rebuilt stream", async () => {
        await stream.refresh();

        const [, , onTrigger] = infiniteScroll.attach.mock.calls.at(-1)!;
        await onTrigger();

        expect(service.getBatch).toHaveBeenCalled();
    });
});

describe("the pane", () => {
    it("passes a resize on to the window, which lays out for the new size", () => {
        stream.onResize();
        expect(noteWindow.onResize).toHaveBeenCalled();
    });

    it("passes a scroll on to the window, which waits for it to stop before unloading", () => {
        stream.onScroll();
        expect(noteWindow.onScroll).toHaveBeenCalled();
    });

    it("passes a touch on to the window, which lets that note's hold go", () => {
        const target = document.createElement("div");
        stream.onTouch(target);
        expect(noteWindow.onTouch).toHaveBeenCalledWith(target);
    });

    it("stops observing on close", () => {
        stream.close();
        expect(infiniteScroll.detach).toHaveBeenCalled();
        expect(noteWindow.detach).toHaveBeenCalled();
        expect(guard.detach).toHaveBeenCalled();
    });

    // iOS ends a glide early on a scroll box; Android is held to the same rule (ADR 0008).
    it("keeps scroll boxes out of the notes it holds on mobile", () => {
        Platform.isMobile = true;
        try {
            stream.open(pane, container);
        } finally {
            Platform.isMobile = false;
        }
        expect(guard.attach).toHaveBeenCalledWith(container);
    });

    it("leaves desktop's scroll boxes alone", () => {
        expect(guard.attach).not.toHaveBeenCalled();
    });

    // The renderer drew the Base, so it decides: cards, or fitted columns.
    it("hands a Base's layout to the renderer", () => {
        const view = document.createElement("div");

        (guard as unknown as { onBaseLayout: (view: HTMLElement) => void }).onBaseLayout(view);

        expect(renderer.onBaseLayout).toHaveBeenCalledWith(view);
    });

    // Its style reads wait for the scroll to stop, like unloads.
    it("passes a scroll on to the scroll box guard", () => {
        stream.onScroll();
        expect(guard.onScroll).toHaveBeenCalled();
    });
});

describe("Obsidian's daily-notes settings changed", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    /** Runs the debounced check and drains the mutation queue. */
    async function settingsChanged() {
        stream.onDailyNoteSettingsChange();
        await vi.runAllTimersAsync();
    }

    it("reloads the stream when the format or folder changed", async () => {
        await load(note("2025-01-01"));
        service.refreshIfSettingsChanged.mockReturnValue(true);
        service.getBatch.mockReturnValueOnce([new TFile("Journal/2025-01-01.md")]);

        await settingsChanged();

        expect(shown()).toEqual(["Journal/2025-01-01.md"]);
    });

    it("leaves the stream untouched when the settings are unchanged", async () => {
        await settingsChanged();
        expect(service.getBatch).not.toHaveBeenCalled();
    });

    it("collapses a burst of config writes into one check", async () => {
        stream.onDailyNoteSettingsChange();
        stream.onDailyNoteSettingsChange();
        await settingsChanged();

        expect(service.refreshIfSettingsChanged).toHaveBeenCalledTimes(1);
    });

    it("drops notes loaded under the old format before loading the new ones", async () => {
        await load(note("2025-01-01"));
        service.refreshIfSettingsChanged.mockReturnValue(true);

        await settingsChanged();

        expect(shown()).toEqual([]);
        expect(emptyState()).not.toBeNull();
    });

    it("re-arms infinite scroll against the reloaded stream", async () => {
        service.refreshIfSettingsChanged.mockReturnValue(true);
        await settingsChanged();

        const [, , onTrigger] = infiniteScroll.attach.mock.calls.at(-1)!;
        service.getBatch.mockReturnValueOnce([new TFile("Journal/2025-02-01.md")]);
        await onTrigger();

        expect(shown()).toEqual(["Journal/2025-02-01.md"]);
    });

    it("logs, and keeps the stream working, when rebuilding the cache throws", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        service.refreshIfSettingsChanged.mockImplementation(() => {
            throw new Error("daily notes folder missing");
        });

        await settingsChanged();
        expect(consoleSpy).toHaveBeenCalled();
        await load(note("2025-01-01"));

        expect(shown()).toEqual(["Notes/2025-01-01.md"]);
        consoleSpy.mockRestore();
    });

    it("cancels the pending check on close", async () => {
        stream.onDailyNoteSettingsChange();
        stream.close();
        await vi.runAllTimersAsync();

        expect(service.refreshIfSettingsChanged).not.toHaveBeenCalled();
    });
});

/** 30 notes, newest first, one per day back from 2025-01-30. */
function makeNotes(): TFile[] {
    return Array.from({ length: 30 }, (_, i) => note(`2025-01-${String(30 - i).padStart(2, "0")}`));
}

describe("jumping to a date", () => {
    let notes: TFile[];

    beforeEach(() => {
        // jsdom lays nothing out: every block lands at the pane's top at once.
        HTMLElement.prototype.scrollIntoView = vi.fn();
        notes = makeNotes();
        service.getBatch.mockImplementation((offset: number, limit: number) => notes.slice(offset, offset + limit));
    });

    const jump = (date: string) => stream.jumpToDate(moment(date, "YYYY-MM-DD", true));

    it("notices and loads nothing when no note is on or before the date", async () => {
        service.indexForDate.mockReturnValue(-1);

        await jump("2024-01-01");

        expect(Notice.shown).toEqual(["No daily note on or before that date."]);
        expect(service.getBatch).not.toHaveBeenCalled();
    });

    it("loads just enough batches to reach the target note", async () => {
        service.indexForDate.mockReturnValue(24);

        await jump("2025-01-06");

        // 24 is the 25th note: three batches of ten.
        expect(service.getBatch).toHaveBeenCalledTimes(3);
        expect(await loadedCount()).toBe(30);
    });

    it("loads no batch when the target note is already loaded", async () => {
        await stream.loadMoreNotes();
        service.getBatch.mockClear();
        service.indexForDate.mockReturnValue(3);

        await jump("2025-01-27");

        expect(service.getBatch).not.toHaveBeenCalled();
    });

    it("scrolls the target note to the top of the view", async () => {
        const target = placeholder(notes[12]!.path);
        target.scrollIntoView = vi.fn();
        noteWindow.add.mockImplementation((f: TFile) => (f === notes[12] ? target : placeholder(f.path)));
        service.indexForDate.mockReturnValue(12);

        await jump("2025-01-18");

        expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    });

    it("scrolls nowhere when the target was renamed before its block caught up", async () => {
        await stream.loadMoreNotes();
        renameInPlace(notes[3]!, "Notes/Renamed.md");
        service.indexForDate.mockReturnValue(3);

        await jump("2025-01-27");

        expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
        expect(Notice.shown).toEqual(["No daily note on or before that date."]);
    });

    it("stops loading when the stream runs out before the target index", async () => {
        // A cache that shrank under us: the index can no longer be reached.
        service.indexForDate.mockReturnValue(99);

        await jump("2025-01-01");

        expect(service.getBatch).toHaveBeenCalledTimes(4);
        expect(Notice.shown).toEqual(["No daily note on or before that date."]);
    });
});

describe("what a search moves through", () => {
    let notes: TFile[];
    const observers: { callback: () => void; disconnected: boolean }[] = [];
    /** Reports a resize to every observer still connected. */
    const resized = () => observers.filter((o) => !o.disconnected).forEach((o) => o.callback());

    beforeEach(() => {
        observers.length = 0;
        vi.stubGlobal(
            "ResizeObserver",
            class {
                disconnected = false;
                constructor(readonly callback: () => void) {
                    observers.push(this);
                }
                observe() {}
                disconnect() {
                    this.disconnected = true;
                }
            }
        );
        notes = makeNotes();
        service.getBatch.mockImplementation((offset: number, limit: number) => notes.slice(offset, offset + limit));
        service.indexOf = vi.fn((path: string) => notes.findIndex((n) => n.path === path));
    });

    afterEach(() => vi.unstubAllGlobals());

    const rect = (top: number, bottom: number) => ({ top, bottom }) as DOMRect;

    it("loads a note past the loaded range and scrolls it to the top", async () => {
        const target = placeholder(notes[24]!.path);
        target.scrollIntoView = vi.fn();
        noteWindow.add.mockImplementation((f: TFile) => (f === notes[24] ? target : placeholder(f.path)));

        expect(await stream.reveal(notes[24]!)).toBe(target);
        expect(await loadedCount()).toBe(30);
        expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    });

    // A search reads the note's highlights the moment it arrives; the window
    // manager's own render can land a frame after the scroll settles.
    it("renders the note before handing it back", async () => {
        HTMLElement.prototype.scrollIntoView = vi.fn();
        let rendered = false;
        noteWindow.render.mockImplementation(() => void noteWindow["enqueue"](async () => void (rendered = true)));

        const block = await stream.reveal(notes[3]!);

        expect(noteWindow.render).toHaveBeenCalledWith(block);
        expect(rendered).toBe(true);
    });

    it("centers an element and keeps it there while the stream renders", async () => {
        const el = document.createElement("span");
        el.scrollIntoView = vi.fn();

        await stream.center(el);

        expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    });

    describe("a centered match, as the stream settles around it", () => {
        let el: HTMLElement;

        beforeEach(async () => {
            document.body.appendChild(pane);
            HTMLElement.prototype.scrollIntoView = vi.fn();
            pane.getBoundingClientRect = () => rect(0, 800);
            el = container.createSpan();
            el.scrollIntoView = vi.fn();
            el.getBoundingClientRect = () => rect(390, 410);
            await stream.center(el);
            // A Base above it fills in.
            el.getBoundingClientRect = () => rect(6390, 6410);
            vi.mocked(el.scrollIntoView).mockClear();
        });
        afterEach(() => pane.remove());

        it("is centered again when a Base above it fills in", () => {
            resized();

            expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
        });

        it("is let go once another is revealed", async () => {
            await stream.reveal(notes[3]!);
            resized();

            expect(el.scrollIntoView).not.toHaveBeenCalled();
        });

        it("is let go once another is centered", async () => {
            const next = container.createSpan();
            next.getBoundingClientRect = () => rect(390, 410);
            await stream.center(next);
            resized();

            expect(el.scrollIntoView).not.toHaveBeenCalled();
        });

        it("is let go once the reader touches the pane", () => {
            stream.onTouch(null);
            resized();

            expect(el.scrollIntoView).not.toHaveBeenCalled();
        });

        it("is let go once the reader wheels", () => {
            stream.onWheel();
            resized();

            expect(el.scrollIntoView).not.toHaveBeenCalled();
        });

        it("is let go when the stream closes", () => {
            stream.close();
            resized();

            expect(el.scrollIntoView).not.toHaveBeenCalled();
        });
    });

    it("tells a match inside the pane from one past its edge", () => {
        pane.getBoundingClientRect = () => rect(100, 800);
        const range = (top: number, bottom: number) => ({ getBoundingClientRect: () => rect(top, bottom) }) as Range;

        expect(stream.isOnScreen(range(400, 420))).toBe(true);
        expect(stream.isOnScreen(range(90, 110))).toBe(false);
        expect(stream.isOnScreen(range(790, 810))).toBe(false);
    });

    it("reveals nothing for a note no longer in the vault", async () => {
        expect(await stream.reveal(note("2024-06-01"))).toBeNull();
        expect(service.getBatch).not.toHaveBeenCalled();
    });

    it("hands back a loaded note's block, and none for one not loaded", async () => {
        await stream.loadMoreNotes();

        expect(stream.blockOf(notes[0]!)?.dataset.sourcePath).toBe(notes[0]!.path);
        expect(stream.blockOf(notes[20]!)).toBeNull();
    });

    it("names the first note whose block reaches into the pane", async () => {
        await stream.loadMoreNotes();
        pane.getBoundingClientRect = () => rect(0, 800);
        stream.blockOf(notes[0]!)!.getBoundingClientRect = () => rect(-900, -10);
        stream.blockOf(notes[1]!)!.getBoundingClientRect = () => rect(-10, 390);

        expect(stream.firstVisibleNote()).toBe(notes[1]);
    });

    it("names no note in an empty stream", () => {
        expect(stream.firstVisibleNote()).toBeNull();
    });
});

describe("the heights the stream reserves", () => {
    // Every view reads and adds to one store (ADR 0010).
    it("are the plugin's, measured in the column the notes sit in", () => {
        Object.defineProperty(container, "clientWidth", { value: 612 });

        expect(noteWindow.memory.heights).toBe(heights);
        expect(noteWindow.memory.layoutOf()).toBe("612:");
    });
});

describe("the stream's place", () => {
    let notes: TFile[];

    beforeEach(() => {
        HTMLElement.prototype.scrollIntoView = vi.fn();
        notes = makeNotes();
        service.getBatch.mockImplementation((offset: number, limit: number) => notes.slice(offset, offset + limit));
        service.indexOf = vi.fn((path: string) => notes.findIndex((n) => n.path === path));
        pane.getBoundingClientRect = () => ({ top: 0, bottom: 800 }) as DOMRect;
    });

    it("is the first note reaching into the pane, and how far above the pane it starts", async () => {
        await stream.loadMoreNotes();
        stream.blockOf(notes[0]!)!.getBoundingClientRect = () => ({ top: -900, bottom: -10 }) as DOMRect;
        stream.blockOf(notes[1]!)!.getBoundingClientRect = () => ({ top: -150, bottom: 390 }) as DOMRect;

        expect(stream.place()).toMatchObject({ path: notes[1]!.path, offset: -150 });
    });

    // Back rebuilds the view, which reserves what the plugin remembers (ADR 0010).
    it("holds only the place", async () => {
        await stream.loadMoreNotes();
        stream.blockOf(notes[0]!)!.getBoundingClientRect = () => ({ top: -150, bottom: 390 }) as DOMRect;

        expect(stream.place()).toEqual({ path: notes[0]!.path, offset: -150 });
    });

    it("is nowhere in an empty stream", () => {
        expect(stream.place()).toBeNull();
    });

    it("is returned to in one step", async () => {
        const target = placeholder(notes[24]!.path);
        target.getBoundingClientRect = () => ({ top: 10, bottom: 600 }) as DOMRect;
        noteWindow.add.mockImplementation((f: TFile) => (f === notes[24] ? target : placeholder(f.path)));
        Object.defineProperty(pane, "scrollHeight", { value: 20000, configurable: true });
        pane.scrollTop = 1000;

        await stream.restorePlace({ path: notes[24]!.path, offset: -150 });

        expect(await loadedCount()).toBe(30);
        expect(target.scrollIntoView).not.toHaveBeenCalled();
        expect(pane.scrollTop).toBe(1160);
    });

    it("tells the window the scroll was set to the place, once it is", async () => {
        pane.scrollTop = 0;
        noteWindow.placed.mockImplementation(() => expect(pane.scrollTop).toBe(900));
        const target = placeholder(notes[1]!.path);
        target.getBoundingClientRect = () => ({ top: 900, bottom: 1400 }) as DOMRect;
        noteWindow.add.mockImplementation((f: TFile) => (f === notes[1] ? target : placeholder(f.path)));

        await stream.restorePlace({ path: notes[1]!.path, offset: 0 });

        expect(noteWindow.placed).toHaveBeenCalledOnce();
    });

    // Loaded only through the place's note, the stream can end too soon
    // below it for the pane to scroll there: the scroll stops short.
    it("loads past the place until the pane can scroll to it", async () => {
        Object.defineProperty(pane, "clientHeight", { value: 800, configurable: true });
        Object.defineProperty(pane, "scrollHeight", { get: () => shown().length * 400, configurable: true });
        const target = placeholder(notes[9]!.path);
        target.getBoundingClientRect = () => ({ top: 3600, bottom: 4000 }) as DOMRect;
        noteWindow.add.mockImplementation((f: TFile) => (f === notes[9] ? target : placeholder(f.path)));
        pane.scrollTop = 0;

        await stream.restorePlace({ path: notes[9]!.path, offset: -300 });

        expect(await loadedCount()).toBe(20);
        expect(pane.scrollTop).toBe(3900);
    });

    it("stops loading past the place when the notes run out", async () => {
        Object.defineProperty(pane, "clientHeight", { value: 800, configurable: true });
        Object.defineProperty(pane, "scrollHeight", { get: () => 0, configurable: true });

        await stream.restorePlace({ path: notes[9]!.path, offset: -300 });

        expect(service.getBatch).toHaveBeenLastCalledWith(30, 10);
    });

    it("stays at the top when the note it was at is gone", async () => {
        pane.scrollTop = 0;

        await stream.restorePlace({ path: "Notes/2024-06-01.md", offset: -150 });

        expect(pane.scrollTop).toBe(0);
        expect(Notice.shown).toEqual([]);
    });

    it("stays at the top when the stream runs out before its note", async () => {
        // A cache that shrank under us: the index can no longer be reached.
        service.indexOf = vi.fn().mockReturnValue(99);
        pane.scrollTop = 0;

        await stream.restorePlace({ path: "Notes/2025-01-01.md", offset: -150 });

        expect(pane.scrollTop).toBe(0);
    });
});
