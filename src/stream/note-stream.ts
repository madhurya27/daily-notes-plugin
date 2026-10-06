import { basesLoaded } from "../render/bases/bases-loaded";
import { Debouncer, Notice, Platform, TFile, TAbstractFile, debounce } from "obsidian";
import type { DailyNoteService, Moment } from "../notes/daily-note-service";
import type { CollapsibleStateStore } from "../render/collapse-store";
import type { NoteRenderer } from "../render/note-renderer";
import { StreamState } from "./stream-state";
import { StreamBlocks } from "./stream-blocks";
import { InfiniteScrollController } from "./infinite-scroll";
import { NoteWindowManager } from "./note-window";
import { layoutOf, type LayoutMemory } from "./layout-memory";
import { ScrollBoxGuard } from "./scroll-box-guard";
import { FrameDeferral } from "./frame-deferral";
import { youtubeThumbnail } from "../render/video-thumbnails";
import { webPageLink } from "../render/web-page-links";
import {
    captureAnchor,
    keepInPlace,
    restoreAnchor,
    scrollIntoPlace,
    type StreamLayout,
    type StreamPlace,
} from "./scroll-position";

/** Obsidian autosaves as you type; one render per save is wasted work. */
const MODIFY_DEBOUNCE_MS = 300;

/** The format field writes per keystroke, and a half-typed format rebuilds the stream. */
const CONFIG_DEBOUNCE_MS = 1000;

const BATCH_SIZE = 10;

const NO_NOTES = "No daily notes found. Please check your daily notes settings.";

