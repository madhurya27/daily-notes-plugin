/**
 * Switches the layout of the window `pnpm run open` left running — window size
 * and mobile emulation together — without relaunching Obsidian.
 *
 *   node scripts/layout.mjs [--desktop|--ipad] [--landscape] [--keep-size]
 *
 * Relaunching costs a cold start and a reindex; emulateMobile alone reloads the
 * renderer but leaves the window at whatever size it had, so a desktop layout in
 * a phone-sized window shows nothing but the sidebar. This does both.
 */
import { chromium } from "@playwright/test";
import { isMain, runningPort } from "./reload-plugin.mjs";
import { layoutFrom } from "./window-layout.mjs";

const VIEW_TYPE = "daily-notes-stream-view";

const USAGE = `pnpm run layout [options]

Switches the open window between the phone, iPad and desktop layouts in place.
Default: phone portrait, as \`pnpm run open\` opens it.

  --ipad          tablet window, 820x1180 — is-mobile without is-phone
  --landscape     turn the phone or iPad size on its side
  --desktop       desktop window, 1280x860, no mobile emulation
  --keep-size     switch emulation only, leaving the window as it is
  --help, -h      this message

Turning emulation on or off reloads the renderer, so the stream takes a moment
to come back. A size-only change is immediate.`;

const KNOWN_FLAGS = new Set(["--desktop", "--ipad", "--landscape", "--keep-size"]);

/** Resizes the window and emulates the device, in that order. */
export async function applyLayout(page, layout) {
    if (layout.size) {
        await page.evaluate((size) => window.electron.remote.getCurrentWindow().setBounds(size, false), layout.size);
    }
    // Sizing first means the reload comes up at the new width: is-phone follows
    // the viewport, not the emulation.
    if (layout.mobile === (await page.evaluate(() => window.app.isMobile))) return false;
    // emulateMobile reloads the renderer, which tears this call's context down
    // with it — the reload is the result, not an error.
    await page.evaluate((on) => window.app.emulateMobile(on), layout.mobile).catch(() => {});
    await page.waitForFunction(() => window.app?.workspace?.layoutReady === true, null, { timeout: 60_000 });
    return true;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes("--help") || args.includes("-h")) {
        console.log(USAGE);
        return;
    }
    const unknown = args.filter((arg) => !KNOWN_FLAGS.has(arg));
    if (unknown.length) {
        console.error(
            `Unknown option${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}\nRun: pnpm run layout --help`
        );
        process.exit(1);
    }

    const port = runningPort();
    if (port === null) {
        console.error("No Obsidian with a debugging port — start one with: pnpm run open");
        process.exit(1);
    }

    const layout = layoutFrom(args);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    try {
        const page = browser
            .contexts()
            .flatMap((context) => context.pages())
            .find((candidate) => candidate.url().includes("obsidian.md"));
        if (!page) throw new Error(`Obsidian is on port ${port}, but no vault window is open.`);
        // Attaching over CDP emulates a light colour scheme; null hands the
        // system preference straight back.
        await page.emulateMedia({ colorScheme: null });

        const reloaded = await applyLayout(page, layout);
        if (reloaded) {
            // A reload drops the stream's leaf back to deferred; reopening it is
            // what `pnpm run open` does on a cold start.
            await page.evaluate(async (viewType) => {
                const { workspace } = window.app;
                const leaf = workspace.getLeavesOfType(viewType)[0] ?? workspace.getLeaf(true);
                await leaf.setViewState({ type: viewType, active: true });
                workspace.revealLeaf(leaf);
            }, VIEW_TYPE);
            await page.waitForFunction(
                () =>
                    [...document.querySelectorAll(".daily-notes-stream-container")].some(
                        (el) => el.offsetParent !== null
                    ),
                null,
                { timeout: 30_000 }
            );
        }

        const classes = await page.evaluate(() =>
            [...document.body.classList].filter((name) => name === "is-mobile" || name === "is-phone").join(" ")
        );
        const size = layout.size ? ` in a ${layout.size.width}x${layout.size.height} window` : "";
        console.log(`Layout: ${classes || "desktop"}${size}.`);
    } finally {
        await browser.close();
    }
}

if (isMain(import.meta.url)) await main();
