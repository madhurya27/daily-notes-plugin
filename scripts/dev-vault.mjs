/**
 * The edit-reload loop: links the build into PluginTest/, watches it, and
 * reloads the plugin in the open window after every change.
 *
 *   node scripts/dev-vault.mjs [vault]
 *
 * Why links and a reload: docs/decisions.md. Watching the linked files covers a
 * TypeScript change without knowing anything about the build — `main.js` is
 * what esbuild rewrites — and `styles.css` needs no build at all.
 */
import { spawn } from "child_process";
import { existsSync, rmSync, statSync, symlinkSync, watch } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { isMain, reloadPlugin } from "./reload-plugin.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "daily-notes-stream";

/** What the vault needs from the repo. `main.js` first: esbuild rewrites it. */
export const ASSETS = ["main.js", "styles.css", "manifest.json"];

/** Points a seeded vault's plugin folder at the repo's own files. */
export function linkAssets(repo, vault) {
    const pluginDir = join(vault, ".obsidian", "plugins", PLUGIN_ID);
    if (!existsSync(pluginDir)) {
        throw new Error(`No plugin installed in ${vault} — seed it first: pnpm run build && pnpm run seed`);
    }
    for (const asset of ASSETS) {
        const target = join(pluginDir, asset);
        rmSync(target, { force: true });
        symlinkSync(join(repo, asset), target);
    }
    return pluginDir;
}

/**
 * Returns a test for "this event carries a write". Reloading makes Obsidian
 * re-read the linked files, and macOS reports that read as a change — left
 * alone, every reload asks for the next.
 */
export function createChangeFilter(mtimeOf) {
    const seen = new Map();
    return (path) => {
        let mtime;
        try {
            mtime = mtimeOf(path);
        } catch {
            return false; // mid-write, or gone: the next event carries the truth
        }
        if (seen.get(path) === mtime) return false;
        seen.set(path, mtime);
        return true;
    };
}

/**
 * Returns the function to call on every change. One reload per burst: esbuild
 * writes `main.js` in more than one step, and a reload outlasts the writing, so
 * changes arriving during one share a single run after it.
 */
export function createReloader(reload, delay) {
    let timer = null;
    let running = false;
    let again = false;

    const schedule = () => {
        if (running) {
            again = true;
            return;
        }
        clearTimeout(timer);
        timer = setTimeout(run, delay);
    };

    const run = async () => {
        running = true;
        try {
            console.log(`[reload] ${PLUGIN_ID} on port ${await reload()}`);
        } catch (error) {
            console.log(`[reload] ${error.message}`);
        }
        running = false;
        if (again) {
            again = false;
            schedule();
        }
    };

    return schedule;
}

function main() {
    const vault = resolve(process.argv[2] ?? join(REPO, "PluginTest"));
    const missing = ASSETS.filter((asset) => !existsSync(join(REPO, asset)));
    if (missing.length > 0) {
        console.error(`Build first — missing ${missing.join(", ")}. Run: pnpm run build`);
        process.exit(1);
    }

    console.log(`Linked ${ASSETS.join(", ")} into ${linkAssets(REPO, vault)}`);

    const esbuild = spawn("node", [join(REPO, "esbuild.config.mjs")], { stdio: "inherit" });
    esbuild.on("exit", (code) => process.exit(code ?? 0));
    process.on("SIGINT", () => esbuild.kill());

    const schedule = createReloader(reloadPlugin, 250);
    const changed = createChangeFilter((path) => statSync(path).mtimeMs);
    for (const asset of ASSETS) {
        const path = join(REPO, asset);
        changed(path); // the build that just ran is not a change to react to
        watch(path, () => {
            if (changed(path)) schedule();
        });
    }
    console.log("Watching for changes. The window to reload is the one from: pnpm run open");
}

if (isMain(import.meta.url)) main();
