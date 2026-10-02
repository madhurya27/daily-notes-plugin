import { test, expect } from "./phone";

const HEADER = '.workspace-leaf-content[data-type="daily-notes-stream-view"] .view-header';
/** The oldest note: every note between it and the top was never drawn. */
const OLDEST = "2026-09-10";

test("a tap on the title glides to the newest note and holds it at the very top", async ({ phone }) => {
    await phone.openStream();
    const top = await phone.newestOffset();
    await phone.jumpTo(OLDEST);

    await phone.tap(`${HEADER} .view-header-title`);
    await phone.rest();

    expect(await phone.scrollTop()).toBe(0);
    expect(await phone.newestOffset()).toBe(top);
});

/** Each action, and the input that shows it opened. */
for (const [action, opened] of [
    ["Search", ".daily-notes-search:not(.is-closed) input"],
    ["Jump to date", ".prompt input"],
] as const)
    test(`a tap on ${action} leaves the scroll alone`, async ({ phone }) => {
        await phone.openStream();
        await phone.jumpTo(OLDEST);
        const before = await phone.scrollTop();

        await phone.tap(`${HEADER} .view-action[aria-label="${action}"]`);
        await expect.poll(() => phone.has(opened), `${action} did not open`).toBe(true);
        await phone.rest();

        // As the turn checks allow: a pixel's rounding is not a jump.
        expect(Math.abs((await phone.scrollTop()) - before)).toBeLessThan(5);
        await phone.escape(opened);
        await expect.poll(() => phone.has(opened)).toBe(false);
    });
