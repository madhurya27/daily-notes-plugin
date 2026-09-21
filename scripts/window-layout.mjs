/**
 * The layout flags `pnpm run open` and `pnpm run layout` share, and the window
 * each one wants.
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
