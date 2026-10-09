import type { Page } from "@playwright/test";
import { installPinned, DATAVIEW } from "./pinned-plugin";

/** Installs and enables Dataview in the vault, its JS queries on; the returned function removes it. */
export async function installDataview(page: Page): Promise<() => Promise<void>> {
    const uninstall = await installPinned(page, DATAVIEW);
    await page.evaluate(() => {
        window.app.plugins.plugins.dataview.settings.enableDataviewJs = true;
    });
    return uninstall;
}
