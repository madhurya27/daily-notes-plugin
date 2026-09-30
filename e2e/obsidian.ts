import { test as base, chromium, expect, type Browser, type Locator, type Page } from "@playwright/test";
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

// Hidden means occluded, and Chromium throttles occluded renderers: timers crawl
// and IntersectionObserver stops firing — what the scroll tests wait on.
const NO_THROTTLE = [
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
];
// Hidden in the phone layout, the window drew about a frame a second and a smooth
// scroll never moved. Drawing without vsync fixes that; on desktop, which draws
// normally hidden, it made the jump and menu tests flaky.
const PHONE_FRAMES = ["--disable-gpu-vsync", "--disable-frame-rate-limit"];
/**
 * Shrunk to Obsidian's minimum and parked in a corner, so the flash before the
 * hide is a small square. The renderer lays out at VIEWPORT regardless.
 */
const MIN_WINDOW = { width: 300, height: 200 };
const VIEWPORT = { width: 1024, height: 800 };
/** An iPhone Pro's screen in points: layouts that depend on width, like Bases' cards per row, match the phone. */
const PHONE_VIEWPORT = { width: 402, height: 874 };
const PLUGIN_ID = "daily-notes-stream";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Daily notes seeded into every fixture vault. Raise it for a run that needs a
 * vault the size of a real journal — see `pnpm run test:memory`.
 */
export const SEEDED_DAYS = Number(process.env.E2E_SEED_DAYS ?? 14);

/** The newest seeded note; the rest run backwards from here, one per day. */
const NEWEST_DAY = Date.UTC(2026, 2, 14);

/** `daysBack` days before the newest note, as YYYY-MM-DD. */
export function seededDate(daysBack: number): string {
    return new Date(NEWEST_DAY - daysBack * 86_400_000).toISOString().slice(0, 10);
}

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
        `Ran ${day} km before work. #running`,
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
        "- Read a chapter of [[Reading list]], then [[Someday]], then [[Reading list#Later|what's next]]",
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
        "https://example.com/a/deliberately/long/path/that/has/no/spaces/to/break/at/so/it/must/wrap/mid-word?query=value",
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

    for (let daysBack = 0; daysBack < SEEDED_DAYS; daysBack++) {
        const date = seededDate(daysBack);
        writeFileSync(join(vault, "Notes", `${date}.md`), noteBody(SEEDED_DAYS - daysBack));
    }

    // What the seeded notes link to; [[Someday]] stays unresolved. Long, so a
    // link to its last heading has somewhere to scroll.
    const books = Array.from({ length: 80 }, (_, i) => `- Book ${i + 1}`);
    writeFileSync(
        join(vault, "Reading list.md"),
        ["# Reading list", "", ...books, "", "## Later", "", "- Middlemarch", ""].join("\n")
    );

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
    isHidden: () => boolean;
    isFrontmost: () => boolean;
    windowBounds: () => { width: number; height: number; x: number; y: number } | null;
}

