import { describe, it, expect, vi } from "vitest";
import { DailyNotesStreamSettingTab, DEFAULT_SETTINGS } from "../src/settings";
import type DailyNotesStreamPlugin from "../src/main";
import { asApp, fake } from "./stream-view-fixture";

function makePlugin() {
    return {
        settings: { ...DEFAULT_SETTINGS },
        saveSettings: vi.fn().mockResolvedValue(undefined),
    };
}

function makeTab(plugin: ReturnType<typeof makePlugin>) {
    return new DailyNotesStreamSettingTab(asApp({}), fake<DailyNotesStreamPlugin>(plugin));
}

/** The definitions' shape here: toggles, and groups of them. */
type Toggle = { name: string; desc: string; visible?: () => boolean; control: { type: string; key: string } };
type Group = { type: "group"; heading: string; items: Toggle[] };

function definitionsOf(tab: DailyNotesStreamSettingTab) {
    return tab.getSettingDefinitions() as (Toggle | Group)[];
}

/** Each toggle by name and key, a group's under its heading in brackets. */
function outline(items: (Toggle | Group)[]): unknown[] {
    return items.map((item) =>
        "type" in item ? { [`[${item.heading}]`]: outline(item.items) } : `${item.name} (${item.control.key})`
    );
}

/** Every toggle, groups opened, top to bottom. */
function toggles(items: (Toggle | Group)[]): Toggle[] {
    return items.flatMap((item) => ("type" in item ? item.items : [item]));
}

describe("DailyNotesStreamSettingTab", () => {
    it("puts Hide empty notes first, then each section's toggles in a group under its heading", () => {
        const definitions = definitionsOf(makeTab(makePlugin()));

        expect(outline(definitions)).toEqual([
            "Hide empty notes (hideEmptyNotes)",
            {
                "[Properties]": [
                    "Show note properties (showProperties)",
                    "Collapse properties by default (propertiesCollapsed)",
                ],
            },
            {
                "[Linked mentions]": [
                    "Show linked mentions (showLinkedMentions)",
                    "Collapse linked mentions by default (linkedMentionsCollapsed)",
                ],
            },
        ]);
        for (const item of toggles(definitions)) {
            expect(item.desc, item.name).toBeTruthy();
            expect(item.control.type, item.name).toBe("toggle");
        }
    });

    it.each([
        ["showProperties", "propertiesCollapsed"],
        ["showLinkedMentions", "linkedMentionsCollapsed"],
    ] as const)("draws %s's collapse toggle only while the section shows", (show, collapsed) => {
        const plugin = makePlugin();
        const definitions = definitionsOf(makeTab(plugin));
        const drawn = () =>
            toggles(definitions)
                .filter((item) => item.visible?.() ?? true)
                .map((item) => item.control.key);

        expect(drawn()).toContain(collapsed);
        plugin.settings[show] = false;
        expect(drawn()).not.toContain(collapsed);
        expect(drawn()).toContain(show);
    });

    it.each(Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[])(
        "writes %s alone and saves through the plugin, which redraws its streams",
        async (key) => {
            const plugin = makePlugin();

            await makeTab(plugin).setControlValue(key, !DEFAULT_SETTINGS[key]);

            expect(plugin.settings).toEqual({ ...DEFAULT_SETTINGS, [key]: !DEFAULT_SETTINGS[key] });
            expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
        }
    );
});
