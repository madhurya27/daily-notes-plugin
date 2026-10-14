import { test, expect } from "./phone";
import { longNote } from "../long-note";

const STREAM = ".daily-notes-stream-container";

// A blank screen shows only in a capture (scripts/capture-iphone.swift): this
// checks what makes one, a hidden run's spacer reaching the screen (ADR 0021).
test("flicks down a long note and back show no hidden run's spacer on screen", async ({ phone }) => {
    test.setTimeout(300_000);
    const path = await phone.run(() => `Journal/${new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA")}.md`);
    const original = await phone.runAsync(async (p: string) => {
        const file = window.app.vault.getFileByPath(p);
        return file ? window.app.vault.read(file) : null;
    }, path);
    try {
        await phone.runAsync(
            async (p: string, text: string) => {
                const { vault } = window.app;
                const file = vault.getFileByPath(p);
                await (file ? vault.modify(file, text) : vault.create(p, text));
            },
            path,
            longNote(5000)
        );
        await phone.openStream();
        await phone.jumpTo(path.slice(8, 18));
        await expect
            .poll(() => phone.run(() => document.querySelectorAll(".daily-note-far-run").length), { timeout: 60_000 })
            .toBeGreaterThan(0);

        await phone.run(
            (s: string, p: string) => {
                const w = window as unknown as { spacerFrames: number; frames: number };
                w.spacerFrames = 0;
                w.frames = 0;
                const pane = document.querySelector(s)!.parentElement!;
                const frame = () => {
                    w.frames++;
                    const { top, bottom } = pane.getBoundingClientRect();
                    const spacers = document.querySelectorAll(`[data-source-path="${p}"] .daily-note-far-run`);
                    for (const spacer of spacers) {
                        const rect = spacer.getBoundingClientRect();
                        if (rect.bottom > top && rect.top < bottom) {
                            w.spacerFrames++;
                            break;
                        }
                    }
                    requestAnimationFrame(frame);
                };
                requestAnimationFrame(frame);
            },
            STREAM,
            path
        );
        await phone.flick("up", 8);
        await phone.flick("down", 8);

        const { spacerFrames, frames } = await phone.run(() => {
            const { spacerFrames, frames } = window as unknown as { spacerFrames: number; frames: number };
            return { spacerFrames, frames };
        });
        expect(frames).toBeGreaterThan(100);
        expect(spacerFrames, "frames with a spacer on screen").toBe(0);
    } finally {
        await phone.runAsync(
            async (p: string, text: string | null) => {
                const file = window.app.vault.getFileByPath(p);
                if (!file) return;
                if (text === null) await window.app.vault.delete(file);
                else await window.app.vault.modify(file, text);
            },
            path,
            original
        );
    }
});
