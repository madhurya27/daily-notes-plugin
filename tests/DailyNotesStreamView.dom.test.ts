import { describe, it, expect, beforeEach, vi } from "vitest";
import { DailyNotesStreamView } from "../src/DailyNotesStreamView";
import { TFile } from "./mocks/obsidian";
import { StreamState } from "../src/StreamState";
import { makeViewSetup } from "./streamViewFixture";

describe("DailyNotesStreamView — findNoteElement", () => {
    let view: DailyNotesStreamView;

    beforeEach(async () => {
        ({ view } = await makeViewSetup());
        delete (view as any).stream.findNoteElement; // expose real implementation
        delete (view as any).stream.findNoteElementByPath; // ...and the lookup it delegates to
    });

    /** What loadBatch does: the view owns the path → block index. */
    function track(path: string): HTMLElement {
        const block = document.createElement("div");
        block.classList.add("daily-note-block");
        (view as any).stream.blocks.set(path, block);
        return block;
    }

    // A per-lookup querySelector made captureAnchor O(n^2) across a refresh,
    // and the window manager adds another hot caller.
    it("resolves a note through the index, not a DOM query", () => {
        const container = document.createElement("div");
        (view as any).stream.streamContainerEl = container;
        container.querySelector = vi.fn(() => null);
        const block = track("Notes/2025-01-01.md");

        expect((view as any).stream.findNoteElement(new TFile("Notes/2025-01-01.md"))).toBe(block);
        expect(container.querySelector).not.toHaveBeenCalled();
    });

    it("matches paths containing CSS selector metacharacters", () => {
        const path = 'Notes/2025-01-01 [a\\b"c].md';
        const block = track(path);
        expect((view as any).stream.findNoteElement(new TFile(path))).toBe(block);
    });

    it("returns null for a note that is not loaded", () => {
        expect((view as any).stream.findNoteElement(new TFile("Notes/2025-01-01.md"))).toBeNull();
    });
});

describe("DailyNotesStreamView — insertElementAt", () => {
    let view: DailyNotesStreamView;
    let state: StreamState;
    let container: HTMLElement;

    beforeEach(async () => {
        ({ view, state } = await makeViewSetup());
        delete (view as any).stream.insertElementAt; // expose real implementation
        container = document.createElement("div");
        (view as any).stream.streamContainerEl = container;
    });

    it("index 0 → inserts before the first note block", () => {
        const fileA = new TFile("Notes/2025-01-01.md");
        state.reset([fileA]);
        const blockA = document.createElement("div");
        container.appendChild(blockA);
        (view as any).stream.findNoteElement = vi.fn().mockReturnValue(blockA);

        const el = document.createElement("div");
        (view as any).stream.insertElementAt(el, 0);

        expect(container.firstChild).toBe(el);
        expect(container.children[1]).toBe(blockA);
    });

    it("index 0 with an empty stream → appends to container", () => {
        (view as any).stream.scroll.getSentinel = vi.fn().mockReturnValue(null);
        const el = document.createElement("div");
        (view as any).stream.insertElementAt(el, 0);
        expect(container.firstChild).toBe(el);
    });

    it("index >= notes.length with sentinel → inserts before sentinel", () => {
        state.reset([new TFile("Notes/a.md")]);
        const sentinel = document.createElement("div");
        container.appendChild(sentinel);
        (view as any).stream.scroll.getSentinel = vi.fn().mockReturnValue(sentinel);

        const el = document.createElement("div");
        (view as any).stream.insertElementAt(el, 1); // 1 >= notes.length (1)
        expect(container.lastChild).toBe(sentinel);
        expect(container.firstChild).toBe(el);
    });

    it("index >= notes.length, no sentinel → appends to container", () => {
        state.reset([new TFile("Notes/a.md")]);
        (view as any).stream.scroll.getSentinel = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).stream.insertElementAt(el, 1);
        expect(container.lastChild).toBe(el);
    });

    it("middle index, nextEl found → inserts before next element", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        const fileB = new TFile("Notes/2025-01-01.md");
        state.reset([fileA, fileB]);

        const blockB = document.createElement("div");
        container.appendChild(blockB);
        (view as any).stream.findNoteElement = vi.fn().mockReturnValue(blockB);

        const el = document.createElement("div");
        (view as any).stream.insertElementAt(el, 1); // 0 < 1 < 2
        const children = Array.from(container.children);
        expect(children.indexOf(el)).toBeLessThan(children.indexOf(blockB));
    });

    it("middle index, nextEl not found, sentinel exists → inserts before sentinel", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        const fileB = new TFile("Notes/2025-01-01.md");
        state.reset([fileA, fileB]);

        const sentinel = document.createElement("div");
        container.appendChild(sentinel);
        (view as any).stream.scroll.getSentinel = vi.fn().mockReturnValue(sentinel);
        (view as any).stream.findNoteElement = vi.fn().mockReturnValue(null);
        (view as any).stream.findNoteElementByPath = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).stream.insertElementAt(el, 1);
        const children = Array.from(container.children);
        expect(children.indexOf(el)).toBeLessThan(children.indexOf(sentinel));
        expect(container.lastChild).toBe(sentinel);
    });

    it("middle index, nextEl not found, no sentinel → appends", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        const fileB = new TFile("Notes/2025-01-01.md");
        state.reset([fileA, fileB]);

        (view as any).stream.scroll.getSentinel = vi.fn().mockReturnValue(null);
        (view as any).stream.findNoteElement = vi.fn().mockReturnValue(null);
        (view as any).stream.findNoteElementByPath = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).stream.insertElementAt(el, 1);
        expect(container.lastChild).toBe(el);
    });

    it("index inside the range but with an undefined slot → appends", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        state.reset([fileA, fileA]); // length = 2 so else branch is reached at index 1
        // Make notes[1] return undefined via a spy on the getter
        vi.spyOn(state, "notes", "get").mockReturnValue([fileA, undefined as any] as any);
        (view as any).stream.scroll.getSentinel = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).stream.insertElementAt(el, 1);
        // nextFile is undefined → findNoteElement is not called → falls through to append
        expect(container.lastChild).toBe(el);
    });
});
