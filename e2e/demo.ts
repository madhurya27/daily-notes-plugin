import type { Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { demoVault } from "../scripts/demo-vault.mjs";

/** Where the README's images live. */
export const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs", "images");

/** Fixed, so a retake shows the same days. */
const DEMO = demoVault({ until: new Date(Date.UTC(2026, 8, 25)), days: 21 });

/**
 * Swaps the fixture's test notes for the demo journal, in the folder the
 * fixture's daily notes use, and collapses the sidebar: it carries the
 * throwaway vault's generated name, and collapsed it gives the stream the width
 * a reader cares about. Phone layout hides it already.
 */
export async function prepareDemo(page: Page): Promise<void> {
    const files = Object.entries(DEMO).map(([path, text]): [string, string] => [
        path.replace(/^Journal\//, "Notes/"),
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
        // The stream renders from metadataCache, which lags the write.
        await new Promise((r) => setTimeout(r, 1000));
    }, files);
    await page.evaluate(() => window.app.workspace.leftSplit?.collapse?.());
    await showLightTheme(page);
    mkdirSync(OUT, { recursive: true });
}

/** The vault follows the system theme: pinned, a Mac in dark mode takes the same images. */
export async function showLightTheme(page: Page): Promise<void> {
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(() => document.body.classList.contains("theme-light"));
}
