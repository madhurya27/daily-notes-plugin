import { Plugin, WorkspaceLeaf } from "obsidian";
import { DailyNotesStreamView, VIEW_TYPE_DAILY_NOTES_STREAM } from "./ui/stream-view";
import { DEFAULT_SETTINGS, DailyNotesStreamSettings, DailyNotesStreamSettingTab } from "./settings";
import { CollapsibleStateStore } from "./render/collapse-store";
import { DailyNoteService } from "./notes/daily-note-service";

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

        this.registerView(
            VIEW_TYPE_DAILY_NOTES_STREAM,
            (leaf) =>
                new DailyNotesStreamView(leaf, this, new DailyNoteService(() => this.app.vault.getMarkdownFiles()))
        );

        this.addRibbonIcon("calendar-days", "Open daily notes stream", () => logActivationFailure(this.activateView()));

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
        if (leaf?.view instanceof DailyNotesStreamView) leaf.view.promptJumpToDate();
    }

    async activateView(): Promise<WorkspaceLeaf | null> {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_DAILY_NOTES_STREAM);

        if (leaves.length > 0) {
            leaf = leaves[0] ?? null;
        } else {
            leaf = workspace.getLeaf(true);
            await leaf.setViewState({
                type: VIEW_TYPE_DAILY_NOTES_STREAM,
                active: true,
            });
        }

        if (leaf) {
            await workspace.revealLeaf(leaf);
        }
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
