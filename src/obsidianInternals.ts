import type { App } from "obsidian";

/** Obsidian's unpublished shape, so every unsupported access sits in one place. */
type AppInternal = { vault?: { config?: { readableLineLength?: boolean } } };

/**
 * No public API: Obsidian applies "Readable line length" per MarkdownView rather
 * than on the body, so a custom ItemView reads the config. Absent means default, on.
 */
export function getReadableLineLength(app: App): boolean {
    return (app as unknown as AppInternal).vault?.config?.readableLineLength ?? true;
}
