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

/** Draws the tab afresh and returns its rows, headings included, top to bottom. */
function display(tab: DailyNotesStreamSettingTab) {
    Setting.reset();
    tab.display();
    return Setting.created;
}

/** The rows as the reader sees them: a heading in brackets. */
function rowNames() {
    return Setting.created.map((row) => (row.heading ? `[${row.name}]` : row.name));
}

describe("DailyNotesStreamSettingTab", () => {
    beforeEach(() => Setting.reset());

    it("groups each section's toggles under a heading, seeded from current values", () => {
        const plugin = makePlugin();
        plugin.settings.propertiesCollapsed = true;
        plugin.settings.hideEmptyNotes = false;

        const rows = display(makeTab(plugin));

        expect(rowNames()).toEqual([
            "Hide empty notes",
            "[Properties]",
            "Show note properties",
            "Collapse by default",
            "[Linked mentions]",
            "Show linked mentions",
            "Collapse by default",
        ]);
        const toggles = rows.filter((row) => !row.heading);
        expect(toggles.every((row) => row.desc.length > 0)).toBe(true);
        expect(toggles.map((row) => row.toggles[0]?.value)).toEqual([false, true, true, true, false]);
        expect(rows.filter((row) => row.heading).every((row) => row.toggles.length === 0)).toBe(true);
    });

    it("leaves out a section's collapse toggle while the section is hidden", () => {
        const plugin = makePlugin();
        plugin.settings.showProperties = false;
        plugin.settings.showLinkedMentions = false;

        display(makeTab(plugin));

        expect(rowNames()).toEqual([
            "Hide empty notes",
            "[Properties]",
            "Show note properties",
            "[Linked mentions]",
            "Show linked mentions",
        ]);
    });

    it.each([
        ["showProperties", 2],
        ["showLinkedMentions", 5],
    ] as const)("redraws when %s changes, so its collapse toggle comes and goes", async (_key, position) => {
        const tab = makeTab(makePlugin());
        const shown = [...display(tab)];
        Setting.reset();

        await shown[position]!.toggles[0]!.change(false);
        expect(rowNames()[position + 1]).not.toBe("Collapse by default");
        expect(tab.containerEl.childElementCount).toBe(shown.length - 1);

        const hidden = [...Setting.created];
        Setting.reset();
        await hidden[position]!.toggles[0]!.change(true);
        expect(rowNames()[position + 1]).toBe("Collapse by default");
        expect(tab.containerEl.childElementCount).toBe(shown.length);
    });

    it.each([
        ["hideEmptyNotes", 0],
        ["propertiesCollapsed", 3],
        ["linkedMentionsCollapsed", 6],
    ] as const)("does not redraw when %s changes", async (_key, position) => {
        const rows = [...display(makeTab(makePlugin()))];
        Setting.reset();

        await rows[position]!.toggles[0]!.change(true);

        expect(Setting.created).toEqual([]);
    });

    it.each([
        ["hideEmptyNotes", 0],
        ["showProperties", 2],
        ["propertiesCollapsed", 3],
        ["showLinkedMentions", 5],
        ["linkedMentionsCollapsed", 6],
    ] as const)("writes and saves %s alone when its toggle changes", async (key, position) => {
        const plugin = makePlugin();
        const rows = display(makeTab(plugin));

        await rows[position]!.toggles[0]!.change(!DEFAULT_SETTINGS[key]);

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
