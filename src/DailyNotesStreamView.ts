import { ItemView, WorkspaceLeaf, TFile, TAbstractFile } from "obsidian";
import { getDateFromFile } from "obsidian-daily-notes-interface";
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

        // Vault events
        this.registerEvent(this.app.vault.on("modify", (f) => this.onFileModify(f)));
        this.registerEvent(this.app.vault.on("create", (f) => this.onFileCreate(f)));
        this.registerEvent(this.app.vault.on("delete", (f) => this.onFileDelete(f)));
        this.registerEvent(this.app.vault.on("rename", (f) => this.onFileRename(f)));

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
        const date = getDateFromFile(file, "day");
        if (!date) return;
        if (this.state.length === 0) return;

        const notes = this.state.notes;
        const newestDate = getDateFromFile(notes[0]!, "day");
        const oldestDate = getDateFromFile(notes[notes.length - 1]!, "day");
        if (!newestDate || !oldestDate) return;

        let insertIndex: number;
        if (date.isAfter(newestDate)) {
            insertIndex = 0;
        } else if (date.isBefore(newestDate) && date.isAfter(oldestDate)) {
            insertIndex = notes.length;
            for (let i = 0; i < notes.length; i++) {
                const d = getDateFromFile(notes[i]!, "day");
                if (d && date.isAfter(d)) { insertIndex = i; break; }
            }
        } else {
            return;
        }

        this.renderer.createNoteElement(file).then(newEl => {
            this.insertElementAt(newEl, insertIndex);
            this.state.insert(insertIndex, file);
            this.offset++;
        }).catch(e => console.error("DailyNotesStream: Failed to insert new note", e));
    }

    onFileDelete(file: TAbstractFile) {
        if (!(file instanceof TFile)) return;
        const el = this.findNoteElement(file);
        if (el) el.remove();
        const idx = this.state.findIndex(file.path);
        if (idx !== -1) {
            this.state.remove(file.path);
            this.offset--;
        }
        this.plugin.collapseStore.clearForFile(file.path);
    }

    onFileRename(file: TAbstractFile) {
        if (!(file instanceof TFile)) return;
        const inState = this.state.findIndex(file.path) !== -1;
        if (inState) {
            const date = getDateFromFile(file, "day");
            if (!date) {
                this.onFileDelete(file);
            } else {
                this.onFileDelete(file);
                this.onFileCreate(file);
            }
        } else {
            this.onFileCreate(file);
        }
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
                if (this.offset === 0) {
                    const empty = document.createElement("div");
                    empty.addClass("daily-notes-empty-state");
                    empty.setText("No daily notes found. Please check your daily notes settings.");
                    const sentinel = this.scroll.getSentinel();
                    if (sentinel) {
                        this.streamContainerEl.insertBefore(empty, sentinel);
                    } else {
                        this.streamContainerEl.appendChild(empty);
                    }
                }
                return;
            }

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

    private findNoteElement(file: TFile): HTMLElement | null {
        const selector = `.daily-note-content[data-source-path="${file.path.replace(/"/g, '\\"')}"]`;
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
