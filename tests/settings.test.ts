import { describe, it, expect, beforeEach, vi } from "vitest";
import { DailyNotesStreamSettingTab, DEFAULT_SETTINGS } from "../src/settings";
import type DailyNotesStreamPlugin from "../src/main";
import { Setting } from "./mocks/obsidian";
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

describe("DailyNotesStreamSettingTab", () => {
    beforeEach(() => Setting.reset());

    it("renders one toggle per setting, seeded from current values", () => {
        const plugin = makePlugin();
        plugin.settings.showProperties = true;
        plugin.settings.propertiesCollapsed = true;
        plugin.settings.showLinkedMentions = false;
        plugin.settings.linkedMentionsCollapsed = true;

        makeTab(plugin).display();

        expect(Setting.created.map((s) => s.name)).toEqual([
            "Show note properties",
            "Collapse properties by default",
            "Show linked mentions",
            "Collapse linked mentions by default",
        ]);
        expect(Setting.created.every((s) => s.desc.length > 0)).toBe(true);
        expect(Setting.created.map((s) => s.toggles[0]?.value)).toEqual([true, true, false, true]);
    });

    it.each([
        ["showProperties", 0],
        ["propertiesCollapsed", 1],
        ["showLinkedMentions", 2],
        ["linkedMentionsCollapsed", 3],
    ] as const)("writes and saves %s alone when its toggle changes", async (key, position) => {
        const plugin = makePlugin();
        makeTab(plugin).display();

        await Setting.created[position]!.toggles[0]!.change(!DEFAULT_SETTINGS[key]);

        expect(plugin.settings).toEqual({ ...DEFAULT_SETTINGS, [key]: !DEFAULT_SETTINGS[key] });
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it("empties the container so redisplay does not duplicate settings", () => {
        const tab = makeTab(makePlugin());

        tab.display();
        const afterFirst = tab.containerEl.childElementCount;
        tab.display();

        expect(tab.containerEl.childElementCount).toBe(afterFirst);
    });
});
