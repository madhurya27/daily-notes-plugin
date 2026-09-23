import { Debouncer, Notice, TFile, TAbstractFile, debounce } from "obsidian";
import type { DailyNoteService, Moment } from "./DailyNoteService";
import type { CollapsibleStateStore } from "./CollapsibleStateStore";
import type { NoteRenderer } from "./NoteRenderer";
import { StreamState } from "./StreamState";
import { InfiniteScrollController } from "./InfiniteScrollController";
import { NoteWindowManager } from "./NoteWindowManager";
import { captureAnchor, restoreAnchor } from "./ScrollAnchorManager";

/** Obsidian autosaves as you type; one render per save is wasted work. */
const MODIFY_DEBOUNCE_MS = 300;

/** The format field writes per keystroke, and a half-typed format rebuilds the stream. */
const CONFIG_DEBOUNCE_MS = 1000;

const BATCH_SIZE = 10;

const NO_NOTE_FOR_DATE = "No daily note on or before that date.";

/** Passes over a jump's scroll before it is left where it landed. */
const MAX_SCROLL_PASSES = 8;

/** How near the top of the pane counts as arrived. */
const SCROLL_TOLERANCE_PX = 2;

/**
 * Two frames: the first gives the scroll a rendering opportunity, the second
 * is when the IntersectionObserver's callback for it has been delivered.
 */
