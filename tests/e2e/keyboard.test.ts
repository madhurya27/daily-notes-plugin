import { describe, it, expect } from "vitest";
import { keyboardAfterRun } from "../../e2e-tests/ios/keyboard";

// WebDriverAgent turns both off on the phone each time it starts.
describe("keyboardAfterRun", () => {
    it("turns autocorrection and prediction back on by default", () => {
        expect(keyboardAfterRun({})).toEqual({ keyboardAutocorrection: true, keyboardPrediction: true });
    });

    it("leaves each off when its variable says off", () => {
        expect(keyboardAfterRun({ IOS_KEYBOARD_AUTOCORRECT: "off" })).toEqual({
            keyboardAutocorrection: false,
            keyboardPrediction: true,
        });
        expect(keyboardAfterRun({ IOS_KEYBOARD_PREDICTION: "off" })).toEqual({
            keyboardAutocorrection: true,
            keyboardPrediction: false,
        });
    });

    it("rejects anything but on or off, before the run", () => {
        expect(() => keyboardAfterRun({ IOS_KEYBOARD_PREDICTION: "no" })).toThrow(
            "IOS_KEYBOARD_PREDICTION must be on or off, not no"
        );
    });
});
