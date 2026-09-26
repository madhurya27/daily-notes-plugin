import {
    ItemView,
    Platform,
    Scope,
    WorkspaceLeaf,
    debounce,
    type Hotkey,
    type HoverParent,
    type HoverPopover,
} from "obsidian";
import type DailyNotesStreamPlugin from "../main";
import { JumpToDateModal } from "./jump-to-date-modal";
import { NoteRenderer } from "../render/note-renderer";
import { CollapsibleManager } from "../render/collapsible";
import { NoteStream } from "../stream/note-stream";
import type { DailyNoteService } from "../notes/daily-note-service";
import { StreamSearch } from "../stream/stream-search";
import { SearchHighlighter } from "../render/search-highlights";
import { SearchBar } from "./search-bar";
import { matchesHotkey } from "./hotkey";
import { getReadableLineLength, getSearchHotkeys, getViewTitle, onVaultConfigChange } from "../obsidian-internals";
import { isStreamPlace } from "../stream/scroll-position";

export const VIEW_TYPE_DAILY_NOTES_STREAM = "daily-notes-stream-view";

/** A vault change re-reads every note for an open search; a burst of saves needs one. */
const SEARCH_REFRESH_DEBOUNCE_MS = 500;

export class DailyNotesStreamView extends ItemView implements HoverParent {
    hoverPopover: HoverPopover | null = null;
    /**
     * Obsidian takes a view that isn't navigable for a sidebar, and keeps the
     * last note active behind it: its word count stays in the status bar.
     */
    navigation = true;
    private plugin: DailyNotesStreamPlugin;
    private renderer: NoteRenderer;
    private collapsible: CollapsibleManager;
    private stream: NoteStream;
    private search: StreamSearch;
    private searchBar: SearchBar;
    /** Obsidian's "Search current file" binding, re-read on each config write. */
    private searchHotkeys: Hotkey[] = [];

    /** `service` is this view's own (CLAUDE.md, Invariants). */
    constructor(
        leaf: WorkspaceLeaf,
        plugin: DailyNotesStreamPlugin,
        private readonly service: DailyNoteService
    ) {
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
            highlighter,
            plugin.baseMeasurements
        );
        this.stream = new NoteStream(this.service, plugin.collapseStore, this.renderer, plugin.layoutMemory.notes);

        this.search = new StreamSearch(
            {
                notes: () => this.service.getBatch(0, this.service.length),
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
        return "gallery-vertical-end";
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
        // contains, and nothing re-reads them. A rebind lands in hotkeys.json.
        this.searchHotkeys = getSearchHotkeys(this.app);
        this.registerEvent(
            onVaultConfigChange(this.app, () => {
                this.searchHotkeys = getSearchHotkeys(this.app);
                this.stream.onDailyNoteSettingsChange();
            })
        );

        // Not in onload(): the vault may not have indexed its files yet.
        this.service.initialize();

        this.collapsible.delegate(this, streamContainerEl);
        this.renderer.delegate(this, streamContainerEl);

        // metadataCache "changed", not vault "modify": the cache lags the write,
        // and the renderer reads it for frontmatter offsets and properties.
        const { metadataCache, vault } = this.app;
        this.registerEvent(metadataCache.on("changed", (f) => this.applyChange(() => this.stream.onFileModify(f))));
        this.registerEvent(vault.on("create", (f) => this.applyChange(() => this.stream.onFileCreate(f))));
        this.registerEvent(vault.on("delete", (f) => this.applyChange(() => this.stream.onFileDelete(f))));
        this.registerEvent(vault.on("rename", (f, old) => this.applyChange(() => this.stream.onFileRename(f, old))));
        // A Base has no metadata to wait for.
        this.registerEvent(vault.on("modify", (f) => void this.renderer.onBaseModified(f)));

        this.addAction("calendar-1", "Jump to date", () => this.promptJumpToDate());
        this.addAction("search", "Search", () => this.searchBar.open());
        // iOS apps scroll to the top on a tap of the title bar.
        const title = getViewTitle(this);
        if (Platform.isMobile && title) this.registerDomEvent(title, "click", () => this.scrollToTop());

        this.registerDomEvent(this.contentEl, "scroll", () => this.stream.onScroll());
        this.stream.open(this.contentEl, streamContainerEl);
    }

    /**
     * Obsidian's history keeps a view's scroll here, not in its state: Back
     * reopens the stream from its state, then hands this back.
     */
    getEphemeralState(): Record<string, unknown> {
        const place = this.stream.place();
        return place ? { ...super.getEphemeralState(), place } : super.getEphemeralState();
    }

    setEphemeralState(state: unknown): void {
        super.setEphemeralState(state);
        const place = (state as { place?: unknown } | null | undefined)?.place;
        if (isStreamPlace(place)) void this.stream.restorePlace(place);
    }

    /** Obsidian calls this on a pane resize. */
    onResize(): void {
        this.stream.onResize();
    }

    async onClose() {
        this.refreshSearch.cancel();
        this.stream.close();
    }

    /** Obsidian's "Search current file" hotkey opens the bar. False takes the key. */
    private onKeydown(evt: KeyboardEvent): false | undefined {
        if (!this.searchHotkeys.some((hotkey) => matchesHotkey(evt, hotkey))) return undefined;
        this.searchBar.open();
        return false;
    }

    /** Applies a vault change to the stream; an open search re-reads the notes after it. */
    private applyChange(toStream: () => void): void {
        toStream();
        this.refreshSearch();
    }

    private readonly refreshSearch = debounce(() => void this.search.refresh(), SEARCH_REFRESH_DEBOUNCE_MS, true);

    /** Asks for a date, then jumps to it. */
    promptJumpToDate(): void {
        new JumpToDateModal(this.app, this.service, (target) => void this.stream.jumpToDate(target)).open();
    }

    scrollToTop(): void {
        this.stream.scrollToTop();
    }

    refresh(): Promise<void> {
        return this.stream.refresh();
    }
}
