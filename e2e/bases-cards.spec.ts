import type { Locator, Page } from "@playwright/test";
import { test, expect, openStream, LAYOUT_VIEWPORT } from "./obsidian";

/** Newer than every seeded note, so it opens the stream. */
const NOTE = "Notes/2026-03-15.md";

function table(name: string, columns: string[], ...extra: string[]): string[] {
    return ["  - type: table", `    name: ${name}`, ...extra, "    order:", ...columns.map((c) => `      - ${c}`)];
}

const block = (...lines: string[]) => ["```base", ...lines, "```", ""];

/** Its headers alone overrun a phone and a desktop note. */
const HEADERS_WIDE = ["file.name", "file.path", "file.folder", "file.ext", "file.size", "file.ctime", "file.mtime"];
/** Fits a tablet's note, not a phone's: headers overrun only the phone. */
const MIDDLE = ["file.name", "file.path", "file.folder", "file.ext", "file.size"];

/** Short headers, long values: only a drawn table shows it is too wide. */
const VALUES_WIDE = [
    "formulas:",
    ...["a", "b", "c", "d"].map((f) => `  ${f}: file.path + " " + file.path`),
    "views:",
    ...table("Values", ["formula.a", "formula.b", "formula.c", "formula.d"]),
];

/** An embed names its second view; `this` is the embedding note. */
const TWO_VIEWS = [
    "views:",
    ...table("First", ["file.name"]),
    ...table("This note", HEADERS_WIDE, "    filters: file.path == this.file.path"),
    "",
].join("\n");

async function seed(page: Page, body: string[]): Promise<string> {
    const text = body.join("\n");
    await page.evaluate(
        async ({ note, text, base }) => {
            await window.app.vault.create("Two.base", base);
            await window.app.vault.create(note, text);
        },
        { note: NOTE, text, base: TWO_VIEWS }
    );
    return text;
}

const read = (page: Page, path: string) => page.evaluate((p) => window.app.vault.adapter.read(p), path);

/** Bases keeps a hidden card to measure with; the drawn ones drag. */
const cards = (base: Locator) => base.locator(".bases-cards-item[draggable]");

/** Wide enough that `MIDDLE` fits. */
const TABLET_WIDTH = 900;

async function resize(page: Page, width: number): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: LAYOUT_VIEWPORT.mobile.height,
        deviceScaleFactor: 1,
        mobile: false,
    });
}

