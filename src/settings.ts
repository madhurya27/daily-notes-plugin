import { App, PluginSettingTab, Setting } from "obsidian";
import DailyNotesStreamPlugin from "./main";

export interface DailyNotesStreamSettings {
	// Add future settings here
}

export const DEFAULT_SETTINGS: DailyNotesStreamSettings = {
}

export class DailyNotesStreamSettingTab extends PluginSettingTab {
	plugin: DailyNotesStreamPlugin;

	constructor(app: App, plugin: DailyNotesStreamPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: 'Daily Notes Stream Settings' });

		new Setting(containerEl)
			.setName('Placeholder')
			.setDesc('Currently there are no configurable settings.');
	}
}