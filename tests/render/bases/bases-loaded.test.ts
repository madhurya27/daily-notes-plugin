import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASES_LOAD_LIMIT_MS, basesLoaded } from "../../../src/render/bases/bases-loaded";
import { BASE_SLOT_CLASS } from "../../../src/render/bases/bases-as-cards";

/** A frame, at the fake clock's 60 fps. */
const FRAME_MS = 16;

describe("basesLoaded", () => {
    let note: HTMLElement;
    let loaded: boolean;

    /** A Base as Bases first draws it: its query not yet run. */
    function loadingBase(): HTMLElement {
        return note.createDiv({ cls: BASE_SLOT_CLASS }).createDiv({ cls: "bases-cards-container is-loading" });
    }

    function waitForBases(): void {
        loaded = false;
        void basesLoaded(note).then(() => (loaded = true));
    }

    beforeEach(() => {
        vi.useFakeTimers();
        note = document.body.createDiv();
    });
    afterEach(() => {
        note.remove();
        vi.useRealTimers();
    });

    it("resolves at once for a note with no Base", async () => {
        note.createEl("p", { text: "Roast squash soup" });

        waitForBases();
        await vi.advanceTimersByTimeAsync(0);

        expect(loaded).toBe(true);
    });

    it("waits while a Base runs its query", async () => {
        loadingBase();

        waitForBases();
        await vi.advanceTimersByTimeAsync(10 * FRAME_MS);

        expect(loaded).toBe(false);
    });

    it("resolves a frame after the Base fills in", async () => {
        const view = loadingBase();
        waitForBases();

        view.removeClass("is-loading");
        await vi.advanceTimersByTimeAsync(FRAME_MS);

        expect(loaded).toBe(true);
    });

    // A table too wide for its note is redrawn as cards once it lays out.
    it("waits on for a Base redrawn within the frame", async () => {
        const view = loadingBase();
        waitForBases();

        view.removeClass("is-loading");
        await vi.advanceTimersByTimeAsync(0);
        view.addClass("is-loading");
        await vi.advanceTimersByTimeAsync(10 * FRAME_MS);

        expect(loaded).toBe(false);
    });

    it("gives up on a Base that never fills in", async () => {
        loadingBase();
        waitForBases();

        await vi.advanceTimersByTimeAsync(BASES_LOAD_LIMIT_MS);

        expect(loaded).toBe(true);
    });
});
