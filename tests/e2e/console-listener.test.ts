import { describe, it, expect } from "vitest";
import { oneConsoleListener } from "../../e2e/ios/console-listener";

const start = "            this.remote.startConsole(eventListener);";
const driver = `        if (safariConsole) {\n${start}\n        }`;

// D-144.
describe("oneConsoleListener", () => {
    it("drops the listeners before the driver adds one", () => {
        expect(oneConsoleListener(driver)).toBe(
            `        if (safariConsole) {\n            this.remote.stopConsole();\n${start}\n        }`
        );
    });

    it("leaves a driver it has already patched as it is", () => {
        const patched = oneConsoleListener(driver);

        expect(oneConsoleListener(patched)).toBe(patched);
    });

    it("refuses a driver that no longer starts its console as expected", () => {
        expect(() => oneConsoleListener("this.remote.startConsole(listener);")).toThrow(
            "The XCUITest driver no longer starts its console listener as e2e/ios/console-listener.ts expects."
        );
    });
});
