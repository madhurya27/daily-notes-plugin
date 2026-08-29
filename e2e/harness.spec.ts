import { test, expect } from "./obsidian";

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