async function observersDelivered(): Promise<void> {
    for (let frame = 0; frame < 2; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
}

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
    private streamContainerEl!: HTMLElement;

    /** Every loaded note's block, by the path it was rendered under. */
    private readonly blocks = new Map<string, HTMLElement>();

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
        this.streamContainerEl = container;
        this.state.reset();
        this.window.attach(scrollRoot);
        // A visible sentinel triggers the initial load.
        this.scroll.attach(scrollRoot, container, () => this.loadMoreNotes());
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
                    const el = this.findNoteElement(file);
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

            this.insertElementAt(this.trackBlock(file), globalIndex);
            this.state.insert(globalIndex, file);
        });
    }

    /**
     * Keyed by rendered path, which differs from `file.path` after a rename:
     * data-source-path is set at render time. Collapse state is the caller's —
     * delete drops it, rename carries it over.
     */
    private removeNote(file: TFile, renderedPath: string): void {
        const el = this.findNoteElementByPath(renderedPath);
        if (el) {
            this.window.remove(el);
            el.remove();
            this.blocks.delete(renderedPath);
        }

        const globalIndex = this.service.removeSorted(file.path);
        if (globalIndex !== -1 && globalIndex < this.state.length) {
            this.state.remove(file.path);
        }
        if (this.service.length === 0) this.showEmptyState();
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
            if (this.state.length === 0) this.showEmptyState();
            return;
        }

        this.findEmptyState()?.remove();

        for (const file of batch) {
            this.insertBeforeSentinel(this.trackBlock(file));
        }
        this.state.append(batch);

        this.scroll.recheck();
    }

    /**
     * Scrolls to the newest note dated on or before `target`, loading batches
     * until it is in the stream. Loading is one enqueued task: interleaving
     * with a scroll-triggered load would desync state from the service cache.
     */
    async jumpToDate(target: Moment): Promise<void> {
        const index = this.service.indexForDate(target);
        let file: TFile | undefined;
        if (index !== -1) {
            await this.enqueue(async () => {
                file = await this.loadThrough(index);
            });
        }

        if (!file) {
            new Notice(NO_NOTE_FOR_DATE);
            return;
        }
        const block = this.findNoteElement(file);
        if (block) await this.scrollTo(block);
    }

    /**
     * Puts `block` at the top of the pane and keeps it there. Scrolling to it
     * brings the window manager to it, and a note rendering *above* it grows
     * past its placeholder estimate and pushes it down (ADR 0006), so the
     * scroll is re-applied until the block is at the top of a stream that has
     * stopped rendering.
     */
    private async scrollTo(block: HTMLElement): Promise<void> {
        for (let pass = 0; pass < MAX_SCROLL_PASSES; pass++) {
            const changes = this.window.layoutChanges;
            block.scrollIntoView({ block: "start" });
            await observersDelivered();
            // Drains the renders those observers queued.
            await this.enqueue(async () => {});

            // The block sits at the top the instant it is scrolled to; the
            // renders that will push it down land after. Arrived means at the
            // top *and* nothing rendered or unloaded on this pass.
            const offset = block.getBoundingClientRect().top - this.scrollRoot.getBoundingClientRect().top;
            if (Math.abs(offset) <= SCROLL_TOLERANCE_PX && this.window.layoutChanges === changes) return;
        }
        // Out of passes: a note too short to reach the top of a tall pane
        // cannot, and the stream is scrolled as far as it goes.
    }

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
        this.streamContainerEl.empty();
        this.scroll.detach();
        this.resetWindow();
        this.state.reset();
        this.scroll.attach(this.scrollRoot, this.streamContainerEl, () => this.loadMoreNotes());
        await this.loadBatch();
    }

    /**
     * Rebuilds the stream as placeholders of the heights it already has, and
     * lets the window manager fill in what is near the viewport. Nothing here
     * renders, so a refresh costs the same whether ten notes are loaded or a
     * thousand.
     */
    private async rerenderAll(): Promise<void> {
        const snapshot = captureAnchor(this.state.notes, this.streamContainerEl, this.scrollRoot, (f) =>
            this.findNoteElement(f)
        );

        const notes = [...this.state.notes];
        const heights = new Map([...this.blocks].map(([path, block]) => [path, this.window.heightOf(block)]));

        this.streamContainerEl.empty();
        this.scroll.detach();
        this.resetWindow();
        this.state.reset();

        for (const file of notes) {
            this.streamContainerEl.appendChild(this.trackBlock(file, heights.get(file.path)));
        }

        this.scroll.attach(this.scrollRoot, this.streamContainerEl, () => this.loadMoreNotes());

        if (snapshot) {
            restoreAnchor(snapshot, this.scrollRoot, (f) => this.findNoteElement(f));
        }

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

    // -------------------------------------------------------------------------
    // DOM helpers
    // -------------------------------------------------------------------------

    private showEmptyState(): void {
        if (this.findEmptyState()) return;
        this.insertBeforeSentinel(
            this.streamContainerEl.createDiv({
                cls: "daily-notes-empty-state",
                text: "No daily notes found. Please check your daily notes settings.",
            })
        );
    }

    private findEmptyState(): HTMLElement | null {
        return this.streamContainerEl.querySelector(".daily-notes-empty-state");
    }

    private findNoteElement(file: TFile): HTMLElement | null {
        return this.findNoteElementByPath(file.path);
    }

    private findNoteElementByPath(path: string): HTMLElement | null {
        return this.blocks.get(path) ?? null;
    }

    /** An unloaded block for `file`, indexed by path and watched for scroll. */
    private trackBlock(file: TFile, height?: number): HTMLElement {
        const block = this.window.add(file, height);
        this.blocks.set(file.path, block);
        return block;
    }

    /** Frees every note and starts the observers over on the new container. */
    private resetWindow(): void {
        this.window.detach();
        this.blocks.clear();
        this.window.attach(this.scrollRoot);
    }

    /** The sentinel must stay the last child, so everything lands before it. */
    private insertBeforeSentinel(el: HTMLElement): void {
        const sentinel = this.scroll.getSentinel();
        if (sentinel) {
            this.streamContainerEl.insertBefore(el, sentinel);
        } else {
            this.streamContainerEl.appendChild(el);
        }
    }

    /** Inserts a note block ahead of the note that now follows it. */
    private insertElementAt(el: HTMLElement, index: number): void {
        const nextFile = this.state.notes[index];
        const nextEl = nextFile ? this.findNoteElement(nextFile) : null;
        if (nextEl) {
            this.streamContainerEl.insertBefore(el, nextEl);
        } else {
            this.insertBeforeSentinel(el);
        }
    }
}
