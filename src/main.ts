import { Keymap, Notice, PaneType, Plugin, WorkspaceLeaf } from "obsidian";
import { DailyNotesStreamView, VIEW_TYPE_DAILY_NOTES_STREAM } from "./ui/stream-view";
import { DEFAULT_SETTINGS, DailyNotesStreamSettings, DailyNotesStreamSettingTab } from "./settings";
import { CollapsibleStateStore } from "./render/collapse-store";
import { DailyNoteService } from "./notes/daily-note-service";
import { ParsedDates } from "./notes/parsed-dates";
import { LayoutMemory } from "./stream/layout-memory";
import { BacklinkIndex } from "./notes/backlink-index";
import { EMPTY_NOTES_KEY, EmptyNotes, hideEmptyNotes } from "./notes/empty-notes";
import { LinkChanges } from "./notes/link-changes";
import { getDailyNoteSettings } from "obsidian-daily-notes-interface";

/** Set by esbuild from the environment: the build put on a device to test. Empty in a release. */
declare const BUILD_LABEL: string;

/** Unit tests run the source unbundled, where nothing defines it. */
function buildLabel(): string {
    return typeof BUILD_LABEL === "string" ? BUILD_LABEL : "";
}

/** A ribbon click or command has no caller to reject to, so a failure is logged. */
function logActivationFailure(activation: Promise<unknown>): void {
    activation.catch((error) => console.error("DailyNotesStream: Failed to activate view", error));
}

export default class DailyNotesStreamPlugin extends Plugin {
    settings!: DailyNotesStreamSettings;
    collapseStore!: CollapsibleStateStore;
    layoutMemory!: LayoutMemory;
    backlinks!: BacklinkIndex;
    emptyNotes!: EmptyNotes;
    linkChanges!: LinkChanges;

    async onload() {
        if (buildLabel()) new Notice(`Daily notes stream: ${buildLabel()}`);
        await this.loadSettings();

        this.collapseStore = new CollapsibleStateStore(this.app);
        this.rememberLayout();
        this.indexBacklinks();
        this.indexEmptyNotes();
        this.followLinkChanges();

        // Each view owns its service (CLAUDE.md, Invariants); they share only the parsed dates and verdicts.
        const parsedDates = new ParsedDates();
        const markdownFiles = () => this.app.vault.getMarkdownFiles();
        const filter = hideEmptyNotes(this.emptyNotes, this.backlinks, () => this.settings);
        this.registerView(
            VIEW_TYPE_DAILY_NOTES_STREAM,
            (leaf) => new DailyNotesStreamView(leaf, this, new DailyNoteService(markdownFiles, parsedDates, filter))
        );

        this.registerHoverLinkSource(VIEW_TYPE_DAILY_NOTES_STREAM, {
            display: "Daily notes stream",
            defaultMod: true,
        });

        this.addRibbonIcon("gallery-vertical-end", "Open daily notes stream", (evt) =>
            logActivationFailure(this.activateView(Keymap.isModEvent(evt)))
        );

        this.addCommand({
            id: "open-stream",
            name: "Open stream",
            callback: () => logActivationFailure(this.activateView()),
        });

        this.addCommand({
            id: "jump-to-date",
            name: "Jump to date",
            callback: () => logActivationFailure(this.promptJumpToDate()),
        });

        this.addCommand({
            id: "scroll-to-top",
            name: "Scroll to top",
            checkCallback: (checking) => {
                const view = this.app.workspace.getMostRecentLeaf()?.view;
                if (!(view instanceof DailyNotesStreamView)) return false;
                if (!checking) view.scrollToTop();
                return true;
            },
        });

        // A testing aid, to start from no stored heights: only on a device build.
        if (buildLabel()) {
            this.addCommand({
                id: "forget-note-heights",
                name: "Forget measured note heights",
                callback: () => this.forgetNoteHeights(),
            });
        }

        this.addSettingTab(new DailyNotesStreamSettingTab(this.app, this));
    }

