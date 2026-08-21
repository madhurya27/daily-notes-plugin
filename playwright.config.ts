import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "e2e",
    globalSetup: "./e2e/global-setup.ts",
    // One Obsidian instance at a time: each carries a real vault on disk.
    workers: 1,
    fullyParallel: false,
    timeout: 60_000,
    expect: { timeout: 15_000 },
    reporter: process.env.CI ? "list" : [["list"]],
    use: { trace: "retain-on-failure" },
});
