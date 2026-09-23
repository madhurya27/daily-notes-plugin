import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DailyNotesStreamView } from "../src/ui/stream-view";
import { Platform, TFile } from "./mocks/obsidian";
import { makeApp, makeViewSetup } from "./stream-view-fixture";

const NOTES = ["Notes/2025-01-03.md", "Notes/2025-01-02.md", "Notes/2025-01-01.md"].map((p) => new TFile(p));
const SOURCES: Record<string, string> = {
    "Notes/2025-01-03.md": "dentist",
    "Notes/2025-01-02.md": "nothing",
    "Notes/2025-01-01.md": "dentist again",
};

describe("DailyNotesStreamView — search", () => {
    let view: DailyNotesStreamView;
    let app: ReturnType<typeof makeApp> & { hotkeyManager?: unknown };

    beforeEach(async () => {
        vi.useFakeTimers();
        Platform.isMacOS = true;
        app = makeApp();
        app.vault.cachedRead = vi.fn((file: TFile) => Promise.resolve(SOURCES[file.path]!));
        const setup = await makeViewSetup(app);
        view = setup.view;
        setup.plugin.service.getBatch = vi.fn((offset: number, limit: number) => NOTES.slice(offset, offset + limit));
        setup.plugin.service.length = NOTES.length;
        document.body.appendChild(view.containerEl);
    });

    afterEach(() => {
        view.containerEl.remove();
        vi.useRealTimers();
    });

    const bar = () => view.containerEl.querySelector<HTMLElement>(".daily-notes-search")!;
    const input = () => bar().querySelector("input")!;
    const count = () => bar().querySelector(".document-search-count")!.textContent;
    /** What the view's scope does with a keydown, as Obsidian's keymap would ask it. */
    const press = (init: KeyboardEventInit) => {
        const handler = (view.scope as any).registered.find((h: any) => h.key === null && h.modifiers === null);
        return handler.callback(new KeyboardEvent("keydown", init), {});
    };
    /** Past every debounce, with the reads and the queue behind them drained. */
    const settle = () => vi.advanceTimersByTimeAsync(1000);

    it("sits above the scrolling notes, not inside them", () => {
        expect(bar().nextElementSibling).toBe(view.contentEl);
    });

    it("opens on Obsidian's search hotkey, and takes the key", () => {
        expect(press({ key: "f", metaKey: true })).toBe(false);

        expect(bar().hasClass("is-closed")).toBe(false);
        expect(document.activeElement).toBe(input());
    });

    it("leaves every other key to Obsidian", () => {
        expect(press({ key: "p", metaKey: true })).toBeUndefined();

        expect(bar().hasClass("is-closed")).toBe(true);
    });

    it("follows a rebind without reopening the view", () => {
        app.hotkeyManager = {
            getHotkeys: () => [{ modifiers: ["Mod", "Shift"], key: "S" }],
            getDefaultHotkeys: () => [{ modifiers: ["Mod"], key: "F" }],
        };

        expect(press({ key: "f", metaKey: true })).toBeUndefined();
        expect(press({ key: "S", metaKey: true, shiftKey: true })).toBe(false);
    });

    it("opens from the header, where a phone has no hotkey", () => {
        (view as any).actions.find((a: { title: string }) => a.title === "Search").callback();

        expect(bar().hasClass("is-closed")).toBe(false);
    });

    it("counts the matching notes as the query is typed", async () => {
        input().value = "dentist";
        input().dispatchEvent(new Event("input"));
        await settle();

        expect(count()).toBe("2 notes");
    });

    it("recounts after the vault changes under an open search", async () => {
        input().value = "dentist";
        input().dispatchEvent(new Event("input"));
        await settle();
        SOURCES["Notes/2025-01-02.md"] = "dentist";

        try {
            const changed = app.metadataCache.on.mock.calls.find(([name]) => name === "changed")![1];
            changed(NOTES[1]);
            await settle();

            expect(count()).toBe("3 notes");
        } finally {
            SOURCES["Notes/2025-01-02.md"] = "nothing";
        }
    });

    it.each(["create", "delete", "rename"])("recounts after a vault %s", async (event) => {
        input().value = "dentist";
        input().dispatchEvent(new Event("input"));
        await settle();
        NOTES.push(new TFile("Notes/2024-12-31.md"));
        SOURCES["Notes/2024-12-31.md"] = "dentist";

        try {
            (view as any).plugin.service.length = NOTES.length;
            const handler = app.vault.on.mock.calls.find(([name]) => name === event)![1];
            handler(NOTES[3], "old.md");
            await settle();

            expect(count()).toBe("3 notes");
        } finally {
            NOTES.pop();
        }
    });

    it("drops a recount still waiting when the view closes", async () => {
        input().value = "dentist";
        input().dispatchEvent(new Event("input"));
        await settle();
        const reads = app.vault.cachedRead.mock.calls.length;
        const changed = app.metadataCache.on.mock.calls.find(([name]) => name === "changed")![1];

        changed(NOTES[1]);
        await view.onClose();
        await settle();

        expect(app.vault.cachedRead.mock.calls.length).toBe(reads);
    });

    it("steps to the next matching note on Enter", async () => {
        const reveal = vi.spyOn((view as any).stream, "reveal").mockResolvedValue(null);
        input().value = "dentist";
        input().dispatchEvent(new Event("input"));

        // Before the typing pause: Enter searches first, then steps.
        input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        await settle();

        expect(reveal).toHaveBeenCalledWith(NOTES[0]);
        // The mocked reveal draws no block, so the match is hidden.
        expect(count()).toBe("1 / 2 · hidden");
    });

    it("steps back on the Previous button", async () => {
        const reveal = vi.spyOn((view as any).stream, "reveal").mockResolvedValue(null);
        input().value = "dentist";
        input().dispatchEvent(new Event("input"));
        await settle();

        bar().querySelector<HTMLElement>('[aria-label="Previous"]')!.click();
        await settle();

        expect(reveal).toHaveBeenCalledWith(NOTES[0]);
    });

    it("clears the count when closed", async () => {
        input().value = "dentist";
        input().dispatchEvent(new Event("input"));
        await settle();

        input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        await settle();

        expect(count()).toBe("");
    });
});