const ALL_HIDDEN =
    'Every daily note is hidden: each holds only its template. Turn off "Hide empty notes" to show them.';

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
    private scrollBoxes: ScrollBoxGuard;
    private readonly frames = new FrameDeferral(youtubeThumbnail, webPageLink);

    // Serialized: an event interleaving with an in-flight batch would leave
    // state and the service cache disagreeing.
    private queue: Promise<void> = Promise.resolve();
    private loadPending = false;
    /** Lets go of the match last centered; a no-op once it has. */
    private letGoOfCentered = () => {};

    /** Notes saved since the last flush, by path. */
    private readonly pendingModified = new Map<string, TFile>();

    constructor(
        private readonly service: DailyNoteService,
        private readonly collapseStore: CollapsibleStateStore,
        renderer: NoteRenderer,
        /** Every height measured, kept across sessions (ADR 0010). */
        memory: Pick<LayoutMemory, "notes">
    ) {
        this.window = new NoteWindowManager(renderer, this.enqueue.bind(this), memory.notes, () =>
            layoutOf(this.blocks.el)
        );
        this.scrollBoxes = new ScrollBoxGuard((view) => renderer.onBaseLayout(view));
    }

    /** Starts watching `container`, inside the pane `scrollRoot`, for the first batch. */
    open(scrollRoot: HTMLElement, container: HTMLElement): void {
        this.scrollRoot = scrollRoot;
        this.blocks.attach(container);
        this.state.reset();
        this.window.attach(scrollRoot);
        // iOS ends a glide early on a scroll box, or on a frame starting its page;
        // Android is held to the same rules (ADR 0008, D-087).
        if (Platform.isMobile) {
            this.scrollBoxes.attach(container);
            this.frames.attach(container);
        }
        this.attachScroll();
    }

    close(): void {
        this.letGoOfCentered();
        this.onDailyNoteSettingsChange.cancel();
        this.flushModified.cancel();
        this.scroll.detach();
        this.window.detach();
        this.scrollBoxes.detach();
        this.frames.detach();
        this.blocks.clear();
    }

    onResize(): void {
        this.window.onResize();
    }

    /** The layout memory was emptied: every placeholder is estimated afresh. */
    forgetHeights(): void {
        this.window.forgetHeights();
    }

    scrollToTop(): void {
        this.window.scrollToTop();
    }

    /** Unloads, style reads and frames' pages wait for the scroll to stop. */
    onScroll(): void {
        this.window.onScroll();
        this.scrollBoxes.onScroll();
        this.frames.onScroll();
    }

    /** A touch is the reader's own: a match held in place is let go. */
    onTouch(target: EventTarget | null): void {
        this.letGoOfCentered();
        this.window.onTouch(target);
    }

    /** The reader scrolls the pane themselves. */
    onWheel(): void {
        this.letGoOfCentered();
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
            for (const file of files) void this.enqueue(() => this.applyModify(file));
        },
        MODIFY_DEBOUNCE_MS,
        true
    );

    /** A save may hide a note, or show one again (ADR 0011); otherwise it re-renders. */
    private async applyModify(file: TFile): Promise<void> {
        if (await this.reconsider(file)) return;
        const el = this.blocks.get(file.path);
        if (el) await this.window.refresh(el);
    }

    /**
     * Links to `files` came or went, which may hide or show them (ADR 0011).
     * One that stays is left alone: its linked mentions redraw themselves.
     */
    onLinksChanged(files: TFile[]): Promise<void> {
        return this.enqueue(async () => {
            for (const file of files) await this.reconsider(file);
        });
    }

    /** Takes `file` out, or puts it back, when whether it belongs changed; whether it did. */
    private async reconsider(file: TFile): Promise<boolean> {
        const listed = this.service.indexOf(file.path) !== -1;
        const belongs = await this.service.belongs(file);
        if (listed && !belongs) this.removeNote(file, file.path);
        else if (!listed && belongs) this.insertNote(file);
        else return false;
        return true;
    }

    onFileCreate(file: TAbstractFile) {
        if (!(file instanceof TFile)) return;
        void this.enqueue(async () => this.insertNote(file));
    }

    private insertNote(file: TFile): void {
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

        this.blocks.hideEmptyState();

        for (const file of batch) {
            this.blocks.append(file.path, this.window.add(file));
        }
        this.state.append(batch);

        this.scroll.recheck();
    }

    private showEmptyState(): void {
        this.blocks.showEmptyState(this.service.hidesAny() ? ALL_HIDDEN : NO_NOTES);
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

    /** Loads `file` into the stream, drawn whole, without scrolling to it; its block, or null when gone. */
    ready(file: TFile): Promise<HTMLElement | null> {
        const index = this.service.indexOf(file.path);
        return index === -1 ? Promise.resolve(null) : this.readyIndex(index);
    }

    private async revealIndex(index: number): Promise<HTMLElement | null> {
        const block = await this.readyIndex(index);
        if (block) await scrollIntoPlace(block, "start", this.scrollRoot, this.layout);
        return block;
    }

    /**
     * Renders the note before any scroll reaches it, and waits for its Bases:
     * scrolled to first, it shows each empty, then filling in. Loading is one
     * enqueued task: interleaving with a scroll-triggered load would desync
     * state from the service cache.
     */
    private async readyIndex(index: number): Promise<HTMLElement | null> {
        this.letGoOfCentered();
        let file: TFile | undefined;
        await this.enqueue(async () => {
            file = await this.loadThrough(index);
        });
        const block = file ? this.blocks.get(file.path) : null;
        if (!block) return null;
        this.window.render(block);
        await this.layout.drain();
        await basesLoaded(block);
        return block;
    }

    /**
     * Centers `el`, inside a note, on the pane, and keeps it there while the
     * stream renders and, once centered, while the Bases around it fill in.
     */
    async center(el: HTMLElement): Promise<void> {
        this.letGoOfCentered();
        await scrollIntoPlace(el, "center", this.scrollRoot, this.layout);
        this.letGoOfCentered = keepInPlace(el, "center", this.scrollRoot, this.blocks.el);
    }

    /** Whether `range` lies wholly inside the pane's visible area. */
    isOnScreen(range: Range): boolean {
        const rect = range.getBoundingClientRect();
        const pane = this.scrollRoot.getBoundingClientRect();
        return rect.top >= pane.top && rect.bottom <= pane.bottom;
    }

    /** The block `file` is shown in; null when it is not loaded. */
    blockOf(file: TFile): HTMLElement | null {
        return this.blocks.get(file.path);
    }

    /** The first note reaching into the pane; null when none does. */
    firstVisibleNote(): TFile | null {
        const find = (f: TFile) => this.blocks.get(f.path);
        return captureAnchor(this.state.notes, this.scrollRoot, find)?.file ?? null;
    }

    /**
     * Where the pane is scrolled to; null when no note is in it. Back rebuilds
     * the view, whose placeholders reserve what the notes measured (ADR 0010).
     */
    place(): StreamPlace | null {
        const find = (f: TFile) => this.blocks.get(f.path);
        const anchor = captureAnchor(this.state.notes, this.scrollRoot, find);
        if (!anchor) return null;
        return { path: anchor.file.path, offset: anchor.relativeTopPx };
    }

    /**
     * Scrolls back to `place`, before a frame is drawn; stays put when its note
     * is gone. A note never measured at this layout renders into a new height,
     * and the scroll anchor holds the place.
     */
    restorePlace(place: StreamPlace): Promise<void> {
        return this.enqueue(() => this.returnTo(place));
    }

    private async returnTo(place: StreamPlace): Promise<void> {
        const index = this.service.indexOf(place.path);
        const file = index === -1 ? undefined : await this.loadThrough(index);
        const block = file && this.blocks.get(file.path);
        if (!block) return;
        const root = this.scrollRoot;
        const scrollTop =
            root.scrollTop + block.getBoundingClientRect().top - root.getBoundingClientRect().top - place.offset;
        await this.loadUntilScrollable(scrollTop);
        root.scrollTop = scrollTop;
        this.window.placed();
    }

    /**
     * Batches until the pane can scroll to `scrollTop`: loaded only through the
     * place's note, the stream may end too soon below it, and a scroll past the
     * end stops short. Placeholders only; nothing renders here.
     */
    private async loadUntilScrollable(scrollTop: number): Promise<void> {
        const root = this.scrollRoot;
        while (root.scrollHeight - root.clientHeight < scrollTop) {
            const before = this.state.length;
            await this.loadBatch();
            if (this.state.length === before) return;
        }
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

    /**
     * Re-renders every note; reloads instead when what the service lists
     * changed, a setting toggled, and returns to the reader's place (D-074).
     */
    refresh(): Promise<void> {
        return this.enqueue(async () => {
            const place = this.place();
            const date = place && this.service.dates()[this.service.indexOf(place.path)];
            if (!(await this.service.refreshIfSettingsChanged())) return this.rerenderAll();
            await this.reload();
            if (place && date) await this.returnNear(place, date);
        });
    }

    /**
     * Returns to `place`; when its note is no longer listed, to the top of the
     * next older one, or to the end of the stream when none is older.
     */
    private async returnNear(place: StreamPlace, date: Moment): Promise<void> {
        if (this.service.indexOf(place.path) !== -1) return this.returnTo(place);
        const index = this.service.indexForDate(date);
        const older = index === -1 ? undefined : this.service.getBatch(index, 1)[0];
        if (older) return this.returnTo({ path: older.path, offset: 0 });
        await this.returnToEnd();
    }

    /** Loads every note and scrolls to the end; an empty stream stays at the top. */
    private async returnToEnd(): Promise<void> {
        if (!(await this.loadThrough(this.service.length - 1))) return;
        this.scrollRoot.scrollTop = this.scrollRoot.scrollHeight;
        this.window.placed();
    }

    /**
     * A config write redefines which files are daily notes, so the cache and
     * every rendered note are suspect.
     */
    onDailyNoteSettingsChange: Debouncer<[], void> = debounce(
        () => {
            void this.enqueue(async () => {
                if (!(await this.service.refreshIfSettingsChanged())) return;
                await this.reload();
            });
        },
        CONFIG_DEBOUNCE_MS,
        true
    );

    /** Discards the stream and loads the first batch of the new note set. */
    private async reload(): Promise<void> {
        this.blocks.empty();
        this.scrollRoot.scrollTop = 0;
        this.scroll.detach();
        this.resetWindow();
        this.state.reset();
        this.attachScroll();
        await this.loadBatch();
    }

    /**
     * Rebuilds the stream as placeholders of the heights the store remembers,
     * and lets the window manager fill in what is near the viewport. Nothing
     * here renders, so a refresh costs the same whether ten notes are loaded or
     * a thousand.
     */
    private async rerenderAll(): Promise<void> {
        const find = (f: TFile) => this.blocks.get(f.path);
        const snapshot = captureAnchor(this.state.notes, this.scrollRoot, find);

        const notes = [...this.state.notes];

        this.blocks.empty();
        this.scroll.detach();
        this.resetWindow();
        this.state.reset();

        for (const file of notes) {
            this.blocks.append(file.path, this.window.add(file));
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
