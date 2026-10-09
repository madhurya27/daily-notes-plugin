import { writeFileSync } from "fs";
import { join } from "path";
import { OUT } from "../demo";
import { test, expect, type Phone } from "./phone";
import { FRAMES, type Scene } from "./screen-capture";

/**
 * Records the README's animated WebP of the stream on a real iPhone, its
 * screen captured over USB: flicks that glide, search, a jump to a date, and a
 * tap on the title back to the top. Opt-in, through
 * `pnpm run capture:recording:ios`.
 */

const HEADER = '.workspace-leaf-content[data-type="daily-notes-stream-view"] .view-header';
const SEARCH = ".daily-notes-search";
/** A reader's flick, not the harness's hard one: shorter and slower, so the glide fits the thumb. */
const FLICK = { share: 0.4, ms: 220 };
/** A thumb typing at a reader's pace, unevenly: 180–320 ms a key. */
const THUMB = (key: number) => 180 + ((key * 53) % 140);

/**
 * iOS shows no touches: a disc under each finger, in the web view, fading as
 * it lifts. A stroke's moves never reach the page, which iOS takes over for
 * the scroll: the disc glides along the stroke `planStroke` armed instead.
 */
function showTouches(phone: Phone): Promise<void> {
    return phone.run(() => {
        const discs = new Map<number, HTMLElement>();
        const fade = (disc: HTMLElement) => {
            disc.style.transition = "opacity 250ms ease-out";
            requestAnimationFrame(() => (disc.style.opacity = "0"));
            window.setTimeout(() => disc.remove(), 350);
        };
        document.addEventListener(
            "touchstart",
            (event) => {
                for (const touch of Array.from(event.changedTouches)) {
                    const disc = document.body.appendChild(document.createElement("div"));
                    Object.assign(disc.style, {
                        position: "fixed",
                        left: "0",
                        top: "0",
                        width: "44px",
                        height: "44px",
                        borderRadius: "50%",
                        background: "rgba(120, 120, 120, 0.35)",
                        border: "2px solid rgba(255, 255, 255, 0.85)",
                        pointerEvents: "none",
                        zIndex: "2147483647",
                        transform: `translate(${touch.clientX - 22}px, ${touch.clientY - 22}px)`,
                    });
                    const planned = window as unknown as { plannedStroke?: { dy: number; ms: number } };
                    const stroke = planned.plannedStroke;
                    if (!stroke) {
                        discs.set(touch.identifier, disc);
                        continue;
                    }
                    delete planned.plannedStroke;
                    disc.style.transition = `transform ${stroke.ms}ms linear`;
                    requestAnimationFrame(() => (disc.style.transform += ` translateY(${stroke.dy}px)`));
                    window.setTimeout(() => fade(disc), stroke.ms);
                }
            },
            { capture: true, passive: true }
        );
        const lift = (event: TouchEvent) => {
            for (const touch of Array.from(event.changedTouches)) {
                const disc = discs.get(touch.identifier);
                if (!disc) continue;
                discs.delete(touch.identifier);
                fade(disc);
            }
        };
        document.addEventListener("touchend", lift, { capture: true, passive: true });
        document.addEventListener("touchcancel", lift, { capture: true, passive: true });
    });
}

/** Arms the next touch's disc to glide as a `FLICK` up the screen does. */
function planStroke(phone: Phone): Promise<void> {
    return phone.run(
        ({ share, ms }: typeof FLICK) =>
            void ((window as unknown as { plannedStroke: { dy: number; ms: number } }).plannedStroke = {
                dy: -share * window.innerHeight,
                ms,
            }),
        FLICK
    );
}

test("README recording on the phone", async ({ phone }) => {
    test.skip(process.env.CAPTURE_RECORDING !== "1", "set CAPTURE_RECORDING=1 to record");
    test.setTimeout(300_000);
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    await phone.openStream();
    await showTouches(phone);
    // The frames to keep: global-setup.ts captures the screen and encodes this scene.
    const start = Date.now() / 1000;
    await pause(1200);

    // Reading down through a few days, a thumb's flick at a time, each left to glide out.
    for (let flick = 0; flick < 3; flick++) {
        await planStroke(phone);
        await phone.flick("up", 1, FLICK);
        await pause(600);
    }

    // Search: typed on the phone's own keyboard, then stepped note to note.
    await phone.tap(`${HEADER} .view-action[aria-label="Search"]`);
    await expect.poll(() => phone.keyboardShown()).toBe(true);
    await pause(400);
    await phone.type("Mara", THUMB);
    await pause(800);
    for (let step = 0; step < 2; step++) {
        await phone.tap(`${SEARCH} .document-search-button[aria-label="Next"]`);
        await phone.rest();
        await pause(1000);
    }
    await phone.tap(`${SEARCH} .document-search-close-button`);
    await phone.rest();
    await pause(600);

    // Jump: the list first, the keyboard on a tap, a few keys to narrow it, a tap on the day.
    await phone.tap(`${HEADER} .view-action[aria-label="Jump to date"]`);
    await expect.poll(() => phone.has(".prompt .suggestion-item")).toBe(true);
    await pause(800);
    await phone.tap(".prompt input.prompt-input");
    await expect.poll(() => phone.keyboardShown()).toBe(true);
    await phone.type("09-0", THUMB);
    await pause(700);
    const day = ".prompt .suggestion-item:nth-child(2)";
    expect(await phone.run((s: string) => document.querySelector(s)?.textContent, day)).toBe("2026-09-08");
    await phone.tap(day);
    await phone.rest();
    expect((await phone.place()).path).toBe("Journal/2026-09-08.md");
    await pause(1500);

    // Back to the newest, as on any iPhone screen: a tap on the title at the top.
    await phone.tap(`${HEADER} .view-header-title`);
    await phone.rest();
    await pause(1500);

    const scene: Scene = { start, end: Date.now() / 1000, output: join(OUT, "demo-phone.webp") };
    writeFileSync(join(FRAMES, "scene.json"), JSON.stringify(scene));
});
