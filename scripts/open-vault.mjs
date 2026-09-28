/**
 * Opens the demo vault, or the test vault with --test, in Obsidian, plugin
 * enabled and mobile emulation on, then detaches and leaves the window running.
 * The step of `pnpm run demo` that opens the window; its options are these.
 *
 * Own instance against `.dev/obsidian-userdata`, so your real config and vaults
 * are untouched and both can run at once. That directory persists — settings and
 * the trust prompt stay put; delete it for a clean slate.
 */
import { chromium } from "@playwright/test";
import { execFileSync, spawn } from "child_process";
import { createServer } from "net";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { boundsFor, emulateDevice, layoutFrom } from "./window-layout.mjs";
import { PLUGIN_ID, vaultFrom } from "./vaults.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OBSIDIAN = process.env.OBSIDIAN_PATH ?? "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const VIEW_TYPE = "daily-notes-stream-view";
const VAULT_ID = "dev00000000000001";
const args = process.argv.slice(2);

const USAGE = `pnpm run demo [options] [vault]

Opens .dev/demo-vault/ in its own Obsidian with the plugin enabled, the stream
view showing and mobile emulation on, then reloads the plugin on every save
until Ctrl-C. Reseeds the vault first, and builds if there is no build.

Vault (default: the demo vault)
  --test          the test vault, .dev/vault/, that docs/TESTING.md uses
  [vault]         any other vault, by path

Size and layout (default: phone portrait)
  --ipad          tablet window, 820x1180 — is-mobile without is-phone
  --landscape     turn the phone or iPad size on its side
  --desktop       desktop window, 1280x860, no mobile emulation
  --keep-size     leave the window at the size it last had

Placement (default: 40,40 on the main display)
  --position x,y  place the window (phone mode has no drag region to move it by)

  --help, -h      this message

is-phone follows the window: either dimension under 600px turns it on, so a
phone keeps the phone layout in landscape and an iPad never takes it.
Everything runs against .dev/obsidian-userdata — your real Obsidian config and
vaults are untouched, and the two can run side by side.`;

if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
}

// A silently ignored typo (--ipad2) opens the wrong layout and looks like a bug.
const KNOWN_FLAGS = new Set(["--test", "--desktop", "--ipad", "--landscape", "--keep-size", "--position"]);
const unknown = args.filter((arg) => arg.startsWith("--") && !KNOWN_FLAGS.has(arg.split("=")[0]));
if (unknown.length) {
    console.error(`Unknown option${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}\nRun: pnpm run demo --help`);
    process.exit(1);
}

/** Reads `--flag value` and `--flag=value` alike. */
const flagValue = (name) => {
    const inline = args.find((arg) => arg.startsWith(`${name}=`));
    if (inline) return inline.slice(name.length + 1);
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
};

const parsePosition = (value) => {
    if (value === undefined) return null;
    const match = /^(-?\d+),(-?\d+)$/.exec(value.trim());
    if (!match) {
        console.error(`--position wants x,y in pixels (e.g. --position 900,60), got: ${value}`);
        process.exit(1);
    }
    return { x: Number(match[1]), y: Number(match[2]) };
};

const layout = layoutFrom(args);
const windowSize = layout.size;
const position = parsePosition(flagValue("--position"));
// A value consumed by a flag is not the vault path.
const consumed = new Set(["--position"]);
const positional = args.filter((arg, index) => !arg.startsWith("--") && !consumed.has(args[index - 1]));
const vault = vaultFrom(positional[0], args);
const userDataDir = join(REPO, ".dev", "obsidian-userdata");

const freePort = () =>
    new Promise((res, rej) => {
        const srv = createServer();
        srv.on("error", rej);
        srv.listen(0, "127.0.0.1", () => {
            const { port } = srv.address();
            srv.close(() => res(port));
        });
    });

const connect = async (port) => {
    const deadline = Date.now() + 60_000;
    for (;;) {
        try {
            return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        } catch (error) {
            if (Date.now() > deadline) throw error;
            await new Promise((r) => setTimeout(r, 500));
        }
    }
};

/**
 * A surviving Electron helper holds the single-instance lock, and the next launch
 * then exits silently without opening its debugging port. Clear the whole group.
 */
const stopExisting = () => {
    const running = () => {
        try {
            return (
                execFileSync("pgrep", ["-f", `user-data-dir=${userDataDir}`], { encoding: "utf8" }).trim().length > 0
            );
        } catch {
            return false; // pgrep exits 1 when nothing matches.
        }
    };
    if (!running()) return;
    try {
        execFileSync("pkill", ["-f", `user-data-dir=${userDataDir}`]);
    } catch {
        // Already gone between the check and the kill.
    }
    const deadline = Date.now() + 10_000;
    while (running() && Date.now() < deadline) execFileSync("sleep", ["0.2"]);
};

