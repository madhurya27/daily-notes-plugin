import { Debouncer, Notice, TFile, TAbstractFile, debounce } from "obsidian";
import type { DailyNoteService, Moment } from "../notes/daily-note-service";
import type { CollapsibleStateStore } from "../render/collapse-store";
import type { NoteRenderer } from "../render/note-renderer";
import { StreamState } from "./stream-state";
import { StreamBlocks } from "./stream-blocks";
import { InfiniteScrollController } from "./infinite-scroll";
import { NoteWindowManager } from "./note-window";
import { captureAnchor, restoreAnchor, scrollIntoPlace, type StreamLayout } from "./scroll-position";

/** Obsidian autosaves as you type; one render per save is wasted work. */
const MODIFY_DEBOUNCE_MS = 300;

/** The format field writes per keystroke, and a half-typed format rebuilds the stream. */
const CONFIG_DEBOUNCE_MS = 1000;

const BATCH_SIZE = 10;

const NO_NOTE_FOR_DATE = "No daily note on or before that date.";

/**
 * The stream's contents: which notes are loaded, their blocks, and every
 * mutation of them — batches, vault events, jumps, rebuilds — run one at a
 * time through a single queue (ADR 0004).
 */
export class NoteStream {
    private state = new StreamState();
    private scroll = new InfiniteScrollController();
    private window: NoteWindowManager;
    private scrollRoot!: HTMLElement;
    private blocks = new StreamBlocks(() => this.scroll.getSentinel());

    // Serialized: an event interleaving with an in-flight batch would leave
    // state and the service cache disagreeing.
    private queue: Promise<void> = Promise.resolve();
    private loadPending = false;

    /** Notes saved since the last flush, by path. */
    private readonly pendingModified = new Map<string, TFile>();

    constructor(
        private readonly service: DailyNoteService,
        private readonly collapseStore: CollapsibleStateStore,
        renderer: NoteRenderer
    ) {
        this.window = new NoteWindowManager(renderer, this.enqueue.bind(this));
    }

    /** Starts watching `container`, inside the pane `scrollRoot`, for the first batch. */
    open(scrollRoot: HTMLElement, container: HTMLElement): void {
        this.scrollRoot = scrollRoot;
        this.blocks.attach(container);
        this.state.reset();
        this.window.attach(scrollRoot);
        this.attachScroll();
    }

    close(): void {
        this.onDailyNoteSettingsChange.cancel();
        this.flushModified.cancel();
        this.scroll.detach();
        this.window.detach();
        this.blocks.clear();
    }

    /** The margins are viewports, so a resized pane needs new ones. */
    onResize(): void {
        this.window.refreshMargins();
    }

    onFileModify(file: TAbstractFile) {
        if (!(file instanceof TFile)) return;
        // Keyed by path, so a burst touching two notes still re-renders both
        // while repeated saves of one collapse into a single render.
        this.pendingModified.set(file.path, file);
        this.flushModified();
    }

    private flushModified: Debouncer<[], void> = debounce(
        () => {
            const files = [...this.pendingModified.values()];
            this.pendingModified.clear();
            for (const file of files) {
                void this.enqueue(async () => {
                    const el = this.blocks.get(file.path);
                    if (!el) return;
                    await this.window.refresh(el);
                });
            }
        },
        MODIFY_DEBOUNCE_MS,
        true
    );

    onFileCreate(file: TAbstractFile) {
        if (!(file instanceof TFile)) return;
        void this.enqueue(async () => {
            // Single source of truth for sort order, and what keeps the service
            // cache aligned with `this.state.length`. -1 when not a daily note.
            const globalIndex = this.service.insertSorted(file);
            if (globalIndex === -1) return;
            if (globalIndex >= this.state.length) {
                // Beyond the loaded range — a visible sentinel loads it now.
                this.scroll.recheck();
                return;
            }

            this.blocks.insertBefore(file.path, this.window.add(file), this.state.notes[globalIndex]?.path);
            this.state.insert(globalIndex, file);
        });
    }

    /**
     * Keyed by rendered path, which differs from `file.path` after a rename:
     * data-source-path is set at render time. Collapse state is the caller's —
     * delete drops it, rename carries it over.
     */
    private removeNote(file: TFile, renderedPath: string): void {
        const el = this.blocks.remove(renderedPath);
        if (el) this.window.remove(el);

        const globalIndex = this.service.removeSorted(file.path);
        if (globalIndex !== -1 && globalIndex < this.state.length) {
            this.state.remove(file.path);
        }
        if (this.service.length === 0) this.blocks.showEmptyState();
    }

    onFileDelete(file: TAbstractFile) {
        if (!(file instanceof TFile)) return;
        void this.enqueue(async () => {
            this.removeNote(file, file.path);
            this.collapseStore.clearForFile(file.path);
        });
    }

    onFileRename(file: TAbstractFile, oldPath: string) {
        if (!(file instanceof TFile)) return;
        void this.enqueue(async () => {
            this.collapseStore.migrate(oldPath, file.path);
            this.removeNote(file, oldPath);
        });
        this.onFileCreate(file);
    }

    loadMoreNotes(): Promise<void> {
        if (this.loadPending) return this.queue;
        this.loadPending = true;
        return this.enqueue(async () => {
            try {
                await this.loadBatch();
            } finally {
                this.loadPending = false;
            }
        });
    }