async function launch(extraArgs: string[]): Promise<{
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

    // Bounds are per vault. Fully off-screen is rejected (centered 1024x800
    // instead); a corner is clamped to fit, which is what we want.
    if (!SHOW_WINDOW) {
        // The corner must be a point some display contains, or Obsidian centers
        // a full-size window over the user's work. An extended desktop is where
        // a "past the edge" guess stops being clamped.
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
        // Park a watched run on a second display rather than over the user's work.
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
    const args = [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`, ...NO_THROTTLE, ...extraArgs];
    // detached: Electron's helpers outlive a parent-only kill; signal the group.
    const proc: ChildProcess | null = SHOW_WINDOW
        ? spawn(OBSIDIAN, args, { stdio: "ignore", detached: true })
        : launchHidden(args, userDataDir);

    let browser: Browser | null = null;
    // Defined before startup: a throw below must still tear the instance down.
    const dispose = async () => {
        await browser?.close().catch(() => {});
        if (proc) await killTree(proc);
        else killByUserDataDir(userDataDir);
        rmSync(vaultPath, { recursive: true, force: true });
        rmSync(userDataDir, { recursive: true, force: true });
    };

    try {
        // Armed as soon as Playwright can reach the page; the grab before that
        // is the only one left.
        const app = await startUp((browser = await connectWithRetry(port)), userDataDir, vaultPath);
        // Settles the hidden state, rather than trust the last event.
        if (!SHOW_WINDOW) hideApp(userDataDir);
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
    // The window is 300x200; lay the page out normally so scroll behaves.
    if (!SHOW_WINDOW) {
        await guardFocus(page);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });
    }
    // Playwright emulates light on attach; null restores the system preference.
    await page.emulateMedia({ colorScheme: null });
    await page.waitForLoadState("domcontentloaded");
    // layoutReady fires once the workspace (and plugin loading) has settled.
    await page.waitForFunction(() => window.app?.workspace?.layoutReady === true, null, {
        timeout: 60_000,
    });

    // A vault shipping plugins raises a trust prompt whose overlay eats clicks.
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

    // An open settings pane keeps the leaf deferred, and a deferred view never renders.
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
 * LaunchServices with -g -j: starts hidden, never steals focus. `open` returns no
 * pid, so cleanup matches the user-data-dir — which catches the helpers too.
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
 * bounds in. NSScreen reports Cocoa frames: origin bottom-left, y upwards.
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

/**
 * Takes the window out of the user's way from inside the app. `open -g -j` stops
 * LaunchServices activating it, not Obsidian activating itself — at first paint,
 * when the vault opens, and on the reload `emulateMobile` triggers.
 *
 * An accessory process has no menu bar and macOS will not front it, so the grabs
 * stop rather than get undone; the listeners cover the window between launch and
 * this call. A reload drops them, and the policy with them: callers re-arm.
 */
async function guardFocus(page: Page): Promise<void> {
    // The preload sets the bridge; a loaded machine attaches before it runs.
    await page.waitForFunction(() => window.electron?.remote !== undefined, null, { polling: 10 });
    await page.evaluate(() => {
        const { remote } = window.electron;
        const win = remote.getCurrentWindow();
        const hide = () => remote.app.hide();
        win.on("show", hide);
        win.on("focus", hide);
        remote.app.setActivationPolicy("accessory");
        hide();
    });
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
            // Tight: the window is unguarded until this connects.
            await new Promise((r) => setTimeout(r, 50));
        }
    }
    throw new Error(`Could not attach to Obsidian on port ${port}: ${String(lastError)}`);
}

interface TestFixtures {
    freshPluginState: void;
}

interface WorkerFixtures {
    obsidian: ObsidianApp;
    /** Set per project: every spec runs once as a desktop and once as a phone. */
    mobileLayout: boolean;
}

/** Undoes what an earlier test left in the shared instance; order is not fixed. */
async function resetPluginState(page: Page): Promise<void> {
    await page.evaluate(async (pluginId) => {
        const plugin = window.app.plugins.plugins[pluginId];
        await plugin.saveData({});
        await plugin.loadSettings();
        for (const file of window.app.vault.getMarkdownFiles()) plugin.collapseStore.clearForFile(file.path);
        plugin.layoutMemory.notes.restore(null);
        plugin.layoutMemory.bases.restore(null);
    }, PLUGIN_ID);
    await page.mouse.move(0, 0);
}

/** One Obsidian instance per worker; tests share it and open a fresh view each. */
export const test = base.extend<TestFixtures, WorkerFixtures>({
    freshPluginState: [
        async ({ obsidian }, use) => {
            await resetPluginState(obsidian.page);
            await use();
        },
        { auto: true },
    ],
    mobileLayout: [false, { scope: "worker", option: true }],
    obsidian: [
        async ({ mobileLayout }, use: (app: ObsidianApp) => Promise<void>) => {
            const { app, dispose } = await launch(mobileLayout && !SHOW_WINDOW ? PHONE_FRAMES : []);
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
    await page.waitForFunction(() => window.app?.workspace?.layoutReady === true, null, { timeout: 60_000 });
    // The reload shows the window again, and took the guard with it.
    if (!SHOW_WINDOW) await guardFocus(page);
}

/** The per-project option playwright.config.ts sets. */
export interface MobileLayoutOptions {
    mobileLayout: boolean;
}

/** The viewport each project lays out at. */
export const LAYOUT_VIEWPORT = { desktop: VIEWPORT, mobile: PHONE_VIEWPORT };

/** The stream's column, not the copy of it the template is measured in while the stream opens. */
export const STREAM = ".daily-notes-stream-container:not(.daily-notes-stream-probe)";

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
    const container = page.locator(STREAM);
    await expect(container).toBeVisible();
    await expect(container.locator(".daily-note-block").first()).toBeVisible();
    return container;
}

/**
 * Holds each note at the top in turn until its height is remembered, then
 * waits for the scroll to count as still. Stepping a screen at a time skips
 * notes: one growing from its estimate above the screen moves the page on.
 */
export async function scrollThroughStream(container: Locator) {
    const blocks = container.locator(".daily-note-block");
    const pane = container.locator("xpath=..");
    for (let i = 0; i < SEEDED_DAYS; i++) {
        // The next batch loads as the end comes into view.
        await expect
            .poll(async () => {
                const count = await blocks.count();
                if (count <= i) await pane.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
                return count;
            })
            .toBeGreaterThan(i);
        const block = blocks.nth(i);
        const path = await block.getAttribute("data-source-path");
        // Brought back each time: a batch arriving, or the place being held, can move the page.
        await expect
            .poll(
                () =>
                    block.evaluate((el) => {
                        el.scrollIntoView({ block: "start", behavior: "instant" });
                        const notes: [string, [string, number][]][] =
                            window.app.plugins.plugins["daily-notes-stream"].layoutMemory.notes.toJSON();
                        return notes.some(([, heights]) => heights.some(([key]) => key === el.dataset.sourcePath));
                    }),
                { message: `${path} is remembered` }
            )
            .toBe(true);
    }
    await container.page().waitForTimeout(500);
}

/**
 * Chromium stands in for iOS WebKit, which has no scroll anchoring: the stream
 * holds the reader's place itself from the next view opened. Undone by
 * `restoreScrollAnchoring`, since tests share the instance.
 */
export async function withoutScrollAnchoring(page: Page) {
    await page.evaluate(() => {
        const supports = CSS.supports.bind(CSS);
        (window as unknown as { realSupports: typeof supports }).realSupports = supports;
        CSS.supports = ((...args: [string, string]) =>
            args[0] === "overflow-anchor" ? false : supports(...args)) as typeof CSS.supports;
    });
}

export async function restoreScrollAnchoring(page: Page) {
    await page.evaluate(() => {
        CSS.supports = (window as unknown as { realSupports: typeof CSS.supports }).realSupports;
    });
}

/** Lighthouse's mobile preset: a laptop's CPU slowed to a phone's. */
const PHONE_CPU_SLOWDOWN = 4;

/**
 * Slows the CPU to a phone's for timings taken in the mobile project, whose
 * Chromium otherwise runs at laptop speed. Returns the undo: tests share the
 * instance.
 */
export async function emulatePhoneCpu(page: Page): Promise<() => Promise<void>> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: PHONE_CPU_SLOWDOWN });
    return async () => {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        await cdp.detach();
    };
}

/**
 * Detaches every search pane. Tests share one Obsidian instance, so a search
 * opened by an earlier test would still be on screen for this one to match.
 */
export async function closeSearchPanes(page: Page) {
    await page.evaluate(() => window.app.workspace.detachLeavesOfType("search"));
}

export { expect };
