import { ItemView, Scope, WorkspaceLeaf, debounce } from "obsidian";
import type DailyNotesStreamPlugin from "../main";
import { JumpToDateModal } from "./jump-to-date-modal";
import { NoteRenderer } from "../render/note-renderer";
import { CollapsibleManager } from "../render/collapsible";
import { NoteStream } from "../stream/note-stream";
import { StreamSearch } from "../stream/stream-search";
import { SearchHighlighter } from "../render/search-highlights";
import { SearchBar } from "./search-bar";
import { matchesHotkey } from "./hotkey";
import { getReadableLineLength, getSearchHotkeys, onVaultConfigChange } from "../obsidian-internals";

export const VIEW_TYPE_DAILY_NOTES_STREAM = "daily-notes-stream-view";

/** A vault change re-reads every note for an open search; a burst of saves needs one. */
const SEARCH_REFRESH_DEBOUNCE_MS = 500;

export class DailyNotesStreamView extends ItemView {
    private plugin: DailyNotesStreamPlugin;
    private renderer: NoteRenderer;
    private collapsible: CollapsibleManager;
    private stream: NoteStream;
    private search: StreamSearch;
    private searchBar: SearchBar;

    constructor(leaf: WorkspaceLeaf, plugin: DailyNotesStreamPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.collapsible = new CollapsibleManager(plugin.collapseStore);
        const highlighter = new SearchHighlighter();
        this.renderer = new NoteRenderer(
            this.app,
            this,
            this.collapsible,
            // A closure, not the object: loadSettings() reassigns plugin.settings.
            () => plugin.settings,
            highlighter
        );
        this.stream = new NoteStream(plugin.service, plugin.collapseStore, this.renderer);

        this.search = new StreamSearch(
            {
                notes: () => plugin.service.getBatch(0, plugin.service.length),
                read: (file) => this.app.vault.cachedRead(file),
            },
            this.stream,
            highlighter,
            this.collapsible,
            (status) => this.searchBar.setStatus(status)
        );
        this.searchBar = new SearchBar(this, {
            search: (query) => void this.search.search(query),
            next: () => void this.search.next(),
            previous: () => void this.search.previous(),
            close: () => void this.search.close(),
        });

        // The active leaf's scope sees every key first; what it leaves
        // undefined goes on to Obsidian's own hotkeys.
        this.scope = new Scope(this.app.scope);
        this.scope.register(null, null, (evt) => this.onKeydown(evt));
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
        // Outside the scrolling pane, so it stays put while the notes move.
        this.containerEl.insertBefore(this.searchBar.el, this.contentEl);

        const streamContainerEl = this.contentEl.createDiv({ cls: "daily-notes-stream-container" });

        // Mirrors Obsidian's "Readable line length" setting.
        const syncReadableWidth = () => {
            this.contentEl.toggleClass("is-readable-line-width", getReadableLineLength(this.app));
        };
        syncReadableWidth();
        this.registerEvent(this.app.workspace.on("css-change", syncReadableWidth));

        // Obsidian's daily-notes format and folder decide what the stream even
        // contains, and nothing re-reads them.
        this.registerEvent(onVaultConfigChange(this.app, () => this.stream.onDailyNoteSettingsChange()));

        // Not in onload(): the vault may not have indexed its files yet.
        this.plugin.service.initialize();

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
        this.registerEvent(
            this.app.metadataCache.on("changed", (f) => {
                this.stream.onFileModify(f);
                this.refreshSearch();
            })
        );
        this.registerEvent(
            this.app.vault.on("create", (f) => {
                this.stream.onFileCreate(f);
                this.refreshSearch();
            })
        );
        this.registerEvent(
            this.app.vault.on("delete", (f) => {
                this.stream.onFileDelete(f);
                this.refreshSearch();
            })
        );
        this.registerEvent(
            this.app.vault.on("rename", (f, oldPath) => {
                this.stream.onFileRename(f, oldPath);
                this.refreshSearch();
            })
        );

        this.addAction("calendar-1", "Jump to date", () => this.promptJumpToDate());
        this.addAction("search", "Search", () => this.searchBar.open());

        this.stream.open(this.contentEl, streamContainerEl);
    }

    /** Obsidian calls this on a pane resize. */
    onResize(): void {
        this.stream.onResize();
    }

    async onClose() {
        this.refreshSearch.cancel();
        this.stream.close();
    }

    /**
     * Obsidian's "Search current file" hotkey, read on every press so a rebind
     * applies at once (docs/decisions.md, 2026-09-23). False takes the key.
     */
    private onKeydown(evt: KeyboardEvent): false | undefined {
        if (!getSearchHotkeys(this.app).some((hotkey) => matchesHotkey(evt, hotkey))) return undefined;
        this.searchBar.open();
        return false;
    }

    private readonly refreshSearch = debounce(() => void this.search.refresh(), SEARCH_REFRESH_DEBOUNCE_MS, true);

    /** Asks for a date, then jumps to it. */
    promptJumpToDate(): void {
        new JumpToDateModal(this.app, this.plugin.service, (target) => void this.stream.jumpToDate(target)).open();
    }

    refresh(): Promise<void> {
        return this.stream.refresh();
    }
}
