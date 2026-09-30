import type { Locator, Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { test, expect, openStream, STREAM } from "./obsidian";
import { demoVault } from "../scripts/demo-vault.mjs";

/**
 * Measures the demo journal, its embeds varied, at a phone's two orientations,
 * for scoring placeholder estimates against real heights. Opt-in, through
 * MEASURE_ESTIMATES=1 E2E_SHOW_WINDOW=1: it writes `.dev/estimates.json`.
 */

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".dev", "estimates.json");
const TEMPLATE_PATH = "Scratch/Daily template.md";

const base = (folder: string, columns: string[]) =>
    [
        "filters:",
        "  and:",
        `    - file.inFolder("${folder}")`,
        "views:",
        "  - type: table",
        "    name: View",
        "    order:",
        ...columns.map((column) => `      - ${column}`),
        "",
    ].join("\n");
const svg = (width: number, height: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#b8ae9a"/></svg>\n`;

/** The demo has one Base and one image; a vault's embeds differ in shape and in how they meet the width. */
const EMBEDS = {
    /** Narrow: a table at both widths. */
    "People.base": base("People", ["file.name"]),
    /** Wide: cards at both widths. */
    "Library.base": base("Books", ["file.name", "author", "status", "rating", "file.path", "file.ctime", "file.mtime"]),
    /** Scales with the width. */
    "Attachments/banner.svg": svg(1200, 240),
    /** Narrower than a phone: the same height at both widths. */
    "Attachments/photo.svg": svg(300, 480),
    "Attachments/icon.svg": svg(96, 96),
};
const BASES = ["Reading.base", "People.base", "Library.base"];
const IMAGES = ["atlas-wireframe.svg", "banner.svg", "photo.svg", "icon.svg"];

/** Sundays rotate through the Bases, every other one with an image too; one written weekday in five gets an image. */
function variedDemo(): Record<string, string> {
    const demo = demoVault({ until: new Date(Date.UTC(2026, 8, 25)), days: 90 });
    const template = demo["Templates/Daily.md"]!;
    const vault: Record<string, string> = { ...EMBEDS };
    let sundays = 0;
    let images = 0;
    const image = () => `\n![[${IMAGES[images++ % IMAGES.length]}]]\n`;
    for (const [index, [path, text]] of Object.entries(demo).entries()) {
        let varied = text;
        if (text.includes("![[Reading.base]]")) {
            varied = text.replace("Reading.base", BASES[sundays % BASES.length]!);
            if (sundays++ % 2 === 1) varied += image();
        } else if (path.startsWith("Journal/") && text !== template && index % 5 === 2) varied += image();
        vault[path.replace(/^Journal\//, "Notes/").replace(/^Templates\/Daily\.md$/, TEMPLATE_PATH)] = varied;
    }
    return vault;
}
const VAULT = variedDemo();
const ORIENTATIONS = { portrait: { width: 402, height: 874 }, landscape: { width: 874, height: 402 } };

interface Measured {
    layout: string;
    heights: Record<string, number>;
    template: number;
    /** The note text's width, and its font's line height and average character width. */
    text: { width: number; lineHeight: number; charWidth: number };
    /** The plugin's own estimates, by case: see `estimateAll`. */
    estimates?: Estimates;
}

type Estimates = Record<"elsewhere" | "learned" | "fresh", Record<string, number | null>>;

/** The template set, and notes holding only it shown, so every note is measured. */
async function useTemplate(page: Page, vaultPath: string): Promise<void> {
    const template = TEMPLATE_PATH.replace(/\.md$/, "");
    writeFileSync(
        join(vaultPath, ".obsidian", "daily-notes.json"),
        JSON.stringify({ folder: "Notes", format: "YYYY-MM-DD", template })
    );
    await expect
        .poll(() =>
            page.evaluate(() => window.app.internalPlugins.getPluginById("daily-notes").instance.options.template)
        )
        .toBe(template);
    await page.evaluate(async () => {
        const plugin = window.app.plugins.plugins["daily-notes-stream"];
        plugin.settings.hideEmptyNotes = false;
        await plugin.saveSettings();
    });
}

/**
 * The stream's own estimate of each note at `here`, the layout it is laid out
 * in now, with the heights stored as three cases leave them: measured only at
 * `other` (a turn); never measured, every other note measured at both (a
 * long-read vault); nothing measured yet.
 */
async function estimateAll(page: Page, here: string, other: string, heights: Record<string, Record<string, number>>) {
    return page.evaluate(
        ({ here, other, heights }) => {
            const plugin = window.app.plugins.plugins["daily-notes-stream"];
            const { estimates } = window.app.workspace.getLeavesOfType("daily-notes-stream-view")[0].view.stream;
            const estimating = (saved: [string, [string, number][]][]) => {
                const stored = new plugin.layoutMemory.notes.constructor();
                stored.restore(saved);
                return new estimates.constructor(stored, plugin.layoutMemory.templates, estimates.sources);
            };
            const without = (layout: string, path: string): [string, [string, number][]] => [
                layout,
                Object.entries(heights[layout]!).filter(([p]) => p !== path),
            ];
            const elsewhere = estimating([[other, Object.entries(heights[other]!)]]);
            const fresh = estimating([]);
            const result: Record<string, Record<string, number | null>> = { elsewhere: {}, learned: {}, fresh: {} };
            for (const path of Object.keys(heights[here]!)) {
                const learned = estimating([without(other, path), without(here, path)]);
                result.elsewhere![path] = elsewhere.estimate(here, path) ?? null;
                result.learned![path] = learned.estimate(here, path) ?? null;
                result.fresh![path] = fresh.estimate(here, path) ?? null;
            }
            return result as Estimates;
        },
        { here, other, heights }
    );
}

async function seed(page: Page): Promise<void> {
    const files = Object.entries(VAULT);
    await page.evaluate(async (files) => {
        const { vault } = window.app;
        for (const file of vault.getFiles()) await vault.delete(file);
        for (const [path, text] of files) {
            const folder = path.split("/").slice(0, -1).join("/");
            if (folder && !vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
            await vault.create(path, text);
        }
        await new Promise((r) => setTimeout(r, 1000));
    }, files);
}

/** Every note brought to the top in turn until its height is remembered. */
async function measureAll(page: Page, container: Locator): Promise<void> {
    const blocks = container.locator(".daily-note-block");
    const pane = container.locator("xpath=..");
    for (let i = 0; ; i++) {
        const count = await blocks.count();
        if (i >= count) {
            await pane.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
            await page.waitForTimeout(500);
            if ((await blocks.count()) === count) return;
        }
        await expect
            .poll(
                () =>
                    blocks.nth(i).evaluate((el) => {
                        el.scrollIntoView({ block: "start", behavior: "instant" });
                        const notes: [string, [string, number][]][] =
                            window.app.plugins.plugins["daily-notes-stream"].layoutMemory.notes.toJSON();
                        return notes.some(([, heights]) => heights.some(([path]) => path === el.dataset.sourcePath));
                    }),
                { timeout: 15_000 }
            )
            .toBe(true);
    }
}

/** The template rendered as a note, in the stream's column, out of sight. */
async function measureTemplate(container: Locator): Promise<number> {
    return container.evaluate(async (stream, path) => {
        const file = window.app.vault.getFileByPath(path)!;
        const view = window.app.workspace.getLeavesOfType("daily-notes-stream-view")[0]!.view as unknown as {
            renderer: {
                createBlock(file: unknown): HTMLElement;
                renderInto(block: HTMLElement, file: unknown): Promise<{ component: { unload(): void } }>;
            };
        };
        const block = view.renderer.createBlock(file);
        Object.assign(block.style, { position: "absolute", visibility: "hidden", width: `${stream.clientWidth}px` });
        stream.appendChild(block);
        const { component } = await view.renderer.renderInto(block, file);
        await new Promise((r) => setTimeout(r, 1000));
        const height = block.getBoundingClientRect().height;
        component.unload();
        block.remove();
        return height;
    }, TEMPLATE_PATH);
}

async function textMetrics(container: Locator): Promise<Measured["text"]> {
    return container.evaluate((stream) => {
        const content = stream.querySelector<HTMLElement>(".daily-note-content")!;
        const paragraph = content.querySelector("p") ?? content;
        const style = getComputedStyle(paragraph);
        const context = document.createElement("canvas").getContext("2d")!;
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const sample = content.innerText.replace(/\s+/g, " ");
        return {
            width: content.clientWidth,
            lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5,
            charWidth: context.measureText(sample).width / sample.length,
        };
    });
}

test("measures the demo journal at both orientations", async ({ obsidian, mobileLayout }) => {
    test.skip(process.env.MEASURE_ESTIMATES !== "1", "set MEASURE_ESTIMATES=1 to measure");
    test.skip(!mobileLayout, "a phone's two orientations");
    test.setTimeout(900_000);
    const { page, vaultPath } = obsidian;
    await seed(page);
    await useTemplate(page, vaultPath);

    const results: Record<string, Measured> = {};
    for (const [name, size] of Object.entries(ORIENTATIONS)) {
        await page.setViewportSize(size);
        await page.evaluate(() => window.app.plugins.plugins["daily-notes-stream"].layoutMemory.notes.restore(null));
        const container = await openStream(page);
        await measureAll(page, container);
        const saved: [string, [string, number][]][] = await page.evaluate(() =>
            window.app.plugins.plugins["daily-notes-stream"].layoutMemory.notes.toJSON()
        );
        const [layout, heights] = saved.reduce((most, entry) => (entry[1].length > most[1].length ? entry : most));
        results[name] = {
            layout,
            heights: Object.fromEntries(heights),
            template: await measureTemplate(container),
            text: await textMetrics(container),
        };
    }

    const heights = Object.fromEntries(Object.values(results).map(({ layout, heights }) => [layout, heights]));
    for (const [name, size] of Object.entries(ORIENTATIONS)) {
        await page.setViewportSize(size);
        const here = results[name]!.layout;
        await expect.poll(() => page.locator(STREAM).evaluate((el) => el.clientWidth)).toBe(Number(here.split(":")[0]));
        const other = Object.values(results).find(({ layout }) => layout !== here)!.layout;
        results[name]!.estimates = await estimateAll(page, here, other, heights);
    }
    const templates: unknown = await page.evaluate(() =>
        window.app.plugins.plugins["daily-notes-stream"].layoutMemory.templates.toJSON()
    );

    const texts = Object.fromEntries(Object.entries(VAULT).filter(([path]) => path.startsWith("Notes/")));
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ results, templates, texts, template: VAULT[TEMPLATE_PATH] }, null, 2));
});
