import { describe, it, expect, vi } from "vitest";
import { moment } from "./mocks/obsidian";
import { JumpToDateModal } from "../src/ui/jump-to-date-modal";
import { makeViewSetup } from "./stream-view-fixture";

describe("DailyNotesStreamView — the jump action", () => {
    it("carries the date the modal returns into a jump", async () => {
        const { view, plugin } = await makeViewSetup();
        const opened: JumpToDateModal[] = [];
        vi.spyOn(JumpToDateModal.prototype, "open").mockImplementation(function (this: JumpToDateModal) {
            opened.push(this);
        });

        const action = (view as any).actions.find((a: { title: string }) => a.title === "Jump to date");
        action.callback();
        (opened[0] as any).onSubmit(moment("2025-01-05", "YYYY-MM-DD", true));

        expect(plugin.service.indexForDate).toHaveBeenCalledOnce();
        expect(plugin.service.indexForDate.mock.calls[0]![0].format("YYYY-MM-DD")).toBe("2025-01-05");
    });
});