    private async loadBatch(): Promise<void> {
        const batch = this.service.getBatch(this.state.length, BATCH_SIZE);
        if (batch.length === 0) {
            // No recheck: re-triggering on an empty batch spins forever.
            if (this.state.length === 0) this.blocks.showEmptyState();
            return;
        }

        this.blocks.hideEmptyState();

        for (const file of batch) {
            this.blocks.append(file.path, this.window.add(file));
        }
        this.state.append(batch);

        this.scroll.recheck();
    }

    /**
     * Scrolls to the newest note dated on or before `target`, loading batches
     * until it is in the stream.
     */
    async jumpToDate(target: Moment): Promise<void> {
        const index = this.service.indexForDate(target);
        const block = index === -1 ? null : await this.revealIndex(index);
        if (!block) new Notice(NO_NOTE_FOR_DATE);
    }

    /** Loads `file` into the stream and scrolls it to the top; its block, or null when gone. */
    reveal(file: TFile): Promise<HTMLElement | null> {
        const index = this.service.indexOf(file.path);
        return index === -1 ? Promise.resolve(null) : this.revealIndex(index);
    }

    /**
     * Loading is one enqueued task: interleaving with a scroll-triggered load
     * would desync state from the service cache.
     */
    private async revealIndex(index: number): Promise<HTMLElement | null> {
        let file: TFile | undefined;
        await this.enqueue(async () => {
            file = await this.loadThrough(index);
        });
        const block = file ? this.blocks.get(file.path) : null;
        if (!block) return null;
        await scrollIntoPlace(block, "start", this.scrollRoot, this.layout);
        // The observer's render can land a frame after the scroll settles.
        this.window.render(block);
        await this.layout.drain();
        return block;
    }

    /** Centres `el`, inside a note, on the pane, and keeps it there while the stream renders. */
    centre(el: HTMLElement): Promise<void> {
        return scrollIntoPlace(el, "center", this.scrollRoot, this.layout);
    }

    /** The block `file` is shown in; null when it is not loaded. */
    blockOf(file: TFile): HTMLElement | null {
        return this.blocks.get(file.path);
    }

    /** The first note reaching into the pane; null when none does. */
    firstVisibleNote(): TFile | null {
        const find = (f: TFile) => this.blocks.get(f.path);
        return captureAnchor(this.state.notes, this.blocks.el, this.scrollRoot, find)?.file ?? null;
    }

    /** The window manager's renders, drained through the queue they run on. */
    private readonly layout: StreamLayout = {
        layoutChanges: () => this.window.layoutChanges,
        drain: () => this.enqueue(async () => {}),
    };

    /**
     * Batches until `index` is loaded, and the note there. Undefined when the
     * stream ends first — the cache shrank under the index mid-jump.
     */
    private async loadThrough(index: number): Promise<TFile | undefined> {
        while (this.state.length <= index) {
            const before = this.state.length;
            await this.loadBatch();
            if (this.state.length === before) return undefined;
        }
        return this.state.notes[index];
    }

    refresh(): Promise<void> {
        return this.enqueue(() => this.rerenderAll());
    }

    /**
     * A config write redefines which files are daily notes, so the cache and
     * every rendered note are suspect.
     */
    onDailyNoteSettingsChange: Debouncer<[], void> = debounce(
        () => {
            void this.enqueue(async () => {
                if (!this.service.refreshIfSettingsChanged()) return;
                await this.reload();
            });
        },
        CONFIG_DEBOUNCE_MS,
        true
    );

    /** Discards the stream and loads the first batch of the new note set. */
    private async reload(): Promise<void> {
        this.blocks.empty();
        this.scroll.detach();
        this.resetWindow();
        this.state.reset();
        this.attachScroll();
        await this.loadBatch();
    }

    /**
     * Rebuilds the stream as placeholders of the heights it already has, and
     * lets the window manager fill in what is near the viewport. Nothing here
     * renders, so a refresh costs the same whether ten notes are loaded or a
     * thousand.
     */
    private async rerenderAll(): Promise<void> {
        const find = (f: TFile) => this.blocks.get(f.path);
        const snapshot = captureAnchor(this.state.notes, this.blocks.el, this.scrollRoot, find);

        const notes = [...this.state.notes];
        const heights = new Map([...this.blocks.entries()].map(([path, block]) => [path, this.window.heightOf(block)]));

        this.blocks.empty();
        this.scroll.detach();
        this.resetWindow();
        this.state.reset();

        for (const file of notes) {
            this.blocks.append(file.path, this.window.add(file, heights.get(file.path)));
        }

        this.attachScroll();

        if (snapshot) restoreAnchor(snapshot, this.scrollRoot, find);

        this.state.reset(notes);
    }

    /**
     * Runs `task` after every queued mutation, so none interleave at an await.
     */
    private enqueue(task: () => Promise<void>): Promise<void> {
        this.queue = this.queue
            .then(task)
            .catch((e) => console.error("DailyNotesStream: Failed to update the stream", e));
        return this.queue;
    }

    /** A visible sentinel loads the next batch. */
    private attachScroll(): void {
        this.scroll.attach(this.scrollRoot, this.blocks.el, () => this.loadMoreNotes());
    }

    /** Frees every note and starts the observers over. */
    private resetWindow(): void {
        this.window.detach();
        this.window.attach(this.scrollRoot);
    }
}
