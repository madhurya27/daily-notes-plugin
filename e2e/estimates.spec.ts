import type { Locator, Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { test, expect, openStream } from "./obsidian";
import { demoVault } from "../scripts/demo-vault.mjs";

/**
 * Measures the demo journal at a phone's two orientations, for scoring
 * placeholder estimates against real heights. Opt-in, through
 * MEASURE_ESTIMATES=1 E2E_SHOW_WINDOW=1: it writes `.dev/estimates.json`.
 */

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".dev", "estimates.json");
const DEMO = demoVault({ until: new Date(Date.UTC(2026, 8, 25)), days: 90 });
const TEMPLATE_PATH = "Scratch/Daily template.md";
const ORIENTATIONS = { portrait: { width: 402, height: 874 }, landscape: { width: 874, height: 402 } };

interface Measured {
    layout: string;
    heights: Record<string, number>;
    template: number;
    /** The note text's width, and its font's line height and average character width. */
    text: { width: number; lineHeight: number; charWidth: number };
}

async function seed(page: Page): Promise<void> {
    const files = Object.entries(DEMO).map(([path, text]): [string, string] => [
        path.replace(/^Journal\//, "Notes/").replace(/^Templates\/Daily\.md$/, TEMPLATE_PATH),
        text,
    ]);
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
    const { page } = obsidian;
    await seed(page);

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

    const chars = Object.fromEntries(
        Object.entries(DEMO).map(([path, text]) => [path.replace(/^Journal\//, "Notes/"), text.length])
    );
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ results, chars, templateChars: DEMO["Templates/Daily.md"]!.length }, null, 2));
});
