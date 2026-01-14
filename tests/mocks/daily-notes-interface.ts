import { TFile } from "./obsidian";

let mockNotes: Record<string, TFile> = {};
let mockSettings = {
    format: "YYYY-MM-DD",
    folder: "Notes"
};

export function getAllDailyNotes() {
    return mockNotes;
}

export function getDailyNoteSettings() {
    return mockSettings;
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
