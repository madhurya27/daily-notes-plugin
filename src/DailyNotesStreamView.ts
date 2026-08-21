import { ItemView, WorkspaceLeaf, TFile, TAbstractFile } from "obsidian";
import type DailyNotesStreamPlugin from "./main";
import { StreamState } from "./StreamState";
import { NoteRenderer } from "./NoteRenderer";
import { CollapsibleManager } from "./CollapsibleManager";
import { InfiniteScrollController } from "./InfiniteScrollController";
import { captureAnchor, restoreAnchor } from "./ScrollAnchorManager";

export const VIEW_TYPE_DAILY_NOTES_STREAM = "daily-notes-stream-view";

const BATCH_SIZE = 10;

export class DailyNotesStreamView extends ItemView {
    private plugin: DailyNotesStreamPlugin;
    private state: StreamState;
    private renderer: NoteRenderer;
    private scroll: InfiniteScrollController;
    private streamContainerEl!: HTMLElement;
    private offset = 0;
    private isLoading = false;

    constructor(leaf: WorkspaceLeaf, plugin: DailyNotesStreamPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.state = new StreamState();
        this.scroll = new InfiniteScrollController();
        this.renderer = new NoteRenderer(
            this.app,
            this,
            new CollapsibleManager(plugin.collapseStore),
            plugin.settings
        );
    }

    getViewType(): string { return VIEW_TYPE_DAILY_NOTES_STREAM; }
    getDisplayText(): string { return "Daily notes stream"; }
    getIcon(): string { return "calendar-days"; }

