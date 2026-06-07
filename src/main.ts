import { Plugin, WorkspaceLeaf } from 'obsidian';
import { DailyNotesStreamView, VIEW_TYPE_DAILY_NOTES_STREAM } from "./DailyNotesStreamView";
import { DEFAULT_SETTINGS, DailyNotesStreamSettings, DailyNotesStreamSettingTab } from "./settings";
import { DailyNoteService } from "./DailyNoteService";
import { CollapsibleStateStore } from "./CollapsibleStateStore";

export default class DailyNotesStreamPlugin extends Plugin {
	settings!: DailyNotesStreamSettings;
	service!: DailyNoteService;
	collapseStore!: CollapsibleStateStore;

	async onload() {
		await this.loadSettings();

		this.service = new DailyNoteService();
		// initialize() is called lazily in onOpen() — not here, because
		// getAllDailyNotes() throws if invoked before the vault is ready.

		this.collapseStore = new CollapsibleStateStore(this.app);

		this.registerView(
			VIEW_TYPE_DAILY_NOTES_STREAM,
			(leaf) => new DailyNotesStreamView(leaf, this)
		);

		this.addRibbonIcon('calendar-days', 'Open daily notes stream', () => {
			this.activateView().catch((error) => {
				console.error("DailyNotesStream: Failed to activate view", error);
			});
		});

		this.addCommand({
			id: 'open-stream',
			name: 'Open stream',
			callback: () => {
				this.activateView().catch((error) => {
					console.error("DailyNotesStream: Failed to activate view", error);
				});
			}
		});

		this.addSettingTab(new DailyNotesStreamSettingTab(this.app, this));
	}

	async activateView() {
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
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<DailyNotesStreamSettings>);
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
