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
    // The obsidian mock hands tests the real moment, because Obsidian's own
    // moment is what the plugin calls at run time: a stand-in that only spoke
    // ISO would pass every test a vault dated DD-MM-YYYY fails. Dev-only —
    // `obsidian` is external, so the bundle takes moment from the app.
    {
        files: ["package.json"],
        rules: { "depend/ban-dependencies": ["error", { allowed: ["moment"] }] },
    },
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
    // Tests run in Node under vitest, never inside the app: the rules that
    // guard the shipped plugin's runtime don't apply. unbound-method misreads
    // `expect(mock.method)`, which never calls the method.
    {
        files: ["tests/**/*.ts"],
        languageOptions: { globals: { ...globals.node } },
        rules: {
            "import/no-nodejs-modules": "off",
            "obsidianmd/hardcoded-config-path": "off",
            "@microsoft/sdl/no-inner-html": "off",
            "no-restricted-imports": "off",
            "@typescript-eslint/unbound-method": "off",
            // Tests stand in for Obsidian and Bases, which style inline.
            "obsidianmd/no-static-styles-assignment": "off",
        },
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
        // Typechecked by tsconfig.e2e.json; ESLint's project service covers src and tests.
        "e2e",
        "playwright.config.ts",
    ])
);
