import type { Locator, Page } from "@playwright/test";
import { test, expect, openStream } from "./obsidian";

/** Newer than every seeded note, so it opens the stream. */
const NOTE = "Notes/2026-03-15.md";

/** Enough columns to overrun a phone, and a desktop at Bases' default width. */
const WIDE_COLUMNS = ["file.name", "file.path", "file.folder", "file.ext", "file.size", "file.ctime", "file.mtime"];

const BASES: Record<string, string> = {
    "Wide.base": baseView(WIDE_COLUMNS),
    "Narrow.base": baseView(["file.name"]),
    // A hand-resized column ignores the fitted cap, so it clips instead.
    "Resized.base": baseView(["file.name", "file.path"], ["columnSize:", "      file.path: 900"]),
};

function baseView(order: string[], extra: string[] = []): string {
    return [
        "views:",
        "  - type: table",
        "    name: Table",
        "    order:",
        ...order.map((column) => `      - ${column}`),
        ...extra.map((line) => `    ${line}`),
        "",
    ].join("\n");
}

/** One of each embed that scrolls inside a note elsewhere in Obsidian. */
const ZOO = [
    "## Embeds",
    "",
    "![[Wide.base]]",
    "",
    "![[Narrow.base]]",
    "",
    "![[Resized.base]]",
    "",
    "![[Reading list]]",
    "",
    "![[Reading list#Later]]",
    "",
    "$$\\sum_{i=1}^{n} x_i + \\sum_{j=1}^{m} y_j + \\sum_{k=1}^{p} z_k + \\sum_{l=1}^{q} w_l + \\sum_{r=1}^{s} v_r + \\int_0^1 f(t)\\,dt$$",
    "",
    "```mermaid",
    "flowchart LR",
    "  A[Alpha step] --> B[Beta step] --> C[Gamma step] --> D[Delta step] --> E[Epsilon step] --> F[Zeta step]",
    "```",
    "",
    "| Column one | Column two | Column three | Column four | Column five | Column six | Column seven |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "| a | b | c | d | e | f | g |",
    "",
].join("\n");

/** Every element in the stream that is a scroll container, SVG aside. */
function scrollBoxes(container: Locator): Promise<string[]> {
    return container.evaluate((root) =>
        Array.from(root.querySelectorAll("*"))
            .filter((el) => !(el instanceof SVGElement))
            .filter((el) => {
                const style = getComputedStyle(el);
                return /auto|scroll|hidden/.test(`${style.overflowX} ${style.overflowY}`);
            })
            .map((el) => `${el.tagName.toLowerCase()}.${Array.from(el.classList).join(".")}`)
    );
}

async function seedZoo(page: Page): Promise<void> {
    await page.evaluate(
        async ({ bases, note, zoo }) => {
            // What Mermaid's "Allow" writes; without it Obsidian draws no diagram.
            window.app.saveLocalStorage("mermaid-vault-trust", true);
            for (const [path, body] of Object.entries(bases)) await window.app.vault.create(path, body);
            await window.app.vault.create(note, zoo);
        },
        { bases: BASES, note: NOTE, zoo: ZOO }
    );
}

test.describe("nothing inside the stream scrolls", () => {
    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.evaluate(
            async (paths) => {
                for (const path of paths) {
                    const file = window.app.vault.getAbstractFileByPath(path);
                    if (file) await window.app.vault.delete(file);
                }
            },
            [NOTE, ...Object.keys(BASES)]
        );
    });

    // iOS ends a glide early on a scroll box inside the scroller once notes
    // have unloaded (ADR 0007).
    test("has no scroll box in the seeded notes", async ({ obsidian }) => {
        const container = await openStream(obsidian.page);
        await expect(container.locator("table").first()).toBeVisible();

        await expect.poll(() => scrollBoxes(container)).toEqual([]);
    });

    test("has no scroll box around Bases, math, diagrams or embedded notes", async ({ obsidian }) => {
        const { page } = obsidian;
        await seedZoo(page);
        const container = await openStream(page);
        const note = container.locator(".daily-note-block").first();
        await expect(note.locator(".bases-view")).toHaveCount(3);
        await expect(note.locator(".bases-tr").first()).toBeVisible();
        await expect(note.locator(".mermaid svg")).toBeVisible();

        await expect.poll(() => scrollBoxes(container)).toEqual([]);
    });

    test("never scrolls sideways", async ({ obsidian }) => {
        const { page } = obsidian;
        await seedZoo(page);
        const container = await openStream(page);
        await expect(container.locator(".bases-tr").first()).toBeVisible();
        await expect(container.locator(".mermaid svg")).toBeVisible();

        await expect
            .poll(() => container.evaluate((el) => el.parentElement!.scrollWidth - el.parentElement!.clientWidth))
            .toBeLessThanOrEqual(0);
    });

    test("fits a wide Base to the note", async ({ obsidian }) => {
        const { page } = obsidian;
        await seedZoo(page);
        const container = await openStream(page);
        const view = container.locator(".bases-view").first();
        await expect(view.locator(".bases-tr").first()).toBeVisible();

        await expect
            .poll(() =>
                view.evaluate((el) => el.querySelector<HTMLElement>(".bases-thead")!.offsetWidth - el.clientWidth)
            )
            .toBeLessThanOrEqual(0);
    });

    test("stacks a table too wide for the note, on a phone only", async ({ obsidian, mobileLayout }) => {
        const container = await openStream(obsidian.page);
        const table = container.locator(".daily-note-block").first().locator("table").first();
        await expect(table).toBeVisible();

        if (mobileLayout) await expect(table).toHaveClass(/is-stacked/);
        else await expect(table).not.toHaveClass(/is-stacked/);
        // Each stacked cell names its column, from the header row.
        await expect(table.locator("tbody td").nth(1)).toHaveAttribute("data-column", "Distance");
    });
});
