import { describe, it, expect, beforeEach, vi } from "vitest";
import { DailyNotesStreamView } from "../src/ui/stream-view";
import { Notice, TFile, moment } from "./mocks/obsidian";
import { JumpToDateModal } from "../src/ui/jump-to-date-modal";
import { makePlugin, makeViewSetup } from "./stream-view-fixture";

/** 30 notes, newest first, one per day back from 2025-01-30. */
function makeNotes(): TFile[] {
    return Array.from({ length: 30 }, (_, i) => new TFile(`Notes/2025-01-${String(30 - i).padStart(2, "0")}.md`));
}

describe("DailyNotesStreamView — jumpToDate", () => {
    let view: DailyNotesStreamView;
    let plugin: ReturnType<typeof makePlugin>;
    let notes: TFile[];

    beforeEach(async () => {
        Notice.reset();
        ({ view, plugin } = await makeViewSetup());
        // jsdom lays nothing out: every block lands at the pane's top at once.
        HTMLElement.prototype.scrollIntoView = vi.fn();
        notes = makeNotes();
        plugin.service.getBatch = vi.fn((offset: number, limit: number) => notes.slice(offset, offset + limit));
    });

    const jump = (date: string) => (view as any).stream.jumpToDate(moment(date, "YYYY-MM-DD", true));

    it("notices and loads nothing when no note is on or before the date", async () => {
        plugin.service.indexForDate = vi.fn().mockReturnValue(-1);

        await jump("2024-01-01");

        expect(Notice.shown).toEqual(["No daily note on or before that date."]);
        expect(plugin.service.getBatch).not.toHaveBeenCalled();
    });

    it("loads just enough batches to reach the target note", async () => {
        plugin.service.indexForDate = vi.fn().mockReturnValue(24);

        await jump("2025-01-06");

        // 24 is the 25th note: three batches of ten.
        expect(plugin.service.getBatch).toHaveBeenCalledTimes(3);
        expect((view as any).stream.state.length).toBe(30);
    });

    it("loads no batch when the target note is already on screen", async () => {
        await (view as any).stream.loadMoreNotes();
        plugin.service.getBatch = vi.fn();
        plugin.service.indexForDate = vi.fn().mockReturnValue(3);

        await jump("2025-01-27");

        expect(plugin.service.getBatch).not.toHaveBeenCalled();
    });

    /** A block whose top follows `tops`, holding the last value afterwards. */
    function blockMoving(tops: number[]) {
        const block = document.createElement("div");
        block.scrollIntoView = vi.fn();
        let pass = 0;
        block.getBoundingClientRect = vi.fn(() => ({ top: tops[Math.min(pass++, tops.length - 1)] }) as DOMRect);
        // The pane's own top, which the block is scrolled onto.
        (view as any).contentEl.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
        return block;
    }

    /** Targets index 12, and hands `block` back for it. */
    function targeting(block: HTMLElement) {
        plugin.service.indexForDate = vi.fn().mockReturnValue(12);
        (view as any).stream.blocks.get = vi.fn((path: string) => (path === notes[12]!.path ? block : null));
    }

    it("scrolls the target note to the top of the view", async () => {
        const block = blockMoving([0]);
        targeting(block);

        await jump("2025-01-18");

        expect(block.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    });

    it("scrolls nowhere when the target's block is gone", async () => {
        plugin.service.indexForDate = vi.fn().mockReturnValue(3);
        (view as any).stream.blocks.get = vi.fn().mockReturnValue(null);

        await jump("2025-01-27");

        expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    it("stops loading when the stream runs out before the target index", async () => {
        // A cache that shrank under us: the index can no longer be reached.
        plugin.service.indexForDate = vi.fn().mockReturnValue(99);

        await jump("2025-01-01");

        expect(plugin.service.getBatch).toHaveBeenCalledTimes(4);
        expect(Notice.shown).toEqual(["No daily note on or before that date."]);
    });
});

describe("DailyNotesStreamView — the jump action", () => {
    it("carries the date the modal returns into a jump", async () => {
        const { view } = await makeViewSetup();
        const jump = vi.spyOn((view as any).stream, "jumpToDate").mockResolvedValue(undefined);
        const opened: JumpToDateModal[] = [];
        vi.spyOn(JumpToDateModal.prototype, "open").mockImplementation(function (this: JumpToDateModal) {
            opened.push(this);
        });

        const action = (view as any).actions.find((a: { title: string }) => a.title === "Jump to date");
        action.callback();
        (opened[0] as any).onSubmit(moment("2025-01-05", "YYYY-MM-DD", true));

        expect(jump).toHaveBeenCalledOnce();
        expect(jump.mock.calls[0]![0].format("YYYY-MM-DD")).toBe("2025-01-05");
    });
});

describe("NoteStream — what a search moves through", () => {
    let view: DailyNotesStreamView;
    let plugin: ReturnType<typeof makePlugin>;
    let notes: TFile[];

    beforeEach(async () => {
        ({ view, plugin } = await makeViewSetup());
        notes = makeNotes();
        plugin.service.getBatch = vi.fn((offset: number, limit: number) => notes.slice(offset, offset + limit));
        plugin.service.indexOf = vi.fn((path: string) => notes.findIndex((n) => n.path === path));
    });

    const stream = () => (view as any).stream;

    it("loads a note past the loaded range and scrolls it to the top", async () => {
        const block = document.createElement("div");
        block.scrollIntoView = vi.fn();
        stream().blocks.get = vi.fn((path: string) => (path === notes[24]!.path ? block : null));

        expect(await stream().reveal(notes[24])).toBe(block);
        expect(stream().state.length).toBe(30);
        expect(block.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    });

    // A search reads the note's highlights the moment it arrives; the window
    // manager's own render can land a frame after the scroll settles.
    it("renders the note before handing it back", async () => {
        const block = document.createElement("div");
        stream().blocks.get = vi.fn(() => block);
        let rendered = false;
        stream().window.render = vi.fn(() => void stream().enqueue(async () => void (rendered = true)));

        await stream().reveal(notes[3]);

        expect(stream().window.render).toHaveBeenCalledWith(block);
        expect(rendered).toBe(true);
    });

    it("centres an element and keeps it there while the stream renders", async () => {
        const el = document.createElement("span");
        el.scrollIntoView = vi.fn();

        await stream().centre(el);

        expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    });

    it("reveals nothing for a note no longer in the vault", async () => {
        expect(await stream().reveal(new TFile("Notes/2024-06-01.md"))).toBeNull();
        expect(plugin.service.getBatch).not.toHaveBeenCalled();
    });

    it("hands back a loaded note's block, and none for one not loaded", async () => {
        await stream().loadMoreNotes();

        expect(stream().blockOf(notes[0])).toBe(stream().blocks.get(notes[0]!.path));
        expect(stream().blockOf(notes[20])).toBeNull();
    });

    it("names the first note whose block reaches into the pane", async () => {
        await stream().loadMoreNotes();
        const rect = (top: number, bottom: number) => ({ top, bottom }) as DOMRect;
        stream().scrollRoot.getBoundingClientRect = () => rect(0, 800);
        stream().blocks.get(notes[0]!.path).getBoundingClientRect = () => rect(-900, -10);
        stream().blocks.get(notes[1]!.path).getBoundingClientRect = () => rect(-10, 390);

        expect(stream().firstVisibleNote()).toBe(notes[1]);
    });

    it("names no note in an empty stream", () => {
        expect(stream().firstVisibleNote()).toBeNull();
    });
});
