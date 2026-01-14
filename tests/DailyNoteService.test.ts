import { DailyNoteService } from "../src/DailyNoteService";
import { __setMockNotes, __setMockSettings } from "obsidian-daily-notes-interface";
import { moment } from "obsidian";

function runTest(name: string, fn: () => void) {
    try {
        fn();
        console.log(`PASS: ${name}`);
    } catch (e) {
        console.error(`FAIL: ${name}`);
        console.error(e);
        process.exit(1);
    }
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(message);
    }
}

console.log("Starting DailyNoteService Tests...");

runTest("Should parse daily notes in root folder (Legacy)", () => {
    __setMockSettings({ format: "YYYY-MM-DD" });
    __setMockNotes([
        "Notes/2025-01-01.md",
        "Notes/2025-01-03.md", // Newer
        "Notes/2025-01-02.md"
    ]);

    const sorted = DailyNoteService.getAllNotesSorted();
    
    assert(sorted.length === 3, `Expected 3 notes, got ${sorted.length}`);
    assert(sorted[0].basename === "2025-01-03", "First note should be Jan 3");
    assert(sorted[1].basename === "2025-01-02", "Second note should be Jan 2");
    assert(sorted[2].basename === "2025-01-01", "Third note should be Jan 1");
});

runTest("Should parse daily notes in nested folders (New format)", () => {
    // This format implies the file name is YYYY-MM-DD, but resides in YYYY/MM/
    __setMockSettings({ format: "YYYY/MM/YYYY-MM-DD" });
    __setMockNotes([
        "Notes/2025/01/2025-01-01.md",
        "Notes/2025/01/2025-01-10.md", // Newer
        "Notes/2025/01/2025-01-05.md"
    ]);

    const sorted = DailyNoteService.getAllNotesSorted();
    
    assert(sorted.length === 3, `Expected 3 notes, got ${sorted.length}`);
    assert(sorted[0].basename === "2025-01-10", "First note should be Jan 10");
    assert(sorted[1].basename === "2025-01-05", "Second note should be Jan 5");
    assert(sorted[2].basename === "2025-01-01", "Third note should be Jan 1");
});

runTest("Should ignore files that do not match the format", () => {
    __setMockSettings({ format: "YYYY/MM/YYYY-MM-DD" });
    __setMockNotes([
        "Notes/2025/01/2025-01-01.md",
        "Notes/2025/01/Template.md", // Invalid
        "Notes/SomeOtherFile.md"     // Invalid
    ]);

    const sorted = DailyNoteService.getAllNotesSorted();
    
    assert(sorted.length === 1, `Expected 1 note, got ${sorted.length}`);
    assert(sorted[0].basename === "2025-01-01", "Should only have the valid note");
});

runTest("Should handle format without slashes gracefully", () => {
    __setMockSettings({ format: "YYYYMMDD" });
    __setMockNotes([
        "Notes/20250101.md"
    ]);
    
    const sorted = DailyNoteService.getAllNotesSorted();
    assert(sorted.length === 1, "Should parse compact format");
    assert(sorted[0].basename === "20250101", "Basename match");
});

console.log("All tests passed!");
