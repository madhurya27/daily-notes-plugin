import { defineConfig } from "@playwright/test";
import type { MobileLayoutOptions } from "./e2e/obsidian";

export default defineConfig<MobileLayoutOptions>({
    testDir: "e2e",
    globalSetup: "./e2e/global-setup.ts",
    // One Obsidian instance at a time: each carries a real vault on disk.
    workers: 1,
    fullyParallel: false,
    timeout: 60_000,
    expect: { timeout: 15_000 },
    reporter: process.env.CI ? "list" : [["list"]],
    use: { trace: "retain-on-failure" },
    // Every spec runs twice. Obsidian's mobile stylesheet and phone layout differ
    // enough that a rule can be right on one and wrong on the other, and each
    // project owns its own Obsidian instance, so neither leaks state to the other.
    projects: [
        { name: "desktop", use: { mobileLayout: false } },
        { name: "mobile", use: { mobileLayout: true } },
    ],
});
