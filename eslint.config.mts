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
    // Node scripts, not plugin code: Node globals, and no typed linting to
    // configure since they sit outside every tsconfig.
    {
        files: ["scripts/**/*.mjs"],
        languageOptions: {
            globals: { ...globals.node },
            parserOptions: { projectService: false },
        },
        extends: [tseslint.configs.disableTypeChecked],
    },
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
