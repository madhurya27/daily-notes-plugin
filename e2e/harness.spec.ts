import { test, expect } from "./obsidian";

test("the test window follows the system colour scheme", async ({ obsidian }) => {
    const { bodyClass, prefersDark } = await obsidian.page.evaluate(() => ({
        bodyClass: document.body.className.match(/theme-\w+/)?.[0] ?? "none",
        prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
    }));

    // Playwright emulates a light scheme on attach unless the fixture clears it.
    expect(bodyClass).toBe(prefersDark ? "theme-dark" : "theme-light");
});
