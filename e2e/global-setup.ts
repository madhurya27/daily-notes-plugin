import { execFileSync } from "child_process";
import { readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/** True when some running process still references this directory. */
function inUse(dir: string): boolean {
    try {
        execFileSync("pgrep", ["-f", dir], { stdio: "ignore" });
        return true;
    } catch {
        return false; // pgrep exits non-zero when nothing matches
    }
}

/**
 * Fixture vaults and profiles are removed on teardown, which covers a normal
 * exit, Ctrl-C and a killed run alike. A crashed worker can still strand one,
 * so sweep anything left over that no live process is using.
 */
export default function globalSetup(): void {
    killStrandedInstances();
    const tmp = tmpdir();
    for (const entry of readdirSync(tmp)) {
        if (!entry.startsWith("dns-vault-") && !entry.startsWith("dns-userdata-")) continue;
        const dir = join(tmp, entry);
        if (inUse(dir)) continue;
        rmSync(dir, { recursive: true, force: true });
        console.log(`[e2e] swept stale fixture directory: ${entry}`);
    }
}

/**
 * Kills Obsidian instances left behind by an earlier run. Every fixture profile
 * lives in a fresh dns-userdata- directory, so anything matching one before this
 * run launches is stale — and killing it also frees its directory for the sweep.
 */
function killStrandedInstances(): void {
    for (const signal of ["-TERM", "-KILL"]) {
        try {
            execFileSync("pkill", [signal, "-f", join(tmpdir(), "dns-userdata-")], { stdio: "ignore" });
            console.log("[e2e] killed a stranded Obsidian instance");
        } catch {
            // pkill exits non-zero when nothing matched — nothing was stranded.
        }
    }
}
