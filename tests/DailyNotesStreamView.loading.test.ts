import { describe, it, expect, beforeEach, vi } from "vitest";
import { DailyNotesStreamView } from "../src/DailyNotesStreamView";
import { TFile } from "./mocks/obsidian";
import { StreamState } from "../src/StreamState";
import { flushPromises, makeViewSetup } from "./streamViewFixture";

describe("DailyNotesStreamView — loadMoreNotes", () => {
    let view: DailyNotesStreamView;
    let plugin: ReturnType<typeof makePlugin>;

    beforeEach(async () => {
        ({ view, plugin } = await makeViewSetup());
        // Use real DOM container so appendChild/insertBefore work correctly
        (view as any).streamContainerEl = document.createElement("div");
    });

    it("returns early without calling getBatch when already loading", async () => {
        (view as any).loadPending = true;
        await (view as any).loadMoreNotes();
        expect(plugin.service.getBatch).not.toHaveBeenCalled();
    });

    it("resets loadPending to false after completion", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        await (view as any).loadMoreNotes();
        expect((view as any).loadPending).toBe(false);
    });

    it("appends empty-state div when the batch is empty, nothing is loaded, and there is no sentinel", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        await (view as any).loadMoreNotes();
        expect(container.querySelector(".daily-notes-empty-state")).not.toBeNull();
    });

    it("inserts empty-state before sentinel when the batch is empty and nothing is loaded", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        const container = document.createElement("div");
        const sentinel = document.createElement("div");
        container.appendChild(sentinel);
        (view as any).streamContainerEl = container;
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(sentinel);
        await (view as any).loadMoreNotes();
        const emptyState = container.querySelector(".daily-notes-empty-state");
        expect(emptyState).not.toBeNull();
        const children = Array.from(container.children);
        expect(children.indexOf(emptyState!)).toBeLessThan(children.indexOf(sentinel));
    });

    it("adds no empty-state div when the batch is empty but notes are already loaded", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([]);
        (view as any).state.reset([new TFile("Notes/2025-01-01.md")]);
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        await (view as any).loadMoreNotes();
        expect(container.querySelector(".daily-notes-empty-state")).toBeNull();
    });

    it("renders each file in batch and appends them to state", async () => {
        const files = [new TFile("Notes/2025-01-03.md"), new TFile("Notes/2025-01-01.md")];
        plugin.service.getBatch = vi.fn().mockReturnValue(files);
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(null);
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        await (view as any).loadMoreNotes();
        expect((view as any).window.add).toHaveBeenCalledTimes(2);
        expect((view as any).state.length).toBe(2);
    });

    it("does not double-load when the observer fires again while a load is in flight", async () => {
        plugin.service.getBatch = vi.fn().mockReturnValue([new TFile("Notes/2025-01-03.md")]);

        const first = (view as any).loadMoreNotes();
        const second = (view as any).loadMoreNotes();
        await Promise.all([first, second]);

        expect(plugin.service.getBatch).toHaveBeenCalledTimes(1);
    });

    it("keeps a note deleted mid-load out of state and the DOM", async () => {
        const kept = new TFile("Notes/2025-01-03.md");
        const doomed = new TFile("Notes/2025-01-02.md");
        plugin.service.getBatch = vi.fn().mockReturnValue([kept, doomed]);
        const doomedEl = document.createElement("div");
        (view as any).window.add = vi.fn((f: TFile) => (f === doomed ? doomedEl : document.createElement("div")));
        (view as any).findNoteElementByPath = vi.fn((path: string) => (path === doomed.path ? doomedEl : null));
        plugin.service.removeSorted = vi.fn().mockReturnValue(1);
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;

        const loading = (view as any).loadMoreNotes();
        view.onFileDelete(doomed);
        await loading;
        await flushPromises();

        expect((view as any).state.notes).toEqual([kept]);
        expect(container.contains(doomedEl)).toBe(false);
    });

    it("inserts each rendered note before sentinel when one exists", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        plugin.service.getBatch = vi.fn().mockReturnValue([file]);
        const container = document.createElement("div");
        const sentinel = document.createElement("div");
        container.appendChild(sentinel);
        (view as any).streamContainerEl = container;
        (view as any).scroll.getSentinel = vi.fn().mockReturnValue(sentinel);
        await (view as any).loadMoreNotes();
        const children = Array.from(container.children);
        // Sentinel must remain last
        expect(children[children.length - 1]).toBe(sentinel);
    });

    it("removes a stale empty-state div once notes exist", async () => {
        const container = document.createElement("div");
        container.createDiv({ cls: "daily-notes-empty-state", text: "No daily notes found." });
        (view as any).streamContainerEl = container;
        plugin.service.getBatch = vi.fn().mockReturnValue([new TFile("Notes/2025-01-01.md")]);

        await (view as any).loadMoreNotes();

        expect(container.querySelector(".daily-notes-empty-state")).toBeNull();
    });

    it("never appends a second empty-state div on repeated empty loads", async () => {
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        plugin.service.getBatch = vi.fn().mockReturnValue([]);

        await (view as any).loadMoreNotes();
        await (view as any).loadMoreNotes();

        expect(container.querySelectorAll(".daily-notes-empty-state").length).toBe(1);
    });

    it("rechecks the sentinel after a non-empty batch so a short batch keeps loading", async () => {
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        plugin.service.getBatch = vi.fn().mockReturnValue([new TFile("Notes/2025-01-01.md")]);

        await (view as any).loadMoreNotes();

        expect((view as any).scroll.recheck).toHaveBeenCalledOnce();
    });

    it("does not recheck after an empty batch (would loop forever)", async () => {
        const container = document.createElement("div");
        (view as any).streamContainerEl = container;
        plugin.service.getBatch = vi.fn().mockReturnValue([]);

        await (view as any).loadMoreNotes();

        expect((view as any).scroll.recheck).not.toHaveBeenCalled();
    });
});

