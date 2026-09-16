import { Debouncer, ItemView, WorkspaceLeaf, TFile, TAbstractFile, debounce } from "obsidian";
import type DailyNotesStreamPlugin from "./main";
import { StreamState } from "./StreamState";
import { NoteRenderer } from "./NoteRenderer";
import { CollapsibleManager } from "./CollapsibleManager";
import { InfiniteScrollController } from "./InfiniteScrollController";
import { captureAnchor, restoreAnchor } from "./ScrollAnchorManager";
import { getReadableLineLength, onVaultConfigChange } from "./obsidianInternals";

/** Obsidian autosaves as you type; one render per save is wasted work. */
const MODIFY_DEBOUNCE_MS = 300;

/** The format field writes per keystroke, and a half-typed format rebuilds the stream. */
const CONFIG_DEBOUNCE_MS = 1000;

export const VIEW_TYPE_DAILY_NOTES_STREAM = "daily-notes-stream-view";

const BATCH_SIZE = 10;

export class DailyNotesStreamView extends ItemView {
    private plugin: DailyNotesStreamPlugin;
    private state: StreamState;
    private renderer: NoteRenderer;
    private collapsible: CollapsibleManager;
    private scroll: InfiniteScrollController;
    private streamContainerEl!: HTMLElement;

    // Serialized: an event interleaving with an in-flight batch would leave
    // state and the service cache disagreeing.
    private queue: Promise<void> = Promise.resolve();
    private loadPending = false;

    /** Notes saved since the last flush, by path. */
    private readonly pendingModified = new Map<string, TFile>();

    constructor(leaf: WorkspaceLeaf, plugin: DailyNotesStreamPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.state = new StreamState();
        this.scroll = new InfiniteScrollController();
        this.collapsible = new CollapsibleManager(plugin.collapseStore);
        this.renderer = new NoteRenderer(
            this.app,
            this,
            this.collapsible,
            // A closure, not the object: loadSettings() reassigns plugin.settings.
            () => plugin.settings
        );
    }

    getViewType(): string {
        return VIEW_TYPE_DAILY_NOTES_STREAM;
    }
    getDisplayText(): string {
        return "Daily notes stream";
    }
    getIcon(): string {
        return "calendar-days";
    }

    async onOpen() {
        this.streamContainerEl = this.contentEl.createDiv({ cls: "daily-notes-stream-container" });

        // Mirrors Obsidian's "Readable line length" setting.
        const syncReadableWidth = () => {
            this.contentEl.toggleClass("is-readable-line-width", getReadableLineLength(this.app));
        };
        syncReadableWidth();
        this.registerEvent(this.app.workspace.on("css-change", syncReadableWidth));

        // Obsidian's daily-notes format and folder decide what the stream even
        // contains, and nothing re-reads them: registered before initialize() so
        // that correcting broken settings recovers the view.
        this.registerEvent(onVaultConfigChange(this.app, () => this.checkDailyNoteSettings()));

        // Not in onload(): getAllDailyNotes() throws if the vault or the configured
        // daily-notes folder is not ready.
        try {
            this.plugin.service.initialize();
        } catch (e) {
            console.error("DailyNotesStream: Failed to initialize note service", e);
            this.streamContainerEl.createDiv({
                cls: "daily-notes-empty-state",
                text: "Could not load daily notes. Please check your daily notes settings (folder and date format).",
            });
            return;
        }
        this.state.reset();

        this.collapsible.delegate(this, this.streamContainerEl);
        this.renderer.delegate(this, this.streamContainerEl);

        this.registerDomEvent(this.streamContainerEl, "click", (event) => {
            const target = event.target as HTMLElement;
            if (!target.matches(".internal-link")) return;
            event.preventDefault();
            const linkText = target.getAttribute("data-href");
            const sourceContainer = target.closest<HTMLElement>(".daily-note-content");
            const sourcePath = sourceContainer?.dataset.sourcePath ?? "";
            if (linkText) {
                this.app.workspace.openLinkText(linkText, sourcePath, false).catch((e) => {
                    console.error("DailyNotesStream: Failed to open link", e);
                });
            }
        });

        // metadataCache "changed", not vault "modify": the cache lags the write,
        // and the renderer reads it for frontmatter offsets and properties.
        this.registerEvent(this.app.metadataCache.on("changed", (f) => this.onFileModify(f)));
        this.registerEvent(this.app.vault.on("create", (f) => this.onFileCreate(f)));
        this.registerEvent(this.app.vault.on("delete", (f) => this.onFileDelete(f)));
        this.registerEvent(this.app.vault.on("rename", (f, oldPath) => this.onFileRename(f, oldPath)));

        // A visible sentinel triggers the initial load.
        this.scroll.attach(this.contentEl, this.streamContainerEl, () => this.loadMoreNotes());
    }

