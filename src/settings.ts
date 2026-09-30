import { App, PluginSettingTab, Setting } from "obsidian";
import DailyNotesStreamPlugin from "./main";

export interface DailyNotesStreamSettings {
    showProperties: boolean;
    propertiesCollapsed: boolean;
    showLinkedMentions: boolean;
    linkedMentionsCollapsed: boolean;
    hideEmptyNotes: boolean;
}

export const DEFAULT_SETTINGS: DailyNotesStreamSettings = {
    showProperties: true,
    propertiesCollapsed: false,
    showLinkedMentions: true,
    linkedMentionsCollapsed: false,
    hideEmptyNotes: true,
};

interface ToggleRow {
    key: keyof DailyNotesStreamSettings;
    name: string;
    desc: string;
}

export class DailyNotesStreamSettingTab extends PluginSettingTab {
    plugin: DailyNotesStreamPlugin;

    constructor(app: App, plugin: DailyNotesStreamPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        this.draw();
    }

    private draw(): void {
        this.containerEl.empty();

        this.addToggle({
            key: "hideEmptyNotes",
            name: "Hide empty notes",
            desc: "Leave out daily notes that hold only their template. Today's note always shows.",
        });
        this.addSection(
            "Properties",
            {
                key: "showProperties",
                name: "Show note properties",
                desc: "Display the frontmatter properties (metadata) for each daily note.",
            },
            {
                key: "propertiesCollapsed",
                name: "Collapse by default",
                desc: "Whether the properties section should be collapsed by default.",
            }
        );
        this.addSection(
            "Linked mentions",
            {
                key: "showLinkedMentions",
                name: "Show linked mentions",
                desc: "List the notes that link to each daily note.",
            },
            {
                key: "linkedMentionsCollapsed",
                name: "Collapse by default",
                desc: "Whether the linked mentions should be collapsed by default.",
            }
        );
    }

    /** A heading over a section's toggles; `collapsed` is drawn only while the section shows (D-078). */
    private addSection(heading: string, show: ToggleRow, collapsed: ToggleRow): void {
        new Setting(this.containerEl).setName(heading).setHeading();
        this.addToggle(show, () => this.draw());
        if (this.plugin.settings[show.key]) this.addToggle(collapsed);
    }

    private addToggle({ key, name, desc }: ToggleRow, afterSave: () => void = () => {}): void {
        new Setting(this.containerEl)
            .setName(name)
            .setDesc(desc)
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
                    this.plugin.settings[key] = value;
                    await this.plugin.saveSettings();
                    afterSave();
                })
            );
    }
}
