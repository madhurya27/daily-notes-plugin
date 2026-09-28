import { describe, it, expect, vi } from "vitest";
import { join, resolve } from "path";
import { readFileSync } from "fs";
import { DEMO_VAULT, PLUGIN_ID, TEST_VAULT, USER_DATA_DIR, stopObsidian, vaultFrom } from "../../scripts/vaults.mjs";

const repoRoot = resolve(__dirname, "../..");

describe("vaultFrom", () => {
    it("acts on the demo vault by default", () => {
        expect(vaultFrom(undefined, ["--desktop"])).toBe(join(repoRoot, ".dev", "demo-vault"));
        expect(DEMO_VAULT).toBe(join(repoRoot, ".dev", "demo-vault"));
    });

    it("acts on the test vault when asked with --test", () => {
        expect(vaultFrom(undefined, ["--test"])).toBe(join(repoRoot, ".dev", "vault"));
        expect(TEST_VAULT).toBe(join(repoRoot, ".dev", "vault"));
    });

    it("acts on a vault named on the command line, whatever else is asked", () => {
        expect(vaultFrom("elsewhere", ["--test"])).toBe(resolve("elsewhere"));
    });
});

describe("PLUGIN_ID", () => {
    it("is the id the manifest gives the plugin, which names its folder in a vault", () => {
        const manifest = JSON.parse(readFileSync(join(repoRoot, "manifest.json"), "utf8")) as { id: string };
        expect(PLUGIN_ID).toBe(manifest.id);
    });
});

describe("stopObsidian", () => {
    const pattern = `user-data-dir=${join(repoRoot, ".dev", "obsidian-userdata")}`;

    /** A stand-in for execFileSync: pgrep finds the instance until pkill runs. */
    function commands(running: boolean) {
        let alive = running;
        return vi.fn((command: string, args: string[]) => {
            if (command === "pgrep") {
                if (!alive) throw new Error("pgrep exits 1 when nothing matches");
                return "4242\n";
            }
            if (command === "pkill") alive = false;
            return "";
        });
    }

    it("is the instance under the dev user-data directory, never your own Obsidian", () => {
        expect(USER_DATA_DIR).toBe(join(repoRoot, ".dev", "obsidian-userdata"));
    });

    it("kills the dev instance's processes and waits until they are gone", () => {
        const run = commands(true);

        stopObsidian(run);

        expect(run).toHaveBeenCalledWith("pkill", ["-f", pattern]);
        expect(run).toHaveBeenLastCalledWith("pgrep", ["-f", pattern], expect.anything());
    });

    it("kills nothing when no dev instance is running", () => {
        const run = commands(false);

        stopObsidian(run);

        expect(run).not.toHaveBeenCalledWith("pkill", expect.anything());
    });
});
