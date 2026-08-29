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
        "## Evening",
        "",
        "- Groceries",
        "    - Milk",
        "    - Bread",
        "- Read a chapter",
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

    const port = await freePort();
    const args = [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`, ...NO_THROTTLE];
    // detached: Electron spawns helper processes, and killing only the parent
    // orphans them. Its own process group can be signalled as a unit.
    const proc: ChildProcess | null = SHOW_WINDOW
        ? spawn(OBSIDIAN, args, { stdio: "ignore", detached: true })
        : launchHidden(args, userDataDir);

    let browser: Browser | null = null;
    // Defined before startup runs: a throw anywhere below must still tear the
    // instance down, or a failed run leaves an Obsidian window in the dock.
    const dispose = async () => {
        await browser?.close().catch(() => {});
        if (proc) await killTree(proc);
        else killByUserDataDir(userDataDir);
        rmSync(vaultPath, { recursive: true, force: true });
        rmSync(userDataDir, { recursive: true, force: true });
    };

    try {
        return { app: await startUp((browser = await connectWithRetry(port)), userDataDir, vaultPath), dispose };
    } catch (error) {
        await dispose();
        throw error;
    }
}

/** Drives Obsidian's first-run dance until the plugin is live and the window hidden. */
async function startUp(browser: Browser, userDataDir: string, vaultPath: string): Promise<ObsidianApp> {
    // As early as possible: the CDP target exists, so the window does too, and
    // every step below drives the renderer over CDP rather than the desktop.
    if (!SHOW_WINDOW) hideApp(userDataDir);

    const context = browser.contexts()[0]!;
    const page = context.pages()[0]!;
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

    // Again at the end: opening the vault re-shows the window behind us.
    // Electron never propagates the hide to the renderer, so document.hidden
    // stays false — macOS is the only authority on whether the window shows.
    if (!SHOW_WINDOW) hideApp(userDataDir);

    const isHidden = () => {
        const pid = mainProcessPid(userDataDir);
        return pid !== null && systemEvents(pid, "get visible") === "false";
    };

    return { page, vaultPath, isHidden };
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

/**
 * Hides the app once it owns a window. `-j` only stops the app activating —
 * Obsidian shows its window regardless, and hiding before that window exists is
 * undone by the show. Seeding the window offscreen does not work either: macOS
 * clamps saved bounds back onto a display. Hiding this late leaves the window on
 * screen for a moment; it is once per run, not once per test.
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
}

/** One Obsidian instance per worker; tests share it and open a fresh view each. */
export const test = base.extend<object, WorkerFixtures>({
    obsidian: [
        async ({}, use: (app: ObsidianApp) => Promise<void>) => {
            const { app, dispose } = await launch();
            await use(app);
            await dispose();
        },
        { scope: "worker", timeout: 120_000 },
    ],
});

export { expect };
