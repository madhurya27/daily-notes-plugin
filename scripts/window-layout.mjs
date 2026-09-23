/**
 * What `pnpm run open`'s layout flags mean: the window to open, where, and the
 * emulation to apply once it is up.
 *
 * `is-mobile` comes from emulateMobile, `is-phone` from either dimension under
 * 600px — so a phone stays a phone on its side, and an iPad never takes it.
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

/** Marks the document the reload is about to throw away. */
const OLD_DOCUMENT = "__layoutSwitchPending";

/**
 * Emulates the device, and waits out the renderer reload it costs: the old
 * document answers `layoutReady` until that lands, so the stamp is what says
 * the new one is up.
 */
export async function emulateDevice(page, mobile) {
    if (mobile === (await page.evaluate(() => window.app.isMobile))) return false;
    await page.evaluate((key) => (window[key] = true), OLD_DOCUMENT);
    // The reload tears this call's context down with it: that is the result.
    await page.evaluate((on) => window.app.emulateMobile(on), mobile).catch(() => {});
    await page.waitForFunction(
        (key) => window[key] === undefined && window.app?.workspace?.layoutReady === true,
        OLD_DOCUMENT,
        { timeout: 60_000 }
    );
    return true;
}

/** How far into the main display a window opens. */
const MARGIN = 40;

/**
 * Where the window opens and how big. Saved bounds carry the rest of the file —
 * Obsidian keeps zoom there too — but never a maximised state, which would
 * swallow the size just asked for. A window too big for the screen needs no
 * clamping: macOS shrinks it to fit.
 *
 * @param {{
 *     saved?: object,
 *     size: { width: number, height: number } | null,
 *     position?: { x: number, y: number } | null,
 * }} options
 */
export function boundsFor({ saved = {}, size, position = null }) {
    const bounds = { zoom: 0, ...saved, x: MARGIN, y: MARGIN, isMaximized: false, ...size };
    // An explicit position wins over the corner.
    if (position) {
        bounds.x = position.x;
        bounds.y = position.y;
    }
    return bounds;
}
