import { isHeld, release, SETTINGS } from "./auto-lock";
import { startAppium } from "./global-setup";
import { connect } from "./session";

/** `pnpm run ios:release`: the phone's own Auto-Lock back, once a session's runs are done. */
if (!isHeld()) {
    console.log("Auto-Lock is the phone's own: nothing to release.");
} else {
    const stopAppium = await startAppium();
    try {
        const driver = await connect(SETTINGS);
        try {
            await release(driver);
        } finally {
            await driver.deleteSession();
        }
    } finally {
        stopAppium();
    }
    console.log("Auto-Lock restored.");
}
