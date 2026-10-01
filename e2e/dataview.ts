import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import type { Page } from "@playwright/test";

/** A pinned release, so a new one cannot change what the specs see. */
const VERSION = "0.5.70";

const SHA256: Record<string, string> = {
    "main.js": "6bb1cf7010afad830e73575fca0e2bfbd3279c562e3d9d24f2d2f45161eb7d00",
    "manifest.json": "9235db47112da81b85591c79ecb9ae2574e5e72207056e976472f90616286185",
    "styles.css": "3306dd9032e00f989ba7233a37fd255bc4d3f4340cee661762e952f3f6aa1de9",
};

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".dev", "e2e-plugins", `dataview-${VERSION}`);

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Downloads the release once into .dev/, verified; later runs need no network. */
export async function fetchDataview(): Promise<void> {
    mkdirSync(DIR, { recursive: true });
    for (const [name, hash] of Object.entries(SHA256)) {
        const path = join(DIR, name);
        if (existsSync(path) && sha256(readFileSync(path)) === hash) continue;
        const url = `https://github.com/blacksmithgu/obsidian-dataview/releases/download/${VERSION}/${name}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Dataview ${name}: ${response.status} from ${url}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (sha256(bytes) !== hash) throw new Error(`Dataview ${name}: checksum mismatch`);
        writeFileSync(path, bytes);
        console.log(`[e2e] fetched Dataview ${VERSION} ${name}`);
    }
}

/** Installs and enables Dataview in the vault, its JS queries on; the returned function disables it. */
export async function installDataview(page: Page): Promise<() => Promise<void>> {
    const files = Object.fromEntries(Object.keys(SHA256).map((name) => [name, readFileSync(join(DIR, name), "utf8")]));
    await page.evaluate(async (files) => {
        const { adapter, configDir } = window.app.vault;
        const dir = `${configDir}/plugins/dataview`;
        if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
        for (const [name, text] of Object.entries(files)) await adapter.write(`${dir}/${name}`, text);
        await window.app.plugins.loadManifests();
        await window.app.plugins.enablePlugin("dataview");
        window.app.plugins.plugins.dataview.settings.enableDataviewJs = true;
    }, files);
    return () => page.evaluate(() => window.app.plugins.disablePlugin("dataview"));
}
