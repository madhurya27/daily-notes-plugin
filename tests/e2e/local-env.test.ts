import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadLocalEnv } from "../../e2e/ios/local-env";

function envFile(text: string): string {
    const file = join(mkdtempSync(join(tmpdir(), "local-env-")), ".env");
    writeFileSync(file, text);
    return file;
}

describe("loadLocalEnv", () => {
    it("adds the file's variables", () => {
        const env: Record<string, string | undefined> = {};
        loadLocalEnv(envFile("# kept on\nIOS_KEYBOARD_PREDICTION=off\n"), env);
        expect(env).toEqual({ IOS_KEYBOARD_PREDICTION: "off" });
    });

    it("leaves a variable the command line set", () => {
        const env: Record<string, string | undefined> = { IOS_KEYBOARD_PREDICTION: "on" };
        loadLocalEnv(envFile("IOS_KEYBOARD_PREDICTION=off\n"), env);
        expect(env).toEqual({ IOS_KEYBOARD_PREDICTION: "on" });
    });

    it("does nothing without the file", () => {
        const env: Record<string, string | undefined> = {};
        loadLocalEnv(join(tmpdir(), "no-such-dir", ".env"), env);
        expect(env).toEqual({});
    });
});
