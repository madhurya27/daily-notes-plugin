import { TFile } from "./obsidian";
import type { IDailyNoteSettings } from "obsidian-daily-notes-interface/dist/index";

/** The vault's files, whatever their extension. */
let mockFiles: TFile[] = [];
let mockSettings: IDailyNoteSettings = {
    format: "YYYY-MM-DD",
    folder: "Notes",
};

let settingsCallCount = 0;

export function getDailyNoteSettings() {
    settingsCallCount++;
    return mockSettings;
}

export function __getSettingsCallCount() {
    return settingsCallCount;
}

export function __resetSettingsCallCount() {
    settingsCallCount = 0;
}

// Helpers to setup test state
export function __setMockNotes(paths: string[]) {
    mockFiles = paths.map((path) => new TFile(path));
}

/** What `Vault.getMarkdownFiles()` would return for them. */
export function __mockMarkdownFiles(): TFile[] {
    return mockFiles.filter((file) => file.extension === "md");
}

export function __setMockSettings(settings: IDailyNoteSettings) {
    mockSettings = settings;
}
