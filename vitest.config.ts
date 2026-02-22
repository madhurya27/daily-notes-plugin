import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    test: {
        environment: "jsdom",
        setupFiles: ["tests/setup.ts"],
        exclude: [
            "tests/dist/**",
            "tests/out.test.js",
            "**/node_modules/**",
        ],
    },
    resolve: {
        alias: {
            obsidian: resolve(__dirname, "tests/mocks/obsidian.ts"),
            "obsidian-daily-notes-interface": resolve(__dirname, "tests/mocks/daily-notes-interface.ts"),
        },
    },
});
