/**
 * Opens PluginTest/ in Obsidian with the plugin enabled and mobile emulation on,
 * then leaves the window running and detaches.
 *
 *   node scripts/open-test-vault.mjs [--desktop] [vault]
 *
 * Runs its own Obsidian instance against `.dev/obsidian-userdata`, so your real
 * Obsidian config and vaults are never touched — the two can run side by side.
 * That directory persists, so the trust prompt and any settings you change stay
 * put between runs; delete it for a clean slate.
 */
import { chromium } from "@playwright/test";
import { spawn } from "child_process";
import { createServer } from "net";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OBSIDIAN = process.env.OBSIDIAN_PATH ?? "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const PLUGIN_ID = "daily-notes-stream";
const VAULT_ID = "dev00000000000001";

const args = process.argv.slice(2);
const mobile = !args.includes("--desktop");
const vault = resolve(args.find((arg) => !arg.startsWith("--")) ?? join(REPO, "PluginTest"));
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

mkdirSync(userDataDir, { recursive: true });
writeFileSync(
    join(userDataDir, "obsidian.json"),
    JSON.stringify({ vaults: { [VAULT_ID]: { path: vault, ts: Date.now(), open: true } }, updateDisabled: true })
);

const port = await freePort();
spawn(OBSIDIAN, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`], {
    stdio: "ignore",
    detached: true,
}).unref();

const browser = await connect(port);
const page = browser.contexts()[0].pages()[0];
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

await page.evaluate(async () => {
    const leaf = window.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: "daily-notes-stream-view", active: true });
    window.app.workspace.revealLeaf(leaf);
});
await page.waitForSelector(".daily-notes-stream-container", { timeout: 30_000 });

await browser.close();
console.log(
    `Obsidian is open on ${vault} with the stream view showing, mobile emulation ${mobile ? "ON" : "OFF"}.\n` +
        "Toggle it any time in the console: this.app.emulateMobile(false)\n" +
        "Narrow the window past ~600px to pick up Obsidian's phone layout (is-phone) too."
);
