import { test, expect, LAYOUT_VIEWPORT } from "./obsidian";

test("the test window follows the system colour scheme", async ({ obsidian }) => {
    const { bodyClass, prefersDark } = await obsidian.page.evaluate(() => ({
        bodyClass: document.body.className.match(/theme-\w+/)?.[0] ?? "none",
        prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
    }));

    // Playwright emulates a light scheme on attach unless the fixture clears it.
    expect(bodyClass).toBe(prefersDark ? "theme-dark" : "theme-light");
});

test("the test window stays off the screen", async ({ obsidian }) => {
    test.skip(process.env.E2E_SHOW_WINDOW === "1", "the window is deliberately visible");

    // Asked of macOS, not the renderer: Electron leaves document.visibilityState
    // at "visible" for a hidden window, so the DOM cannot answer this.
    expect(obsidian.isHidden()).toBe(true);
});

test("the test run never leaves Obsidian in front of the user's work", async ({ obsidian }) => {
    test.skip(process.env.E2E_SHOW_WINDOW === "1", "the window is deliberately visible");

    // Obsidian focuses its own window twice while starting, so the fixture hides
    // it and hands focus back; by the time a test runs, neither may have stuck.
    expect(obsidian.isFrontmost()).toBe(false);
});

test("shrinks the window to Obsidian's minimum", async ({ obsidian }) => {
    test.skip(process.env.E2E_SHOW_WINDOW === "1", "the window is deliberately a normal one");

    // Bounds landing on no display at all are rejected outright, and Obsidian
    // falls back to a centred full-size window — which then flashes over the
    // user's screen before the hide lands. An extended desktop makes that easy
    // to hit, so the corner has to be a point some display actually contains.
    const bounds = obsidian.windowBounds();
    expect(bounds).not.toBeNull();
    expect({ width: bounds!.width, height: bounds!.height }).toEqual({ width: 300, height: 200 });
});

test("lays the page out at a normal size despite the small window", async ({ obsidian }) => {
    test.skip(process.env.E2E_SHOW_WINDOW === "1", "the window is a normal one");

    // The window itself is shrunk to Obsidian's 300x200 minimum and parked in a
    // corner, so the flash before the hide lands is small; the renderer is told
    // to lay out at a usual size so infinite scroll behaves realistically.
    // Each project lays out at its own size: a desktop window, or a phone.
    const expected = LAYOUT_VIEWPORT[test.info().project.name === "mobile" ? "mobile" : "desktop"];
    const inner = await obsidian.page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    expect(inner).toEqual({ w: expected.width, h: expected.height });
});
