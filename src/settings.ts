import { App, PluginSettingTab, SettingDefinitionItem } from "obsidian";
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
    hideEmptyNotes: false,
};

type SettingKey = keyof DailyNotesStreamSettings;

export class DailyNotesStreamSettingTab extends PluginSettingTab {
    plugin: DailyNotesStreamPlugin;

    constructor(app: App, plugin: DailyNotesStreamPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /** Drawn by Obsidian, which reads `plugin.settings` and lists each toggle in its settings search. */
    getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
        return [
            toggle(
                "hideEmptyNotes",
                "Hide empty notes",
                "Leave out daily notes that hold only their template. Today's note always shows."
            ),
            this.section(
                "Properties",
                toggle(
                    "showProperties",
                    "Show note properties",
                    "Display the frontmatter properties (metadata) for each daily note."
                ),
                toggle(
                    "propertiesCollapsed",
                    "Collapse properties by default",
                    "Whether the properties section should be collapsed by default."
                )
            ),
            this.section(
                "Linked mentions",
                toggle("showLinkedMentions", "Show linked mentions", "List the notes that link to each daily note."),
                toggle(
                    "linkedMentionsCollapsed",
                    "Collapse linked mentions by default",
                    "Whether the linked mentions should be collapsed by default."
                )
            ),
        ];
    }

    /** Saved through the plugin, which redraws every open stream. */
    async setControlValue(key: string, value: unknown): Promise<void> {
        this.plugin.settings[key as SettingKey] = value as boolean;
        await this.plugin.saveSettings();
    }

    /** A group under `heading`; `collapsed` is drawn only while the section shows (D-114). */
    private section(heading: string, show: Toggle, collapsed: Toggle): SettingDefinitionItem<SettingKey> {
        const key = show.control.key;
        return { type: "group", heading, items: [show, { ...collapsed, visible: () => this.plugin.settings[key] }] };
    }
}

type Toggle = { name: string; desc: string; control: { type: "toggle"; key: SettingKey } };

function toggle(key: SettingKey, name: string, desc: string): Toggle {
    return { name, desc, control: { type: "toggle", key } };
}
