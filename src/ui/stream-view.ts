import { ItemView, WorkspaceLeaf } from "obsidian";
import type DailyNotesStreamPlugin from "../main";
import { JumpToDateModal } from "./jump-to-date-modal";
import { NoteRenderer } from "../render/note-renderer";
import { CollapsibleManager } from "../render/collapsible";
import { NoteStream } from "../stream/note-stream";
import { getReadableLineLength, onVaultConfigChange } from "../obsidian-internals";

export const VIEW_TYPE_DAILY_NOTES_STREAM = "daily-notes-stream-view";

export class DailyNotesStreamView extends ItemView {
    private plugin: DailyNotesStreamPlugin;
    private renderer: NoteRenderer;
    private collapsible: CollapsibleManager;
    private stream: NoteStream;

    constructor(leaf: WorkspaceLeaf, plugin: DailyNotesStreamPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.collapsible = new CollapsibleManager(plugin.collapseStore);
        this.renderer = new NoteRenderer(
            this.app,
            this,
            this.collapsible,
            // A closure, not the object: loadSettings() reassigns plugin.settings.
            () => plugin.settings
        );
        this.stream = new NoteStream(plugin.service, plugin.collapseStore, this.renderer);
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
        const streamContainerEl = this.contentEl.createDiv({ cls: "daily-notes-stream-container" });

        // Mirrors Obsidian's "Readable line length" setting.
        const syncReadableWidth = () => {
            this.contentEl.toggleClass("is-readable-line-width", getReadableLineLength(this.app));
        };
        syncReadableWidth();
        this.registerEvent(this.app.workspace.on("css-change", syncReadableWidth));

        // Obsidian's daily-notes format and folder decide what the stream even
        // contains, and nothing re-reads them: registered before initialize() so
        // that correcting broken settings recovers the view.
        this.registerEvent(onVaultConfigChange(this.app, () => this.stream.onDailyNoteSettingsChange()));

        // Not in onload(): getAllDailyNotes() throws if the vault or the configured
        // daily-notes folder is not ready.
        try {
            this.plugin.service.initialize();
        } catch (e) {
            console.error("DailyNotesStream: Failed to initialize note service", e);
            streamContainerEl.createDiv({
                cls: "daily-notes-empty-state",
                text: "Could not load daily notes. Please check your daily notes settings (folder and date format).",
            });
            return;
        }

        this.collapsible.delegate(this, streamContainerEl);
        this.renderer.delegate(this, streamContainerEl);

        this.registerDomEvent(streamContainerEl, "click", (event) => {
            const target = event.target as HTMLElement;
            if (!target.matches(".internal-link")) return;
            event.preventDefault();
            const linkText = target.getAttribute("data-href");
            const sourceContainer = target.closest<HTMLElement>(".daily-note-block");
            const sourcePath = sourceContainer?.dataset.sourcePath ?? "";
            if (linkText) {
                this.app.workspace.openLinkText(linkText, sourcePath, false).catch((e) => {
                    console.error("DailyNotesStream: Failed to open link", e);
                });
            }
        });

        // metadataCache "changed", not vault "modify": the cache lags the write,
        // and the renderer reads it for frontmatter offsets and properties.
        this.registerEvent(this.app.metadataCache.on("changed", (f) => this.stream.onFileModify(f)));
        this.registerEvent(this.app.vault.on("create", (f) => this.stream.onFileCreate(f)));
        this.registerEvent(this.app.vault.on("delete", (f) => this.stream.onFileDelete(f)));
        this.registerEvent(this.app.vault.on("rename", (f, oldPath) => this.stream.onFileRename(f, oldPath)));

        this.addAction("calendar-search", "Jump to date", () => this.promptJumpToDate());

        this.stream.open(this.contentEl, streamContainerEl);
    }

    /** Obsidian calls this on a pane resize. */
    onResize(): void {
        this.stream.onResize();
    }

    async onClose() {
        this.stream.close();
    }

    /** Asks for a date, then jumps to it. */
    promptJumpToDate(): void {
        new JumpToDateModal(this.app, this.plugin.service, (target) => void this.stream.jumpToDate(target)).open();
    }

    refresh(): Promise<void> {
        return this.stream.refresh();
    }
}
