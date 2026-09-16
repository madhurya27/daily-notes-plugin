import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { getReadableLineLength, onVaultConfigChange } from "../src/obsidianInternals";

/** Builds an App-shaped object; `config` is the internal vault config under test. */
const makeApp = (config?: unknown): App => ({ vault: { config } }) as unknown as App;

describe("getReadableLineLength", () => {
    it("returns the configured value when readable line length is on", () => {
        expect(getReadableLineLength(makeApp({ readableLineLength: true }))).toBe(true);
    });

    it("returns the configured value when readable line length is off", () => {
        expect(getReadableLineLength(makeApp({ readableLineLength: false }))).toBe(false);
    });

    it("defaults to true when the setting is absent from the config", () => {
        expect(getReadableLineLength(makeApp({}))).toBe(true);
    });

    it("defaults to true when the internal config is unavailable", () => {
        expect(getReadableLineLength({} as App)).toBe(true);
    });
});

describe("onVaultConfigChange", () => {
    /** Captures the "raw" subscription so a test can fire paths at it. */
    function makeVaultApp(configDir: string) {
        let raw: ((path: string) => void) | null = null;
        const ref = {};
        const app = {
            vault: {
                configDir,
                on: (name: string, cb: (path: string) => void) => {
                    if (name === "raw") raw = cb;
                    return ref;
                },
            },
        } as unknown as App;
        return { app, ref, fire: (path: string) => raw?.(path) };
    }

    it("calls back when a file under the config directory changes", () => {
        const { app, fire } = makeVaultApp(".obsidian");
        const handler = vi.fn();
        onVaultConfigChange(app, handler);

        fire(".obsidian/daily-notes.json");

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("ignores vault notes, which arrive on the same event", () => {
        const { app, fire } = makeVaultApp(".obsidian");
        const handler = vi.fn();
        onVaultConfigChange(app, handler);

        fire("Notes/2025-01-01.md");

        expect(handler).not.toHaveBeenCalled();
    });

    it("returns the event ref, so the caller can register it for cleanup", () => {
        const { app, ref } = makeVaultApp(".obsidian");
        expect(onVaultConfigChange(app, vi.fn())).toBe(ref);
    });
});
