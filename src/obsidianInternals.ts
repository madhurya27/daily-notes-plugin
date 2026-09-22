import type { App, EventRef, PaneType } from "obsidian";

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

/** The core search plugin's unpublished handle, reached through the registry. */
type InternalPlugins = {
    getPluginById(id: "global-search"): { instance?: { openGlobalSearch(query: string): void } } | undefined;
};

/** The core search view, whose query a pane of our own has to set itself. */
type SearchView = { setQuery?(query: string): void };

/** A tag as the search pane spells it; one holding a space needs quoting. */
function tagQuery(tag: string): string {
    const name = tag.startsWith("#") ? tag : `#${tag}`;
    return /\s/.test(name) ? `tag:"${name}"` : `tag:${name}`;
}

/**
 * Opens the search on a tag, the way clicking a tag anywhere else in Obsidian
 * does: in the sidebar pane, or, given a pane, in a pane of its own. No
 * public API exposes the search pane, so the core plugin is reached by id; a
 * user who disabled it gets nothing rather than an error.
 */
export async function openTagSearch(app: App, tag: string, pane: PaneType | boolean = false): Promise<void> {
    const plugins = (app as unknown as { internalPlugins?: InternalPlugins }).internalPlugins;
    const search = plugins?.getPluginById("global-search")?.instance;
    if (!search) return;
    const query = tagQuery(tag);
    if (!pane) {
        search.openGlobalSearch(query);
        return;
    }
    const { workspace } = app;
    // `true` is Keymap's word for the default new pane, a tab.
    const leaf = workspace.getLeaf(pane === true ? "tab" : pane);
    await leaf.setViewState({ type: "search", active: true });
    (leaf.view as SearchView).setQuery?.(query);
}
