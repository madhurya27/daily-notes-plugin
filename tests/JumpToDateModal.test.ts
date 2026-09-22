import { describe, it, expect, beforeEach, vi } from "vitest";
import { JumpToDateModal } from "../src/JumpToDateModal";
import { makeApp } from "./streamViewFixture";

describe("JumpToDateModal", () => {
    let onSubmit: ReturnType<typeof vi.fn>;
    let modal: JumpToDateModal;

    const input = () => modal.contentEl.querySelector("input") as HTMLInputElement;
    const button = () => modal.contentEl.querySelector("button") as HTMLButtonElement;

    beforeEach(() => {
        onSubmit = vi.fn();
        modal = new JumpToDateModal(makeApp() as any, onSubmit);
        modal.close = vi.fn();
        modal.onOpen();
    });

    it("offers a date field", () => {
        expect(input().type).toBe("date");
    });

    it("submits the typed date and closes", () => {
        input().value = "2025-01-05";

        button().click();

        expect(onSubmit).toHaveBeenCalledOnce();
        expect(onSubmit.mock.calls[0]![0].format("YYYY-MM-DD")).toBe("2025-01-05");
        expect(modal.close).toHaveBeenCalled();
    });

    it("submits on Enter, so the field alone is enough", () => {
        input().value = "2025-01-05";

        modal.scope.press("Enter");

        expect(onSubmit).toHaveBeenCalledOnce();
    });

    it("empties its content on close, so a reopen starts clean", () => {
        modal.onClose();

        expect(modal.contentEl.childElementCount).toBe(0);
    });

    it("stays open on an empty field", () => {
        button().click();

        expect(onSubmit).not.toHaveBeenCalled();
        expect(modal.close).not.toHaveBeenCalled();
    });

    it("stays open on an unparseable date", () => {
        input().value = "not-a-date";

        button().click();

        expect(onSubmit).not.toHaveBeenCalled();
        expect(modal.close).not.toHaveBeenCalled();
    });
});
