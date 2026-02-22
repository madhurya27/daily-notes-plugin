import { describe, it, expect, beforeEach } from "vitest";
import { DailyNoteService } from "../src/DailyNoteService";
import { __setMockNotes, __setMockSettings } from "obsidian-daily-notes-interface";
import { TFile } from "obsidian";

describe("DailyNoteService", () => {
    beforeEach(() => {
        __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
        __setMockNotes([]);
    });

    describe("getAllNotesSorted (static legacy)", () => {
        it("parses daily notes in root folder", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            __setMockNotes([
                "Notes/2025-01-01.md",
                "Notes/2025-01-03.md",
                "Notes/2025-01-02.md",
            ]);

            const sorted = DailyNoteService.getAllNotesSorted();

            expect(sorted.length).toBe(3);
            expect(sorted[0]?.basename).toBe("2025-01-03");
            expect(sorted[1]?.basename).toBe("2025-01-02");
            expect(sorted[2]?.basename).toBe("2025-01-01");
        });

        it("parses daily notes in nested folders", () => {
            __setMockSettings({ format: "YYYY/MM/YYYY-MM-DD" });
            __setMockNotes([
                "Notes/2025/01/2025-01-01.md",
                "Notes/2025/01/2025-01-10.md",
                "Notes/2025/01/2025-01-05.md",
            ]);

            const sorted = DailyNoteService.getAllNotesSorted();

            expect(sorted.length).toBe(3);
            expect(sorted[0]?.basename).toBe("2025-01-10");
            expect(sorted[1]?.basename).toBe("2025-01-05");
            expect(sorted[2]?.basename).toBe("2025-01-01");
        });

        it("ignores files that do not match the format", () => {
            __setMockSettings({ format: "YYYY/MM/YYYY-MM-DD" });
            __setMockNotes([
                "Notes/2025/01/2025-01-01.md",
                "Notes/2025/01/Template.md",
                "Notes/SomeOtherFile.md",
            ]);

            const sorted = DailyNoteService.getAllNotesSorted();

            expect(sorted.length).toBe(1);
            expect(sorted[0]?.basename).toBe("2025-01-01");
        });

        it("handles compact date format without slashes", () => {
            __setMockSettings({ format: "YYYYMMDD" });
            __setMockNotes(["Notes/20250101.md"]);

            const sorted = DailyNoteService.getAllNotesSorted();

            expect(sorted.length).toBe(1);
            expect(sorted[0]?.basename).toBe("20250101");
        });
    });

    describe("instance: initialize + getBatch", () => {
        it("returns a batch starting at offset 0", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            __setMockNotes([
                "Notes/2025-01-01.md",
                "Notes/2025-01-03.md",
                "Notes/2025-01-02.md",
            ]);

            const svc = new DailyNoteService();
            svc.initialize();

            const batch = svc.getBatch(0, 2);
            expect(batch.length).toBe(2);
            expect(batch[0]?.basename).toBe("2025-01-03");
            expect(batch[1]?.basename).toBe("2025-01-02");
        });

        it("returns empty batch when offset exceeds length", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            __setMockNotes(["Notes/2025-01-01.md"]);

            const svc = new DailyNoteService();
            svc.initialize();

            expect(svc.getBatch(5, 10)).toEqual([]);
        });
    });

    describe("instance: insertSorted", () => {
        it("inserts a newer note at index 0", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            __setMockNotes(["Notes/2025-01-01.md"]);

            const svc = new DailyNoteService();
            svc.initialize();

            const newFile = new TFile("Notes/2025-01-05.md");
            const idx = svc.insertSorted(newFile);

            expect(idx).toBe(0);
            expect(svc.getBatch(0, 10)[0]?.basename).toBe("2025-01-05");
        });

        it("returns -1 when file already present", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            __setMockNotes(["Notes/2025-01-01.md"]);

            const svc = new DailyNoteService();
            svc.initialize();

            const existing = svc.getBatch(0, 1)[0]!;
            expect(svc.insertSorted(existing)).toBe(-1);
        });
    });

    describe("instance: removeSorted", () => {
        it("removes a file by path and returns its index", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            __setMockNotes(["Notes/2025-01-03.md", "Notes/2025-01-01.md"]);

            const svc = new DailyNoteService();
            svc.initialize();

            const idx = svc.removeSorted("Notes/2025-01-03.md");
            expect(idx).toBe(0);
            expect(svc.length).toBe(1);
        });

        it("returns -1 when path not found", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            __setMockNotes(["Notes/2025-01-01.md"]);

            const svc = new DailyNoteService();
            svc.initialize();

            expect(svc.removeSorted("Notes/nonexistent.md")).toBe(-1);
        });
    });
});
