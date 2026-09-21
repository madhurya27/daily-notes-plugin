import { describe, it, expect } from "vitest";
// @ts-expect-error -- plain ESM scripts, outside the TypeScript program
import { layoutFrom } from "../scripts/window-layout.mjs";
// @ts-expect-error -- plain ESM scripts, outside the TypeScript program
import { boundsFor, emulateDevice, screensFrom } from "../scripts/window-layout.mjs";

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

describe("emulateDevice", () => {
    /**
     * A page whose `evaluate` runs the callback here, against jsdom's window,
     * and whose `waitForFunction` gives up rather than polling: a predicate that
     * is not already true is one this window never satisfies.
     */
    const fakePage = (isMobile: boolean, { reloads = true } = {}) => {
        const emulated: boolean[] = [];
        (window as unknown as { app: unknown }).app = {
            isMobile,
            // The real one reloads the renderer, which drops every global the
            // old document carried.
            emulateMobile: (on: boolean) => {
                emulated.push(on);
                if (reloads) for (const key of Object.keys(window)) if (key.startsWith("__")) delete window[key];
            },
            workspace: { layoutReady: true },
        };
        return {
            emulated,
            evaluate: async (fn: (arg: never) => unknown, arg: never) => fn(arg),
            waitForFunction: async (fn: (arg: never) => unknown, arg: never) => {
                if (!fn(arg)) throw new Error("waitForFunction timed out");
            },
        };
    };

    it("turns emulation on for a phone", async () => {
        const page = fakePage(false);
        await expect(emulateDevice(page, true)).resolves.toBe(true);
        expect(page.emulated).toEqual([true]);
    });

    it("waits for the document the reload brings back, not the one that answered first", async () => {
        const page = fakePage(false, { reloads: false });
        await expect(emulateDevice(page, true)).rejects.toThrow("timed out");
    });

    it("does nothing when the emulation already matches", async () => {
        const page = fakePage(true);
        await expect(emulateDevice(page, true)).resolves.toBe(false);
        expect(page.emulated).toEqual([]);
    });
});

describe("screensFrom", () => {
    it("flips Cocoa frames into the top-left space Obsidian stores bounds in", () => {
        // Main display 1512x982, a second one directly above it: Cocoa counts y
        // upwards from the main display's bottom-left, so that one sits at +982.
        expect(screensFrom("0,0,1512,982;0,982,1920,1080")).toEqual([
            { x: 0, y: 0, width: 1512, height: 982 },
            { x: 0, y: -1080, width: 1920, height: 1080 },
        ]);
    });

    it("places a display to the left at its own negative x", () => {
        expect(screensFrom("0,0,1512,982;-1920,0,1920,982")[1]).toEqual({
            x: -1920,
            y: 0,
            width: 1920,
            height: 982,
        });
    });

    it("gives up on output it cannot read, leaving macOS to clamp the window", () => {
        expect(screensFrom("")).toBeNull();
    });
});

describe("boundsFor", () => {
    const screen = { x: 0, y: 0, width: 1512, height: 982 };

    it("opens in the screen's top-left corner, a margin in", () => {
        expect(boundsFor({ screen, size: { width: 420, height: 900 } })).toMatchObject({
            x: 40,
            y: 40,
            width: 420,
            height: 900,
            isMaximized: false,
        });
    });

    it("offsets from the chosen display, not from the main one", () => {
        expect(boundsFor({ screen: { x: -1920, y: -100, width: 1920, height: 1080 }, size: null })).toMatchObject({
            x: -1880,
            y: -60,
        });
    });

    it("clamps a window too big for the screen it opens on", () => {
        expect(boundsFor({ screen, size: { width: 1920, height: 1200 } })).toMatchObject({
            width: 1432,
            height: 902,
        });
    });

    it("leaves the saved size alone when no size is asked for", () => {
        const saved = { width: 700, height: 500, zoom: 2 };
        expect(boundsFor({ saved, screen, size: null })).toMatchObject({ width: 700, height: 500, zoom: 2 });
    });

    it("lets an explicit position win over the display's corner", () => {
        expect(boundsFor({ screen, size: null, position: { x: 900, y: 60 } })).toMatchObject({ x: 900, y: 60 });
    });

    it("never restores a maximised window, whatever the saved bounds say", () => {
        expect(boundsFor({ saved: { isMaximized: true }, screen, size: null }).isMaximized).toBe(false);
    });
});
