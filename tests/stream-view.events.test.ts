import { describe, it, expect, vi } from "vitest";
import { TFile } from "./mocks/obsidian";
import { makeApp, makeViewSetup } from "./stream-view-fixture";

// What each event does to the stream is note-stream.test.ts's; this is the wiring.
describe("DailyNotesStreamView — vault events", () => {
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
