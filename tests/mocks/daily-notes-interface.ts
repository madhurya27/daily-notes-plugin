import { TFile } from "./obsidian";

// Duplicate MockMoment here to avoid import issues in tests
class MockMoment {
    date: Date;
    _isValid: boolean;

    constructor(dateStr?: string, format?: string, strict?: boolean) {
        if (!dateStr) {
            this.date = new Date();
            this._isValid = true;
        } else {
            const parts = dateStr.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
            const compact = dateStr.match(/(\d{4})(\d{2})(\d{2})/);
            if (parts) {
                this.date = new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]));
                this._isValid = true;
            } else if (compact) {
                this.date = new Date(parseInt(compact[1]), parseInt(compact[2]) - 1, parseInt(compact[3]));
                this._isValid = true;
            } else {
                this.date = new Date("Invalid");
                this._isValid = false;
            }
        }
    }

    isValid() { return this._isValid; }
    isAfter(other: MockMoment) { return this.date.getTime() > other.date.getTime(); }
    isBefore(other: MockMoment) { return this.date.getTime() < other.date.getTime(); }
    valueOf() { return this.date.getTime(); }
}

function moment(inp?: string, fmt?: string, strict?: boolean) {
    return new MockMoment(inp, fmt, strict);
}

let mockNotes: Record<string, TFile> = {};
let mockSettings = {
    format: "YYYY-MM-DD",
    folder: "Notes"
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
