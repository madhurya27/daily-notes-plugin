import { describe, it, expect, afterEach } from "vitest";
import { Platform } from "obsidian";
import type { Hotkey } from "obsidian";
import { matchesHotkey } from "../src/ui/hotkey";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);
const modF: Hotkey = { modifiers: ["Mod"], key: "F" };

describe("matchesHotkey", () => {
    afterEach(() => {
        Platform.isMacOS = true;
    });

    it("reads Mod as Cmd on macOS", () => {
        Platform.isMacOS = true;
        expect(matchesHotkey(key({ key: "f", metaKey: true }), modF)).toBe(true);
        expect(matchesHotkey(key({ key: "f", ctrlKey: true }), modF)).toBe(false);
    });

    it("reads Mod as Ctrl elsewhere", () => {
        Platform.isMacOS = false;
        expect(matchesHotkey(key({ key: "f", ctrlKey: true }), modF)).toBe(true);
        expect(matchesHotkey(key({ key: "f", metaKey: true }), modF)).toBe(false);
    });

    it("refuses a chord holding a modifier the hotkey does not", () => {
        expect(matchesHotkey(key({ key: "F", metaKey: true, shiftKey: true }), modF)).toBe(false);
        expect(matchesHotkey(key({ key: "f", metaKey: true, altKey: true }), modF)).toBe(false);
    });

    it("matches each modifier named outright", () => {
        const hotkey: Hotkey = { modifiers: ["Ctrl", "Meta", "Shift", "Alt"], key: "K" };
        expect(
            matchesHotkey(key({ key: "K", ctrlKey: true, metaKey: true, shiftKey: true, altKey: true }), hotkey)
        ).toBe(true);
    });

    it("refuses another key under the same modifiers", () => {
        expect(matchesHotkey(key({ key: "g", metaKey: true }), modF)).toBe(false);
    });
});
