import { test, expect, SEEDED_DAYS } from "./obsidian";

/**
 * Opens a *fresh* stream view and returns its container locator. Tests share one
 * Obsidian instance, so an existing view would carry the previous test's loaded
 * range and scroll position into this one.
 */
async function openStream(page: import("@playwright/test").Page) {
    await page.evaluate(async () => {
        const type = "daily-notes-stream-view";
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
        window.app.workspace.detachLeavesOfType(type);

        // Tearing down the emptied tab outlives the leaf count dropping to 0, and
        // a view opened inside that window gets cleaned up with it. Retry until
        // one sticks rather than guessing a settle delay.
        for (let attempt = 0; attempt < 5; attempt++) {
            await wait(300);
            await window.app.commands.executeCommandById("daily-notes-stream:open-stream");
            await wait(300);
            if (window.app.workspace.getLeavesOfType(type).length > 0) return;
        }
        throw new Error("stream view never opened");
    });
    const container = page.locator(".daily-notes-stream-container");
    await expect(container).toBeVisible();
    await expect(container.locator(".daily-note-block").first()).toBeVisible();
    return container;
}

test.describe("daily notes stream in real Obsidian", () => {
    test("renders daily notes as real rendered markdown", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);

        await expect(container.locator(".daily-note-block").first()).toBeVisible();
        // Newest first: 2026-03-14 is the most recent seeded note.
        await expect(container.locator(".daily-note-title").first()).toHaveText("2026-03-14");

        // Obsidian's MarkdownRenderer produced real elements, not raw text.
        const firstNote = container.locator(".daily-note-block").first();
        await expect(firstNote.locator(".daily-note-content h2").first()).toHaveText(/Morning/);
        await expect(firstNote.locator(".daily-note-content ul li").first()).toBeVisible();
        // Frontmatter must not leak into the body.
        await expect(firstNote.locator(".daily-note-content")).not.toContainText("mood:");
    });

    test("collapses a heading in the real rendered DOM", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const firstNote = container.locator(".daily-note-block").first();
        const heading = firstNote.locator(".daily-note-content h2").first();
        const body = firstNote.locator(".daily-note-content p").first();

        await expect(body).toBeVisible();
        await heading.locator(".collapse-indicator").click();

        await expect(heading).toHaveClass(/is-collapsed/);
        await expect(body).toBeHidden();

        await heading.locator(".collapse-indicator").click();
        await expect(body).toBeVisible();
    });

    test("hides headings nested under a collapsed one, not just its text", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const firstNote = container.locator(".daily-note-block").first();
        const heading = firstNote.locator(".daily-note-content h2").first();
        const nested = firstNote.locator(".daily-note-content h3").first();

        await expect(nested).toBeVisible();
        await heading.locator(".collapse-indicator").click();

        // Hiding is a class the stylesheet has to honour: a heading carries the
        // collapsible rule's own display, which a bare .is-hidden cannot outrank.
        await expect(nested).toHaveClass(/is-hidden/);
        await expect(nested).toBeHidden();

        await heading.locator(".collapse-indicator").click();
        await expect(nested).toBeVisible();
    });

    test("toggles a heading from the keyboard", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const firstNote = container.locator(".daily-note-block").first();
        const heading = firstNote.locator(".daily-note-content h2").first();
        const chevron = heading.locator(".collapse-indicator");

        await chevron.focus();
        await expect(chevron).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Enter");

        await expect(chevron).toHaveAttribute("aria-expanded", "false");
        await expect(heading).toHaveClass(/is-collapsed/);
        await page.keyboard.press("Enter");
        await expect(chevron).toHaveAttribute("aria-expanded", "true");
    });

    test("loads a second batch on scroll", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);
        const blocks = container.locator(".daily-note-block");

        await expect(blocks).toHaveCount(10); // BATCH_SIZE

        await container.locator(".daily-note-block").last().scrollIntoViewIfNeeded();
        await expect(blocks).toHaveCount(SEEDED_DAYS);
    });

    test("shows a note created while the view is open", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);

        // Return nothing: the created TFile is not serialisable back to Node.
        await page.evaluate(async () => {
            await window.app.vault.create("Notes/2026-03-20.md", "## Later\n\nA newer day.\n");
        });

        await expect(container.locator(".daily-note-title").first()).toHaveText("2026-03-20");
        await page.evaluate(async () => {
            const file = window.app.vault.getAbstractFileByPath("Notes/2026-03-20.md");
            await window.app.vault.delete(file);
        });
        await expect(container.locator(".daily-note-title").first()).toHaveText("2026-03-14");
    });

    test("ignores dated files that are not daily notes", async ({ obsidian }) => {
        const { page } = obsidian;
        const container = await openStream(page);

        await page.evaluate(async () => {
            await window.app.vault.createFolder("Attachments").catch(() => {});
            // Right date shape, wrong folder — and right folder, wrong extension.
            await window.app.vault.create("Attachments/2026-03-25.md", "not a daily note");
            await window.app.vault.create("Notes/2026-03-26.png", "not markdown either");
        });

        // Give the vault events time to be wrong, if they are going to be.
        await page.waitForTimeout(1000);
        await expect(container.locator(".daily-note-title").first()).toHaveText("2026-03-14");
        await expect(container.locator(".daily-note-block")).toHaveCount(10);

        await page.evaluate(async () => {
            for (const path of ["Attachments/2026-03-25.md", "Notes/2026-03-26.png"]) {
                const file = window.app.vault.getAbstractFileByPath(path);
                if (file) await window.app.vault.delete(file);
            }
        });
    });

    test("keeps wide content inside the stream instead of scrolling the page", async ({ obsidian }) => {
        const { page } = obsidian;
        const cdp = await page.context().newCDPSession(page);
        const setViewport = (width: number) =>
            cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false });
        const setMobile = async (on: boolean) => {
            await page.evaluate((emulate) => window.app.emulateMobile(emulate), on);
            // emulateMobile tears the workspace down and rebuilds it, taking every
            // open leaf with it, so the view has to be reopened afterwards.
            await page.waitForFunction(() => window.app.workspace.layoutReady === true, null, { timeout: 30_000 });
        };

        // A phone is where a wide table or code line has nowhere to go and starts
        // pushing the page sideways; at desktop width it simply fits.
        await setViewport(420);
        await setMobile(true);
        try {
            const container = await openStream(page);
            await expect(container.locator("table").first()).toBeVisible();
            // is-phone is what carries the mobile layout, and it keys off width.
            await expect(page.locator("body")).toHaveClass(/is-phone/);

            const overflow = await container.evaluate((el) => {
                const scroller = el.parentElement!;
                // Both are viewport coordinates: the scroller need not start at 0.
                const limit = scroller.getBoundingClientRect().right;
                return {
                    pageOverflow: scroller.scrollWidth - scroller.clientWidth,
                    widest: Math.max(
                        ...Array.from(el.querySelectorAll("table, pre")).map((child) =>
                            Math.round(child.getBoundingClientRect().right - limit)
                        )
                    ),
                };
            });

            expect(overflow.pageOverflow).toBeLessThanOrEqual(0);
            expect(overflow.widest).toBeLessThanOrEqual(0);
        } finally {
            // Restore the fixture's layout: the instance is shared with every
            // other test, and a failure here must not leave them on a phone.
            await setMobile(false);
            await setViewport(1024);
        }
    });

    test("keeps the properties panel collapsed across a re-render", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(async () => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            plugin.settings.showProperties = true;
            plugin.settings.propertiesCollapsed = false;
            await plugin.saveSettings();
        });
        const container = await openStream(page);
        const firstNote = container.locator(".daily-note-block").first();
        const panel = firstNote.locator(".metadata-container");

        await expect(panel).toBeVisible();
        await expect(panel).not.toHaveClass(/is-collapsed/);
        await firstNote.locator(".metadata-properties-heading").click();
        await expect(panel).toHaveClass(/is-collapsed/);

        // Editing the note re-renders it; the panel must not spring back open.
        await page.evaluate(async () => {
            const file = window.app.vault.getAbstractFileByPath("Notes/2026-03-14.md");
            await window.app.vault.append(file, "\nEdited.\n");
        });

        await expect(firstNote.locator(".daily-note-content")).toContainText("Edited.");
        await expect(container.locator(".daily-note-block").first().locator(".metadata-container")).toHaveClass(
            /is-collapsed/
        );
    });
});