    async onOpen() {
        this.streamContainerEl = this.contentEl.createDiv({ cls: "daily-notes-stream-container" });

        // Mirror Obsidian's "Readable line length" setting so the stream view
        // respects the same layout constraint as regular notes.
        // Obsidian does NOT put is-readable-line-width on document.body — it sets it
        // per-view on MarkdownView instances. Read the config directly instead.
        const syncReadableWidth = () => {
            // readableLineLength defaults to true when absent from config
            type AppInternal = { vault?: { config?: { readableLineLength?: boolean } } };
            const readable = (this.app as unknown as AppInternal).vault?.config?.readableLineLength ?? true;
            this.contentEl.toggleClass("is-readable-line-width", readable);
        };
        syncReadableWidth();
        this.registerEvent(this.app.workspace.on("css-change", syncReadableWidth));

        // Initialize the service here, not in onload(), because getAllDailyNotes()
        // throws if the vault / daily notes folder isn't ready yet at plugin load time.
        // It also throws if the configured daily notes folder doesn't exist in the vault.
        try {
            this.plugin.service.initialize();
        } catch (e) {
            console.error("DailyNotesStream: Failed to initialize note service", e);
            this.streamContainerEl.createDiv({
                cls: "daily-notes-empty-state",
                text: "Could not load daily notes. Please check your Daily Notes settings (folder and date format).",
            });
            return;
        }
        this.offset = 0;
        this.state.reset();

        // Internal-link click handler
        this.streamContainerEl.addEventListener("click", (event) => {
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

        // Vault events. Re-render on metadataCache "changed", not vault
        // "modify": the cache lags the write, and the renderer reads it for
        // frontmatter offsets and properties.
        this.registerEvent(this.app.metadataCache.on("changed", (f) => this.onFileModify(f)));
        this.registerEvent(this.app.vault.on("create", (f) => this.onFileCreate(f)));
        this.registerEvent(this.app.vault.on("delete", (f) => this.onFileDelete(f)));
        this.registerEvent(this.app.vault.on("rename", (f, oldPath) => this.onFileRename(f, oldPath)));

        // Sentinel + observer — triggers initial load because sentinel is visible
        this.scroll.attach(this.contentEl, this.streamContainerEl, () => this.loadMoreNotes());

        console.debug("DailyNotesStreamView: Opening view...");
    }

    async onClose() {
        this.scroll.detach();
    }

    // -------------------------------------------------------------------------
    // Vault event handlers
    // -------------------------------------------------------------------------

    onFileModify(file: TAbstractFile) {
        if (!(file instanceof TFile)) return;
        const el = this.findNoteElement(file);
        if (el) {
            this.renderer.createNoteElement(file).then(newEl => {
                this.streamContainerEl.insertBefore(newEl, el);
                el.remove();
            }).catch(e => console.error("DailyNotesStream: Failed to refresh note", e));
        }
    }

    onFileCreate(file: TAbstractFile) {
        if (!(file instanceof TFile)) return;

        // insertSorted is the single source of truth for sort order — it also
        // keeps the service's cache in sync so later getBatch() calls stay
        // aligned with `this.offset`. Returns -1 for non-daily-note files.
        const globalIndex = this.plugin.service.insertSorted(file);
        if (globalIndex === -1) return;
        if (globalIndex >= this.offset) {
            // Beyond the loaded range — a visible sentinel loads it now.
            this.scroll.recheck();
            return;
        }

        this.renderer.createNoteElement(file).then(newEl => {
            this.insertElementAt(newEl, globalIndex);
            this.state.insert(globalIndex, file);
            this.offset++;
        }).catch(e => console.error("DailyNotesStream: Failed to insert new note", e));
    }

    /**
     * Removes a note by its rendered path (which may differ from `file.path`
     * after a rename — the DOM element's data-source-path is set at render time).
     */
    private removeNote(file: TFile, renderedPath: string): void {
        const el = this.findNoteElementByPath(renderedPath);
        if (el) el.remove();

        const globalIndex = this.plugin.service.removeSorted(file.path);
        if (globalIndex !== -1 && globalIndex < this.offset) {
            this.state.remove(file.path);
            this.offset--;
        }
        this.plugin.collapseStore.clearForFile(renderedPath);
    }

    onFileDelete(file: TAbstractFile) {
        if (!(file instanceof TFile)) return;
        this.removeNote(file, file.path);
    }

    onFileRename(file: TAbstractFile, oldPath: string) {
        if (!(file instanceof TFile)) return;
        this.removeNote(file, oldPath);
        this.onFileCreate(file);
    }

    // -------------------------------------------------------------------------
    // Load more (infinite scroll)
    // -------------------------------------------------------------------------

    async loadMoreNotes() {
        if (this.isLoading) return;
        this.isLoading = true;
        try {
            const batch = this.plugin.service.getBatch(this.offset, BATCH_SIZE);
            if (batch.length === 0) {
                // No recheck: re-triggering on an empty batch spins forever.
                if (this.offset === 0 && !this.findEmptyState()) {
                    const empty = this.streamContainerEl.createDiv({
                        cls: "daily-notes-empty-state",
                        text: "No daily notes found. Please check your daily notes settings.",
                    });
                    const sentinel = this.scroll.getSentinel();
                    if (sentinel) this.streamContainerEl.insertBefore(empty, sentinel);
                }
                return;
            }

            this.findEmptyState()?.remove();

            for (const file of batch) {
                const el = await this.renderer.createNoteElement(file);
                const sentinel = this.scroll.getSentinel();
                if (sentinel) {
                    this.streamContainerEl.insertBefore(el, sentinel);
                } else {
                    this.streamContainerEl.appendChild(el);
                }
            }
            this.state.reset([...this.state.notes, ...batch]);
            this.offset += batch.length;

            this.scroll.recheck();
        } finally {
            this.isLoading = false;
        }
    }

    // -------------------------------------------------------------------------
    // Refresh (settings change)
    // -------------------------------------------------------------------------

    async refresh() {
        const snapshot = captureAnchor(
            this.state.notes,
            this.streamContainerEl,
            this.contentEl,
            (f) => this.findNoteElement(f)
        );

        this.streamContainerEl.empty();
        this.scroll.detach();

        const notes = [...this.state.notes];
        this.state.reset();

        for (const file of notes) {
            const el = await this.renderer.createNoteElement(file);
            this.streamContainerEl.appendChild(el);
        }

        // Re-attach scroll (appends new sentinel at end)
        this.scroll.attach(this.contentEl, this.streamContainerEl, () => this.loadMoreNotes());

        if (snapshot) {
            restoreAnchor(snapshot, this.contentEl, (f) => this.findNoteElement(f));
        }

        // Restore state
        this.state.reset(notes);
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
        const selector = `.daily-note-content[data-source-path="${path.replace(/"/g, '\\"')}"]`;
        const contentEl = this.streamContainerEl.querySelector(selector);
        return (contentEl?.closest(".daily-note-block") as HTMLElement) ?? null;
    }

    private insertElementAt(el: HTMLElement, index: number): void {
        const notes = this.state.notes;
        if (index === 0) {
            const first = this.streamContainerEl.firstChild;
            if (first) {
                this.streamContainerEl.insertBefore(el, first);
            } else {
                this.streamContainerEl.appendChild(el);
            }
        } else if (index >= notes.length) {
            const sentinel = this.scroll.getSentinel();
            if (sentinel) {
                this.streamContainerEl.insertBefore(el, sentinel);
            } else {
                this.streamContainerEl.appendChild(el);
            }
        } else {
            const nextFile = notes[index];
            const nextEl = nextFile ? this.findNoteElement(nextFile) : null;
            if (nextEl) {
                this.streamContainerEl.insertBefore(el, nextEl);
            } else {
                const sentinel = this.scroll.getSentinel();
                if (sentinel) {
                    this.streamContainerEl.insertBefore(el, sentinel);
                } else {
                    this.streamContainerEl.appendChild(el);
                }
            }
        }
    }
}
