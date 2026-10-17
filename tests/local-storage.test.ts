import { describe, it, expect, vi } from "vitest";
import { saveLoggingOnce } from "../src/local-storage";

describe("saveLoggingOnce", () => {
    it("runs every save, and logs only the first refused", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const save = saveLoggingOnce("the thing");
        const refused = vi.fn(() => {
            throw new DOMException("full", "QuotaExceededError");
        });

        save(refused);
        expect(error).toHaveBeenCalledOnce();
        expect(error.mock.calls[0]![0]).toBe("DailyNotesStream: Failed to save the thing");

        save(refused);
        expect(refused).toHaveBeenCalledTimes(2);
        expect(error).toHaveBeenCalledOnce();
        error.mockRestore();
    });

    it("logs nothing while saves succeed", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const kept = vi.fn();

        saveLoggingOnce("the thing")(kept);

        expect(kept).toHaveBeenCalledOnce();
        expect(error).not.toHaveBeenCalled();
        error.mockRestore();
    });
});
