/**
 * The two local vaults every command acts on: the demo vault by default, the
 * test vault docs/TESTING.md is written against with `--test`. And the
 * plugin's id, which names its folder in either, and the Obsidian instance
 * that opens them.
 */
import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {string} */
export const PLUGIN_ID = JSON.parse(readFileSync(join(REPO, "manifest.json"), "utf8")).id;

export const DEMO_VAULT = join(REPO, ".dev", "demo-vault");
export const TEST_VAULT = join(REPO, ".dev", "vault");

/**
 * The vault named on the command line, else the one `args` asks for.
 * @param {string | undefined} named
 * @param {readonly string[]} args
 * @returns {string}
 */
export function vaultFrom(named, args) {
    if (named !== undefined) return resolve(named);
    return args.includes("--test") ? TEST_VAULT : DEMO_VAULT;
}

/** What a vault needs from a build, in the plugin's folder. */
const BUILD = ["main.js", "manifest.json", "styles.css"];

/**
 * Copies the build in `repo` into the vault's plugin folder. Throws, copying
 * nothing, when a file of it is missing.
 * @param {string} vault
 * @param {string} repo
 */
export function installBuild(vault, repo = REPO) {
    const missing = BUILD.filter((file) => !existsSync(join(repo, file)));
    if (missing.length > 0) throw new Error(`Build first — missing ${missing.join(", ")}. Run: pnpm run build`);
    const pluginDir = join(vault, ".obsidian", "plugins", PLUGIN_ID);
    mkdirSync(pluginDir, { recursive: true });
    for (const file of BUILD) copyFileSync(join(repo, file), join(pluginDir, file));
}

/** The dev instance's own config, apart from your real Obsidian's. */
export const USER_DATA_DIR = join(REPO, ".dev", "obsidian-userdata");

/**
 * Quits the dev instance, every process of it, and waits until they are gone:
 * a surviving Electron helper holds the single-instance lock, and the next
 * launch then exits silently without opening its debugging port. Your own
 * Obsidian runs under another directory and is left alone.
 * @param {typeof execFileSync} run
 */
export function stopObsidian(run = execFileSync) {
    const pattern = `user-data-dir=${USER_DATA_DIR}`;
    const running = () => {
        try {
            return run("pgrep", ["-f", pattern], { encoding: "utf8" }).trim().length > 0;
        } catch {
            return false; // pgrep exits 1 when nothing matches.
        }
    };
    if (!running()) return;
    try {
        run("pkill", ["-f", pattern]);
    } catch {
        // Already gone between the check and the kill.
    }
    const deadline = Date.now() + 10_000;
    while (running() && Date.now() < deadline) run("sleep", ["0.2"]);
}
