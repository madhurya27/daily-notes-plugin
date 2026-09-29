/**
 * The one command for working against a vault: builds if there is no build,
 * reseeds the vault, links the build into it, opens it in its own Obsidian, then
 * rebuilds on every save and reloads the plugin in that window. Demo vault by
 * default, the test vault with --test; layout flags go to the window.
 *
 *   pnpm run demo [--test] [--desktop | --ipad | --landscape] [vault]
 *
 * Why links and a reload: D-008. Watching the linked files covers a
 * TypeScript change without knowing anything about the build — `main.js` is
 * what esbuild rewrites — and `styles.css` needs no build at all.
 */
import { spawn, spawnSync } from "child_process";
import { existsSync, rmSync, statSync, symlinkSync, watch } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { isMain, reloadPlugin } from "./reload-plugin.mjs";
import { PLUGIN_ID, stopObsidian, vaultFrom } from "./vaults.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** What the vault needs from the repo. `main.js` first: esbuild rewrites it. */
export const ASSETS = ["main.js", "styles.css", "manifest.json"];

/** Points a seeded vault's plugin folder at the repo's own files. */
export function linkAssets(repo, vault) {
    const pluginDir = join(vault, ".obsidian", "plugins", PLUGIN_ID);
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

/**
 * What a run does, in order: a build only when there is none. The seed runs
 * every time: the vaults are disposable, and a fresh seed keeps their notes
 * current with the seed script and the date.
 * @param {{ built: boolean }} state
 */
export function stepsFor({ built }) {
    return [...(built ? [] : ["build"]), "seed", "link", "open", "watch"];
}

/** Flags of `open` that take a value, which is not the vault path. */
const FLAG_VALUES = new Set(["--position"]);

/**
 * Splits the command line: the vault named, what the seed needs, and what the
 * window does, which is everything.
 * @param {readonly string[]} args
 */
export function optionsFrom(args) {
    const named = args.find((arg, index) => !arg.startsWith("--") && !FLAG_VALUES.has(args[index - 1]));
    const seedArgs = [...(args.includes("--test") ? ["--test"] : []), ...(named === undefined ? [] : [named])];
    return { named, seedArgs, openArgs: [...args] };
}

/** Runs a step to completion, stopping here if it fails. */
function run(command, commandArgs) {
    const { status } = spawnSync(command, commandArgs, { stdio: "inherit", cwd: REPO });
    if (status !== 0) process.exit(status ?? 1);
}

/**
 * Rebuilds on every save and reloads the plugin after each, until Ctrl-C,
 * which also closes the window. Ctrl-C reaches esbuild too, so its exit, not
 * the signal, is what ends the run: whichever arrives first, the window goes.
 */
function watchAndReload() {
    const esbuild = spawn("node", [join(REPO, "esbuild.config.mjs")], { stdio: "inherit" });
    esbuild.on("exit", (code) => {
        stopObsidian();
        process.exit(code ?? 0);
    });
    process.on("SIGINT", () => esbuild.kill());

    const schedule = createReloader(reloadPlugin, 250);
    const changed = createChangeFilter((path) => statSync(path).mtimeMs);
    for (const asset of ASSETS) {
        const path = join(REPO, asset);
        changed(path); // what the window just loaded is not a change to react to
        watch(path, () => {
            if (changed(path)) schedule();
        });
    }
    console.log("Watching for changes; every save reloads the plugin in the window. Ctrl-C closes it.");
}

function main() {
    const args = process.argv.slice(2);
    // The options are the window's; answered before anything is built or seeded.
    if (args.includes("--help") || args.includes("-h")) {
        run("node", [join(REPO, "scripts", "open-vault.mjs"), "--help"]);
        return;
    }
    const { named, seedArgs, openArgs } = optionsFrom(args);
    const vault = vaultFrom(named, args);
    const actions = {
        build: () => run("pnpm", ["run", "build"]),
        seed: () => run("node", [join(REPO, "scripts", "seed.mjs"), ...seedArgs]),
        link: () => console.log(`Linked ${ASSETS.join(", ")} into ${linkAssets(REPO, vault)}`),
        open: () => run("node", [join(REPO, "scripts", "open-vault.mjs"), ...openArgs]),
        watch: watchAndReload,
    };
    const built = ASSETS.every((asset) => existsSync(join(REPO, asset)));
    for (const step of stepsFor({ built })) actions[step]();
}

if (isMain(import.meta.url)) main();
