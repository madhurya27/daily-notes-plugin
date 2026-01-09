import { Plugin, WorkspaceLeaf } from 'obsidian';
import { DailyNotesStreamView, VIEW_TYPE_DAILY_NOTES_STREAM } from "./DailyNotesStreamView";
import { DEFAULT_SETTINGS, DailyNotesStreamSettings, DailyNotesStreamSettingTab } from "./settings";

export default class DailyNotesStreamPlugin extends Plugin {
	settings: DailyNotesStreamSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_DAILY_NOTES_STREAM,
			(leaf) => new DailyNotesStreamView(leaf, this)
		);

		this.addRibbonIcon('calendar-days', 'Open Daily Notes Stream', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-daily-notes-stream',
			name: 'Open Daily Notes Stream',
			callback: () => {
				this.activateView();
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
			workspace.revealLeaf(leaf);
		}
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<DailyNotesStreamSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
