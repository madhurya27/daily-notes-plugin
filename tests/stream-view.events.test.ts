import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DailyNotesStreamView } from "../src/ui/stream-view";
import { TFile } from "./mocks/obsidian";
import { StreamState } from "../src/stream/stream-state";
import { flushPromises, makeApp, makeViewSetup } from "./stream-view-fixture";

describe("DailyNotesStreamView — vault event handlers", () => {
    let plugin: Awaited<ReturnType<typeof makeViewSetup>>["plugin"];
    let view: DailyNotesStreamView;
    let state: StreamState;

    beforeEach(async () => {
        ({ view, plugin, state } = await makeViewSetup());
    });

    /** A block in the stream for `path`, as a loaded batch leaves it. */
    function trackBlock(path: string): HTMLElement {
        const el = document.createElement("div");
        (view as any).stream.blocks.append(path, el);
        return el;
    }

    // -----------------------------------------------------------------------
    // onFileCreate
    //
    // insertSorted() is the single source of truth: it both updates the
    // service's cache (keeping it aligned with the loaded range) and reports where the
    // file lands in the full sorted order. The view only renders/tracks it
    // locally when that position falls within the currently loaded range.
    // -----------------------------------------------------------------------
    describe("onFileCreate", () => {
        it("does nothing for a non-TFile argument", () => {
            expect(() => (view as any).stream.onFileCreate({ path: "not-a-tfile" } as any)).not.toThrow();
            expect(plugin.service.insertSorted).not.toHaveBeenCalled();
        });

        it("ignores files that are not daily notes (insertSorted returns -1)", async () => {
            plugin.service.insertSorted = vi.fn().mockReturnValue(-1);
            const file = new TFile("Notes/Template.md");

            (view as any).stream.onFileCreate(file);
            await flushPromises();

            expect(state.length).toBe(0);
            expect((view as any).stream.window.add).not.toHaveBeenCalled();
        });

        it("renders and inserts the note at its global index when within the loaded range", async () => {
            state.reset([new TFile("Notes/2025-01-04.md"), new TFile("Notes/2025-01-03.md")]);
            plugin.service.insertSorted = vi.fn().mockReturnValue(0);
            const file = new TFile("Notes/2025-01-05.md");

            (view as any).stream.onFileCreate(file);
            await flushPromises();

            expect(plugin.service.insertSorted).toHaveBeenCalledWith(file);
            expect((view as any).stream.window.add).toHaveBeenCalledWith(file);
            expect(state.notes[0]).toBe(file);
            expect(state.length).toBe(3);
        });

        it("updates the cache but does not render when the global index is beyond the loaded range", async () => {
            state.reset([new TFile("Notes/2025-01-04.md"), new TFile("Notes/2025-01-03.md")]);
            plugin.service.insertSorted = vi.fn().mockReturnValue(2);
            const file = new TFile("Notes/2025-01-01.md");

            (view as any).stream.onFileCreate(file);
            await flushPromises();

            expect((view as any).stream.window.add).not.toHaveBeenCalled();
            expect(state.length).toBe(2);
        });

        it("rechecks the sentinel when the note lands beyond the loaded range", async () => {
            state.reset([new TFile("Notes/2025-01-04.md"), new TFile("Notes/2025-01-03.md")]);
            plugin.service.insertSorted = vi.fn().mockReturnValue(2);

            (view as any).stream.onFileCreate(new TFile("Notes/2025-01-01.md"));
            await flushPromises();

            expect((view as any).stream.scroll.recheck).toHaveBeenCalledOnce();
        });

        it("derives the loaded range from state.length, so the next batch starts after the insert", async () => {
            state.reset([new TFile("Notes/2025-01-04.md"), new TFile("Notes/2025-01-03.md")]);
            plugin.service.insertSorted = vi.fn().mockReturnValue(0);

            (view as any).stream.onFileCreate(new TFile("Notes/2025-01-05.md"));
            await flushPromises();

            expect(state.length).toBe(3);
            await (view as any).stream.loadMoreNotes();
            expect(plugin.service.getBatch).toHaveBeenCalledWith(3, 10);
        });

        it("inserts two rapidly created notes in order, each seeing the previous insert", async () => {
            const existing = new TFile("Notes/2025-01-01.md");
            state.reset([existing]);
            const newer = new TFile("Notes/2025-01-03.md");
            const middle = new TFile("Notes/2025-01-02.md");
            plugin.service.insertSorted = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(1);

            (view as any).stream.onFileCreate(newer);
            (view as any).stream.onFileCreate(middle);
            await flushPromises();

            expect(state.notes).toEqual([newer, middle, existing]);
        });

        it("rechecks the sentinel for the first note created into an empty stream", async () => {
            plugin.service.insertSorted = vi.fn().mockReturnValue(0);

            (view as any).stream.onFileCreate(new TFile("Notes/2025-01-01.md"));
            await flushPromises();

            expect((view as any).stream.window.add).not.toHaveBeenCalled();
            expect((view as any).stream.scroll.recheck).toHaveBeenCalledOnce();
        });

        it("onFileCreate logs error when the placeholder cannot be built", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            state.reset([new TFile("Notes/2025-01-04.md")]);
            plugin.service.insertSorted = vi.fn().mockReturnValue(0);
            (view as any).stream.window.add = vi.fn(() => {
                throw new Error("create failed");
            });

            (view as any).stream.onFileCreate(new TFile("Notes/2025-01-05.md"));
            await flushPromises();

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    // -----------------------------------------------------------------------
    // onFileDelete
    //
    // removeSorted() reports the file's previous global index — used both to
    // keep the cache aligned and to decide whether the file was
    // currently rendered (global index within the loaded range).
    // -----------------------------------------------------------------------
    describe("onFileDelete", () => {
        it("does nothing for a non-TFile argument", () => {
            expect(() => (view as any).stream.onFileDelete({ path: "not-a-tfile" } as any)).not.toThrow();
            expect(plugin.service.removeSorted).not.toHaveBeenCalled();
        });

        it("removes from state and DOM when within the loaded range", async () => {
            const note = new TFile("Notes/2025-01-01.md");
            state.reset([note]);
            plugin.service.removeSorted = vi.fn().mockReturnValue(0);
            const el = trackBlock(note.path);

            (view as any).stream.onFileDelete(note);
            await flushPromises();

            expect(plugin.service.removeSorted).toHaveBeenCalledWith(note.path);
            expect(el.isConnected).toBe(false);
            expect(state.length).toBe(0);
        });

        it("removes the DOM element without touching state when beyond the loaded range", async () => {
            plugin.service.removeSorted = vi.fn().mockReturnValue(3);
            const note = new TFile("Notes/2025-01-10.md");
            const el = trackBlock(note.path);

            (view as any).stream.onFileDelete(note);
            await flushPromises();

            expect(el.isConnected).toBe(false);
            expect(state.length).toBe(0);
        });

        it("shows the empty state when the vault's last daily note is deleted", async () => {
            const note = new TFile("Notes/2025-01-01.md");
            state.reset([note]);
            plugin.service.removeSorted = vi.fn().mockReturnValue(0);
            const container = document.createElement("div");
            (view as any).stream.blocks.attach(container);

            (view as any).stream.onFileDelete(note);
            await flushPromises();

            expect(container.querySelector(".daily-notes-empty-state")).not.toBeNull();
        });

        it("shows no empty state while other daily notes remain", async () => {
            const note = new TFile("Notes/2025-01-01.md");
            state.reset([note, new TFile("Notes/2024-12-31.md")]);
            plugin.service.removeSorted = vi.fn().mockReturnValue(0);
            plugin.service.length = 1;
            const container = document.createElement("div");
            (view as any).stream.blocks.attach(container);

            (view as any).stream.onFileDelete(note);
            await flushPromises();

            expect(container.querySelector(".daily-notes-empty-state")).toBeNull();
        });

        it("clears collapse state for the file's path regardless of whether it was cached", async () => {
            plugin.service.removeSorted = vi.fn().mockReturnValue(-1);
            const note = new TFile("Notes/nonexistent.md");
            const clearSpy = vi.spyOn(plugin.collapseStore, "clearForFile");

            (view as any).stream.onFileDelete(note);
            await flushPromises();

            expect(clearSpy).toHaveBeenCalledWith(note.path);
        });
    });

    // -----------------------------------------------------------------------
    // onFileRename
    //
    // Obsidian mutates the TFile in place on rename, so `file.path` is already
    // the new path by the time the handler runs — but the rendered DOM element's
    // data-source-path was set to the *old* path at render time. `oldPath` (the
    // event's second argument) is therefore needed to find/remove that element.
    // -----------------------------------------------------------------------
    describe("onFileRename", () => {
        it("does nothing for a non-TFile argument", () => {
            expect(() => (view as any).stream.onFileRename({ path: "x" } as any, "old.md")).not.toThrow();
        });

        it("looks up the old DOM element by oldPath, removes it from the cache by the new path, and re-creates", async () => {
            const file = new TFile("Notes/2025-01-05.md");
            plugin.service.removeSorted = vi.fn().mockReturnValue(-1);
            plugin.service.insertSorted = vi.fn().mockReturnValue(-1);
            const el = trackBlock("Notes/2025-01-01.md");

            (view as any).stream.onFileRename(file, "Notes/2025-01-01.md");
            await flushPromises();

            expect(el.isConnected).toBe(false);
            expect(plugin.service.removeSorted).toHaveBeenCalledWith(file.path);
            expect(plugin.service.insertSorted).toHaveBeenCalledWith(file);
        });

        it("re-inserts the renamed file at its new sorted position when within the loaded range", async () => {
            state.reset([new TFile("Notes/2025-01-02.md")]);
            plugin.service.removeSorted = vi.fn().mockReturnValue(-1);
            plugin.service.insertSorted = vi.fn().mockReturnValue(0);
            const file = new TFile("Notes/2025-01-05.md");
            (view as any).stream.onFileRename(file, "Notes/2025-01-01.md");
            await flushPromises();

            expect(state.notes[0]).toBe(file);
            expect(state.length).toBe(2);
        });

        it("migrates collapse state to the new path", async () => {
            const migrateSpy = vi.spyOn(plugin.collapseStore, "migrate");
            const file = new TFile("Notes/2025-01-05.md");

            (view as any).stream.onFileRename(file, "Notes/2025-01-01.md");
            await flushPromises();

            expect(migrateSpy).toHaveBeenCalledWith("Notes/2025-01-01.md", file.path);
        });

        it("always removes the old entry (by oldPath) and re-creates under the new path — regardless of whether either name is a valid daily note", async () => {
            const file = new TFile("Notes/Template.md");
            const removeSpy = vi.spyOn((view as any).stream, "removeNote");
            const createSpy = vi.spyOn((view as any).stream, "onFileCreate");

            (view as any).stream.onFileRename(file, "Notes/2025-01-01.md");
            await flushPromises();

            expect(removeSpy).toHaveBeenCalledWith(file, "Notes/2025-01-01.md");
            expect(createSpy).toHaveBeenCalledWith(file);
        });
    });

    describe("onFileModify — debounce", () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        function wireContainer(paths: string[]) {
            for (const path of paths) trackBlock(path);
        }

        it("renders nothing until the window elapses", () => {
            wireContainer(["Notes/2025-01-01.md"]);
            (view as any).stream.onFileModify(new TFile("Notes/2025-01-01.md"));
            vi.advanceTimersByTime(299);
            expect((view as any).stream.window.refresh).not.toHaveBeenCalled();
        });

        it("collapses a burst of saves into one re-render", async () => {
            wireContainer(["Notes/2025-01-01.md"]);
            const file = new TFile("Notes/2025-01-01.md");
            for (let i = 0; i < 5; i++) {
                (view as any).stream.onFileModify(file);
                vi.advanceTimersByTime(100);
            }
            vi.advanceTimersByTime(300);
            await vi.runAllTimersAsync();
            expect((view as any).stream.window.refresh).toHaveBeenCalledTimes(1);
        });

        it("re-renders every file touched during the window", async () => {
            wireContainer(["Notes/2025-01-01.md", "Notes/2025-01-02.md"]);
            (view as any).stream.onFileModify(new TFile("Notes/2025-01-01.md"));
            (view as any).stream.onFileModify(new TFile("Notes/2025-01-02.md"));
            vi.advanceTimersByTime(300);
            await vi.runAllTimersAsync();
            expect((view as any).stream.window.refresh).toHaveBeenCalledTimes(2);
        });

        it("drops a pending re-render when the view closes", async () => {
            wireContainer(["Notes/2025-01-01.md"]);
            (view as any).stream.onFileModify(new TFile("Notes/2025-01-01.md"));
            await view.onClose();
            vi.advanceTimersByTime(300);
            await vi.runAllTimersAsync();
            expect((view as any).stream.window.refresh).not.toHaveBeenCalled();
        });
    });

    describe("onFileModify", () => {
        it("does nothing for a non-TFile argument", () => {
            expect(() => (view as any).stream.onFileModify({ path: "not-a-tfile" } as any)).not.toThrow();
            expect((view as any).stream.window.refresh).not.toHaveBeenCalled();
        });

        it("does nothing when the note element is not in the DOM", async () => {
            (view as any).stream.onFileModify(new TFile("Notes/2025-01-01.md"));
            (view as any).stream.flushModified.run();
            await flushPromises();
            expect((view as any).stream.window.refresh).not.toHaveBeenCalled();
        });

        // The block stays: only its content is rebuilt, so the path stays
        // resolvable and an unloaded note is left for its re-entry to render.
        it("refreshes the note's own block rather than replacing it", async () => {
            const file = new TFile("Notes/2025-01-01.md");
            const existingEl = trackBlock(file.path);

            (view as any).stream.onFileModify(file);
            (view as any).stream.flushModified.run();
            await flushPromises();

            expect((view as any).stream.window.refresh).toHaveBeenCalledWith(existingEl);
            expect((view as any).stream.blocks.el.contains(existingEl)).toBe(true);
        });

        it("onFileModify logs error when the re-render rejects", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            trackBlock("Notes/2025-01-01.md");
            (view as any).stream.window.refresh = vi.fn().mockRejectedValue(new Error("render failed"));

            (view as any).stream.onFileModify(new TFile("Notes/2025-01-01.md"));
            (view as any).stream.flushModified.run();
            await flushPromises();

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe("event registration", () => {
        /** Opens a view whose vault and metadataCache capture the callbacks registered with them. */
        async function makeWiredView() {
            const callbacks: Record<string, (file: any, oldPath?: any) => void> = {};
            const capturing = () =>
                vi.fn((event: string, cb: (file: any, oldPath?: any) => void) => {
                    callbacks[event] = cb;
                    return {};
                });
            const app = makeApp();
            const vault = { ...app.vault, on: capturing() };
            const { view } = await makeViewSetup({
                ...app,
                vault,
                metadataCache: { ...app.metadataCache, on: capturing() },
            });
            return { view, callbacks, vault };
        }

        it("metadataCache 'changed' callback delegates to onFileModify", async () => {
            const { view, callbacks } = await makeWiredView();
            const spy = vi.spyOn((view as any).stream, "onFileModify");
            const file = new TFile("Notes/2025-01-01.md");
            callbacks["changed"]?.(file);
            expect(spy).toHaveBeenCalledWith(file);
        });

        // vault 'modify' fires before metadataCache catches up, so re-rendering on
        // it strips frontmatter at a stale offset.
        it("does not re-render on vault 'modify'", async () => {
            const { vault } = await makeWiredView();
            const events = vault.on.mock.calls.map(([event]) => event);
            expect(events).not.toContain("modify");
        });

        it("vault 'create' callback delegates to onFileCreate", async () => {
            const { view, callbacks } = await makeWiredView();
            const spy = vi.spyOn((view as any).stream, "onFileCreate");
            const file = new TFile("Notes/2025-01-01.md");
            callbacks["create"]?.(file);
            expect(spy).toHaveBeenCalledWith(file);
        });

        it("vault 'delete' callback delegates to onFileDelete", async () => {
            const { view, callbacks } = await makeWiredView();
            const spy = vi.spyOn((view as any).stream, "onFileDelete");
            const file = new TFile("Notes/2025-01-01.md");
            callbacks["delete"]?.(file);
            expect(spy).toHaveBeenCalledWith(file);
        });

        it("vault 'rename' callback delegates to onFileRename with the old path", async () => {
            const { view, callbacks } = await makeWiredView();
            const spy = vi.spyOn((view as any).stream, "onFileRename");
            const file = new TFile("Notes/2025-01-01.md");
            callbacks["rename"]?.(file, "Notes/old-name.md");
            expect(spy).toHaveBeenCalledWith(file, "Notes/old-name.md");
        });
    });
});
