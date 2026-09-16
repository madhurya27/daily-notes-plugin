/**
 * Opens PluginTest/ in Obsidian, plugin enabled and mobile emulation on, then
 * detaches and leaves the window running.
 *
 *   node scripts/open-test-vault.mjs [options] [vault]   (--help lists the options)
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

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OBSIDIAN = process.env.OBSIDIAN_PATH ?? "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const PLUGIN_ID = "daily-notes-stream";
const VIEW_TYPE = "daily-notes-stream-view";
const VAULT_ID = "dev00000000000001";
/**
 * Portrait sizes; --landscape swaps them. `is-mobile` comes from emulateMobile,
 * `is-phone` from either dimension under 600px — so a phone stays a phone on its
 * side, and the iPad stays tablet-only: mobile CSS without the phone layer.
 */
const MOBILE_WINDOWS = {
    phone: { width: 420, height: 900 },
    ipad: { width: 820, height: 1180 },
};

const args = process.argv.slice(2);

const USAGE = `pnpm run open [options] [vault]

Opens PluginTest/ in its own Obsidian with the plugin enabled, the stream view
showing and mobile emulation on, then detaches and leaves the window up.

Size and layout (default: phone portrait)
  --ipad          tablet window, 820x1180 — is-mobile without is-phone
  --landscape     turn the phone or iPad size on its side
  --desktop       ordinary window, no mobile emulation
  --keep-size     emulate, but leave the window at its saved size

Placement (default: 40,40 on the main display)
  --position x,y  place the window (phone mode has no drag region to move it by)
  --secondary     open on the second display
  --display N     open on display N, counting from 1

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
const KNOWN_FLAGS = new Set([
    "--desktop",
    "--ipad",
    "--landscape",
    "--keep-size",
    "--position",
    "--secondary",
    "--display",
]);
const unknown = args.filter((arg) => arg.startsWith("--") && !KNOWN_FLAGS.has(arg.split("=")[0]));
if (unknown.length) {
    console.error(`Unknown option${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}\nRun: pnpm run open --help`);
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

const device = args.includes("--desktop") ? "desktop" : args.includes("--ipad") ? "ipad" : "phone";
const mobile = device !== "desktop";
const portrait = mobile && !args.includes("--keep-size") ? MOBILE_WINDOWS[device] : null;
const windowSize =
    portrait && args.includes("--landscape") ? { width: portrait.height, height: portrait.width } : portrait;
const position = parsePosition(flagValue("--position"));
// 1 is the main display; --secondary is shorthand for the next one along.
const displayArg = flagValue("--display") ?? (args.includes("--secondary") ? "2" : undefined);
const display = displayArg === undefined ? null : Number(displayArg);
if (display !== null && (!Number.isInteger(display) || display < 1)) {
    console.error(`--display wants a screen number from 1, got: ${displayArg}`);
    process.exit(1);
}
// A value consumed by a flag is not the vault path.
const consumed = new Set(["--position", "--display"]);
const positional = args.filter((arg, index) => !arg.startsWith("--") && !consumed.has(args[index - 1]));
const vault = resolve(positional[0] ?? join(REPO, "PluginTest"));
const userDataDir = join(REPO, ".dev", "obsidian-userdata");

if (!existsSync(join(vault, ".obsidian", "plugins", PLUGIN_ID, "main.js"))) {
    console.error(`No plugin build in ${vault}. Run: pnpm run build && pnpm run seed`);
    process.exit(1);
}

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
 * Every display in top-left origin, the space Obsidian stores bounds in. NSScreen
 * reports Cocoa frames — origin bottom-left of the *main* display, y upwards — so
 * each is flipped against the main display's height.
 */
const screens = () => {
    const script =
        "ObjC.import('AppKit'); $.NSScreen.screens.js.map(s => " +
        "[s.frame.origin.x, s.frame.origin.y, s.frame.size.width, s.frame.size.height].join(',')).join(';')";
    try {
        const out = execFileSync("osascript", ["-l", "JavaScript", "-e", script], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        const frames = out.split(";").map((frame) => frame.split(",").map(Number));
        const mainHeight = frames[0]?.[3];
        if (!mainHeight) return null;
        return frames.map(([x, y, width, height]) => ({ x, y: mainHeight - (y + height), width, height }));
    } catch {
        return null; // Fall through: macOS clamps a window back onto a display.
    }
};

const FALLBACK_SCREEN = { x: 0, y: 0, width: 1440, height: 900 };

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
    // --keep-size keeps the last session's size, and the rest of the file with
    // it — Obsidian stores zoom and maximised state there too.
    let bounds = { x: 60, y: 40, isMaximized: false, zoom: 0 };
    if (existsSync(boundsPath)) {
        try {
            bounds = { ...bounds, ...JSON.parse(readFileSync(boundsPath, "utf8")) };
        } catch {
            // A corrupt bounds file is not worth failing the launch over.
        }
    }
    const displays = screens();
    let screen = displays?.[0] ?? FALLBACK_SCREEN;
    if (display !== null) {
        const chosen = displays?.[display - 1];
        if (!chosen) {
            const found = displays?.length ?? 0;
            console.error(`No display ${display}: macOS reports ${found} screen${found === 1 ? "" : "s"}.`);
            process.exit(1);
        }
        screen = chosen;
    }
    // Placed every run, not only when asked: bounds persist, so without this a
    // window opens wherever the last run happened to put it. This window is one
    // to watch, so it belongs on the main display unless asked otherwise — the
    // hidden e2e run is the one that goes to a second screen.
    bounds.x = screen.x + 40;
    bounds.y = screen.y + 40;
    bounds.isMaximized = false;
    if (windowSize) {
        bounds.width = Math.min(windowSize.width, screen.width - 80);
        bounds.height = Math.min(windowSize.height, screen.height - 80);
    }
    // An explicit position wins over the display's default corner.
    if (position) {
        bounds.x = position.x;
        bounds.y = position.y;
        bounds.isMaximized = false;
    }
    writeFileSync(boundsPath, JSON.stringify(bounds));
}

const port = await freePort();
spawn(OBSIDIAN, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`], {
    stdio: "ignore",
    detached: true,
}).unref();

