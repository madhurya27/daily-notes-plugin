import { describe, it, expect, vi } from "vitest";
import { TFile } from "../mocks/obsidian";
import { makeApp, makeViewSetup } from "../stream-view-fixture";

// What each event does to the stream is note-stream.test.ts's; this is the wiring.
describe("DailyNotesStreamView — vault events", () => {
    /** Opens a view whose vault and metadataCache capture the callbacks registered with them. */
    async function makeWiredView() {
        const app = makeApp();
        const { view } = await makeViewSetup(app);
        const callbacks = Object.fromEntries([...app.vault.on.mock.calls, ...app.metadataCache.on.mock.calls]);
        return { view, callbacks, vault: app.vault };
    }

    it("metadataCache 'changed' callback delegates to onFileModify", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view["stream"], "onFileModify");
        const file = new TFile("Notes/2025-01-01.md");
        callbacks["changed"]?.(file);
        expect(spy).toHaveBeenCalledWith(file);
    });

    // vault 'modify' fires before metadataCache catches up, so re-rendering on
    // it strips frontmatter at a stale offset.
    it("does not re-render a note on vault 'modify'", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view["stream"], "onFileModify");
        callbacks["modify"]?.(new TFile("Notes/2025-01-01.md"));
        expect(spy).not.toHaveBeenCalled();
    });

    // A Base has no metadata to wait for; its copies drawn as cards redraw.
    it("vault 'modify' callback hands the file to the renderer's Bases", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view["renderer"], "onBaseModified").mockResolvedValue();
        const file = new TFile("Bases/Views.base");
        callbacks["modify"]?.(file);
        expect(spy).toHaveBeenCalledWith(file);
    });

    it("vault 'create' callback delegates to onFileCreate", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view["stream"], "onFileCreate");
        const file = new TFile("Notes/2025-01-01.md");
        callbacks["create"]?.(file);
        expect(spy).toHaveBeenCalledWith(file);
    });

    it("vault 'delete' callback delegates to onFileDelete", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view["stream"], "onFileDelete");
        const file = new TFile("Notes/2025-01-01.md");
        callbacks["delete"]?.(file);
        expect(spy).toHaveBeenCalledWith(file);
    });

    it("vault 'rename' callback delegates to onFileRename with the old path", async () => {
        const { view, callbacks } = await makeWiredView();
        const spy = vi.spyOn(view["stream"], "onFileRename");
        const file = new TFile("Notes/2025-01-01.md");
        callbacks["rename"]?.(file, "Notes/old-name.md");
        expect(spy).toHaveBeenCalledWith(file, "Notes/old-name.md");
    });
});
