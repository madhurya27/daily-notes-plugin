import { App, PluginSettingTab, Setting } from "obsidian";
import DailyNotesStreamPlugin from "./main";

export interface DailyNotesStreamSettings {
    showProperties: boolean;
    propertiesCollapsed: boolean;
    showLinkedMentions: boolean;
    linkedMentionsCollapsed: boolean;
}

export const DEFAULT_SETTINGS: DailyNotesStreamSettings = {
    showProperties: true,
    propertiesCollapsed: false,
    showLinkedMentions: true,
    linkedMentionsCollapsed: false,
};

export class DailyNotesStreamSettingTab extends PluginSettingTab {
    plugin: DailyNotesStreamPlugin;

    constructor(app: App, plugin: DailyNotesStreamPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        this.containerEl.empty();

        this.addToggle(
            "showProperties",
            "Show note properties",
            "Display the frontmatter properties (metadata) for each daily note."
        );
        this.addToggle(
            "propertiesCollapsed",
            "Collapse properties by default",
            "Whether the properties section should be collapsed by default."
        );
        this.addToggle("showLinkedMentions", "Show linked mentions", "List the notes that link to each daily note.");
        this.addToggle(
            "linkedMentionsCollapsed",
            "Collapse linked mentions by default",
            "Whether the linked mentions should be collapsed by default."
        );
    }

    private addToggle(key: keyof DailyNotesStreamSettings, name: string, desc: string): void {
        new Setting(this.containerEl)
            .setName(name)
            .setDesc(desc)
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
                    this.plugin.settings[key] = value;
                    await this.plugin.saveSettings();
                })
            );
    }
}