    onunload() {
        this.layoutMemory.flush();
        this.emptyNotes.flush();
    }

    /** What the stream measured; a note's measurements follow it across a rename, and out with a delete. */
    private rememberLayout(): void {
        const memory = (this.layoutMemory = new LayoutMemory(this.app));
        const { vault, workspace } = this.app;
        this.registerEvent(vault.on("rename", (file, oldPath) => memory.rename(oldPath, file.path)));
        this.registerEvent(vault.on("delete", (file) => memory.forget(file.path)));
        workspace.onLayoutReady(() => memory.retainOnly(new Set(vault.getMarkdownFiles().map((file) => file.path))));
    }

    /** Every open stream estimates its notes afresh, as on a device that never measured them. */
    private forgetNoteHeights(): void {
        this.layoutMemory.forgetAll();
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DAILY_NOTES_STREAM)) {
            if (leaf.view instanceof DailyNotesStreamView) leaf.view.forgetHeights();
        }
    }

    /**
     * Registered before any view opens, so a view's own `resolved` handler
     * always looks up an index already told the links changed.
     */
    private indexBacklinks(): void {
        const { metadataCache } = this.app;
        this.backlinks = new BacklinkIndex(() => metadataCache.resolvedLinks);
        this.registerEvent(metadataCache.on("resolved", () => this.backlinks.invalidate()));
    }

    /** Registered before any view opens, so a renamed note's verdict has moved by the time a view looks. */
    /** Registered after `indexBacklinks`, so a view told of a change reads a current index. */
    private followLinkChanges(): void {
        const { vault, metadataCache } = this.app;
        const changes = (this.linkChanges = new LinkChanges(
            () => metadataCache.resolvedLinks,
            () => getDailyNoteSettings().folder ?? ""
        ));
        this.registerEvent(metadataCache.on("resolve", (file) => changes.onResolve(file.path)));
        this.registerEvent(metadataCache.on("resolved", () => changes.onResolved()));
        this.registerEvent(vault.on("delete", (file) => changes.onDelete(file.path)));
        this.registerEvent(vault.on("rename", (file, oldPath) => changes.onRename(oldPath, file.path)));
    }

    private indexEmptyNotes(): void {
        const { vault, metadataCache } = this.app;
        const notes = (this.emptyNotes = new EmptyNotes(
            {
                read: (file) => vault.cachedRead(file),
                resolve: (linkpath) => metadataCache.getFirstLinkpathDest(linkpath, ""),
            },
            {
                load: (): unknown => this.app.loadLocalStorage(EMPTY_NOTES_KEY),
                save: (value) => this.app.saveLocalStorage(EMPTY_NOTES_KEY, value),
            }
        ));
        this.registerEvent(vault.on("rename", (file, oldPath) => notes.rename(oldPath, file.path)));
        this.registerEvent(vault.on("delete", (file) => notes.forget(file.path)));
    }

    /** The stream is the only place a jump means anything, so open it first. */
    private async promptJumpToDate() {
        const leaf = await this.activateView();
        if (leaf.view instanceof DailyNotesStreamView) leaf.view.promptJumpToDate();
    }

    /** Opens the stream as the graph opens: in the current tab, or the pane a mod-click asks for. */
    async activateView(pane: PaneType | boolean = false): Promise<WorkspaceLeaf> {
        const { workspace } = this.app;
        const leaf = workspace.getLeaf(pane);
        await leaf.setViewState({ type: VIEW_TYPE_DAILY_NOTES_STREAM, active: true });
        await workspace.revealLeaf(leaf);
        return leaf;
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            (await this.loadData()) as Partial<DailyNotesStreamSettings>
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);

        // Refresh all stream views
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DAILY_NOTES_STREAM);
        for (const leaf of leaves) {
            if (leaf.view instanceof DailyNotesStreamView) {
                leaf.view.refresh().catch((error) => {
                    console.error("DailyNotesStream: Failed to refresh view on settings change", error);
                });
            }
        }
    }
}
