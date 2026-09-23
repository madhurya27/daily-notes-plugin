import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import type { Moment } from "moment";
import { JumpToDateModal, JUMP_SUGGESTION_LIMIT } from "../src/ui/jump-to-date-modal";
import { DailyNoteService } from "../src/notes/daily-note-service";
import { __mockMarkdownFiles, __setMockNotes, __setMockSettings } from "obsidian-daily-notes-interface";
import { moment } from "obsidian";
import { asApp, makeApp } from "./stream-view-fixture";

describe("JumpToDateModal", () => {
    let onSubmit: Mock<(target: Moment) => void>;
    let modal: JumpToDateModal;

    /** Opens the suggester over a vault naming its notes `format`. */
    function open(format: string, basenames: string[]) {
        __setMockSettings({ format, folder: "Notes" });
        __setMockNotes(basenames.map((name) => `Notes/${name}.md`));
        const service = new DailyNoteService(__mockMarkdownFiles);
        service.initialize();
        modal = new JumpToDateModal(asApp(makeApp()), service, onSubmit);
        modal.close = vi.fn();
        modal.open();
    }

    const listed = () => [...modal.resultContainerEl.children].map((el) => el.textContent);
    const picker = () => modal.contentEl.querySelector<HTMLInputElement>('input[type="date"]');
    const calendarButton = () => modal.contentEl.querySelector("button");

    beforeEach(() => {
        onSubmit = vi.fn();
    });

    it("offers every date, newest first, as this vault names its notes", () => {
        open("DD-MM-YYYY", ["01-01-2025", "03-01-2025", "02-01-2025"]);

        expect(listed()).toEqual(["03-01-2025", "02-01-2025", "01-01-2025"]);
    });

    it("narrows to the dates the query appears in", () => {
        open("DD-MM-YYYY", ["01-01-2025", "03-02-2025", "02-01-2025"]);

        modal.type("-01-");

        expect(listed()).toEqual(["02-01-2025", "01-01-2025"]);
    });

    // The reader may reach for ISO whatever their filenames look like.
    it("narrows on an ISO query in a vault that names nothing that way", () => {
        open("DD-MM-YYYY", ["01-01-2025", "03-02-2025"]);

        modal.type("2025-02");

        expect(listed()).toEqual(["03-02-2025"]);
    });

    it("keeps the list to what a reader can scan", () => {
        open(
            "YYYY-MM-DD",
            Array.from({ length: JUMP_SUGGESTION_LIMIT + 10 }, (_, i) =>
                moment("2025-01-01", "YYYY-MM-DD", true).add(i, "days").format("YYYY-MM-DD")
            )
        );

        expect(listed()).toHaveLength(JUMP_SUGGESTION_LIMIT);
    });

    it("submits the date that was chosen", () => {
        open("DD-MM-YYYY", ["01-01-2025", "03-01-2025"]);

        modal.type("01-01");
        modal.choose();

        expect(onSubmit).toHaveBeenCalledOnce();
        expect(onSubmit.mock.calls[0]![0].format("YYYY-MM-DD")).toBe("2025-01-01");
    });

    // The silent nearest-older fallback is what the suggester retires: a date
    // with no note is still offered, but it says so first.
    describe("a date no note carries", () => {
        it("offers the jump as one entry, saying what it will do", () => {
            open("DD-MM-YYYY", ["01-01-2025"]);

            modal.type("05-01-2025");

            expect(listed()).toEqual(["05-01-2025 has no noteJump to the nearest older note"]);
        });

        it("reads the query in ISO too", () => {
            open("DD-MM-YYYY", ["01-01-2025"]);

            modal.type("2025-01-05");

            expect(listed()).toEqual(["05-01-2025 has no noteJump to the nearest older note"]);
        });

        it("hands the date over, leaving the fallback to the jump itself", () => {
            open("DD-MM-YYYY", ["01-01-2025"]);

            modal.type("05-01-2025");
            modal.choose();

            expect(onSubmit.mock.calls[0]![0].format("YYYY-MM-DD")).toBe("2025-01-05");
        });

        it("offers nothing on a query that is no date at all", () => {
            open("DD-MM-YYYY", ["01-01-2025"]);

            modal.type("not-a-date");

            expect(listed()).toEqual([]);
        });
    });

    describe("the calendar button", () => {
        afterEach(() => {
            delete (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker;
        });

        it("is left out where the platform has no picker to show", () => {
            open("YYYY-MM-DD", ["2025-01-01"]);

            expect(calendarButton()).toBeNull();
            expect(picker()).toBeNull();
        });

        it("writes the picked date into the query, in this vault's format", () => {
            const showPicker = vi.fn();
            (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker = showPicker;
            open("DD-MM-YYYY", ["01-01-2025", "03-01-2025"]);

            calendarButton()!.click();
            expect(showPicker).toHaveBeenCalledOnce();

            picker()!.value = "2025-01-03";
            picker()!.dispatchEvent(new Event("change"));

            expect(modal.inputEl.value).toBe("03-01-2025");
            expect(listed()).toEqual(["03-01-2025"]);
        });

        it("ignores a picker cleared rather than set", () => {
            (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker = vi.fn();
            open("DD-MM-YYYY", ["01-01-2025"]);

            picker()!.value = "";
            picker()!.dispatchEvent(new Event("change"));

            expect(modal.inputEl.value).toBe("");
        });
    });

    it("empties its content on close, so a reopen starts clean", () => {
        open("YYYY-MM-DD", ["2025-01-01"]);

        modal.onClose();

        expect(modal.contentEl.childElementCount).toBe(0);
    });
});