    async onClose() {
        this.checkDailyNoteSettings.cancel();
        this.flushModified.cancel();
        this.scroll.detach();
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
                    const newEl = await this.renderer.createNoteElement(file);
                    this.streamContainerEl.insertBefore(newEl, el);
                    el.remove();
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
            const globalIndex = this.plugin.service.insertSorted(file);
            if (globalIndex === -1) return;
            if (globalIndex >= this.state.length) {
                // Beyond the loaded range — a visible sentinel loads it now.
                this.scroll.recheck();
                return;
            }

            const newEl = await this.renderer.createNoteElement(file);
            this.insertElementAt(newEl, globalIndex);
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
        if (el) el.remove();

        const globalIndex = this.plugin.service.removeSorted(file.path);
        if (globalIndex !== -1 && globalIndex < this.state.length) {
            this.state.remove(file.path);
        }
    }

    onFileDelete(file: TAbstractFile) {
        if (!(file instanceof TFile)) return;
        void this.enqueue(async () => {
            this.removeNote(file, file.path);
            this.plugin.collapseStore.clearForFile(file.path);
        });
    }

    onFileRename(file: TAbstractFile, oldPath: string) {
        if (!(file instanceof TFile)) return;
        void this.enqueue(async () => {
            this.plugin.collapseStore.migrate(oldPath, file.path);
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
        const batch = this.plugin.service.getBatch(this.state.length, BATCH_SIZE);
        if (batch.length === 0) {
            // No recheck: re-triggering on an empty batch spins forever.
            if (this.state.length === 0 && !this.findEmptyState()) {
                this.insertBeforeSentinel(
                    this.streamContainerEl.createDiv({
                        cls: "daily-notes-empty-state",
                        text: "No daily notes found. Please check your daily notes settings.",
                    })
                );
            }
            return;
        }

        this.findEmptyState()?.remove();

        for (const file of batch) {
            this.insertBeforeSentinel(await this.renderer.createNoteElement(file));
        }
        this.state.append(batch);

        this.scroll.recheck();
    }

    refresh(): Promise<void> {
        return this.enqueue(() => this.rerenderAll());
    }

    /**
     * A config write redefines which files are daily notes, so the cache and
     * every rendered note are suspect.
     */
    private checkDailyNoteSettings: Debouncer<[], void> = debounce(
        () => {
            void this.enqueue(async () => {
                if (!this.plugin.service.refreshIfSettingsChanged()) return;
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
        this.state.reset();
        this.scroll.attach(this.contentEl, this.streamContainerEl, () => this.loadMoreNotes());
        await this.loadBatch();
    }

    private async rerenderAll(): Promise<void> {
        const snapshot = captureAnchor(this.state.notes, this.streamContainerEl, this.contentEl, (f) =>
            this.findNoteElement(f)
        );

        this.streamContainerEl.empty();
        this.scroll.detach();

        const notes = [...this.state.notes];
        this.state.reset();

        for (const file of notes) {
            const el = await this.renderer.createNoteElement(file);
            this.streamContainerEl.appendChild(el);
        }

        this.scroll.attach(this.contentEl, this.streamContainerEl, () => this.loadMoreNotes());

        if (snapshot) {
            restoreAnchor(snapshot, this.contentEl, (f) => this.findNoteElement(f));
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

    private findEmptyState(): HTMLElement | null {
        return this.streamContainerEl.querySelector(".daily-notes-empty-state");
    }

    private findNoteElement(file: TFile): HTMLElement | null {
        return this.findNoteElementByPath(file.path);
    }

    private findNoteElementByPath(path: string): HTMLElement | null {
        const selector = `.daily-note-content[data-source-path="${CSS.escape(path)}"]`;
        const contentEl = this.streamContainerEl.querySelector(selector);
        return (contentEl?.closest(".daily-note-block") as HTMLElement) ?? null;
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
