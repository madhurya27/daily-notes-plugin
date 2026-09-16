import { test, openStream } from "./obsidian";
import { mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

/**
 * Captures the README's images from the real app rather than a mockup, one per
 * Playwright project so both layouts come from the same run. Opt-in: an
 * ordinary `pnpm run test:e2e` must not rewrite files in docs/.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs", "images");

/**
 * The fixture's notes are shaped to exercise edge cases — a seven-column table,
 * a deliberately wide code line — which photographs as test scaffolding. These
 * are short enough that several dates share one screen, which is the feature
 * the image has to show.
 */
const SHOWCASE = [
    [
        "## Standup",
        "",
        "- Shipped the export fix; the release checklist is finally green.",
        "- Pairing on the migration after lunch.",
        "",
        "## Evening",
        "",
        "- [x] Renew passport",
        "- [ ] Book the Lisbon flights",
    ].join("\n"),
    [
        "## Notes",
        "",
        "Rewrote the onboarding email. Third draft finally sounds like a person.",
        "",
        "> Simplicity is the consequence of refined emotions.",
    ].join("\n"),
    [
        "## Morning",
        "",
        "Long walk before the rain — 6 km, easy pace.",
        "",
        "## Reading",
        "",
        "- *The Dispossessed*, ch. 7–9",
        "- Two papers on vector indexes",
    ].join("\n"),
    ["## Notes", "", "Quiet day. Cooked, read, went to bed early."].join("\n"),
];

test.describe("README screenshots", () => {
    test.skip(process.env.CAPTURE_SCREENSHOTS !== "1", "set CAPTURE_SCREENSHOTS=1 to capture");

    test("captures the stream", async ({ obsidian }, testInfo) => {
        const { page } = obsidian;

        await page.evaluate(async (bodies: string[]) => {
            const notes = window.app.vault
                .getMarkdownFiles()
                .filter((file: { path: string }) => file.path.startsWith("Notes/"))
                .sort((a: { path: string }, b: { path: string }) => b.path.localeCompare(a.path));
            await Promise.all(bodies.map((body, i) => window.app.vault.modify(notes[i], body)));
            // The stream renders from metadataCache, which lags the write.
            await new Promise((r) => setTimeout(r, 1000));
        }, SHOWCASE);

        // The sidebar carries the throwaway vault's generated name; collapsed it
        // also gives the stream the width a reader cares about. Phone layout
        // hides it already.
        await page.evaluate(() => window.app.workspace.leftSplit?.collapse?.());
        await openStream(page);
        await page.waitForTimeout(1500);

        mkdirSync(OUT, { recursive: true });
        const name = testInfo.project.name === "mobile" ? "stream-phone.png" : "stream-desktop.png";
        await page.screenshot({ path: join(OUT, name) });
    });
});
