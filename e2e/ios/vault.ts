import { expect } from "@playwright/test";
import { createHash } from "crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { DAILY_TEMPLATE, demoVault } from "../../scripts/demo-vault.mjs";
import type { Phone } from "./phone";

/**
 * The harness's own vault on the phone, stored on it rather than in iCloud,
 * holding the demo journal up to a fixed day: the same notes on any phone, on
 * any day (ADR 0016).
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const VAULT = process.env.IOS_VAULT ?? "Stream E2E";
const PLUGIN_ID = "daily-notes-stream";
const DEMO: Record<string, string> = demoVault({ until: new Date(Date.UTC(2026, 8, 30)), days: 21 });
/**
 * What once stopped iOS glides, in the newest notes, so a flick from the top
 * starts on it: math (D-085), a Base, a wide table and a long code line
 * (ADR 0008).
 */
const STALLERS = [
    "## Stallers",
    "",
    "Effort: $\\dot{V}O_2 \\approx 48$, $CO_2$.",
    "",
    "| Route | Effort | Notes on the route, long enough to overrun a phone's width |",
    "| --- | --- | --- |",
    "| Old town circuit | $\\dot{V}O_2 \\approx 48$ | Cobbles after the bridge, then the long climb past the market |",
    "",
    "![[Reading.base]]",
    "",
    "```",
    "const pace = splits.map((split) => split.seconds / split.metres).reduce((sum, each) => sum + each, 0);",
    "```",
    "",
    "",
];
const NEWEST = Object.keys(DEMO)
    .filter((path) => /^Journal\/\d{4}-\d\d-\d\d\.md$/.test(path))
    .sort()
    .slice(-3);
/**
 * Two short notes mid-stream, so the next note's title is on screen below any
 * place in them, for a finger to tap: one ending in a Base, for a place inside
 * it, then one with no Base, below it. 2026-09-20, a Sunday, has its own.
 */
const SHORT_NOTE_WITH_BASE = "Journal/2026-09-22.md";
export const SHORT_NOTE = "Journal/2026-09-21.md";
const NOTES = {
    ...DEMO,
    ...Object.fromEntries(
        NEWEST.map((path) => [path, DEMO[path]!.replace(/^(---\n[\s\S]*?\n---\n\n)/, `$1${STALLERS.join("\n")}`)])
    ),
    [SHORT_NOTE]: "A short day, one paragraph long.\n",
    [SHORT_NOTE_WITH_BASE]: "A short day, then the reading list.\n\n![[Reading.base]]\n",
};

/** Everything the vault holds, configuration and build included, by path. */
function contents(configDir: string): Record<string, string> {
    const config = {
        "daily-notes.json": { folder: "Journal", format: "YYYY-MM-DD", template: DAILY_TEMPLATE },
        "core-plugins.json": { "daily-notes": true, bases: true },
        "community-plugins.json": [PLUGIN_ID],
        "app.json": { attachmentFolderPath: "Attachments" },
    };
    const build = ["main.js", "manifest.json", "styles.css"].map((name) => [
        `${configDir}/plugins/${PLUGIN_ID}/${name}`,
        readFileSync(join(REPO, name), "utf8"),
    ]);
    return {
        ...NOTES,
        ...Object.fromEntries(
            Object.entries(config).map(([name, value]) => [`${configDir}/${name}`, JSON.stringify(value)])
        ),
        ...Object.fromEntries(build),
    };
}

/**
 * Opens the vault by its URL, or creates it through the vault chooser. Never
 * through a vault's page in the chooser: that page holds Delete vault.
 */
async function open(phone: Phone): Promise<void> {
    const name = () => openVault(phone);
    if ((await name()) === VAULT) return;
    await phone.openUrl(`obsidian://open?vault=${encodeURIComponent(VAULT)}`);
    try {
        await expect.poll(name, { timeout: 10_000 }).toBe(VAULT);
        return;
    } catch {
        // No such vault yet.
    }
    // Each step redraws the chooser, so each waits for what the last drew.
    const shows = (selector: string) => () =>
        phone.run((sel: string) => !!document.querySelector(sel), selector).catch(() => false);
    // Shown already, with no vault open, when an earlier run stopped on it.
    await phone.run(() => document.querySelector(".mobile-vault-chooser") || window.app.openVaultChooser());
    await expect.poll(shows(".mobile-vault-chooser .lucide-plus-circle")).toBe(true);
    // By its icon, not its label: Obsidian may speak another language.
    await phone.run(() =>
        document
            .querySelector(".mobile-vault-chooser .lucide-plus-circle")!
            .closest<HTMLElement>(".mobile-vault-chooser-action")!
            .click()
    );
    await expect.poll(shows('.mobile-vault-chooser input[type="text"]')).toBe(true);
    await phone.run((vault: string) => {
        const input = document.querySelector<HTMLInputElement>('.mobile-vault-chooser input[type="text"]')!;
        input.value = vault;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        // On the phone: an iCloud vault's writes sync to every device the account has.
        const iCloud = document.querySelector<HTMLInputElement>('.mobile-vault-chooser input[type="checkbox"]');
        if (iCloud?.checked) iCloud.click();
        document.querySelector<HTMLButtonElement>(".mobile-vault-chooser button.mod-cta")!.click();
    }, VAULT);
    await expect.poll(name, { timeout: 30_000 }).toBe(VAULT);
}

