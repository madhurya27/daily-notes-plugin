import type { App } from "obsidian";

/**
 * Obsidian's internal, unpublished shape for the bits of app state we read.
 * Kept here so every unsupported access lives in one auditable place.
 */
type AppInternal = { vault?: { config?: { readableLineLength?: boolean } } };

/**
 * Whether Obsidian's "Readable line length" setting is on.
 *
 * There is no public API for this: Obsidian applies the setting per-view on
 * MarkdownView instances rather than putting `is-readable-line-width` on the
 * body, so a custom ItemView has to read the vault config directly. Absent
 * from the config means the setting is at its default, which is on.
 */
export function getReadableLineLength(app: App): boolean {
    return (app as unknown as AppInternal).vault?.config?.readableLineLength ?? true;
}
