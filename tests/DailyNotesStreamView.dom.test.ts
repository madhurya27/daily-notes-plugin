import { describe, it, expect, beforeEach, vi } from "vitest";
import { DailyNotesStreamView } from "../src/DailyNotesStreamView";
import { TFile } from "./mocks/obsidian";
import { StreamState } from "../src/StreamState";
import { makeViewSetup } from "./streamViewFixture";

describe("DailyNotesStreamView — findNoteElement", () => {
    let view: DailyNotesStreamView;

    beforeEach(async () => {
        ({ view } = await makeViewSetup());
        delete (view as any).findNoteElement; // expose real implementation
        delete (view as any).findNoteElementByPath; // ...and the lookup it delegates to
    });

    it("returns the .daily-note-block ancestor when a matching element exists", () => {
        const container = document.createElement("div");
        const block = document.createElement("div");
        block.classList.add("daily-note-block");
        const content = document.createElement("div");
        content.classList.add("daily-note-content");
        content.dataset.sourcePath = "Notes/2025-01-01.md";
        block.appendChild(content);
        container.appendChild(block);
        (view as any).streamContainerEl = container;

        const result = (view as any).findNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(result).toBe(block);
    });

    it("matches paths containing CSS selector metacharacters", () => {
        const path = 'Notes/2025-01-01 [a\\b"c].md';
        const container = document.createElement("div");
        const block = document.createElement("div");
        block.classList.add("daily-note-block");
        const content = document.createElement("div");
        content.classList.add("daily-note-content");
        content.dataset.sourcePath = path;
        block.appendChild(content);
        container.appendChild(block);
        (view as any).streamContainerEl = container;

        expect((view as any).findNoteElement(new TFile(path))).toBe(block);
    });

    it("returns null when no matching element exists in the container", () => {
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;

        const result = (view as any).findNoteElement(new TFile("Notes/2025-01-01.md"));
        expect(result).toBeNull();
    });
});

describe("DailyNotesStreamView — insertElementAt", () => {
    let view: DailyNotesStreamView;
    let state: StreamState;
    let container: HTMLElement;

    beforeEach(async () => {
        ({ view, state } = await makeViewSetup());
        delete (view as any).insertElementAt; // expose real implementation
        container = document.createElement("div");
        (view as any).streamContainerEl = container;
    });

    it("index 0 → inserts before the first note block", () => {
        const fileA = new TFile("Notes/2025-01-01.md");
        state.reset([fileA]);
        const blockA = document.createElement("div");
        container.appendChild(blockA);
        (view as any).findNoteElement = vi.fn().mockReturnValue(blockA);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 0);

        expect(container.firstChild).toBe(el);
        expect(container.children[1]).toBe(blockA);
    });

    it("index 0 with an empty stream → appends to container", () => {
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);
        const el = document.createElement("div");
        (view as any).insertElementAt(el, 0);
        expect(container.firstChild).toBe(el);
    });

    it("index >= notes.length with sentinel → inserts before sentinel", () => {
        state.reset([new TFile("Notes/a.md")]);
        const sentinel = document.createElement("div");
        container.appendChild(sentinel);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(sentinel);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1); // 1 >= notes.length (1)
        expect(container.lastChild).toBe(sentinel);
        expect(container.firstChild).toBe(el);
    });

    it("index >= notes.length, no sentinel → appends to container", () => {
        state.reset([new TFile("Notes/a.md")]);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1);
        expect(container.lastChild).toBe(el);
    });

    it("middle index, nextEl found → inserts before next element", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        const fileB = new TFile("Notes/2025-01-01.md");
        state.reset([fileA, fileB]);

        const blockB = document.createElement("div");
        container.appendChild(blockB);
        (view as any).findNoteElement = vi.fn().mockReturnValue(blockB);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1); // 0 < 1 < 2
        const children = Array.from(container.children);
        expect(children.indexOf(el)).toBeLessThan(children.indexOf(blockB));
    });

    it("middle index, nextEl not found, sentinel exists → inserts before sentinel", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        const fileB = new TFile("Notes/2025-01-01.md");
        state.reset([fileA, fileB]);

        const sentinel = document.createElement("div");
        container.appendChild(sentinel);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(sentinel);
        (view as any).findNoteElement = vi.fn().mockReturnValue(null);
        (view as any).findNoteElementByPath = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1);
        const children = Array.from(container.children);
        expect(children.indexOf(el)).toBeLessThan(children.indexOf(sentinel));
        expect(container.lastChild).toBe(sentinel);
    });

    it("middle index, nextEl not found, no sentinel → appends", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        const fileB = new TFile("Notes/2025-01-01.md");
        state.reset([fileA, fileB]);

        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);
        (view as any).findNoteElement = vi.fn().mockReturnValue(null);
        (view as any).findNoteElementByPath = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1);
        expect(container.lastChild).toBe(el);
    });

    it("index inside the range but with an undefined slot → appends", () => {
        const fileA = new TFile("Notes/2025-01-03.md");
        state.reset([fileA, fileA]); // length = 2 so else branch is reached at index 1
        // Make notes[1] return undefined via a spy on the getter
        vi.spyOn(state, "notes", "get").mockReturnValue([fileA, undefined as any] as any);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);

        const el = document.createElement("div");
        (view as any).insertElementAt(el, 1);
        // nextFile is undefined → findNoteElement is not called → falls through to append
        expect(container.lastChild).toBe(el);
    });
});
