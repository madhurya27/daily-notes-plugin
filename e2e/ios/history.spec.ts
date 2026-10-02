import { test, expect } from "./phone";
import { SHORT_NOTE, NOTE_AFTER_THE_BASE } from "./vault";

const inNote = (path: string, selector: string) => `.daily-note-block[data-source-path="${path}"] ${selector}`;

// iOS hands a returning view its place a frame after it draws, so the stream
// may show somewhere else first, then jump (e2e/history.spec.ts). Each case:
// where `placeAt` puts the pane's top, and what must then be at it.
for (const [what, target, depth, atTop] of [
    ["text", inNote(SHORT_NOTE, ".daily-note-content > p"), -20, ".daily-note-block"],
    // Bases fills a view after drawing it: the note shrinks, then grows back.
    // Near its end, so the next note's title is on screen to tap.
    ["a Base", inNote(NOTE_AFTER_THE_BASE, ".daily-note-title"), -400, ".daily-note-base"],
    // The tenth note ends the first batch: nothing below it is loaded on return.
    [
        "the end of a batch's last note",
        ".daily-note-block:nth-child(11 of .daily-note-block)",
        -300,
        ".daily-note-block:nth-child(10 of .daily-note-block)",
    ],
] as const)
    test(`Back from a note's title returns to the place left, with ${what} at the top, and holds it`, async ({
        phone,
    }) => {
        await phone.openStream();
        await phone.placeAt(target, depth);
        expect(await phone.atTop(atTop), `no ${atTop} at the top`).toBe(true);
        const left = await phone.place();

        await phone.tap(".daily-note-title");
        await expect.poll(() => phone.has(".daily-notes-stream-container"), "the note did not open").toBe(false);
        await phone.followPlaces();
        await phone.tap('[aria-label="Navigate back"]');

        const shown = await phone.places();
        expect(shown, "the stream never came back").not.toEqual([]);
        for (const { path, offset } of shown) {
            expect(path).toBe(left.path);
            // Rounded either side of a half pixel: not a jump.
            expect(Math.abs(offset - left.offset), `shown at ${offset}, left at ${left.offset}`).toBeLessThanOrEqual(1);
        }
    });