mkdirSync(userDataDir, { recursive: true });
stopExisting();
writeFileSync(
    join(userDataDir, "obsidian.json"),
    JSON.stringify({ vaults: { [VAULT_ID]: { path: vault, ts: Date.now(), open: true } }, updateDisabled: true })
);

// Bounds are per vault and read at startup: writing them here opens the window
// in place instead of moving it afterwards.
{
    const boundsPath = join(userDataDir, `${VAULT_ID}.json`);
    let saved = {};
    if (existsSync(boundsPath)) {
        try {
            saved = JSON.parse(readFileSync(boundsPath, "utf8"));
        } catch {
            // A corrupt bounds file is not worth failing the launch over.
        }
    }
    // Placed every run, not only when asked: bounds persist, so without this a
    // window opens wherever the last run left it.
    writeFileSync(boundsPath, JSON.stringify(boundsFor({ saved, size: windowSize, position })));
}

const port = await freePort();
spawn(OBSIDIAN, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`], {
    stdio: "ignore",
    detached: true,
}).unref();

const browser = await connect(port);
const page = browser.contexts()[0].pages()[0];
// Attaching over CDP makes Playwright emulate a light color scheme, so the
// window opens light and only returns to the system theme when this script
// detaches. null hands the preference back immediately.
await page.emulateMedia({ colorScheme: null });
await page.waitForFunction(() => window.app?.workspace?.layoutReady === true, null, { timeout: 60_000 });

// A vault that ships plugins raises a one-time trust prompt whose overlay
// swallows every click until it is answered. A loaded plugin means it was
// answered already: without that race, every later run waits the full timeout
// for a modal that never comes.
const trust = page.locator(".modal-container button", { hasText: "Trust author and enable plugins" });
await Promise.race([
    trust.waitFor({ state: "visible", timeout: 10_000 }),
    page.waitForFunction((pluginId) => Boolean(window.app.plugins.plugins[pluginId]), PLUGIN_ID, { timeout: 10_000 }),
]).catch(() => {});
if (await trust.count()) await trust.click();

await page.evaluate(async (pluginId) => {
    const { plugins } = window.app;
    if (!plugins.enabled) await plugins.setEnable(true);
    if (!plugins.plugins[pluginId]) await plugins.enablePlugin(pluginId);
}, PLUGIN_ID);
await page.waitForFunction((pluginId) => Boolean(window.app.plugins.plugins[pluginId]), PLUGIN_ID, {
    timeout: 30_000,
});

// Enabling plugins leaves the settings pane open, and an open modal keeps the
// stream leaf deferred — a deferred view never renders.
await page.evaluate(() => window.app.setting?.close?.());

// The reload takes any open leaf with it, so this precedes opening the view.
await emulateDevice(page, layout.mobile);

// Obsidian restores the previous session's leaves, so reuse a stream view if
// one came back rather than stacking up a new tab on every run.
await page.evaluate(async (viewType) => {
    const { workspace } = window.app;
    const [existing, ...duplicates] = workspace.getLeavesOfType(viewType);
    // A run that failed part-way still left its tab behind; keep one.
    for (const duplicate of duplicates) duplicate.detach();
    const leaf = existing ?? workspace.getLeaf(true);
    await leaf.setViewState({ type: viewType, active: true });
    workspace.revealLeaf(leaf);
}, VIEW_TYPE);
// A deferred or background leaf keeps its container in the DOM but unrendered;
// wait for one that is actually on screen.
await page.waitForFunction(
    () => [...document.querySelectorAll(".daily-notes-stream-container")].some((el) => el.offsetParent !== null),
    null,
    { timeout: 30_000 }
);

const shown = await page.evaluate(() => ({
    mobile: document.body.classList.contains("is-mobile"),
    phone: document.body.classList.contains("is-phone"),
    theme: document.body.className.match(/theme-\w+/)?.[0] ?? "unknown",
}));

await browser.close();
const classes = [shown.mobile && "is-mobile", shown.phone && "is-phone"].filter(Boolean).join(" ");
console.log(
    `Obsidian is open on ${vault} with the stream view showing.\n` +
        `Layout: ${classes || "desktop"}${windowSize ? ` in a ${windowSize.width}x${windowSize.height} window` : ""}, ${shown.theme}.\n` +
        "Other sizes and placement: pnpm run demo --help"
);
