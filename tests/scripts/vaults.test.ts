import { describe, it, expect } from "vitest";
import { join, resolve } from "path";
import { DEMO_VAULT, TEST_VAULT, vaultFrom } from "../../scripts/vaults.mjs";

const repoRoot = resolve(__dirname, "../..");

describe("vaultFrom", () => {
    it("acts on the demo vault by default", () => {
        expect(vaultFrom(undefined, ["--desktop"])).toBe(join(repoRoot, ".dev", "demo-vault"));
        expect(DEMO_VAULT).toBe(join(repoRoot, ".dev", "demo-vault"));
    });

    it("acts on the test vault when asked with --test", () => {
        expect(vaultFrom(undefined, ["--test"])).toBe(join(repoRoot, ".dev", "vault"));
        expect(TEST_VAULT).toBe(join(repoRoot, ".dev", "vault"));
    });

    it("acts on a vault named on the command line, whatever else is asked", () => {
        expect(vaultFrom("elsewhere", ["--test"])).toBe(resolve("elsewhere"));
    });
});
