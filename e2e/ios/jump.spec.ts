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

type Frame = { at: number; top: number; shifted: boolean };

// Placeholders far too short leave the glide less scroll than lies above:
// it bounces at the top, owing the rest (ADR 0010). iOS undoes a write
// mid-bounce; once it ends, the room above is the reader's at once.
test("a glide that bounces at the top owing the notes above hands them over as the bounce ends", async ({ phone }) => {
    await phone.openStream();
    await phone.jumpTo("2026-09-12");
    await phone.shortenPlaceholders();
    await phone.run(() => {
        const stream = document.querySelector<HTMLElement>(
            ".daily-notes-stream-container:not(.daily-notes-stream-probe)"
        )!;
        const pane = stream.parentElement!;
        const frames: Frame[] = [];
        (window as unknown as { streamFrames: Frame[] }).streamFrames = frames;
        const frame = () => {
            const shifted = stream.style.getPropertyValue("--daily-notes-scroll-shift") !== "";
            frames.push({ at: performance.now(), top: pane.scrollTop, shifted });
            if (frames.length < 600) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    });

    await phone.flick("down");

    const frames = await phone.run(() => (window as unknown as { streamFrames: Frame[] }).streamFrames);
    // Its first frame back at the top, or past it: handed over in that frame, the scroll is far below.
    const bounced = frames.findIndex((f, i) => i > 0 && frames[i - 1]!.shifted && frames[i - 1]!.top < 0 && f.top >= 0);
    expect(bounced, "the glide bounced at the top, owing").toBeGreaterThan(0);
    const handed = frames.findIndex((f, i) => i >= bounced && !f.shifted);
    expect(frames[handed]!.at - frames[bounced]!.at).toBeLessThan(100);
});

// The picker is the platform's: desktop Chromium opens another one, so only
// the phone shows whether a tap on the calendar opens it and a pick comes back.
test("the calendar's picker fills the query, and a tap on it jumps there", async ({ phone }) => {
    await phone.openStream();
    await phone.tap('[aria-label="Jump to date"]');
    await phone.tap(".daily-notes-jump-calendar");

    await phone.pickDate("2026-09-12");

    await expect.poll(() => phone.inputValue(".prompt input.prompt-input")).toBe("2026-09-12");
    await phone.tap(".prompt .suggestion-item");
    await phone.rest();
    expect((await phone.place()).path).toBe("Journal/2026-09-12.md");
});
