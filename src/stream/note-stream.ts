import { basesLoaded } from "../render/bases/bases-loaded";
import { Debouncer, Notice, Platform, TFile, TAbstractFile, debounce } from "obsidian";
import type { DailyNoteService } from "../notes/daily-note-service";
import { moment, type Moment } from "../notes/moment";
import type { NoteRenderer } from "../render/note-renderer";
import { StreamBlocks } from "./stream-blocks";
import { InfiniteScrollController } from "./infinite-scroll";
import { NoteWindowManager } from "./note-window";
import { layoutOf, type LayoutMemory } from "./layout-memory";
import { ScrollBoxGuard } from "./scroll-box-guard";
import { FrameDeferral } from "./frame-deferral";
import { SCROLL_IDLE_MS } from "./scroll-anchor";
import { youtubeThumbnail } from "../render/video-thumbnails";
import { webPageLink } from "../render/web-page-links";
import {
    keepInPlace,
    readPlace,
    scrollBlockTo,
    scrollIntoPlace,
    type StreamLayout,
    type StreamPlace,
} from "./scroll-position";

/** Obsidian autosaves as you type; one render per save is wasted work. */
const MODIFY_DEBOUNCE_MS = 300;

/** The format field writes per keystroke, and a half-typed format rebuilds the stream. */
const CONFIG_DEBOUNCE_MS = 1000;

const BATCH_SIZE = 10;