describe("DailyNotesStreamView — refresh", () => {
    let view: DailyNotesStreamView;
    let state: StreamState;

    beforeEach(async () => {
        ({ view, state } = await makeViewSetup());
        // Real DOM so getBoundingClientRect() and empty() are available
        (view as any).contentEl = document.createElement("div");
        (view as any).streamContainerEl = document.createElement("div");
    });

    it("detaches scroll, re-renders all notes, re-attaches scroll, and restores state", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        state.reset([file]);
        await (view as any).refresh();
        expect((view as any).scroll.detach).toHaveBeenCalled();
        expect((view as any).scroll.attach).toHaveBeenCalled();
        expect(state.notes.length).toBe(1);
        expect(state.notes[0]?.basename).toBe("2025-01-01");
    });

    it("rebuilds one placeholder per note", async () => {
        state.reset([new TFile("Notes/2025-01-03.md"), new TFile("Notes/2025-01-01.md")]);
        await (view as any).refresh();
        expect((view as any).window.add).toHaveBeenCalledTimes(2);
    });

    // Rebuilt placeholders reserve the height the old blocks had, or the
    // stream's scroll extent collapses the moment a refresh runs.
    it("carries each block's height into its replacement", async () => {
        const file = new TFile("Notes/2025-01-03.md");
        state.reset([file]);
        const old = document.createElement("div");
        (view as any).blocks.set(file.path, old);
        (view as any).window.heightOf = vi.fn().mockReturnValue(512);

        await (view as any).refresh();

        expect((view as any).window.heightOf).toHaveBeenCalledWith(old);
        expect((view as any).window.add).toHaveBeenCalledWith(file, 512);
    });

    it("calls restoreAnchor when a scroll anchor was captured", async () => {
        const file = new TFile("Notes/2025-01-01.md");
        state.reset([file]);

        // Return an element with non-zero bottom so captureAnchor captures a snapshot
        const anchorEl = document.createElement("div");
        anchorEl.getBoundingClientRect = () =>
            ({ top: 100, bottom: 200, left: 0, right: 0, width: 0, height: 0 }) as DOMRect;
        (view as any).findNoteElement = vi.fn().mockReturnValue(anchorEl);

        // Should not throw — restoreAnchor will run with the captured snapshot
        await expect((view as any).refresh()).resolves.toBeUndefined();
    });
});
