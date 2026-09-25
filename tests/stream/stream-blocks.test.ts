import { describe, it, expect, beforeEach, vi } from "vitest";
import { StreamBlocks } from "../../src/stream/stream-blocks";

describe("StreamBlocks", () => {
    let container: HTMLElement;
    let sentinel: HTMLElement | null;
    let blocks: StreamBlocks;

    beforeEach(() => {
        container = document.createElement("div");
        sentinel = null;
        blocks = new StreamBlocks(() => sentinel);
        blocks.attach(container);
    });

    /** Puts a sentinel last in the container, as the scroll controller does. */
    function addSentinel(): HTMLElement {
        sentinel = container.appendChild(document.createElement("div"));
        return sentinel;
    }

    const block = () => document.createElement("div");

    describe("get", () => {
        // A per-lookup querySelector made captureAnchor O(n^2) across a
        // refresh, and the window manager adds another hot caller.
        it("resolves a block through the index, not a DOM query", () => {
            const querySelector = vi.spyOn(container, "querySelector");
            const el = block();
            blocks.append("Notes/2025-01-01.md", el);

            expect(blocks.get("Notes/2025-01-01.md")).toBe(el);
            expect(querySelector).not.toHaveBeenCalled();
        });

        it("matches paths containing CSS selector metacharacters", () => {
            const path = 'Notes/2025-01-01 [a\\b"c].md';
            const el = block();
            blocks.append(path, el);
            expect(blocks.get(path)).toBe(el);
        });

        it("returns null for a note that is not loaded", () => {
            expect(blocks.get("Notes/2025-01-01.md")).toBeNull();
        });
    });

    describe("append", () => {
        it("appends to the container when there is no sentinel", () => {
            const el = block();
            blocks.append("a", el);
            expect(container.lastChild).toBe(el);
        });

        it("keeps the sentinel last", () => {
            const s = addSentinel();
            const el = block();
            blocks.append("a", el);
            expect([...container.children]).toEqual([el, s]);
        });
    });

    describe("insertBefore", () => {
        it("lands ahead of the next note's block", () => {
            const next = block();
            blocks.append("next", next);
            const el = block();

            blocks.insertBefore("new", el, "next");

            expect([...container.children]).toEqual([el, next]);
            expect(blocks.get("new")).toBe(el);
        });

        it("lands before the sentinel when there is no next note", () => {
            const s = addSentinel();
            const el = block();
            blocks.insertBefore("new", el, undefined);
            expect([...container.children]).toEqual([el, s]);
        });

        it("lands before the sentinel when the next note has no block", () => {
            const s = addSentinel();
            const el = block();
            blocks.insertBefore("new", el, "unloaded");
            expect([...container.children]).toEqual([el, s]);
        });

        it("appends when there is neither a next block nor a sentinel", () => {
            const el = block();
            blocks.insertBefore("new", el, "unloaded");
            expect(container.lastChild).toBe(el);
        });
    });

    describe("remove", () => {
        it("takes the block out of the DOM and the index, and hands it back", () => {
            const el = block();
            blocks.append("a", el);

            expect(blocks.remove("a")).toBe(el);
            expect(container.contains(el)).toBe(false);
            expect(blocks.get("a")).toBeNull();
        });

        it("returns null for a path with no block", () => {
            expect(blocks.remove("missing")).toBeNull();
        });
    });

    it("clear forgets every block but leaves the DOM", () => {
        const el = block();
        blocks.append("a", el);

        blocks.clear();

        expect(blocks.get("a")).toBeNull();
        expect(container.contains(el)).toBe(true);
    });

    it("empty clears the container and the index", () => {
        blocks.append("a", block());

        blocks.empty();

        expect(container.children).toHaveLength(0);
        expect(blocks.get("a")).toBeNull();
    });

    it("lists every indexed block by path", () => {
        const a = block();
        const b = block();
        blocks.append("a", a);
        blocks.append("b", b);
        expect([...blocks.entries()]).toEqual([
            ["a", a],
            ["b", b],
        ]);
    });

    it("exposes the container it was attached to", () => {
        expect(blocks.el).toBe(container);
    });

    describe("empty state", () => {
        const emptyStates = () => container.querySelectorAll(".daily-notes-empty-state");

        it("shows one message before the sentinel", () => {
            const s = addSentinel();
            blocks.showEmptyState();
            expect(emptyStates()).toHaveLength(1);
            expect(container.lastChild).toBe(s);
        });

        it("never shows a second message", () => {
            blocks.showEmptyState();
            blocks.showEmptyState();
            expect(emptyStates()).toHaveLength(1);
        });

        it("hides the message", () => {
            blocks.showEmptyState();
            blocks.hideEmptyState();
            expect(emptyStates()).toHaveLength(0);
        });

        it("hiding without a message is a no-op", () => {
            expect(() => blocks.hideEmptyState()).not.toThrow();
        });
    });
});
