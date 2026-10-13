import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import type { Page } from "@playwright/test";

/** A community plugin at a pinned release, so a new one cannot change what the specs see. */
export interface PinnedPlugin {
    /** Its manifest id, and its folder under `.obsidian/plugins/`. */
    id: string;
    name: string;
    /** The GitHub repo its releases are published from, `owner/name`. */
    repo: string;
    version: string;
    /** Each release asset's SHA-256. */
    sha256: Record<string, string>;
}

export const DATAVIEW: PinnedPlugin = {
    id: "dataview",
    name: "Dataview",
    repo: "blacksmithgu/obsidian-dataview",
    version: "0.5.70",
    sha256: {
        "main.js": "6bb1cf7010afad830e73575fca0e2bfbd3279c562e3d9d24f2d2f45161eb7d00",
        "manifest.json": "9235db47112da81b85591c79ecb9ae2574e5e72207056e976472f90616286185",
        "styles.css": "3306dd9032e00f989ba7233a37fd255bc4d3f4340cee661762e952f3f6aa1de9",
    },
};

/** The release the community directory installs; 1.0's betas keep their settings in another shape. */
export const PERIODIC_NOTES: PinnedPlugin = {
    id: "periodic-notes",
    name: "Periodic Notes",
    repo: "liamcain/obsidian-periodic-notes",
    version: "0.0.17",
    sha256: {
        "main.js": "ccf1a18673693d1036fc7614c3af9d23e5edfe425d1053df81dddcc29b1f8b0e",
        "manifest.json": "bda29323f75d3b3fcbda489335825b97fe4b574914d04635e9a7e67f2414049c",
        "styles.css": "613f3985d4c84900ed2e25d8a46efb7b3ace6889fb71217055084084eb146238",
    },
};

export const TEMPLATER: PinnedPlugin = {
    id: "templater-obsidian",
    name: "Templater",
    repo: "SilentVoid13/Templater",
    version: "2.25.1",
    sha256: {
        "main.js": "eb86d9282694ce1f099154c320286fdd89473e60dc2441ee310f3ac331333e94",
        "manifest.json": "b99280d2c4ab2cd22ad010c12faeedf255bcf385d127d973b89f85deb27d23fd",
        "styles.css": "67a6dd2d1d6dedca1287c334ca884ec4196433f71ca47388a0bd3eac14cf8b5f",
    },
};

/** The nearest alternative, benchmarked against in `compare.spec.ts`. */
export const DAILY_NOTES_EDITOR: PinnedPlugin = {
    id: "daily-notes-editor",
    name: "Daily Notes Editor",
    repo: "Quorafind/Obsidian-Daily-Notes-Editor",
    version: "1.1.0",
    sha256: {
        "main.js": "1c8638431dc3a65be10c9ba33ebc2fac759b640d2940e3a44fcc812e4971d3df",
        "manifest.json": "281aaf360015115d6c629387d92a0cca02571150a6729b0216d8b5eba469e265",
        "styles.css": "23037d9fb00cd43368983dc5d04b6aa5941c21943db9baea97531264ea50917e",
    },
};

/** Every plugin a spec installs, fetched before the run. */
export const PINNED_PLUGINS = [DATAVIEW, PERIODIC_NOTES, TEMPLATER, DAILY_NOTES_EDITOR];

const dirOf = (plugin: PinnedPlugin) =>
    resolve(dirname(fileURLToPath(import.meta.url)), "..", ".dev", "e2e-plugins", `${plugin.id}-${plugin.version}`);

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Downloads the release once into .dev/, verified; later runs need no network. */
export async function fetchPinned(plugin: PinnedPlugin): Promise<void> {
    const dir = dirOf(plugin);
    mkdirSync(dir, { recursive: true });
    for (const [name, hash] of Object.entries(plugin.sha256)) {
        const path = join(dir, name);
        if (existsSync(path) && sha256(readFileSync(path)) === hash) continue;
        const url = `https://github.com/${plugin.repo}/releases/download/${plugin.version}/${name}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${plugin.name} ${name}: ${response.status} from ${url}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (sha256(bytes) !== hash) throw new Error(`${plugin.name} ${name}: checksum mismatch`);
        writeFileSync(path, bytes);
        console.log(`[e2e] fetched ${plugin.name} ${plugin.version} ${name}`);
    }
}

/**
 * Installs and enables the plugin in the vault, starting from `data` as its
 * saved settings when given; the returned function disables and removes it.
 */
export async function installPinned(page: Page, plugin: PinnedPlugin, data?: object): Promise<() => Promise<void>> {
    const files = Object.fromEntries(
        Object.keys(plugin.sha256).map((name) => [name, readFileSync(join(dirOf(plugin), name), "utf8")])
    );
    if (data) files["data.json"] = JSON.stringify(data);
    await page.evaluate(
        async ({ id, files }) => {
            const { adapter, configDir } = window.app.vault;
            const dir = `${configDir}/plugins/${id}`;
            if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
            for (const [name, text] of Object.entries(files)) await adapter.write(`${dir}/${name}`, text);
            await window.app.plugins.loadManifests();
            await window.app.plugins.enablePlugin(id);
        },
        { id: plugin.id, files }
    );
    return () =>
        page.evaluate(async (id) => {
            await window.app.plugins.disablePlugin(id);
            const { adapter, configDir } = window.app.vault;
            const dir = `${configDir}/plugins/${id}`;
            if (await adapter.exists(dir)) await adapter.rmdir(dir, true);
            await window.app.plugins.loadManifests();
        }, plugin.id);
}
