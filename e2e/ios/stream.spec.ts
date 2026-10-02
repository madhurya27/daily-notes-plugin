import { test, expect } from "./phone";

test("flicks reach the oldest note, each note once, newest first", async ({ phone }) => {
    await phone.openStream();
    const total = await phone.run(
        () => window.app.workspace.getLeavesOfType("daily-notes-stream-view")[0].view.service.length
    );

    for (let flicks = 0; flicks < 200 && !(await phone.atEnd()); flicks++) await phone.flick("up");

    const paths = await phone.run(() =>
        [...document.querySelectorAll<HTMLElement>(".daily-note-block")].map((block) => block.dataset.sourcePath!)
    );
    expect(paths).toHaveLength(total);
    expect(new Set(paths).size).toBe(total);
    expect(paths).toEqual([...paths].sort().reverse());
});

test("a turn and back keeps the note at the top in place", async ({ phone }) => {
    await phone.openStream();
    for (let i = 0; i < 4; i++) await phone.flick("up");
    const before = await phone.place();

    await phone.turn("LANDSCAPE");
    await phone.turn("PORTRAIT");

    // As e2e/turn.spec.ts allows: a pixel's rounding is not a jump.
    const after = await phone.place();
    expect(after.path).toBe(before.path);
    expect(Math.abs(after.top - before.top)).toBeLessThan(5);
});