/** Past midnight, so a timer running early still finds the new day. */
const DAY_TURN_DELAY_MS = 60_000;

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
    private scroll = new InfiniteScrollController();
    /** What is rendered, and where blocks sit: the view hands it the pane's own events. */
    readonly window: NoteWindowManager;
    private scrollRoot!: HTMLElement;
    private blocks = new StreamBlocks(() => this.scroll.getSentinel());
    private scrollBoxes: ScrollBoxGuard;
    private readonly frames = new FrameDeferral(youtubeThumbnail, webPageLink);

    /** Lets the queue run: until `open`, there is no container to change. */
    private opened!: () => void;
    // Serialized: an event interleaving with an in-flight batch would leave
    // the blocks and the service's stream disagreeing.
    private queue: Promise<void> = new Promise((resolve) => (this.opened = resolve));
    private loadPending = false;
    /** Closed, the queue drops what is still waiting: each would render, then be discarded. */
    private closed = false;
    private midnight: number | null = null;
    /** The day turned while the reader was moving the pane: caught up once they stop. */
    private dayTurnWaiting = false;
    private readonly catchUpDayOnceStill = debounce(
        () => {
            this.dayTurnWaiting = false;
            void this.enqueueChange(async () => {});
        },
        SCROLL_IDLE_MS,
        true
    );
    /** Lets go of the match last centered; a no-op once it has. */
    private letGoOfCentered = () => {};

    /** Notes saved since the last flush, by path. */
    private readonly pendingModified = new Map<string, TFile>();

    constructor(
        private readonly service: DailyNoteService,
        renderer: NoteRenderer,
        /** Every height measured, kept across sessions (ADR 0010). */
        memory: Pick<LayoutMemory, "notes">,
        /** Its daily notes changed — listed, unlisted or saved — and the change is applied. */
        private readonly notesChanged: () => void = () => {}
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
        this.window.attach(scrollRoot, container, this.loadedToEnd);
        // iOS ends a glide early on a scroll box, or on a frame starting its page;
        // Android is held to the same rules (ADR 0008, D-087).
        if (Platform.isMobile) {
            this.scrollBoxes.attach(container);
            this.frames.attach(container);
        }
        this.attachScroll();
        this.armMidnight();
        this.opened();
    }

    /**
     * A note made ahead comes due at midnight with no change to show it: the
     * stream catches up once then, when the reader is still (D-123).
     */
    private armMidnight(): void {
        const untilMidnight = moment().add(1, "day").startOf("day").diff(Date.now());
        this.midnight = window.setTimeout(() => {
            this.dayTurnWaiting = true;
            this.catchUpDayOnceStill();
            this.armMidnight();
        }, untilMidnight + DAY_TURN_DELAY_MS);
    }

    /** The reader moved the pane: a catch-up due waits for them to stop. */
    private readerMoved(): void {
        if (this.dayTurnWaiting) this.catchUpDayOnceStill();
    }

    close(): void {
        this.closed = true;
        // Stryker disable next-line ConditionalExpression: clearing no timer clears nothing.
        if (this.midnight !== null) window.clearTimeout(this.midnight);
        this.catchUpDayOnceStill.cancel();
        this.letGoOfCentered();
        this.onDailyNoteSettingsChange.cancel();
        this.flushModified.cancel();
        this.scroll.detach();
        this.window.detach();
        this.scrollBoxes.detach();
        this.frames.detach();
        this.blocks.clear();
    }

    /** Unloads, style reads and frames' pages wait for the scroll to stop. */
    onScroll(): void {
        this.readerMoved();
        this.window.onScroll();
        this.scrollBoxes.onScroll();
        this.frames.onScroll();
    }

    /** A touch is the reader's own: a match held in place is let go. */
    onTouch(target: EventTarget | null): void {
        this.readerMoved();
        this.letGoOfCentered();
        this.window.onTouch(target);
    }

    /** The reader scrolls the pane themselves. */
    onWheel(): void {
        this.readerMoved();
        this.letGoOfCentered();
    }

    onFileModify(file: TAbstractFile) {
        // Stryker disable next-line ConditionalExpression: Obsidian sends modify only for files.
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
            for (const file of files) void this.enqueueChange(() => this.applyModify(file));
        },
        MODIFY_DEBOUNCE_MS,
        true
    );

    /** A save may hide a note, or show one again (ADR 0011); otherwise it re-renders. */
    private async applyModify(file: TFile): Promise<void> {
        if (await this.reconsider(file)) return;
        if (this.service.indexOf(file.path) === -1) return;
        const el = this.blocks.get(file.path);
        if (el) await this.window.refresh(el);
        this.notesChanged();
    }

    /**
     * Links to `files` came or went, which may hide or show them (ADR 0011).
     * One that stays is left alone: its linked mentions redraw themselves.
     */
    onLinksChanged(files: TFile[]): Promise<void> {
        return this.enqueueChange(async () => {
            for (const file of files) await this.reconsider(file);
        });
    }

    /** A change from outside the reader's hands: the day's turn, if any, is caught up on first. */
    private enqueueChange(task: () => Promise<void>): Promise<void> {
        return this.enqueue(async () => {
            await this.catchUpDay();
            await task();
        });
    }

    /**
     * Today's note shows however empty. Nothing runs at midnight: the next
     * change hides the last day's and shows one made ahead for the new day
     * (ADR 0011).
     */
    private async catchUpDay(): Promise<void> {
        for (const file of this.service.catchUpDay()) await this.reconsider(file);
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
        void this.enqueueChange(async () => this.insertNote(file));
    }

    private insertNote(file: TFile): void {
        const inserted = this.service.insertSorted(file);
        if (!inserted) return;
        this.notesChanged();
        if (!inserted.inStream) {
            // Beyond the loaded range — a visible sentinel loads it now.
            this.scroll.recheck();
            return;
        }

        const next = this.service.getBatch(inserted.index + 1, 1)[0];
        // Stryker disable next-line OptionalChaining: placed in the stream, a note lands before one already there.
        this.blocks.insertBefore(file.path, this.window.add(file), next?.path);
    }

    /**
     * Keyed by rendered path, which differs from `file.path` after a rename:
     * data-source-path is set at render time. Collapse state is the plugin's
     * to carry or drop.
     */
    private removeNote(file: TFile, renderedPath: string): void {
        const el = this.blocks.remove(renderedPath);
        if (el) this.window.remove(el);

        if (this.service.removeSorted(file.path) === -1) return;
        this.notesChanged();
        if (this.service.length === 0) this.showEmptyState();
    }

    onFileDelete(file: TAbstractFile) {
        if (!(file instanceof TFile)) return;
        void this.enqueueChange(async () => this.removeNote(file, file.path));
    }

    onFileRename(file: TAbstractFile, oldPath: string) {
        if (!(file instanceof TFile)) return;
        void this.enqueueChange(async () => this.removeNote(file, oldPath));
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
        const batch = this.service.extendStream(BATCH_SIZE);
        if (batch.length === 0) {
            // No recheck: re-triggering on an empty batch spins forever.
            if (this.service.streamLength === 0) this.showEmptyState();
            return;
        }

        this.blocks.hideEmptyState();

        for (const file of batch) {
            this.blocks.append(file.path, this.window.add(file));
        }

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
     * the blocks from the service's stream.
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
        // Still far off, it may have hidden meanwhile (ADR 0023): the caller reads it shown.
        this.window.render(block);
        return block;
    }

    /**
     * Centers `range`, inside a note, on the pane, and keeps it there while the
     * stream renders and, once centered, while the Bases around it fill in.
     */
    async center(range: Range): Promise<void> {
        this.letGoOfCentered();
        // Stryker disable StringLiteral: any placement but "start" centers.
        await scrollIntoPlace(range, "center", this.scrollRoot, this.layout);
        this.letGoOfCentered = keepInPlace(range, "center", this.scrollRoot, this.blocks.el);
        // Stryker restore StringLiteral
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
        const place = this.place();
        const index = place ? this.service.indexOf(place.path) : -1;
        return index === -1 ? null : this.service.getBatch(index, 1)[0]!;
    }

    /**
     * Where the pane is scrolled to; null when no note is in it. Back rebuilds
     * the view, whose placeholders reserve what the notes measured (ADR 0010).
     */
    place(): StreamPlace | null {
        return readPlace(this.blocks.el, this.scrollRoot);
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
        // Stryker disable next-line ConditionalExpression: -1 is no note's index; loadThrough finds none there either.
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
            const before = this.service.streamLength;
            await this.loadBatch();
            if (this.service.streamLength === before) return;
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
        while (this.service.streamLength <= index) {
            const before = this.service.streamLength;
            await this.loadBatch();
            if (this.service.streamLength === before) return undefined;
        }
        return this.service.getBatch(index, 1)[0];
    }

    /**
     * Re-renders every note; reloads instead when what the service lists
     * changed, a setting toggled, and returns to the reader's place (D-074).
     */
    refresh(): Promise<void> {
        return this.enqueueChange(async () => {
            // Drawn shifted, the notes are not where the scroll puts them.
            this.window.handOver();
            const place = this.place();
            const date = place && this.service.dates()[this.service.indexOf(place.path)];
            if (!(await this.service.refreshIfSettingsChanged())) return this.rerenderAll();
            await this.reload();
            // Stryker disable next-line LogicalOperator: a place is read from a listed note, which has a date.
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
        // Stryker disable next-line ConditionalExpression: -1 is no note's index; getBatch finds none there either.
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
            void this.enqueueChange(async () => {
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
        this.attachScroll();
        this.notesChanged();
        await this.loadBatch();
    }

    /**
     * Rebuilds the stream as placeholders of the heights the store remembers,
     * and lets the window manager fill in what is near the viewport. Nothing
     * here renders, so a refresh costs the same whether ten notes are loaded or
     * a thousand.
     */
    private async rerenderAll(): Promise<void> {
        const notes = this.service.streamedNotes();
        const place = this.place();

        this.blocks.empty();
        this.scroll.detach();
        this.resetWindow();

        for (const file of notes) {
            this.blocks.append(file.path, this.window.add(file));
        }

        this.attachScroll();

        const block = place && this.blocks.get(place.path);
        if (block) scrollBlockTo(block, place.offset, this.scrollRoot);
    }

    /**
     * Runs `task` after every queued mutation, so none interleave at an await.
     * The reader's own loads, renders and jumps come here, leaving the day's
     * turn alone: the notes at the top stay put under a scroll.
     */
    private enqueue(task: () => Promise<void>): Promise<void> {
        this.queue = this.queue
            .then(() => (this.closed ? undefined : task()))
            .catch((e) => console.error("DailyNotesStream: Failed to update the stream", e));
        return this.queue;
    }

    /** A visible sentinel loads the next batch. */
    private attachScroll(): void {
        this.scroll.attach(this.scrollRoot, this.blocks.el, () => this.loadMoreNotes());
    }

    private readonly loadedToEnd = () => this.service.streamLength >= this.service.length;

    /** Frees every note and starts the observers over. */
    private resetWindow(): void {
        this.window.detach();
        this.window.attach(this.scrollRoot, this.blocks.el, this.loadedToEnd);
    }
}
