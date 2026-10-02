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

// The demo vault's fifth note is two screens long: 225 px in, text is at the
// pane's top; 749 px in, a Base, which redraws on each turn.
for (const [depth, top] of [
    [225, "text"],
    [749, "a Base"],
] as const)
    test(`a turn and back leaves what was in view, with ${top} at the top`, async ({ phone }) => {
        await phone.openStream();
        await phone.placeAt(4, depth);
        const seen = await phone.seen();

        await phone.turn("LANDSCAPE");
        await phone.turn("PORTRAIT");

        // As e2e/turn.spec.ts allows: a pixel's rounding is not a jump.
        const now = await phone.topOf(seen);
        expect(Math.abs(now - seen.top), `"${seen.text}" moved from ${seen.top} to ${now}`).toBeLessThan(5);
    });
