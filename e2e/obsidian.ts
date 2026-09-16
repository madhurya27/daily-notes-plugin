import { test as base, chromium, expect, type Browser, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "child_process";
import { createServer } from "net";
import { mkdirSync, mkdtempSync, writeFileSync, copyFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const OBSIDIAN = process.env.OBSIDIAN_PATH ?? "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const OBSIDIAN_BUNDLE = process.env.OBSIDIAN_BUNDLE ?? "/Applications/Obsidian.app";
/** Set to watch the run happen; otherwise the window never reaches the screen. */
const SHOW_WINDOW = process.env.E2E_SHOW_WINDOW === "1";
const VAULT_ID = "e2e0000000000001";

// A hidden window is an occluded window, and Chromium stops servicing occluded
// renderers: timers slow to a crawl and IntersectionObserver stops firing, which
// is exactly what the infinite-scroll tests wait on.
const NO_THROTTLE = [
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
];
/**
 * The physical window is shrunk to Obsidian's minimum and parked in a screen
 * corner, so the unavoidable flash before the hide lands is a small square
 * rather than a full-size window. The renderer is then told to lay out at
 * VIEWPORT regardless, so tests see an ordinary viewport.
 */
const MIN_WINDOW = { width: 300, height: 200 };
const VIEWPORT = { width: 1024, height: 800 };
/** Narrow enough for is-phone, which switches at 600px. */
const PHONE_VIEWPORT = { width: 420, height: 800 };
const PLUGIN_ID = "daily-notes-stream";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Daily notes seeded into every fixture vault, newest last. */
export const SEEDED_DAYS = 14;

function freePort(): Promise<number> {
    return new Promise((res, rej) => {
        const srv = createServer();
        srv.on("error", rej);
        srv.listen(0, "127.0.0.1", () => {
            const { port } = srv.address() as { port: number };
            srv.close(() => res(port));
        });
    });
}

function noteBody(day: number): string {
    return [
        "---",
        `mood: day-${day}`,
        "tags:",
        "  - daily",
        "---",
        "",
        "## Morning",
        "",
        `Ran ${day} km before work.`,
        "",
        "### Warm-up",
        "",
        "Stretching first.",
        "",
        "## Evening",
        "",
        "- Groceries",
        "    - Milk",
        "    - Bread",
        "- Read a chapter",
        "",
        "## Wide content",
        "",
        "| Day | Distance | Pace | Heart rate | Weather | Route | Notes |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        `| ${day} | 8 km | 5:12 | 148 | Overcast | Riverside loop | Felt easy |`,
        "",
        "```ts",
        "const wide = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5, zeta: 6, eta: 7, theta: 8 };",
        "```",
        "",
        "## Tasks",
        "",
        "- [ ] Parent task",
        "    - [ ] Child task",
        "",
    ].join("\n");
}

/** Writes a vault with `SEEDED_DAYS` daily notes and the built plugin installed. */
function seedVault(): string {
    const vault = mkdtempSync(join(tmpdir(), "dns-vault-"));
    const config = join(vault, ".obsidian");
    mkdirSync(join(vault, "Notes"), { recursive: true });
    mkdirSync(join(config, "plugins", PLUGIN_ID), { recursive: true });

    for (let day = 1; day <= SEEDED_DAYS; day++) {
        const date = `2026-03-${String(day).padStart(2, "0")}`;
        writeFileSync(join(vault, "Notes", `${date}.md`), noteBody(day));
    }

    // Core daily-notes settings the plugin reads through the interface package.
    writeFileSync(join(config, "daily-notes.json"), JSON.stringify({ folder: "Notes", format: "YYYY-MM-DD" }));
    // Follow the system light/dark setting rather than Obsidian's own default.
    writeFileSync(join(config, "appearance.json"), JSON.stringify({ theme: "system" }));
    writeFileSync(join(config, "community-plugins.json"), JSON.stringify([PLUGIN_ID]));
    writeFileSync(join(config, "core-plugins.json"), JSON.stringify({ "daily-notes": true }));

    for (const asset of ["main.js", "manifest.json", "styles.css"]) {
        copyFileSync(join(REPO, asset), join(config, "plugins", PLUGIN_ID, asset));
    }
    return vault;
}

export interface ObsidianApp {
    page: Page;
    vaultPath: string;
    /** Whether macOS currently has the app hidden. */
    isHidden: () => boolean;
    /** Whether macOS currently has the app in front of everything else. */
    isFrontmost: () => boolean;
    /** The window's real size and position, as macOS sees it. */
    windowBounds: () => { width: number; height: number; x: number; y: number } | null;
}

async function launch(): Promise<{
    app: ObsidianApp;
    dispose: () => Promise<void>;
}> {
    const vaultPath = seedVault();
    const userDataDir = mkdtempSync(join(tmpdir(), "dns-userdata-"));
    writeFileSync(
        join(userDataDir, "obsidian.json"),
        JSON.stringify({
            vaults: { [VAULT_ID]: { path: vaultPath, ts: Date.now(), open: true } },
            updateDisabled: true,
        })
    );

    // Obsidian keeps window bounds per vault. Bounds fully off the screen are
    // rejected outright (it falls back to a centred 1024x800); a corner is
    // clamped to fit, which is what we want.
    if (!SHOW_WINDOW) {
        // The corner has to be a point some display actually contains: bounds
        // landing on no screen are rejected, and Obsidian then centres a
        // full-size window, which flashes over the user's work before the hide.
        // An extended desktop is where a "past the edge" guess stops clamping.
        const screen = secondaryScreen() ?? mainScreen();
        writeFileSync(
            join(userDataDir, `${VAULT_ID}.json`),
            JSON.stringify({
                ...MIN_WINDOW,
                x: screen.x + screen.width - MIN_WINDOW.width,
                y: screen.y + screen.height - MIN_WINDOW.height,
                isMaximized: false,
                zoom: 0,
            })
        );
    } else {
        // A watched run is still a run: park it on a second display if there is
        // one, rather than over whatever the user is doing on their main screen.
        const secondary = secondaryScreen();
        if (secondary) {
            writeFileSync(
                join(userDataDir, `${VAULT_ID}.json`),
                JSON.stringify({
                    width: Math.min(VIEWPORT.width, secondary.width - 80),
                    height: Math.min(VIEWPORT.height, secondary.height - 80),
                    x: secondary.x + 40,
                    y: secondary.y + 40,
                    isMaximized: false,
                    zoom: 0,
                })
            );
        }
    }

    const port = await freePort();
    const args = [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`, ...NO_THROTTLE];
    // Whoever owns the screen right now gets it back if Obsidian grabs focus.
    const focusOwner = SHOW_WINDOW ? null : frontmostApp();
    // detached: Electron spawns helper processes, and killing only the parent
    // orphans them. Its own process group can be signalled as a unit.
    const proc: ChildProcess | null = SHOW_WINDOW
        ? spawn(OBSIDIAN, args, { stdio: "ignore", detached: true })
        : launchHidden(args, userDataDir);

    let browser: Browser | null = null;
    let hider: ChildProcess | null = null;
    // Defined before startup runs: a throw anywhere below must still tear the
    // instance down, or a failed run leaves an Obsidian window in the dock.
    const dispose = async () => {
        hider?.kill();
        await browser?.close().catch(() => {});
        if (proc) await killTree(proc);
        else killByUserDataDir(userDataDir);
        rmSync(vaultPath, { recursive: true, force: true });
        rmSync(userDataDir, { recursive: true, force: true });
    };

    try {
        // Armed before the window paints: the CDP port is not open yet, so
        // there is nothing to hide, but there is also nothing left to miss.
        if (!SHOW_WINDOW) hider = watchAndHide(await awaitMainProcess(userDataDir), focusOwner);
        const app = await startUp((browser = await connectWithRetry(port)), userDataDir, vaultPath);
        if (hider) {
            hider.kill();
            hider = null;
            // Startup is over, so nothing will show the window again; make the
            // hidden state one Node observed rather than one AppleScript left.
            hideApp(userDataDir);
        }
        return { app, dispose };
    } catch (error) {
        await dispose();
        throw error;
    }
}

/** Drives Obsidian's first-run dance until the plugin is live and the window hidden. */
async function startUp(browser: Browser, userDataDir: string, vaultPath: string): Promise<ObsidianApp> {
    const context = browser.contexts()[0]!;
    const page = context.pages()[0]!;
    // The window itself is 300x200 in a corner; lay the page out at a normal
    // size so viewport-sensitive behaviour (infinite scroll) is realistic.
    if (!SHOW_WINDOW) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });
    }
    // Playwright emulates a light color scheme on attach; null restores the
    // system preference so the window matches the rest of the desktop.
    await page.emulateMedia({ colorScheme: null });
    await page.waitForLoadState("domcontentloaded");
    // layoutReady fires once the workspace (and plugin loading) has settled.
    await page.waitForFunction(() => window.app?.workspace?.layoutReady === true, null, {
        timeout: 60_000,
    });

    // Opening a vault that ships plugins raises a one-time trust prompt, and its
    // modal overlay swallows every click until it is answered.
    const trustButton = page.locator(".modal-container button", {
        hasText: "Trust author and enable plugins",
    });
    await trustButton.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    if (await trustButton.count()) await trustButton.click();

    await page.evaluate(async (pluginId) => {
        const plugins = window.app.plugins;
        // Restricted mode blocks community plugins; the fixture opts in.
        if (!plugins.enabled) await plugins.setEnable(true);
        if (!plugins.plugins[pluginId]) await plugins.enablePlugin(pluginId);
    }, PLUGIN_ID);
    await page.waitForFunction((pluginId) => Boolean(window.app.plugins.plugins[pluginId]), PLUGIN_ID, {
        timeout: 30_000,
    });

    // Enabling plugins leaves the settings pane open. It covers the workspace,
    // which keeps our leaf deferred — a deferred view never renders.
    await page.evaluate(() => window.app.setting?.close?.());
    await expect(page.locator(".modal-container")).toHaveCount(0);

    const isHidden = () => {
        const pid = mainProcessPid(userDataDir);
        return pid !== null && systemEvents(pid, "get visible") === "false";
    };
    const isFrontmost = () => {
        const pid = mainProcessPid(userDataDir);
        return pid !== null && systemEvents(pid, "get frontmost") === "true";
    };

    const windowBounds = () => {
        const pid = mainProcessPid(userDataDir);
        if (pid === null) return null;
        const size = systemEvents(pid, "get size of first window");
        const position = systemEvents(pid, "get position of first window");
        if (!size || !position) return null;
        const [width, height] = size.split(",").map((n) => Number(n.trim()));
        const [x, y] = position.split(",").map((n) => Number(n.trim()));
        if ([width, height, x, y].some((n) => !Number.isFinite(n))) return null;
        return { width: width!, height: height!, x: x!, y: y! };
    };

    return { page, vaultPath, isHidden, isFrontmost, windowBounds };
}

/**
 * Launches Obsidian through LaunchServices with -g -j so it starts hidden and
 * never steals focus. `open` exits immediately and hands back no pid, so the
 * caller gets null and cleans up by matching the user-data-dir instead — which
 * also catches the helper processes, since they inherit the flag.
 */
function launchHidden(args: string[], userDataDir: string): null {
    execFileSync("open", ["-n", "-g", "-j", "-a", OBSIDIAN_BUNDLE, "--args", ...args], { stdio: "ignore" });
    return null;
}

/** The main display's size, so the window can be parked in its far corner. */
function screenSize(): { width: number; height: number } {
    try {
        const out = execFileSync("osascript", ["-e", 'tell application "Finder" to get bounds of window of desktop'], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        const [, , width, height] = out.split(",").map((n) => Number(n.trim()));
        if (width && height) return { width, height };
    } catch {
        // Fall through to a size no display exceeds by much; macOS clamps anyway.
    }
    return { width: 5000, height: 3000 };
}

interface Screen {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The main display, or a size no display exceeds by much if macOS won't say. */
function mainScreen(): Screen {
    const { width, height } = screenSize();
    return { x: 0, y: 0, width, height };
}

/**
 * The display beside the main one, in the top-left coordinates Obsidian stores
 * window bounds in — NSScreen reports Cocoa frames, whose origin is the main
 * display's bottom-left with y growing upwards.
 */
function secondaryScreen(): Screen | null {
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
        const second = frames[1];
        if (!mainHeight || !second) return null;
        const [x, y, width, height] = second as [number, number, number, number];
        return { x, y: mainHeight - (y + height), width, height };
    } catch {
        return null;
    }
}

/** The app that owns the screen, so focus can be handed straight back to it. */
function frontmostApp(): string | null {
    try {
        const script = 'tell application "System Events" to get name of first process whose frontmost is true';
        return (
            execFileSync("osascript", ["-e", script], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim() || null
        );
    } catch {
        return null;
    }
}

/** Waits for this run's Electron main process to exist, so it can be addressed. */
async function awaitMainProcess(userDataDir: string): Promise<number> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const pid = mainProcessPid(userDataDir);
        if (pid !== null) return pid;
        await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("Obsidian did not start");
}

/**
 * Keeps the window off the screen for the whole of startup, and gives focus
 * back when it is taken. `open -g -j` only stops LaunchServices activating the
 * app — Obsidian shows and focuses its own window twice, when it first paints
 * and again once the vault has opened. Hiding from Node reacts a poll too late
 * (about a third of a second of stolen focus each time), so the loop lives
 * inside one long-running osascript that reacts within a frame or two. It is
 * bounded rather than infinite: a crashed run must not strand it.
 */
function watchAndHide(pid: number, focusOwner: string | null): ChildProcess {
    const restore = focusOwner ? `set frontmost of (first process whose name is "${focusOwner}") to true` : "";
    // The process is resolved once: looking it up by unix id is the slow part,
    // and every millisecond spent on it is a millisecond of visible window.
    const script = `tell application "System Events"
        set p to first process whose unix id is ${pid}
        repeat 6000 times
            try
                if visible of p is true then
                    set visible of p to false
                    ${restore}
                end if
            end try
            delay 0.02
        end repeat
    end tell`;
    return spawn("osascript", ["-e", script], { stdio: "ignore" });
}

/**
 * Hides the app, waiting for it to own a window first — hiding before that
 * window exists is undone by the show, and seeding the window offscreen does not
 * work either: macOS clamps saved bounds back onto a display. The watcher above
 * does the hiding during startup; this settles the final state afterwards.
 */
function hideApp(userDataDir: string): void {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        const pid = mainProcessPid(userDataDir);
        if (
            pid !== null &&
            systemEvents(pid, "count of windows") !== "0" &&
            systemEvents(pid, "set visible to false") !== null
        ) {
            return;
        }
        execFileSync("sleep", ["0.25"]);
    }
    throw new Error("Could not hide the Obsidian window; re-run with E2E_SHOW_WINDOW=1");
}

/** Runs one System Events statement against a process; null when it is not addressable yet. */
function systemEvents(pid: number, statement: string): string | null {
    try {
        const script = `tell application "System Events" to tell (first process whose unix id is ${pid}) to ${statement}`;
        return execFileSync("osascript", ["-e", script], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return null;
    }
}

/** The Electron main process for this run: our user-data-dir, no --type= helper flag. */
function mainProcessPid(userDataDir: string): number | null {
    const ps = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
    for (const line of ps.split("\n")) {
        if (!line.includes(userDataDir) || line.includes("--type=")) continue;
        const pid = Number(line.trim().split(/\s+/)[0]);
        if (Number.isFinite(pid)) return pid;
    }
    return null;
}

/** Kills every process whose command line carries this run's user-data-dir. */
function killByUserDataDir(userDataDir: string): void {
    for (const signal of ["-TERM", "-KILL"]) {
        try {
            execFileSync("pkill", [signal, "-f", userDataDir], { stdio: "ignore" });
        } catch {
            // pkill exits 1 when nothing matched — the process is already gone.
        }
    }
}

/** Signals the whole Electron process group, escalating if it lingers. */
async function killTree(proc: ChildProcess): Promise<void> {
    if (proc.pid === undefined) return;
    const exited = new Promise<void>((res) => proc.once("exit", () => res()));
    try {
        process.kill(-proc.pid, "SIGTERM");
    } catch {
        proc.kill("SIGTERM");
    }
    const timer = new Promise<"timeout">((res) => setTimeout(() => res("timeout"), 5_000));
    if ((await Promise.race([exited, timer])) === "timeout") {
        try {
            process.kill(-proc.pid, "SIGKILL");
        } catch {
            proc.kill("SIGKILL");
        }
    }
}

/** Obsidian needs a moment before the debugging port accepts connections. */
async function connectWithRetry(port: number): Promise<Browser> {
    const deadline = Date.now() + 60_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try {
            return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        } catch (error) {
            lastError = error;
            await new Promise((r) => setTimeout(r, 500));
        }
    }
    throw new Error(`Could not attach to Obsidian on port ${port}: ${String(lastError)}`);
}

interface WorkerFixtures {
    obsidian: ObsidianApp;
    /** Set per project: every spec runs once as a desktop and once as a phone. */
    mobileLayout: boolean;
}

/** One Obsidian instance per worker; tests share it and open a fresh view each. */
export const test = base.extend<object, WorkerFixtures>({
    mobileLayout: [false, { scope: "worker", option: true }],
    obsidian: [
        async ({ mobileLayout }, use: (app: ObsidianApp) => Promise<void>) => {
            const { app, dispose } = await launch();
            if (mobileLayout) await applyMobileLayout(app.page);
            await use(app);
            await dispose();
        },
        { scope: "worker", timeout: 120_000 },
    ],
});

/**
 * Puts the instance in Obsidian's phone layout for the whole worker: is-mobile
 * comes from emulateMobile, is-phone only from a narrow viewport, and the bugs
 * this catches (a wide table pushing the page sideways, a cursor promising a
 * tap that does nothing) need both.
 */
async function applyMobileLayout(page: Page): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
        ...PHONE_VIEWPORT,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await page.evaluate(() => window.app.emulateMobile(true));
    // emulateMobile tears the workspace down and rebuilds it; every leaf goes
    // with it, so tests must open their own view afterwards (they all do).
    await page.waitForFunction(() => window.app.workspace.layoutReady === true, null, { timeout: 60_000 });
}

/** The per-project option playwright.config.ts sets. */
export interface MobileLayoutOptions {
    mobileLayout: boolean;
}

/** The viewport each project lays out at. */
export const LAYOUT_VIEWPORT = { desktop: VIEWPORT, mobile: PHONE_VIEWPORT };

/**
 * Opens a *fresh* stream view and returns its container locator. Tests share one
 * Obsidian instance, so an existing view would carry the previous test's loaded
 * range and scroll position into this one.
 */
export async function openStream(page: Page) {
    await page.evaluate(async () => {
        const type = "daily-notes-stream-view";
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
        window.app.workspace.detachLeavesOfType(type);

        // Tearing down the emptied tab outlives the leaf count dropping to 0, and
        // a view opened inside that window gets cleaned up with it. Retry until
        // one sticks rather than guessing a settle delay.
        for (let attempt = 0; attempt < 5; attempt++) {
            await wait(300);
            await window.app.commands.executeCommandById("daily-notes-stream:open-stream");
            await wait(300);
            if (window.app.workspace.getLeavesOfType(type).length > 0) return;
        }
        throw new Error("stream view never opened");
    });
    const container = page.locator(".daily-notes-stream-container");
    await expect(container).toBeVisible();
    await expect(container.locator(".daily-note-block").first()).toBeVisible();
    return container;
}

export { expect };
