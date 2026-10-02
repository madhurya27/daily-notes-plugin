import { test, expect } from "./phone";

test("flicks reach the oldest note, each note once, newest first", async ({ phone }) => {
    await phone.openStream();
    const total = await phone.run(
        () => window.app.workspace.getLeavesOfType("daily-notes-stream-view")[0].view.service.length
    );

    for (let flicks = 0; flicks < 100 && !(await phone.atEnd()); flicks++) await phone.flick("up", 3);

    const paths = await phone.run(() =>
        [...document.querySelectorAll<HTMLElement>(".daily-note-block")].map((block) => block.dataset.sourcePath!)
    );
    expect(paths).toHaveLength(total);
    expect(new Set(paths).size).toBe(total);
    expect(paths).toEqual([...paths].sort().reverse());
});

// Each flick starts on the newest notes, which hold what once stopped a
// glide dead within 0.4 s (STALLERS in vault.ts).
test("flicks from the top glide on", async ({ phone }) => {
    for (const flick of [1, 2, 3]) {
        await phone.openStream();
        expect(await phone.glidesPast("up", 500), `flick ${flick}`).toBe(true);
    }
});

for (const [what, target, depth] of [
    ["text", ".daily-note-content > p", -20],
    // A Base redraws on each turn, as cards or a table.
    ["a Base", ".daily-note-base", 300],
] as const)
    test(`a turn and back leaves what was in view, with ${what} at the top`, async ({ phone }) => {
        await phone.openStream();
        await phone.placeAt(target, depth);
        const seen = await phone.seen();

        await phone.turn("LANDSCAPE");
        await phone.turn("PORTRAIT");

        // As e2e/turn.spec.ts allows: a pixel's rounding is not a jump.
        const now = await phone.topOf(seen);
        expect(Math.abs(now - seen.top), `"${seen.text}" moved from ${seen.top} to ${now}`).toBeLessThan(5);
    });
