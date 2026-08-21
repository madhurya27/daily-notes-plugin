import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    test: {
        // e2e/ belongs to Playwright; vitest would try to collect its specs.
        include: ["tests/**/*.test.ts"],
        environment: "jsdom",
        setupFiles: ["tests/setup.ts"],
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: ["src/main.ts", "src/settings.ts"],
        },
    },
    resolve: {
        alias: {
            obsidian: resolve(__dirname, "tests/mocks/obsidian.ts"),
            "obsidian-daily-notes-interface": resolve(__dirname, "tests/mocks/daily-notes-interface.ts"),
        },
    },
});
