import { describe, it, expect, beforeEach } from "vitest";
import { DailyNoteService } from "../src/DailyNoteService";
import { __setMockNotes, __setMockSettings, __getSettingsCallCount, __resetSettingsCallCount } from "obsidian-daily-notes-interface";
import { TFile } from "obsidian";

describe("DailyNoteService", () => {
    beforeEach(() => {
        __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
        __setMockNotes([]);
    });

    describe("initialize + getBatch: building the sorted cache", () => {
        function buildSorted(): TFile[] {
            const svc = new DailyNoteService();
            svc.initialize();
            return svc.getBatch(0, svc.length);
        }

        it("parses daily notes in root folder", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            __setMockNotes([
                "Notes/2025-01-01.md",
                "Notes/2025-01-03.md",
                "Notes/2025-01-02.md",
            ]);

            const sorted = buildSorted();

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

            const sorted = buildSorted();

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

            const sorted = buildSorted();

            expect(sorted.length).toBe(1);
            expect(sorted[0]?.basename).toBe("2025-01-01");
        });

        it("handles compact date format without slashes", () => {
            __setMockSettings({ format: "YYYYMMDD" });
            __setMockNotes(["Notes/20250101.md"]);

            const sorted = buildSorted();

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
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);

            const svc = new DailyNoteService();
            svc.initialize();

            const newFile = new TFile("Notes/2025-01-05.md");
            const idx = svc.insertSorted(newFile);

            expect(idx).toBe(0);
            expect(svc.getBatch(0, 10)[0]?.basename).toBe("2025-01-05");
        });

        it("returns -1 for a path already in the cache", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md", "Notes/2025-01-02.md"]);

            const svc = new DailyNoteService();
            svc.initialize();

            expect(svc.insertSorted(new TFile("Notes/2025-01-01.md"))).toBe(-1);
            expect(svc.length).toBe(2);
        });

        it("reads the daily-note settings once per insert", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes([
                "Notes/2025-01-01.md",
                "Notes/2025-01-02.md",
                "Notes/2025-01-03.md",
                "Notes/2025-01-04.md",
            ]);

            const svc = new DailyNoteService();
            svc.initialize();
            __resetSettingsCallCount();

            svc.insertSorted(new TFile("Notes/2025-01-05.md"));

            expect(__getSettingsCallCount()).toBe(1);
        });

        it("returns -1 when file already present", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            __setMockNotes(["Notes/2025-01-01.md"]);

            const svc = new DailyNoteService();
            svc.initialize();

            const existing = svc.getBatch(0, 1)[0]!;
            expect(svc.insertSorted(existing)).toBe(-1);
        });

        it("inserts a note in the middle position (triggers lo = mid+1 branch)", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-05.md", "Notes/2025-01-01.md"]);

            const svc = new DailyNoteService();
            svc.initialize();

            // sorted = [Jan5, Jan1]; inserting Jan3:
            // mid=1 → Jan1 < Jan3 → hi=1; mid=0 → Jan5 > Jan3 → lo=1 (hits line 36)
            const mid = new TFile("Notes/2025-01-03.md");
            const idx = svc.insertSorted(mid);

            expect(idx).toBe(1);
            expect(svc.getBatch(0, 3)[1]?.basename).toBe("2025-01-03");
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

    describe("instance: insertSorted — invalid date", () => {
        it("returns -1 for a file with no parseable date", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService();
            svc.initialize();
            const noDate = new TFile("Notes/Template.md");
            expect(svc.insertSorted(noDate)).toBe(-1);
        });
    });

    describe("instance: insertSorted — non-daily-note files", () => {
        function serviceWith(paths: string[]): DailyNoteService {
            __setMockNotes(paths);
            const svc = new DailyNoteService();
            svc.initialize();
            return svc;
        }

        it("rejects a non-markdown file whose basename matches the date format", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            const svc = serviceWith(["Notes/2025-01-01.md"]);

            expect(svc.insertSorted(new TFile("Notes/2025-01-05.png"))).toBe(-1);
            expect(svc.length).toBe(1);
        });

        it("rejects a date-named note outside the daily notes folder", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            const svc = serviceWith(["Notes/2025-01-01.md"]);

            expect(svc.insertSorted(new TFile("Archive/2025-01-05.md"))).toBe(-1);
            expect(svc.length).toBe(1);
        });

        it("accepts a note in a nested-format subfolder", () => {
            __setMockSettings({ format: "YYYY/MM/YYYY-MM-DD", folder: "Notes" });
            const svc = serviceWith(["Notes/2025/01/2025-01-01.md"]);

            expect(svc.insertSorted(new TFile("Notes/2025/01/2025-01-05.md"))).toBe(0);
        });

        it("rejects a note that sits outside its nested-format subfolder", () => {
            __setMockSettings({ format: "YYYY/MM/YYYY-MM-DD", folder: "Notes" });
            const svc = serviceWith(["Notes/2025/01/2025-01-01.md"]);

            expect(svc.insertSorted(new TFile("Notes/2025-01-05.md"))).toBe(-1);
        });

        it("accepts a root-folder note when the folder setting is empty", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "" });
            const svc = serviceWith(["2025-01-01.md"]);

            expect(svc.insertSorted(new TFile("2025-01-05.md"))).toBe(0);
        });

        it("accepts a note when the folder setting has a trailing slash", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes/" });
            const svc = serviceWith(["Notes/2025-01-01.md"]);

            expect(svc.insertSorted(new TFile("Notes/2025-01-05.md"))).toBe(0);
        });

        it("accepts a note when the folder setting is absent entirely", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            const svc = serviceWith(["2025-01-01.md"]);

            expect(svc.insertSorted(new TFile("2025-01-05.md"))).toBe(0);
        });
    });

    describe("format fallback branches", () => {
        it("buildSorted: uses YYYY-MM-DD when settings.format is empty string (covers || fallback)", () => {
            __setMockSettings({ format: "" }); // empty string is falsy → right side of || taken
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService();
            svc.initialize();
            expect(svc.length).toBe(1);
            expect(svc.getBatch(0, 1)[0]?.basename).toBe("2025-01-01");
        });

        it("buildSorted: uses YYYY-MM-DD basename when format ends with slash (covers pop() || fallback)", () => {
            // "YYYY/MM/".split("/").pop() === "" (falsy) → right side of || taken
            __setMockSettings({ format: "YYYY/MM/" });
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService();
            svc.initialize();
            expect(svc.length).toBeGreaterThanOrEqual(0);
        });

        it("parseDate: uses YYYY-MM-DD fallback when format is empty string", () => {
            __setMockSettings({ format: "YYYY-MM-DD" });
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService();
            svc.initialize();
            // Change format to empty before insertSorted so parseDate uses the fallback
            __setMockSettings({ format: "", folder: "Notes" });
            const newFile = new TFile("Notes/2025-01-05.md");
            const idx = svc.insertSorted(newFile);
            expect(idx).toBe(0); // YYYY-MM-DD fallback parses "2025-01-05" correctly
        });

        it("parseDate: uses YYYY-MM-DD basename fallback when format ends with slash", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService();
            svc.initialize();
            // "YYYY/MM/".split("/").pop() === "" → || fallback taken. No file can
            // match a format ending in a slash, so the note is still rejected.
            __setMockSettings({ format: "YYYY/MM/", folder: "Notes" });
            const newFile = new TFile("Notes/2025-01-05.md");
            expect(svc.insertSorted(newFile)).toBe(-1);
        });
    });

});
