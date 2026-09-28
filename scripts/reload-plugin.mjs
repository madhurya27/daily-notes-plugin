/**
 * Reloads the plugin in the window `pnpm run demo` opened, over the debugging
 * port it was launched with. Why here and not in the vault: docs/decisions.md.
 *
 * Disabling and re-enabling re-runs `onload` and re-injects `styles.css`, which
 * Obsidian otherwise reads once, at load.
 */
import { chromium } from "@playwright/test";
import { execSync } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { PLUGIN_ID } from "./vaults.mjs";

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
    if (port === null) throw new Error("No Obsidian with a debugging port — start one with: pnpm run demo");

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
