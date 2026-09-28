/**
 * The two local vaults every command acts on: the demo vault by default, the
 * test vault docs/TESTING.md is written against with `--test`.
 */
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
