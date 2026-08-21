import { test as base, chromium, expect, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "child_process";
import { createServer } from "net";
import { mkdirSync, mkdtempSync, writeFileSync, copyFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const OBSIDIAN = process.env.OBSIDIAN_PATH ?? "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
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
            vaults: { e2e0000000000001: { path: vaultPath, ts: Date.now(), open: true } },
            updateDisabled: true,
        })
    );

    const port = await freePort();
    // detached: Electron spawns helper processes, and killing only the parent
    // orphans them. Its own process group can be signalled as a unit.
    const proc: ChildProcess = spawn(OBSIDIAN, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`], {
        stdio: "ignore",
        detached: true,
    });

    const browser = await connectWithRetry(port);
    const context = browser.contexts()[0]!;
    const page = context.pages()[0]!;
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

    const dispose = async () => {
        await browser.close().catch(() => {});
        await killTree(proc);
        rmSync(vaultPath, { recursive: true, force: true });
        rmSync(userDataDir, { recursive: true, force: true });
    };
    return { app: { page, vaultPath }, dispose };
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
