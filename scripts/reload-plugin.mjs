/**
 * Reloads the plugin in the window `pnpm run open` left running, over the
 * debugging port it was launched with.
 *
 *   node scripts/reload-plugin.mjs
 *
 * Obsidian reads a plugin's files once, at load; disabling and re-enabling it
 * re-runs `onload` and re-injects `styles.css`. That is what the Hot Reload
 * community plugin does from inside the vault — the open window already exposes
 * the port to do it from here, so the test vault stays a plain vault.
 */
import { chromium } from "@playwright/test";
import { execSync } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";

const PLUGIN_ID = "daily-notes-stream";
const VIEW_TYPE = "daily-notes-stream-view";

/** The port in a `ps` listing, or null when no window carries one. */
export function debugPort(psOutput) {
    const match = /--remote-debugging-port=(\d+)/.exec(psOutput);
    return match ? Number(match[1]) : null;
}

function runningPort() {
    const listing = execSync("ps -Ao args", { encoding: "utf8" })
        .split("\n")
        .filter((line) => line.includes("--remote-debugging-port="))
        .join("\n");
    return debugPort(listing);
}

/**
 * Returns the port it reached. Throws when no window is open, rather than
 * leaving a watcher looking like it worked.
 */
export async function reloadPlugin() {
    const port = runningPort();
    if (port === null) throw new Error("No Obsidian with a debugging port — start one with: pnpm run open");

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    try {
        for (const page of browser.contexts().flatMap((context) => context.pages())) {
            const reloaded = await page
                .evaluate(
                    async ([pluginId, viewType]) => {
                        const app = window.app;
                        if (!app?.plugins?.plugins?.[pluginId]) return false;
                        await app.plugins.disablePlugin(pluginId);
                        await app.plugins.enablePlugin(pluginId);
                        // Disabling detached the view; the command reopens it.
                        if (app.workspace.getLeavesOfType(viewType).length === 0) {
                            await app.commands.executeCommandById(`${pluginId}:open-stream`);
                        }
                        return true;
                    },
                    [PLUGIN_ID, VIEW_TYPE]
                )
                .catch(() => false); // a devtools or about:blank page, not the vault
            if (reloaded) return port;
        }
    } finally {
        await browser.close();
    }
    throw new Error(`Obsidian is on port ${port}, but ${PLUGIN_ID} is not installed in the open vault.`);
}

/** True when this module is the file node was asked to run, not an import. */
export function isMain(moduleUrl) {
    return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(moduleUrl);
}

if (isMain(import.meta.url)) {
    console.log(`Reloaded ${PLUGIN_ID} in the window on port ${await reloadPlugin()}.`);
}
