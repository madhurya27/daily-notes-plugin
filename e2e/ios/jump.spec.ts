import { test, expect } from "./phone";

// The notes above a jump's target were never drawn: each renders as a flick
// up reaches it, while iOS owns the scroll (ADR 0013).
test("a flick up from an old date glides on, the text under the thumb moving only with it", async ({ phone }) => {
    await phone.openStream();
    await phone.jumpTo("2026-09-12");
    // Measured on an earlier run, a placeholder is exact and a render moves
    // nothing. Short, every note above grows as it renders: the case that jumped.
    await phone.run(() => {
        for (const block of document.querySelectorAll<HTMLElement>(".daily-note-block.is-unloaded"))
            block.style.setProperty("--daily-note-placeholder-height", "100px");
    });
    await phone.rest();
    await phone.followReader();

    expect(await phone.glidesPast("down", 500)).toBe(true);

    const { drifts, rendered } = await phone.stopFollowing();
    expect(rendered, "no note above rendered during the glide").toBeGreaterThan(0);
    expect(Math.max(...drifts.map(Math.abs)), `drifts: ${drifts.join(", ")}`).toBeLessThan(5);
});
