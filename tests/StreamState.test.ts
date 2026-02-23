import { describe, it, expect, beforeEach, vi } from "vitest";
import { StreamState } from "../src/StreamState";
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

    it("insert adds a file at the given index and emits note-inserted", () => {
        const handler = vi.fn();
        state.on(handler);

        const f = makeFile("Notes/2025-01-01.md");
        state.insert(0, f);

        expect(state.length).toBe(1);
        expect(state.notes[0]).toBe(f);
        expect(handler).toHaveBeenCalledWith({ type: "note-inserted", index: 0, file: f });
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

    it("remove deletes by path and emits note-removed", () => {
        const handler = vi.fn();
        const f = makeFile("Notes/2025-01-01.md");
        state.insert(0, f);
        state.on(handler);

        state.remove(f.path);

        expect(state.length).toBe(0);
        expect(handler).toHaveBeenCalledWith({ type: "note-removed", index: 0, file: f });
    });

    it("remove is a no-op when path not found", () => {
        const handler = vi.fn();
        state.on(handler);
        state.remove("nonexistent.md");
        expect(handler).not.toHaveBeenCalled();
    });

    it("update replaces the file at its index and emits note-updated", () => {
        const handler = vi.fn();
        const f = makeFile("Notes/2025-01-01.md");
        state.insert(0, f);
        state.on(handler);

        const updated = makeFile("Notes/2025-01-01.md");
        state.update(updated);

        expect(state.notes[0]).toBe(updated);
        expect(handler).toHaveBeenCalledWith({ type: "note-updated", index: 0, file: updated });
    });

    it("reset replaces all notes and emits notes-replaced", () => {
        const handler = vi.fn();
        state.insert(0, makeFile("Notes/old.md"));
        state.on(handler);

        const newFiles = [makeFile("Notes/a.md"), makeFile("Notes/b.md")];
        state.reset(newFiles);

        expect(state.length).toBe(2);
        expect(handler).toHaveBeenCalledWith({ type: "notes-replaced", notes: newFiles });
    });

    it("reset with no args clears the list", () => {
        state.insert(0, makeFile("Notes/a.md"));
        state.reset();
        expect(state.length).toBe(0);
    });

    it("on() returns an unsubscribe function", () => {
        const handler = vi.fn();
        const off = state.on(handler);
        off();
        state.insert(0, makeFile("Notes/a.md"));
        expect(handler).not.toHaveBeenCalled();
    });

    it("findIndex returns -1 when not found", () => {
        expect(state.findIndex("missing.md")).toBe(-1);
    });

    it("findIndex returns correct index", () => {
        const f = makeFile("Notes/2025-01-01.md");
        state.insert(0, f);
        expect(state.findIndex(f.path)).toBe(0);
    });

    it("notes is readonly — external mutation does not affect state", () => {
        const f = makeFile("Notes/a.md");
        state.insert(0, f);
        const snapshot = state.notes as TFile[];
        snapshot.push(makeFile("Notes/b.md")); // mutate the returned array
        // State should be unchanged
        expect(state.length).toBe(1);
    });
    it("getAt returns the file at a valid index", () => {
        const f = makeFile("Notes/a.md");
        state.insert(0, f);
        expect(state.getAt(0)).toBe(f);
    });

    it("getAt returns undefined for out-of-bounds index", () => {
        expect(state.getAt(5)).toBeUndefined();
    });

    it("update is a no-op when file path is not found in state", () => {
        const handler = vi.fn();
        state.on(handler);
        state.update(makeFile("Notes/nonexistent.md"));
        expect(handler).not.toHaveBeenCalled();
    });
});
