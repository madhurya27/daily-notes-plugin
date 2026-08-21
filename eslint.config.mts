import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";

export default tseslint.config(
    {
        languageOptions: {
            globals: {
                ...globals.browser,
            },
            parserOptions: {
                projectService: {
                    allowDefaultProject: ["eslint.config.js", "manifest.json"],
                },
                tsconfigRootDir: import.meta.dirname,
                extraFileExtensions: [".json"],
            },
        },
    },
    ...obsidianmd.configs.recommended,
    // Last: turns off stylistic rules that would fight Prettier.
    prettier,
    globalIgnores([
        "node_modules",
        "coverage",
        "dist",
        "esbuild.config.mjs",
        "eslint.config.mts",
        "version-bump.mjs",
        "versions.json",
        "main.js",
        "PluginTest",
        "vitest.config.ts",
        "tests",
        // Typechecked by tsconfig.e2e.json; ESLint's project service covers src only.
        "e2e",
        "playwright.config.ts",
    ])
);
