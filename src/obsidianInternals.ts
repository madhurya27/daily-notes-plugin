import type { App, EventRef } from "obsidian";

/** Obsidian's unpublished shape, so every unsupported access sits in one place. */
type VaultInternal = {
    config?: { readableLineLength?: boolean };
    /** Public API; read here only because the vault is reached through this cast. */
    configDir: string;
    on(name: "raw", callback: (path: string) => unknown): EventRef;
};

/** Reaches the vault without the bare `app.` global the compliance rules forbid. */
const vaultOf = (app: App) => (app as unknown as { vault?: VaultInternal }).vault;

/**
 * No public API: Obsidian applies "Readable line length" per MarkdownView rather
 * than on the body, so a custom ItemView reads the config. Absent means default, on.
 */
export function getReadableLineLength(app: App): boolean {
    return vaultOf(app)?.config?.readableLineLength ?? true;
}

/**
 * Fires when anything under the vault's config directory is written — the only
 * signal that Obsidian's daily-notes format or folder changed. The undeclared
 * "raw" vault event covers every file in the vault, so paths are filtered here.
 */
export function onVaultConfigChange(app: App, handler: () => void): EventRef {
    const vault = vaultOf(app) as VaultInternal;
    const { configDir } = vault;
    return vault.on("raw", (path) => {
        if (path.startsWith(`${configDir}/`)) handler();
    });
}
