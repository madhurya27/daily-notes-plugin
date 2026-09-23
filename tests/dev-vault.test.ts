import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
// @ts-expect-error -- plain ESM scripts, outside the TypeScript program
import { debugPort } from "../scripts/reload-plugin.mjs";
// @ts-expect-error -- plain ESM scripts, outside the TypeScript program
import { ASSETS, createChangeFilter, createReloader, linkAssets } from "../scripts/dev-vault.mjs";

const repoRoot = resolve(__dirname, "..");

describe("debugPort", () => {
    it("reads the port Obsidian was launched with", () => {
        const ps =
            "/Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir=/x --remote-debugging-port=63416";
        expect(debugPort(ps)).toBe(63416);
    });

    it("returns null when no window carries one", () => {
        expect(debugPort("/Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir=/x")).toBeNull();
    });

    it("takes the first port when several windows are open", () => {
        expect(debugPort("a --remote-debugging-port=1000\nb --remote-debugging-port=2000")).toBe(1000);
    });
});

describe("linkAssets", () => {
    let vault: string;

    beforeEach(() => {
        vault = mkdtempSync(join(tmpdir(), "dev-vault-"));
        mkdirSync(join(vault, ".obsidian", "plugins", "daily-notes-stream"), { recursive: true }); // as `seed` leaves it
    });

    afterEach(() => {
        rmSync(vault, { recursive: true, force: true });
    });

    const pluginDir = () => join(vault, ".obsidian", "plugins", "daily-notes-stream");

    it("points each asset at the repo's own file", () => {
        linkAssets(repoRoot, vault);
        for (const asset of ASSETS) {
            expect(readlinkSync(join(pluginDir(), asset))).toBe(join(repoRoot, asset));
        }
    });

    it("replaces the copies a seeded vault holds", () => {
        writeFileSync(join(pluginDir(), "main.js"), "a stale build");

        linkAssets(repoRoot, vault);

        expect(lstatSync(join(pluginDir(), "main.js")).isSymbolicLink()).toBe(true);
    });

    it("is safe to run twice", () => {
        linkAssets(repoRoot, vault);
        linkAssets(repoRoot, vault);
        expect(lstatSync(join(pluginDir(), "styles.css")).isSymbolicLink()).toBe(true);
    });

    it("refuses a vault that holds no plugin data, rather than seeding one", () => {
        expect(() => linkAssets(repoRoot, join(vault, "nope"))).toThrow(/pnpm run seed/);
        expect(existsSync(join(vault, "nope"))).toBe(false);
    });
});

describe("createReloader", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("collapses a burst of writes into one reload", async () => {
        const reload = vi.fn().mockResolvedValue(1);
        const schedule = createReloader(reload, 250);

        schedule();
        schedule();
        schedule();
        await vi.advanceTimersByTimeAsync(300);

        // esbuild writes main.js in more than one step, and macOS reports a
        // single save as several events.
        expect(reload).toHaveBeenCalledOnce();
    });

    it("waits for a reload in flight, then runs once for everything that arrived", async () => {
        let finish: (port: number) => void = () => {};
        const reload = vi
            .fn()
            .mockImplementationOnce(() => new Promise<number>((res) => (finish = res)))
            .mockResolvedValue(1);
        const schedule = createReloader(reload, 250);

        schedule();
        await vi.advanceTimersByTimeAsync(300); // first reload starts, and hangs
        schedule();
        schedule();
        expect(reload).toHaveBeenCalledOnce();

        finish(1);
        await vi.advanceTimersByTimeAsync(300);

        expect(reload).toHaveBeenCalledTimes(2);
    });

    it("reports a failure and stays watching", async () => {
        const reload = vi.fn().mockRejectedValueOnce(new Error("No Obsidian")).mockResolvedValue(1);
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const schedule = createReloader(reload, 250);

        schedule();
        await vi.advanceTimersByTimeAsync(300);
        schedule();
        await vi.advanceTimersByTimeAsync(300);

        expect(log.mock.calls.flat().join(" ")).toContain("No Obsidian");
        expect(reload).toHaveBeenCalledTimes(2);
        log.mockRestore();
    });
});

describe("createChangeFilter", () => {
    it("passes a file whose contents were written", () => {
        const mtimes = new Map([["main.js", 100]]);
        const changed = createChangeFilter((path) => mtimes.get(path)!);

        expect(changed("main.js")).toBe(true); // first sighting
        mtimes.set("main.js", 200);
        expect(changed("main.js")).toBe(true);
    });

    it("drops an event that left the file as it was", () => {
        // Reloading makes Obsidian re-read the linked files, and macOS reports
        // that read as a change — which would reload again, for ever.
        const changed = createChangeFilter(() => 100);

        expect(changed("main.js")).toBe(true);
        expect(changed("main.js")).toBe(false);
        expect(changed("main.js")).toBe(false);
    });

    it("keeps a file's history apart from its neighbours", () => {
        const mtimes = new Map([
            ["main.js", 100],
            ["styles.css", 100],
        ]);
        const changed = createChangeFilter((path) => mtimes.get(path)!);

        expect(changed("main.js")).toBe(true);
        expect(changed("styles.css")).toBe(true);
        expect(changed("main.js")).toBe(false);
    });

    it("treats a file it cannot stat as unchanged, rather than throwing at the watcher", () => {
        const changed = createChangeFilter(() => {
            throw new Error("ENOENT");
        });

        expect(changed("gone.js")).toBe(false);
    });
});
