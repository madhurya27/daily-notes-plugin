import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { getReadableLineLength } from "../src/obsidianInternals";

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
