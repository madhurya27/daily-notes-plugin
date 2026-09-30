import type { CachedMetadata, Pos } from "obsidian";

/**
 * Lines a note's text wraps to at `width`, read from its metadata cache: what a
 * placeholder's height scales with, before the note is ever drawn. Each list
 * item and each other section outside the frontmatter counts its characters at
 * `charWidth`, and at least one line per line of its source.
 */
export function wrappedLines(cache: CachedMetadata, width: number, charWidth: number): number {
    const lines = (position: Pos) =>
        Math.max(
            position.end.line - position.start.line + 1,
            Math.ceil(((position.end.offset - position.start.offset) * charWidth) / width)
        );
    const sections = (cache.sections ?? []).filter((section) => section.type !== "list" && section.type !== "yaml");
    return [...sections, ...(cache.listItems ?? [])].reduce((sum, { position }) => sum + lines(position), 0);
}

export function embedCount(cache: CachedMetadata): number {
    return cache.embeds?.length ?? 0;
}
