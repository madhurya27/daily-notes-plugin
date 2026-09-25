import { Keymap, PaneType, Plugin, WorkspaceLeaf } from "obsidian";
import { DailyNotesStreamView, VIEW_TYPE_DAILY_NOTES_STREAM } from "./ui/stream-view";
import { DEFAULT_SETTINGS, DailyNotesStreamSettings, DailyNotesStreamSettingTab } from "./settings";
import { CollapsibleStateStore } from "./render/collapse-store";
import { DailyNoteService } from "./notes/daily-note-service";
import { ParsedDates } from "./notes/parsed-dates";

/** A ribbon click or command has no caller to reject to, so a failure is logged. */
function logActivationFailure(activation: Promise<unknown>): void {
    activation.catch((error) => console.error("DailyNotesStream: Failed to activate view", error));
}

export default class DailyNotesStreamPlugin extends Plugin {
    settings!: DailyNotesStreamSettings;
    collapseStore!: CollapsibleStateStore;

    async onload() {
        await this.loadSettings();

        this.collapseStore = new CollapsibleStateStore(this.app);

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

        this.addSettingTab(new DailyNotesStreamSettingTab(this.app, this));
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
