import { test, expect } from "./phone";

// The notes above a jump's target were never drawn: each renders as a flick
// up reaches it, while iOS owns the scroll (ADR 0013).
test("a flick up from an old date glides on, the text under the thumb moving only with it", async ({ phone }) => {
    await phone.openStream();
    await phone.jumpTo("2026-09-12");
    await phone.shortenPlaceholders();
    await phone.followReader();

    expect(await phone.glidesPast("down", 500)).toBe(true);

    const { drifts, rendered } = await phone.stopFollowing();
    expect(rendered, "no note above rendered during the glide").toBeGreaterThan(0);
    expect(Math.max(...drifts.map(Math.abs)), `drifts: ${drifts.join(", ")}`).toBeLessThan(5);
});