/**
 * Makes the vault hold exactly `contents`, its config folder aside, and
 * reloads Obsidian. Skipped when the vault's fingerprint shows the same
 * contents written already.
 */
async function seed(phone: Phone): Promise<void> {
    const configDir = await phone.run(() => window.app.vault.configDir as string);
    const files = contents(configDir);
    const fingerprint = createHash("sha1").update(JSON.stringify(files)).digest("hex");
    const stamp = `${configDir}/stream-e2e-seed`;
    const loaded = (id: string) => !!window.app?.plugins?.plugins?.[id];
    if (
        (await phone.runAsync(
            async (path: string) =>
                (await window.app.vault.adapter.exists(path)) && window.app.vault.adapter.read(path),
            stamp
        )) === fingerprint &&
        (await phone.run(loaded, PLUGIN_ID))
    )
        return;
    const ready = () => phone.run(() => !!window.app?.vault?.adapter).catch(() => false);
    // Off restricted mode before the plugin list names one, or Obsidian asks
    // whether to trust the vault. Turning it off may reload the app.
    await phone
        .runAsync(async () => {
            if (!window.app.plugins.isEnabled()) await window.app.plugins.setEnable(true);
        })
        .catch(() => undefined);
    await expect.poll(ready).toBe(true);
    const [notes, config] = partition(files, (path) => !path.startsWith(`${configDir}/`));
    await phone.runAsync(async (files: Record<string, string>) => {
        const { adapter } = window.app.vault;
        // The vault's own index, which leaves out the config folder: the mobile adapter has no listRecursive.
        await Promise.all(
            (window.app.vault.getFiles() as { path: string }[])
                .filter(({ path }) => !(path in files))
                .map(({ path }) => adapter.remove(path))
        );
        const folders = new Set(Object.keys(files).map((path) => path.split("/").slice(0, -1).join("/")));
        for (const folder of [...folders].filter(Boolean).sort())
            if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
        await Promise.all(Object.entries(files).map(([path, text]) => adapter.write(path, text)));
    }, notes);
    // Last, the stamp after all: Obsidian may reload as its config changes, ending the script.
    await phone
        .runAsync(
            async (files: Record<string, string>, plugin: string) => {
                const { adapter, configDir } = window.app.vault;
                await adapter.mkdir(`${configDir}/plugins/${plugin}`).catch(() => undefined);
                for (const [path, text] of Object.entries(files)) await adapter.write(path, text);
            },
            { ...config, [stamp]: fingerprint },
            PLUGIN_ID
        )
        .catch(() => undefined);
    await expect.poll(ready).toBe(true);
    // The old page answers until the reload lands: marked, it cannot pass for the new one.
    await phone.run(() => {
        (window as unknown as { staleVault: boolean }).staleVault = true;
        window.app.commands.executeCommandById("app:reload");
    });
    const reloaded = (id: string) =>
        !(window as unknown as { staleVault?: boolean }).staleVault && !!window.app?.plugins?.plugins?.[id];
    await expect.poll(() => phone.run(reloaded, PLUGIN_ID).catch(() => false), { timeout: 30_000 }).toBe(true);
}

function partition(
    files: Record<string, string>,
    test: (path: string) => boolean
): [Record<string, string>, Record<string, string>] {
    const entries = Object.entries(files);
    return [
        Object.fromEntries(entries.filter(([path]) => test(path))),
        Object.fromEntries(entries.filter(([path]) => !test(path))),
    ];
}

/** The harness's vault open, seeded, with this build loaded. */
export async function useVault(phone: Phone): Promise<void> {
    await rememberTestersVault(phone);
    await open(phone);
    await seed(phone);
}

/** The tester's vault, on disk until put back: a worker restarted by a failure finds the harness's open. */
const TESTERS_VAULT = join(REPO, ".dev/ios-testers-vault");

function openVault(phone: Phone): Promise<string | undefined> {
    return phone.run(() => window.app?.vault?.getName() as string | undefined).catch(() => undefined);
}

async function rememberTestersVault(phone: Phone): Promise<void> {
    const name = await openVault(phone);
    if (name && name !== VAULT) writeFileSync(TESTERS_VAULT, name);
}

/** Opens the vault the tester had open, so Obsidian starts in it next time too. */
export async function returnToTestersVault(phone: Phone): Promise<void> {
    if (!existsSync(TESTERS_VAULT)) return;
    const name = readFileSync(TESTERS_VAULT, "utf8");
    await phone.openUrl(`obsidian://open?vault=${encodeURIComponent(name)}`);
    await expect.poll(() => openVault(phone), { timeout: 30_000 }).toBe(name);
    rmSync(TESTERS_VAULT);
}
