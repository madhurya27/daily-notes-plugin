import { TFile } from "./obsidian";

import moment from "moment";

let mockNotes: Record<string, TFile> = {};
let mockSettings = {
    format: "YYYY-MM-DD",
    folder: "Notes",
};

export function getAllDailyNotes() {
    return mockNotes;
}

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
export function __setMockNotes(notes: string[]) {
    mockNotes = {};
    for (const path of notes) {
        mockNotes[path] = new TFile(path);
    }
}

export function __setMockSettings(settings: any) {
    mockSettings = settings;
}

export function getDateFromFile(file: TFile, granularity: string) {
    const m = moment(file.basename, mockSettings.format, true);
    return m.isValid() ? m : null;
}
