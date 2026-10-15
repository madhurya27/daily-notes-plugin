import { defineConfig } from "@playwright/test";
import type { MobileLayoutOptions } from "./e2e/obsidian";

/** When this run started, to the second, safe in a file name. */
const runStamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");

export default defineConfig<MobileLayoutOptions>({
    testDir: "e2e",
    // A phone, not Obsidian on this Mac: playwright.ios.config.ts.
    testIgnore: "ios/**",
    globalSetup: "./e2e/global-setup.ts",
    // One Obsidian instance and vault per worker; more starves them of CPU.
    workers: 4,
    // A run stops at its first failure; --max-failures=0 runs on, for a full report.
    maxFailures: 1,
    fullyParallel: true,
    timeout: 60_000,
    expect: { timeout: 15_000 },
    // Playwright wipes outputDir at the start of every run; each run's report
    // sits beside it, kept, to diagnose a failure after the fact.
    outputDir: "test-results/artifacts",
    reporter: [["list"], ["json", { outputFile: `test-results/runs/${runStamp}.json` }]],
    use: { trace: "retain-on-failure" },
    // Every spec runs twice. Obsidian's mobile stylesheet and phone layout differ
    // enough that a rule can be right on one and wrong on the other, and each
    // project owns its own Obsidian instance, so neither leaks state to the other.
    projects: [
        { name: "desktop", use: { mobileLayout: false } },
        { name: "mobile", use: { mobileLayout: true } },
    ],
});
