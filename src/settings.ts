import { App, PluginSettingTab, Setting } from "obsidian";
import DailyNotesStreamPlugin from "./main";

export interface DailyNotesStreamSettings {
    showProperties: boolean;
    propertiesCollapsed: boolean;
}

export const DEFAULT_SETTINGS: DailyNotesStreamSettings = {
    showProperties: false,
    propertiesCollapsed: false,
};

export class DailyNotesStreamSettingTab extends PluginSettingTab {
    plugin: DailyNotesStreamPlugin;

    constructor(app: App, plugin: DailyNotesStreamPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Show note properties")
            .setDesc("Display the frontmatter properties (metadata) for each daily note.")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.showProperties).onChange(async (value) => {
                    this.plugin.settings.showProperties = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Collapse properties by default")
            .setDesc("Whether the properties section should be collapsed by default.")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.propertiesCollapsed).onChange(async (value) => {
                    this.plugin.settings.propertiesCollapsed = value;
                    await this.plugin.saveSettings();
                })
            );
    }
}
