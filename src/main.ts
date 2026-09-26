import { Keymap, Notice, PaneType, Plugin, WorkspaceLeaf } from "obsidian";
import { DailyNotesStreamView, VIEW_TYPE_DAILY_NOTES_STREAM } from "./ui/stream-view";
import { DEFAULT_SETTINGS, DailyNotesStreamSettings, DailyNotesStreamSettingTab } from "./settings";
import { CollapsibleStateStore } from "./render/collapse-store";
import { DailyNoteService } from "./notes/daily-note-service";
import { ParsedDates } from "./notes/parsed-dates";
import { BaseMeasurements } from "./render/bases/base-measurements";
import { LayoutMemory } from "./stream/layout-memory";

/** Set by esbuild from the environment: the build put on a device to test. Empty in a release. */
declare const BUILD_LABEL: string;

/** A ribbon click or command has no caller to reject to, so a failure is logged. */
function logActivationFailure(activation: Promise<unknown>): void {
    activation.catch((error) => console.error("DailyNotesStream: Failed to activate view", error));
}

export default class DailyNotesStreamPlugin extends Plugin {
    settings!: DailyNotesStreamSettings;
    collapseStore!: CollapsibleStateStore;
    baseMeasurements!: BaseMeasurements;
    layoutMemory!: LayoutMemory;

    async onload() {
        // Unit tests run the source unbundled, where nothing defines it.
        if (typeof BUILD_LABEL === "string" && BUILD_LABEL) new Notice(`Daily notes stream: ${BUILD_LABEL}`);
        await this.loadSettings();

        this.collapseStore = new CollapsibleStateStore(this.app);
        this.baseMeasurements = new BaseMeasurements();
        this.rememberLayout();

        // Each view owns its service (CLAUDE.md, Invariants); they share only the parsed dates.
        const parsedDates = new ParsedDates();
        const markdownFiles = () => this.app.vault.getMarkdownFiles();
        this.registerView(
            VIEW_TYPE_DAILY_NOTES_STREAM,
            (leaf) => new DailyNotesStreamView(leaf, this, new DailyNoteService(markdownFiles, parsedDates))
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

        this.addSettingTab(new DailyNotesStreamSettingTab(this.app, this));
    }

    onunload() {
        this.layoutMemory.flush();
    }

    /** Heights follow their note: across a rename, and out with a delete. */
    private rememberLayout(): void {
        const memory = (this.layoutMemory = new LayoutMemory(this.app));
        const { vault, workspace } = this.app;
        this.registerEvent(vault.on("rename", (file, oldPath) => memory.notes.rename(oldPath, file.path)));
        this.registerEvent(vault.on("delete", (file) => memory.notes.forget(file.path)));
        workspace.onLayoutReady(() =>
            memory.notes.retainOnly(new Set(vault.getMarkdownFiles().map((file) => file.path)))
        );
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