// Mobile only: desktop draws Bases as Obsidian does (ADR 0008).
test.describe("Bases on mobile", () => {
    test.beforeEach(({ mobileLayout }) => test.skip(!mobileLayout, "desktop draws Bases as Obsidian does"));
    test.afterEach(async ({ obsidian }) => {
        await obsidian.page.evaluate(
            async (paths) => {
                for (const path of paths) {
                    const file = window.app.vault.getAbstractFileByPath(path);
                    if (file) await window.app.vault.delete(file);
                }
            },
            [NOTE, "Two.base"]
        );
    });

    // The rule a Markdown table follows: cards only when wider than the note.
    test("draws a Base too wide for the note as cards, one that fits as a table", async ({ obsidian }) => {
        const { page } = obsidian;
        await seed(page, [
            ...block("views:", ...table("Wide", HEADERS_WIDE)),
            ...block("views:", ...table("Narrow", ["file.name"])),
        ]);
        const bases = (await openStream(page)).locator(".daily-note-block").first().locator(".daily-note-base");

        await expect(cards(bases.nth(0)).first()).toBeVisible();
        await expect(bases.nth(0).locator(".bases-thead")).toHaveCount(0);
        await expect(bases.nth(1).locator(".bases-thead")).toBeVisible();
        await expect(cards(bases.nth(1))).toHaveCount(0);
    });

    // Its headers alone decide it: measured from Bases' own header, once.
    test("draws a Base whose headers overrun the note straight as cards", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(() => {
            const w = window as unknown as { tablesDrawn: number };
            w.tablesDrawn = 0;
            new MutationObserver((records) => {
                for (const record of records)
                    for (const node of Array.from(record.addedNodes))
                        if (
                            node instanceof Element &&
                            !node.matches(".daily-note-bases-probe") &&
                            node.querySelector(".bases-thead")
                        )
                            w.tablesDrawn++;
            }).observe(document.body, { childList: true, subtree: true });
        });
        await seed(page, block("views:", ...table("Wide", HEADERS_WIDE)));
        const base = (await openStream(page)).locator(".daily-note-base").first();

        await expect(cards(base).first()).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { tablesDrawn: number }).tablesDrawn)).toBe(0);
    });

    // Bases draws a card's border as a 1px ring outside it: nothing clips that.
    test("shows each card's whole border", async ({ obsidian }) => {
        const { page } = obsidian;
        await seed(page, block("views:", ...table("Wide", HEADERS_WIDE)));
        const card = cards((await openStream(page)).locator(".daily-note-base").first()).first();
        await expect(card).toBeVisible();

        const clipped = await card.evaluate((el) => {
            const ring = el.getBoundingClientRect();
            const found: string[] = [];
            for (let e = el.parentElement; e && !e.matches(".daily-note-block"); e = e.parentElement) {
                if (getComputedStyle(e).overflowX === "visible") continue;
                const box = e.getBoundingClientRect();
                if (box.left > ring.left - 1 || box.right < ring.right + 1 || box.top > ring.top - 1)
                    found.push(e.className);
            }
            return found;
        });
        expect(clipped).toEqual([]);
    });

    // Bases draws a card's line at a fixed height, which a pill outgrows as
    // the font grows.
    test("fits a tag pill inside its card line at a large font", async ({ obsidian }) => {
        const { page } = obsidian;
        await page.evaluate(() => {
            window.app.vault.setConfig("baseFontSize", 22);
            window.app.updateFontSize();
        });
        try {
            await seed(page, [
                "---",
                "tags:",
                "  - Books",
                "---",
                "",
                ...block("views:", "  - type: cards", "    name: Tags", "    order:", "      - note.tags"),
            ]);
            const line = cards((await openStream(page)).locator(".daily-note-base").first())
                .first()
                .locator(".bases-cards-line");
            await expect(line.locator(".value-list-element").first()).toBeVisible();

            const overrun = await line.first().evaluate((el) => {
                const bottom = el.getBoundingClientRect().bottom;
                const pill = el.querySelector(".value-list-element")!.getBoundingClientRect().bottom;
                return pill - bottom;
            });
            expect(overrun).toBeLessThanOrEqual(0);
        } finally {
            await page.evaluate(() => {
                window.app.vault.setConfig("baseFontSize", 16);
                window.app.updateFontSize();
            });
        }
    });

    test("measures a table whose values overrun the note, and redraws it as cards", async ({ obsidian }) => {
        const { page } = obsidian;
        await seed(page, block(...VALUES_WIDE));
        const base = (await openStream(page)).locator(".daily-note-base").first();

        await expect(cards(base).first()).toBeVisible();
        await expect(base.locator(".bases-thead")).toHaveCount(0);
    });

    test("draws an embedded Base's named view, for the note", async ({ obsidian }) => {
        const { page } = obsidian;
        await seed(page, ["![[Two.base#This note]]", ""]);
        const base = (await openStream(page)).locator(".daily-note-base").first();

        // The view the embed names, filtered by `this`: the note, not the Base.
        await base.scrollIntoViewIfNeeded();
        await expect(cards(base)).toHaveCount(1);
        await expect(cards(base)).toContainText("2026-03-15");
    });

    // Cards are a copy, so they would not follow the file on their own.
    test("redraws an embed drawn as cards when its file changes", async ({ obsidian }) => {
        const { page } = obsidian;
        await seed(page, ["![[Two.base#This note]]", ""]);
        const base = (await openStream(page)).locator(".daily-note-base").first();
        await base.scrollIntoViewIfNeeded();
        await expect(cards(base)).toHaveCount(1);

        await page.evaluate(
            async (text) => {
                await window.app.vault.modify(window.app.vault.getFileByPath("Two.base")!, text);
            },
            TWO_VIEWS.replace("    filters: file.path == this.file.path\n", "")
        );

        await expect.poll(() => cards(base).count()).toBeGreaterThan(1);
    });

    // A phone turned sideways, or a tablet's split view resized.
    test("redraws a Base when the note's width changes", async ({ obsidian }) => {
        const { page } = obsidian;
        await seed(page, block("views:", ...table("Middle", MIDDLE)));
        const base = (await openStream(page)).locator(".daily-note-base").first();
        await expect(cards(base).first()).toBeVisible();

        try {
            await resize(page, TABLET_WIDTH);
            await expect(base.locator(".bases-thead")).toBeVisible();
            await expect(cards(base)).toHaveCount(0);
        } finally {
            await resize(page, LAYOUT_VIEWPORT.mobile.width);
        }
        await expect(cards(base).first()).toBeVisible();
    });

    test("leaves the note and the Base untouched", async ({ obsidian }) => {
        const { page } = obsidian;
        const body = await seed(page, [...block("views:", ...table("Wide", HEADERS_WIDE)), "![[Two.base#This note]]"]);
        const container = await openStream(page);
        await expect(cards(container.locator(".daily-note-base").first()).first()).toBeVisible();

        expect(await read(page, NOTE)).toBe(body);
        expect(await read(page, "Two.base")).toBe(TWO_VIEWS);
    });

    // Bases saves a block through the editor that holds it; the stream has none.
    test("saves no toolbar edit over the note", async ({ obsidian }) => {
        const { page } = obsidian;
        const body = await seed(page, block("views:", ...table("Narrow", ["file.name"])));
        const note = (await openStream(page)).locator(".daily-note-block").first();

        await note.locator(".bases-toolbar-views-menu").first().click();
        await page.locator(".menu").getByText("Add view").click();
        // The view was added: Bases opens its settings.
        await expect(page.locator(".menu")).toContainText("Configure view");
        // Bases saves 100 ms after an edit; give a save the time to land.
        await page.waitForTimeout(1000);

        expect(await read(page, NOTE)).toBe(body);
    });
});
