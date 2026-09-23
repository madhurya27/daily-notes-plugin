import type { App, EventRef, Hotkey, PaneType } from "obsidian";

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

/** No public API: the type manager resolves a key to the widget that draws its row. */
type MetadataTypeManager = {
    getTypeInfo?(key: string, value: unknown): { expected: { icon: string } | null; inferred: { icon: string } | null };
};

/**
 * The icon Obsidian's own properties panel shows for a key: the one on the type
 * assigned to it, else on the type its value infers. Null once the internal is
 * gone, so a caller can fall back.
 */
export function getPropertyIcon(app: App, key: string, value: unknown): string | null {
    const manager = (app as unknown as { metadataTypeManager?: MetadataTypeManager }).metadataTypeManager;
    const info = manager?.getTypeInfo?.(key, value);
    return (info?.expected ?? info?.inferred)?.icon ?? null;
}

/** The command the vault binds "Search current file" to, whose hotkey the stream answers. */
const SEARCH_COMMAND = "editor:open-search";

/** Obsidian's own default for it, should the hotkey manager go. */
const DEFAULT_SEARCH_HOTKEYS: Hotkey[] = [{ modifiers: ["Mod"], key: "F" }];

/** No public API: the hotkey manager holds the user's bindings, and Obsidian's. */
type HotkeyManager = {
    getHotkeys(id: string): Hotkey[] | undefined;
    getDefaultHotkeys(id: string): Hotkey[] | undefined;
};

/**
 * What "Search current file" is bound to right now: the user's binding, even
 * an empty one, else Obsidian's default. Read per keydown, so a rebind applies
 * at once (docs/decisions.md, 2026-09-23).
 */
export function getSearchHotkeys(app: App): Hotkey[] {
    const manager = (app as unknown as { hotkeyManager?: HotkeyManager }).hotkeyManager;
    if (!manager) return DEFAULT_SEARCH_HOTKEYS;
    return manager.getHotkeys(SEARCH_COMMAND) ?? manager.getDefaultHotkeys(SEARCH_COMMAND) ?? DEFAULT_SEARCH_HOTKEYS;
}
