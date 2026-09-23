import { describe, it, expect, beforeEach, vi } from "vitest";
import { DailyNotesStreamView } from "../src/DailyNotesStreamView";
import { Notice, TFile, moment } from "./mocks/obsidian";
import { JumpToDateModal } from "../src/JumpToDateModal";
import { makePlugin, makeViewSetup } from "./streamViewFixture";

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
        (view as any).stream.blocks.attach(document.createElement("div"));
        // jsdom lays nothing out: every block lands at the pane's top at once.
        (view as any).stream.scrollRoot = document.createElement("div");
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
