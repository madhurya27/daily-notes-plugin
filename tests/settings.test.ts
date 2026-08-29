import { describe, it, expect, beforeEach, vi } from "vitest";
import { DailyNotesStreamSettingTab, DEFAULT_SETTINGS } from "../src/settings";
import { Setting } from "./mocks/obsidian";

function makePlugin() {
    return {
        settings: { ...DEFAULT_SETTINGS },
        saveSettings: vi.fn().mockResolvedValue(undefined),
    };
}

function makeTab(plugin: ReturnType<typeof makePlugin>) {
    return new DailyNotesStreamSettingTab({} as any, plugin as any);
}

describe("DailyNotesStreamSettingTab", () => {
    beforeEach(() => Setting.reset());

    it("defaults to hidden, expanded properties", () => {
        expect(DEFAULT_SETTINGS).toEqual({ showProperties: false, propertiesCollapsed: false });
    });

    it("renders one toggle per setting, seeded from current values", () => {
        const plugin = makePlugin();
        plugin.settings.showProperties = true;
        plugin.settings.propertiesCollapsed = true;

        makeTab(plugin).display();

        expect(Setting.created.map((s) => s.name)).toEqual(["Show note properties", "Collapse properties by default"]);
        expect(Setting.created.every((s) => s.desc.length > 0)).toBe(true);
        expect(Setting.created.map((s) => s.toggles[0]?.value)).toEqual([true, true]);
    });

    it("writes and saves showProperties when its toggle changes", async () => {
        const plugin = makePlugin();
        makeTab(plugin).display();

        await Setting.created[0]!.toggles[0]!.change(true);

        expect(plugin.settings.showProperties).toBe(true);
        expect(plugin.settings.propertiesCollapsed).toBe(false);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it("writes and saves propertiesCollapsed when its toggle changes", async () => {
        const plugin = makePlugin();
        makeTab(plugin).display();

        await Setting.created[1]!.toggles[0]!.change(true);

        expect(plugin.settings.propertiesCollapsed).toBe(true);
        expect(plugin.settings.showProperties).toBe(false);
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
