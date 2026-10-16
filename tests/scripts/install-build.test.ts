import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { main } from "../../scripts/install-build.mjs";
import { PLUGIN_ID } from "../../scripts/vaults.mjs";

describe("install-build", () => {
    it("installs the build into the vault named on the command line", () => {
        const repo = mkdtempSync(join(tmpdir(), "build-"));
        for (const file of ["main.js", "manifest.json", "styles.css"]) writeFileSync(join(repo, file), file);
        const vault = mkdtempSync(join(tmpdir(), "vault-"));

        main([relative(process.cwd(), vault)], repo);

        expect(readFileSync(join(vault, ".obsidian", "plugins", PLUGIN_ID, "main.js"), "utf8")).toBe("main.js");
    });

    it("asks for a vault when none is named", () => {
        expect(() => main([])).toThrow("Usage: pnpm run install:vault <vault>");
    });
});
