import { describe, it, expect, beforeEach } from "vitest";
import { DailyNoteService } from "../src/notes/daily-note-service";
import {
    __mockMarkdownFiles,
    __setMockNotes,
    __setMockSettings,
    __getSettingsCallCount,
    __resetSettingsCallCount,
} from "obsidian-daily-notes-interface";
import { TFile, moment } from "obsidian";

describe("DailyNoteService", () => {
    beforeEach(() => {
        __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
        __setMockNotes([]);
    });

    describe("initialize + getBatch: building the sorted cache", () => {
        function buildSorted(): TFile[] {
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();
            return svc.getBatch(0, svc.length);
        }

        it("parses daily notes in root folder", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md", "Notes/2025-01-03.md", "Notes/2025-01-02.md"]);

            const sorted = buildSorted();

            expect(sorted.length).toBe(3);
            expect(sorted[0]?.basename).toBe("2025-01-03");
            expect(sorted[1]?.basename).toBe("2025-01-02");
            expect(sorted[2]?.basename).toBe("2025-01-01");
        });

        it("parses daily notes in nested folders", () => {
            __setMockSettings({ format: "YYYY/MM/YYYY-MM-DD", folder: "Notes" });
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

        it("never parses the name of a file outside the daily-notes folder", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            const outside = new TFile("Pages/2025-01-02.md");
            let reads = 0;
            Object.defineProperty(outside, "basename", { get: () => (reads++, "2025-01-02") });
            const svc = new DailyNoteService(() => [...__mockMarkdownFiles(), outside]);

            svc.initialize();
            svc.insertSorted(outside);

            expect(reads).toBe(0);
        });

        it("ignores files that do not match the format", () => {
            __setMockSettings({ format: "YYYY/MM/YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025/01/2025-01-01.md", "Notes/2025/01/Template.md", "Notes/SomeOtherFile.md"]);

            const sorted = buildSorted();

            expect(sorted.length).toBe(1);
            expect(sorted[0]?.basename).toBe("2025-01-01");
        });

        it("drops a date-named note in a subfolder the format does not name, as a live create would", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-02.md", "Notes/archive/2025-01-01.md"]);

            expect(buildSorted().map((f) => f.path)).toEqual(["Notes/2025-01-02.md"]);
        });

        it("keeps a note whose date an attachment shares", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md", "Notes/2025-01-01.png"]);

            expect(buildSorted().map((f) => f.path)).toEqual(["Notes/2025-01-01.md"]);
        });

        it("handles compact date format without slashes", () => {
            __setMockSettings({ format: "YYYYMMDD", folder: "Notes" });
            __setMockNotes(["Notes/20250101.md"]);

            const sorted = buildSorted();

            expect(sorted.length).toBe(1);
            expect(sorted[0]?.basename).toBe("20250101");
        });
    });

    describe("instance: initialize + getBatch", () => {
        it("returns a batch starting at offset 0", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md", "Notes/2025-01-03.md", "Notes/2025-01-02.md"]);

            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            const batch = svc.getBatch(0, 2);
            expect(batch.length).toBe(2);
            expect(batch[0]?.basename).toBe("2025-01-03");
            expect(batch[1]?.basename).toBe("2025-01-02");
        });

        it("returns empty batch when offset exceeds length", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);

            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            expect(svc.getBatch(5, 10)).toEqual([]);
        });
    });

    describe("instance: insertSorted", () => {
        it("inserts a newer note at index 0", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);

            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            const newFile = new TFile("Notes/2025-01-05.md");
            const idx = svc.insertSorted(newFile);

            expect(idx).toBe(0);
            expect(svc.getBatch(0, 10)[0]?.basename).toBe("2025-01-05");
        });

        it("returns -1 for a path already in the cache", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md", "Notes/2025-01-02.md"]);

            const svc = new DailyNoteService(__mockMarkdownFiles);
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

            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();
            __resetSettingsCallCount();

            svc.insertSorted(new TFile("Notes/2025-01-05.md"));

            expect(__getSettingsCallCount()).toBe(1);
        });

        it("inserts a note between a newer and an older one", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-05.md", "Notes/2025-01-01.md"]);

            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            const mid = new TFile("Notes/2025-01-03.md");
            const idx = svc.insertSorted(mid);

            expect(idx).toBe(1);
            expect(svc.getBatch(0, 3)[1]?.basename).toBe("2025-01-03");
        });
    });

    describe("instance: removeSorted", () => {
        it("removes a file by path and returns its index", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-03.md", "Notes/2025-01-01.md"]);

            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            const idx = svc.removeSorted("Notes/2025-01-03.md");
            expect(idx).toBe(0);
            expect(svc.length).toBe(1);
        });

        it("returns -1 when path not found", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);

            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            expect(svc.removeSorted("Notes/nonexistent.md")).toBe(-1);
        });
    });

    describe("instance: insertSorted — invalid date", () => {
        it("returns -1 for a file with no parseable date", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();
            const noDate = new TFile("Notes/Template.md");
            expect(svc.insertSorted(noDate)).toBe(-1);
        });
    });

    describe("instance: insertSorted — non-daily-note files", () => {
        function serviceWith(paths: string[]): DailyNoteService {
            __setMockNotes(paths);
            const svc = new DailyNoteService(__mockMarkdownFiles);
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

    describe("a missing or folder-only format", () => {
        // An empty moment format reads any ISO 8601 date, week and ordinal forms included.
        it("lists only notes named YYYY-MM-DD when no format is set", () => {
            __setMockSettings({ format: "", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md", "Notes/20250102.md", "Notes/2025-W01.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();
            expect(svc.getBatch(0, 3).map((f) => f.basename)).toEqual(["2025-01-01"]);
        });

        it("lists nothing when the format ends in a folder, as no path can match it", () => {
            __setMockSettings({ format: "YYYY/MM/", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md", "Notes/2025/01/.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();
            expect(svc.length).toBe(0);
        });

        it("accepts a new YYYY-MM-DD note when no format is set", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();
            __setMockSettings({ format: "", folder: "Notes" });
            const newFile = new TFile("Notes/2025-01-05.md");
            const idx = svc.insertSorted(newFile);
            expect(idx).toBe(0);
        });

        it("rejects a new note when the format ends in a folder, as no path can match it", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();
            __setMockSettings({ format: "YYYY/MM/", folder: "Notes" });
            const newFile = new TFile("Notes/2025-01-05.md");
            expect(svc.insertSorted(newFile)).toBe(-1);
        });
    });
    describe("refreshIfSettingsChanged: reacting to the daily-notes config", () => {
        it("rebuilds and reports true when the date format changed", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            __setMockSettings({ format: "YYYY/MM/YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025/01/2025-01-01.md", "Notes/2025/01/2025-01-02.md"]);

            expect(svc.refreshIfSettingsChanged()).toBe(true);
            expect(svc.length).toBe(2);
            expect(svc.getBatch(0, 1)[0]?.path).toBe("Notes/2025/01/2025-01-02.md");
        });

        it("rebuilds and reports true when the folder changed", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            __setMockSettings({ format: "YYYY-MM-DD", folder: "Journal" });
            __setMockNotes(["Journal/2025-01-01.md", "Journal/2025-01-02.md"]);

            expect(svc.refreshIfSettingsChanged()).toBe(true);
            expect(svc.length).toBe(2);
        });

        it("reports false and leaves the cache alone when the settings are unchanged", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();
            const before = svc.getBatch(0, svc.length);

            // A note appearing on disk is the vault events' business, not a rebuild's.
            __setMockNotes(["Notes/2025-01-01.md", "Notes/2025-01-02.md"]);

            expect(svc.refreshIfSettingsChanged()).toBe(false);
            expect(svc.getBatch(0, svc.length)).toEqual(before);
        });

        it("reports true on the first call when initialize() never ran", () => {
            __setMockSettings({ format: "YYYY-MM-DD", folder: "Notes" });
            __setMockNotes(["Notes/2025-01-01.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);

            expect(svc.refreshIfSettingsChanged()).toBe(true);
            expect(svc.length).toBe(1);
        });
    });

    describe("instance: indexForDate", () => {
        /** Three notes, newest first: 2025-01-10, 2025-01-05, 2025-01-01. */
        function svcWithGaps(): DailyNoteService {
            __setMockNotes(["Notes/2025-01-01.md", "Notes/2025-01-05.md", "Notes/2025-01-10.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();
            return svc;
        }

        it("finds the note for an exact date", () => {
            expect(svcWithGaps().indexForDate(moment("2025-01-05", "YYYY-MM-DD", true))).toBe(1);
        });

        it("falls back to the next note older than a date with no note", () => {
            expect(svcWithGaps().indexForDate(moment("2025-01-07", "YYYY-MM-DD", true))).toBe(1);
        });

        it("returns the newest note when the date is newer than all of them", () => {
            expect(svcWithGaps().indexForDate(moment("2026-01-01", "YYYY-MM-DD", true))).toBe(0);
        });

        it("returns -1 when every note is newer than the date", () => {
            expect(svcWithGaps().indexForDate(moment("2024-12-31", "YYYY-MM-DD", true))).toBe(-1);
        });

        it("returns -1 for an empty stream", () => {
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            expect(svc.indexForDate(moment("2025-01-05", "YYYY-MM-DD", true))).toBe(-1);
        });

        it("ignores the time of day: any moment within the day hits that day's note", () => {
            const midday = moment("2025-01-05", "YYYY-MM-DD", true);
            midday.add(13, "hours");

            expect(svcWithGaps().indexForDate(midday)).toBe(1);
        });
    });

    describe("instance: indexOf", () => {
        it("finds a note by path", () => {
            __setMockNotes(["Notes/2025-01-01.md", "Notes/2025-01-02.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            expect(svc.indexOf("Notes/2025-01-01.md")).toBe(1);
            expect(svc.indexOf("Notes/2025-01-09.md")).toBe(-1);
        });
    });

    describe("dates + formatDate: what the jump suggester offers", () => {
        it("lists every note's date, newest first", () => {
            __setMockNotes(["Notes/2025-01-01.md", "Notes/2025-01-03.md", "Notes/2025-01-02.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            expect(svc.dates().map((d) => d.format("YYYY-MM-DD"))).toEqual(["2025-01-03", "2025-01-02", "2025-01-01"]);
        });

        // The suggester lists what the reader's own filenames say, so a vault
        // that names its notes DD-MM-YYYY must not be offered ISO dates.
        it("writes a date the way this vault names its notes", () => {
            __setMockSettings({ format: "DD-MM-YYYY", folder: "Notes" });
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            expect(svc.formatDate(moment("2025-01-03", "YYYY-MM-DD", true))).toBe("03-01-2025");
        });

        it("reads a date back out of the way this vault writes it", () => {
            __setMockSettings({ format: "DD-MM-YYYY", folder: "Notes" });
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            expect(svc.parseNoteDate("03-01-2025")?.format("YYYY-MM-DD")).toBe("2025-01-03");
            expect(svc.parseNoteDate("2025-01-03")).toBeNull();
        });

        // dates() reads the format live, so between a settings change and the
        // rebuild that follows it the cache holds notes the new format cannot
        // name. Those drop out rather than sit in the suggester unparsed.
        it("drops notes the format in force can no longer read", () => {
            __setMockNotes(["Notes/2025-01-01.md", "Notes/2025-01-31.md"]);
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();
            __setMockSettings({ format: "MMMM D, YYYY", folder: "Notes" });

            expect(svc.dates()).toEqual([]);
        });

        // A nested format names the file after its last segment only.
        it("writes only the segment the filename carries", () => {
            __setMockSettings({ format: "YYYY/MM/YYYY-MM-DD", folder: "Notes" });
            const svc = new DailyNoteService(__mockMarkdownFiles);
            svc.initialize();

            expect(svc.formatDate(moment("2025-01-03", "YYYY-MM-DD", true))).toBe("2025-01-03");
        });
    });
});
