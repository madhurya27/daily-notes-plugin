import { parseLinktext, type App, type CachedMetadata, type Pos, type TFile } from "obsidian";
import type { BacklinkIndex } from "./backlink-index";

/** Offsets into a source's text. */
export interface Excerpt {
    start: number;
    end: number;
}

/** A note linking here, and where. */
export interface Mention {
    source: TFile;
    /** The list item or section around each link in the body, each once, in source order. */
    excerpts: Excerpt[];
    /** Each property linking here, as `key: value` markdown. */
    properties: string[];
}

/**
 * The notes linking to `file`, sorted by path, from the cache alone: nothing
 * is read, so a footer can draw its count before any snippet.
 */
export function linkedMentions(app: App, index: BacklinkIndex, file: TFile): Mention[] {
    const mentions: Mention[] = [];
    for (const path of index.sourcesOf(file.path)) {
        const source = app.vault.getFileByPath(path);
        const cache = source && app.metadataCache.getFileCache(source);
        if (!source || !cache) continue;

        const linksHere = (link: string) =>
            app.metadataCache.getFirstLinkpathDest(parseLinktext(link).path, path)?.path === file.path;
        const excerpts = excerptsOf(
            cache,
            [...(cache.links ?? []), ...(cache.embeds ?? [])].filter((ref) => linksHere(ref.link))
        );
        const properties = [
            ...new Set(
                (cache.frontmatterLinks ?? [])
                    .filter((ref) => linksHere(ref.link))
                    .map((ref) => `${ref.key.split(".")[0]}: ${ref.original}`)
            ),
        ];
        // The index can run ahead of this source's cache while it re-resolves.
        if (excerpts.length > 0 || properties.length > 0) mentions.push({ source, excerpts, properties });
    }
    return mentions;
}

/** Changes whenever what a footer shows could: a source added or gone, linking more or less, or written. */
export function mentionsSignature(mentions: readonly Mention[]): string {
    return mentions
        .map(
            ({ source, excerpts, properties }) =>
                `${source.path}:${excerpts.length + properties.length}:${source.stat.mtime}`
        )
        .join("|");
}

/** Each link's innermost list item, else its section, else itself; de-duplicated. */
function excerptsOf(cache: CachedMetadata, refs: readonly { position: Pos }[]): Excerpt[] {
    const byStart = new Map<number, Excerpt>();
    for (const { position } of refs) {
        const offset = position.start.offset;
        const around = innermost(cache.listItems ?? [], offset) ?? innermost(cache.sections ?? [], offset) ?? position;
        byStart.set(around.start.offset, { start: around.start.offset, end: around.end.offset });
    }
    return [...byStart.values()].sort((a, b) => a.start - b.start);
}

/** The cache lists items in source order, a parent before its children: the last one holding `offset` is innermost. */
function innermost(items: readonly { position: Pos }[], offset: number): Pos | undefined {
    for (let i = items.length - 1; i >= 0; i--) {
        const { position } = items[i]!;
        if (position.start.offset <= offset && offset <= position.end.offset) return position;
    }
    return undefined;
}
