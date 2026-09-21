/**
 * What `pnpm run open`'s layout flags mean: the window to open, and the
 * emulation to apply once it is up.
 *
 * `is-mobile` comes from emulateMobile, `is-phone` from either dimension under
 * 600px — so a phone stays a phone on its side, the iPad stays tablet-only, and
 * a desktop window has to be wide enough for the layout it turns back on.
 */
const WINDOW_SIZES = {
    desktop: { width: 1280, height: 860 },
    phone: { width: 420, height: 900 },
    ipad: { width: 820, height: 1180 },
};

/** The device, whether it emulates mobile, and the window it asks for. */
export function layoutFrom(args) {
    const device = args.includes("--desktop") ? "desktop" : args.includes("--ipad") ? "ipad" : "phone";
    const portrait = args.includes("--keep-size") ? null : WINDOW_SIZES[device];
    const landscape = portrait && args.includes("--landscape");
    return {
        device,
        mobile: device !== "desktop",
        size: landscape ? { width: portrait.height, height: portrait.width } : portrait,
    };
}

/**
 * Marks the document `emulateMobile` is about to throw away. The old one keeps
 * answering `layoutReady` until the reload lands, so waiting on that alone
 * returns while the window is still mid-switch.
 */
const OLD_DOCUMENT = "__layoutSwitchPending";

/** Emulates the device, and waits out the renderer reload that costs. */
export async function emulateDevice(page, mobile) {
    if (mobile === (await page.evaluate(() => window.app.isMobile))) return false;
    await page.evaluate((key) => (window[key] = true), OLD_DOCUMENT);
    // The reload tears this call's context down with it — that is the result,
    // not an error.
    await page.evaluate((on) => window.app.emulateMobile(on), mobile).catch(() => {});
    await page.waitForFunction(
        (key) => window[key] === undefined && window.app?.workspace?.layoutReady === true,
        OLD_DOCUMENT,
        { timeout: 60_000 }
    );
    return true;
}

/**
 * Every display in the top-left space Obsidian stores bounds in, read from the
 * NSScreen frames `osascript` prints. Cocoa's origin is the *main* display's
 * bottom-left with y upwards, so each frame is flipped against that height.
 * Null when the output cannot be read — macOS clamps a stray window back onto a
 * display anyway.
 */
export function screensFrom(output) {
    const frames = output.split(";").map((frame) => frame.split(",").map(Number));
    const mainHeight = frames[0]?.[3];
    if (!mainHeight) return null;
    return frames.map(([x, y, width, height]) => ({ x, y: mainHeight - (y + height), width, height }));
}

/** How far into the display a window opens, and the room it leaves on both sides. */
const MARGIN = 40;

/**
 * Where the window opens and how big. Saved bounds carry everything not decided
 * here — Obsidian keeps zoom in the same file — but never a maximised state: it
 * would swallow the size the layout just asked for.
 */
export function boundsFor({ saved = {}, screen, size, position = null }) {
    const bounds = { zoom: 0, ...saved, x: screen.x + MARGIN, y: screen.y + MARGIN, isMaximized: false };
    if (size) {
        bounds.width = Math.min(size.width, screen.width - MARGIN * 2);
        bounds.height = Math.min(size.height, screen.height - MARGIN * 2);
    }
    // An explicit position wins over the display's default corner.
    if (position) {
        bounds.x = position.x;
        bounds.y = position.y;
    }
    return bounds;
}
