import type { CachedMetadata, Pos } from "obsidian";

/**
 * Lines a note's text wraps to at `width`, read from its metadata cache: what a
 * placeholder's height scales with, before the note is ever drawn. Each list
 * item and each other section outside the frontmatter wraps each line of its
 * source at `charWidth`: the cache holds no line's length, so each is taken as
 * the section's average.
 */
export function wrappedLines(cache: CachedMetadata, width: number, charWidth: number): number {
    const lines = ({ start, end }: Pos) => {
        const source = end.line - start.line + 1;
        const chars = (end.offset - start.offset) / source;
        return source * Math.max(1, Math.ceil((chars * charWidth) / width));
    };
    const sections = (cache.sections ?? []).filter((section) => section.type !== "list" && section.type !== "yaml");
    return [...sections, ...(cache.listItems ?? [])].reduce((sum, { position }) => sum + lines(position), 0);
}

export function embedCount(cache: CachedMetadata): number {
    return cache.embeds?.length ?? 0;
}