const browser = await connect(port);
const page = browser.contexts()[0].pages()[0];
// Attaching over CDP makes Playwright emulate a light colour scheme, so the
// window opens light and only returns to the system theme when this script
// detaches. null hands the preference back immediately.
await page.emulateMedia({ colorScheme: null });
await page.waitForFunction(() => window.app?.workspace?.layoutReady === true, null, { timeout: 60_000 });

// A vault that ships plugins raises a one-time trust prompt whose overlay
// swallows every click until it is answered.
const trust = page.locator(".modal-container button", { hasText: "Trust author and enable plugins" });
await trust.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
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

// emulateMobile tears the workspace down and rebuilds it, taking any open
// leaf with it, so it has to happen before the view is opened.
if (mobile !== (await page.evaluate(() => window.app.isMobile))) {
    await page.evaluate((on) => window.app.emulateMobile(on), mobile);
    await page.waitForFunction(() => window.app?.workspace?.layoutReady === true, null, { timeout: 60_000 });
}

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

const layout = await page.evaluate(() => ({
    mobile: document.body.classList.contains("is-mobile"),
    phone: document.body.classList.contains("is-phone"),
    theme: document.body.className.match(/theme-\w+/)?.[0] ?? "unknown",
}));

await browser.close();
const classes = [layout.mobile && "is-mobile", layout.phone && "is-phone"].filter(Boolean).join(" ");
console.log(
    `Obsidian is open on ${vault} with the stream view showing.\n` +
        `Layout: ${classes || "desktop"}${windowSize ? ` in a ${windowSize.width}x${windowSize.height} window` : ""}, ${layout.theme}.\n` +
        "Toggle emulation in the console any time: this.app.emulateMobile(false)\n" +
        "Other sizes, placement and displays: pnpm run open --help"
);
