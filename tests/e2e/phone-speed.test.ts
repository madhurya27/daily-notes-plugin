import { describe, it, expect } from "vitest";
import { cpuSlowdown } from "../../e2e/phone-speed";

describe("cpuSlowdown", () => {
    it("slows a machine until the workload takes as long as on the target phone", () => {
        expect(cpuSlowdown(10, 80)).toBe(8);
    });

    // Chromium throttles; it cannot speed a slow machine up.
    it("leaves a machine slower than the target as it is", () => {
        expect(cpuSlowdown(100, 80)).toBe(1);
    });
});
