import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { findNotes, searchPattern } from "../../src/notes/note-search";

describe("searchPattern", () => {
    it("is null for a blank query, which matches nothing", () => {
        expect(searchPattern("")).toBeNull();
        expect(searchPattern("   ")).toBeNull();
    });

    it("matches the query anywhere, ignoring case", () => {
        const pattern = searchPattern("Run")!;
        expect("went for a run, then RUNNING".match(pattern)).toEqual(["run", "RUN"]);
    });

    it("reads the query literally, not as a regular expression", () => {
        const pattern = searchPattern("a.c (1+1)")!;
        expect(pattern.test("abc (11)")).toBe(false);
        pattern.lastIndex = 0;
        expect(pattern.test("a.c (1+1)")).toBe(true);
    });
});

describe("findNotes", () => {
    const notes = ["Notes/2025-01-03.md", "Notes/2025-01-02.md", "Notes/2025-01-01.md"].map((p) => new TFile(p));
    const sources: Record<string, string> = {
        "Notes/2025-01-03.md": "Dentist at 9",
        "Notes/2025-01-02.md": "Nothing much",
        "Notes/2025-01-01.md": "---\ntags: dentist\n---\nNew year",
    };
    const read = (file: TFile) => Promise.resolve(sources[file.path]!);

    it("returns the notes whose source holds the query, in stream order", async () => {
        expect(await findNotes(notes, read, "DENTIST")).toEqual([notes[0], notes[2]]);
    });

    it("matches the title, which the stream shows above every note", async () => {
        expect(await findNotes(notes, read, "01-02")).toEqual([notes[1]]);
    });

    it("finds nothing for a blank query, without reading a note", async () => {
        const reads: TFile[] = [];
        const counting = (file: TFile) => (reads.push(file), read(file));

        expect(await findNotes(notes, counting, " ")).toEqual([]);
        expect(reads).toEqual([]);
    });
});
