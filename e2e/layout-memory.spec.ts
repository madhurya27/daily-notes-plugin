import { test, expect, openStream } from "./obsidian";

/** What the stream measured, kept across sessions (ADR 0010), and what it reserves where nothing is. */

// Erring tall: a glide up past notes taller than reserved runs out of scroll short of the top (D-092).
test("reserves a note never measured at what the vault's notes measured, erring tall", async ({ obsidian }) => {
    const container = await openStream(obsidian.page);
    const reserved = () =>
        container.evaluate((column) => {
            const layout = `${column.clientWidth}:${getComputedStyle(column).getPropertyValue("--font-text-size").trim()}`;
            const { notes } = window.app.plugins.plugins["daily-notes-stream"].layoutMemory;
            const unmeasured = [...column.querySelectorAll<HTMLElement>(".daily-note-block.is-unloaded")].find(
                (block) => notes.heightOf(layout, block.dataset.sourcePath) === undefined
            );
            return {
                estimate: notes.estimate(layout) as number | undefined,
                placeholder: unmeasured?.style.getPropertyValue("--daily-note-placeholder-height"),
            };
        });
    await expect.poll(async () => (await reserved()).estimate).toBeGreaterThan(0);

    // Placeholders made before anything was measured take it at a scroll's rest (ADR 0014).
    await container.evaluate((column) => column.parentElement!.scrollBy({ top: 1 }));
    await expect.poll(async () => (await reserved()).placeholder).toBe(`${(await reserved()).estimate}px`);
});

// Edited on another device, or while the plugin was off, its stored height is outdated (ADR 0017).
test("keeps each height with its note's mtime, and forgets it as the note is edited", async ({ obsidian }) => {
    const { page } = obsidian;
    const container = await openStream(page);
    const path = (await container.locator(".daily-note-block").first().getAttribute("data-source-path"))!;
    const stored = () =>
        page.evaluate((path) => {
            const { notes } = window.app.plugins.plugins["daily-notes-stream"].layoutMemory;
            const saved: { mtimes: [string, number][] } = notes.toJSON();
            return {
                heights: (notes.heightsOf(path) as unknown[]).length,
                mtime: saved.mtimes.find(([key]) => key === path)?.[1],
                now: window.app.vault.getFileByPath(path)!.stat.mtime,
            };
        }, path);
    await expect.poll(async () => (await stored()).heights).toBeGreaterThan(0);
    expect((await stored()).mtime).toBe((await stored()).now);

    const original = await page.evaluate(async (path) => {
        const file = window.app.vault.getFileByPath(path)!;
        const text = await window.app.vault.read(file);
        await window.app.vault.modify(file, `${text}\n\nA line written later.\n`);
        return text;
    }, path);
    try {
        expect((await stored()).heights).toBe(0);
        // Rendered, it is measured again, at the edit's mtime.
        await expect.poll(async () => (await stored()).heights).toBeGreaterThan(0);
        const after = await stored();
        expect(after.mtime).toBe(after.now);
    } finally {
        await page.evaluate(
            ({ path, original }) => window.app.vault.modify(window.app.vault.getFileByPath(path)!, original),
            { path, original }
        );
    }
});

test("forgets every height on a device build's command", async ({ obsidian }) => {
    const container = await openStream(obsidian.page);
    const stored = () =>
        container.evaluate((column) => {
            const layout = `${column.clientWidth}:${getComputedStyle(column).getPropertyValue("--font-text-size").trim()}`;
            return window.app.plugins.plugins["daily-notes-stream"].layoutMemory.notes.entries(layout).length as number;
        });
    await expect.poll(stored).toBeGreaterThan(0);

    const forgotten = await obsidian.page.evaluate(() => {
        // A release build, as e2e runs, has no command: call what it runs.
        const plugin = window.app.plugins.plugins["daily-notes-stream"];
        plugin.forgetNoteHeights();
        const { notes } = plugin.layoutMemory;
        return notes.layouts().flatMap((layout: string) => notes.entries(layout));
    });
    expect(forgotten).toEqual([]);
});
