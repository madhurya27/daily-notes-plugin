import { test, expect } from "./phone";
import { longNote } from "../long-note";

// Every test fails on an error in Obsidian's console; these prove the check
// fails, one for each way an error reaches it.
for (const [how, cause] of [
    ["logged", () => console.error("A logged error")],
    [
        "thrown",
        () =>
            void setTimeout(() => {
                throw new Error("A thrown error");
            }),
    ],
    ["rejected", () => void Promise.reject(new Error("A rejected promise"))],
] as const)
    test(`an error ${how} on the phone fails the test`, async ({ phone }) => {
        test.fail();
        await phone.run(cause);
    });

// The status bar's clock ticks: in a shot, two shots of a still screen differ.
test("a screenshot leaves out the status bar", async ({ phone }) => {
    const shot = Buffer.from(await phone.screenshot(), "base64");
    const screen = await phone.run(() => window.innerHeight * window.devicePixelRatio);

    expect(shot.readUInt32BE(20), "the shot's height, in pixels").toBeLessThan(screen);
});

// Written to the top, the scroll left the anchor holding a place from below: a
// long newest note drew from its end and landed some 250,000 px down.
test("a stream opened from deep in it is at its top, over a long newest note", async ({ phone }) => {
    const path = await phone.journalPath(0);
    const original = await phone.writeNote(path, longNote(10000));
    try {
        await phone.openStream();
        await phone.jumpTo("2026-09-10");

        await phone.openStream();

        expect(await phone.scrollTop()).toBe(0);
        expect(await phone.newestOffset()).toBeGreaterThan(0);
    } finally {
        await phone.restoreNote(path, original);
    }
});
