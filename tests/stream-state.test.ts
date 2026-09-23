import { describe, it, expect, beforeEach } from "vitest";
import { StreamState } from "../src/stream/stream-state";
import { TFile } from "obsidian";

function makeFile(path: string): TFile {
    return new TFile(path);
}

describe("StreamState", () => {
    let state: StreamState;

    beforeEach(() => {
        state = new StreamState();
    });

    it("starts empty", () => {
        expect(state.length).toBe(0);
        expect(state.notes).toEqual([]);
    });

    it("insert adds a file at the given index", () => {
        const f = makeFile("Notes/2025-01-01.md");
        state.insert(0, f);

        expect(state.length).toBe(1);
        expect(state.notes[0]).toBe(f);
    });

    it("insert at middle index shifts elements correctly", () => {
        const a = makeFile("Notes/a.md");
        const b = makeFile("Notes/b.md");
        const c = makeFile("Notes/c.md");
        state.insert(0, a);
        state.insert(1, c);
        state.insert(1, b);

        expect(state.notes[0]).toBe(a);
        expect(state.notes[1]).toBe(b);
        expect(state.notes[2]).toBe(c);
    });

    it("remove deletes by path", () => {
        const f = makeFile("Notes/2025-01-01.md");
        state.insert(0, f);

        state.remove(f.path);

        expect(state.length).toBe(0);
    });

    it("remove is a no-op when path not found", () => {
        state.insert(0, makeFile("Notes/a.md"));
        state.remove("nonexistent.md");
        expect(state.length).toBe(1);
    });

    it("reset replaces all notes", () => {
        state.insert(0, makeFile("Notes/old.md"));

        const newFiles = [makeFile("Notes/a.md"), makeFile("Notes/b.md")];
        state.reset(newFiles);

        expect(state.length).toBe(2);
        expect(state.notes[0]).toBe(newFiles[0]);
        expect(state.notes[1]).toBe(newFiles[1]);
    });

    it("reset with no args clears the list", () => {
        state.insert(0, makeFile("Notes/a.md"));
        state.reset();
        expect(state.length).toBe(0);
    });

    it("append adds files to the end", () => {
        const a = makeFile("Notes/a.md");
        const b = makeFile("Notes/b.md");
        const c = makeFile("Notes/c.md");
        state.reset([a]);

        state.append([b, c]);

        expect(state.notes).toEqual([a, b, c]);
    });

    it("append with an empty batch leaves the list untouched", () => {
        const a = makeFile("Notes/a.md");
        state.reset([a]);

        state.append([]);

        expect(state.notes).toEqual([a]);
    });

    it("reset copies its argument — later mutation of it does not leak in", () => {
        const notes = [makeFile("Notes/a.md")];
        state.reset(notes);

        notes.push(makeFile("Notes/b.md"));

        expect(state.length).toBe(1);
    });
});
