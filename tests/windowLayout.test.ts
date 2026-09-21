import { describe, it, expect } from "vitest";
// @ts-expect-error -- plain ESM scripts, outside the TypeScript program
import { layoutFrom } from "../scripts/window-layout.mjs";
// @ts-expect-error -- plain ESM scripts, outside the TypeScript program
import { applyLayout } from "../scripts/window-layout.mjs";

describe("layoutFrom", () => {
    it("opens a phone in portrait by default", () => {
        expect(layoutFrom([])).toEqual({ device: "phone", mobile: true, size: { width: 420, height: 900 } });
    });

    it("gives the iPad a tablet window, still emulating mobile", () => {
        expect(layoutFrom(["--ipad"])).toEqual({ device: "ipad", mobile: true, size: { width: 820, height: 1180 } });
    });

    it("gives the desktop a window wide enough for the layout it turns on", () => {
        expect(layoutFrom(["--desktop"])).toEqual({
            device: "desktop",
            mobile: false,
            size: { width: 1280, height: 860 },
        });
    });

    it("turns a size on its side for --landscape", () => {
        expect(layoutFrom(["--landscape"]).size).toEqual({ width: 900, height: 420 });
        expect(layoutFrom(["--ipad", "--landscape"]).size).toEqual({ width: 1180, height: 820 });
    });

    it("asks for no size at all under --keep-size", () => {
        expect(layoutFrom(["--keep-size"])).toEqual({ device: "phone", mobile: true, size: null });
        expect(layoutFrom(["--desktop", "--keep-size"]).size).toBeNull();
    });
});

describe("applyLayout", () => {
    /**
     * A page whose `evaluate` runs the callback here, against jsdom's window,
     * and whose `waitForFunction` gives up rather than polling: a predicate that
     * is not already true is one this window never satisfies.
     */
    const fakePage = (isMobile: boolean, { reloads = true } = {}) => {
        const bounds: { width: number; height: number }[] = [];
        const emulated: boolean[] = [];
        (window as unknown as { electron: unknown }).electron = {
            remote: { getCurrentWindow: () => ({ setBounds: (size: never) => bounds.push(size) }) },
        };
        const app = {
            isMobile,
            // The real one reloads the renderer, which drops every global the
            // old document carried.
            emulateMobile: (on: boolean) => {
                emulated.push(on);
                if (reloads) for (const key of Object.keys(window)) if (key.startsWith("__")) delete window[key];
            },
            workspace: { layoutReady: true },
        };
        (window as unknown as { app: unknown }).app = app;
        return {
            bounds,
            emulated,
            evaluate: async (fn: (arg: never) => unknown, arg: never) => fn(arg),
            waitForFunction: async (fn: (arg: never) => unknown, arg: never) => {
                if (!fn(arg)) throw new Error("waitForFunction timed out");
            },
        };
    };

    it("resizes the window before emulating, so is-phone follows the new width", async () => {
        const page = fakePage(false);
        await expect(applyLayout(page, layoutFrom([]))).resolves.toBe(true);
        expect(page.bounds).toEqual([{ width: 420, height: 900 }]);
        expect(page.emulated).toEqual([true]);
    });

    it("leaves the window alone under --keep-size", async () => {
        const page = fakePage(false);
        await applyLayout(page, layoutFrom(["--keep-size"]));
        expect(page.bounds).toEqual([]);
        expect(page.emulated).toEqual([true]);
    });

    it("waits for the document the reload brings back, not the one that answered first", async () => {
        const page = fakePage(false, { reloads: false });
        await expect(applyLayout(page, layoutFrom([]))).rejects.toThrow("timed out");
    });

    it("reports no reload when the emulation already matches", async () => {
        const page = fakePage(true);
        await expect(applyLayout(page, layoutFrom([]))).resolves.toBe(false);
        expect(page.bounds).toEqual([{ width: 420, height: 900 }]);
        expect(page.emulated).toEqual([]);
    });
});
