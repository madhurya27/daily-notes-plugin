import { defineConfig } from "@playwright/test";

/** When this run started, to the second, safe in a file name. */
const runStamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");

/** Obsidian on a USB-connected iPhone (ADR 0016): one phone, so one worker. */
export default defineConfig({
    testDir: "e2e-tests/ios",
    globalSetup: "./e2e-tests/ios/global-setup.ts",
    workers: 1,
    // A run stops at its first failure; --max-failures=0 runs on, for a full report.
    maxFailures: 1,
    // A session starts WebDriverAgent on the phone; flicks wait out their glide.
    timeout: 180_000,
    expect: { timeout: 15_000 },
    outputDir: "test-results/ios-artifacts",
    reporter: [["list"], ["json", { outputFile: `test-results/ios-runs/${runStamp}.json` }]],
});
