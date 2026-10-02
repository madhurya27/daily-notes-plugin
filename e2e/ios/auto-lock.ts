import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

/**
 * Turns the phone's Auto-Lock off through the Settings app, and back on
 * `pnpm run ios:release`: a phone that locks mid-run fails every test after
 * it. Held across runs, since a working session runs many; the phone's own
 * setting waits on disk until released.
 */

export const SETTINGS = "com.apple.Preferences";
/** Choices are named by their seconds; Never is -1. */
const NEVER = "-1";
const DEV = join(resolve(dirname(fileURLToPath(import.meta.url)), "../.."), ".dev");
const SAVED = join(DEV, "ios-auto-lock");

/** From the Settings root, by accessibility ids only: the pages on the way hold switches and Delete buttons. */
async function openAutoLock(driver: WebdriverIO.Browser): Promise<void> {
    await driver.execute("mobile: terminateApp", { bundleId: SETTINGS });
    await driver.execute("mobile: activateApp", { bundleId: SETTINGS });
    // Settings may reopen where it was left.
    for (let back = await driver.$("~BackButton"); await back.isExisting(); back = await driver.$("~BackButton"))
        await back.click();
    await scrollTo(driver, "com.apple.settings.displayAndBrightness");
    await driver.$("~com.apple.settings.displayAndBrightness").click();
    await scrollTo(driver, "AUTOLOCK");
    await driver.$("~AUTOLOCK").click();
}

async function scrollTo(driver: WebdriverIO.Browser, id: string): Promise<void> {
    const list = await driver.$("-ios class chain:**/XCUIElementTypeCollectionView[1]");
    for (let i = 0; i < 10 && !(await driver.$(`~${id}`).isDisplayed()); i++)
        await driver.execute("mobile: swipe", { direction: "up", elementId: list.elementId });
}

/**
 * Settings saves the choice only on leaving the page: quitting from it drops
 * the tap. So it goes back, and checks the value on the page before.
 */
async function choose(driver: WebdriverIO.Browser, seconds: string): Promise<void> {
    const choice = await driver.$(`~${seconds}`);
    const label = await choice.getAttribute("label");
    await choice.click();
    await driver.$("~BackButton").click();
    const shown = await driver.$("~AUTOLOCK").getAttribute("label");
    // The row reads "Auto-Lock, 1 minute" in English: only the choice's own label is the same in every language.
    if (!label || !shown?.endsWith(label)) {
        await driver.saveScreenshot(join(DEV, "ios-auto-lock.png"));
        throw new Error(
            `Auto-Lock reads "${shown}", not ${label}: see .dev/ios-auto-lock.png. Low Power Mode holds it at 30 seconds.`
        );
    }
    await driver.execute("mobile: terminateApp", { bundleId: SETTINGS });
}

export function isHeld(): boolean {
    return existsSync(SAVED);
}

/** Sets Never, in the same visit that reads the phone's own setting. */
export async function holdAwake(driver: WebdriverIO.Browser): Promise<void> {
    await openAutoLock(driver);
    const chosen = await driver.$(`-ios predicate string:type == "XCUIElementTypeCell" AND selected == 1`);
    const seconds = await chosen.getAttribute("name");
    if (!seconds) throw new Error("Auto-Lock shows no choice selected.");
    writeFileSync(SAVED, seconds);
    await choose(driver, NEVER);
}

/** Puts the phone's own setting back. */
export async function release(driver: WebdriverIO.Browser): Promise<void> {
    await openAutoLock(driver);
    await choose(driver, readFileSync(SAVED, "utf8"));
    rmSync(SAVED);
}
