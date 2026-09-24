import { parseYaml, stringifyYaml } from "obsidian";

/** A fence's opening line: up to three spaces, then three or more ` or ~, then the info string. */
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)/;
/** A Base embed alone on its line: `![[X.base]]`, `![[X.base#View]]`, `![[X.base|300]]`. */
const BASE_EMBED = /^ {0,3}!\[\[([^\]|#]+\.base)(?:#([^\]|]+))?(?:\|[^\]]*)?\]\]\s*$/;

interface Fence {
    marker: string;
    indent: string;
    isBase: boolean;
    opening: string;
    body: string[];
}

/**
 * A Base's definition with its table views drawn as cards, and `first`, the
 * view an embed names, moved to the front: a Base shows its first view. Null
 * when no view converts, so the Base keeps its fitted columns.
 */
export function asCards(definition: string, first?: string): string | null {
    let parsed: unknown;
    try {
        parsed = parseYaml(definition);
    } catch {
        return null;
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.views)) return null;

    const views: unknown[] = parsed.views;
    if (!views.some(isTable)) return null;
    const converted = views.map((view) => (isTable(view) ? { ...view, type: "cards" } : view));
    const named = converted.findIndex((view) => isRecord(view) && view.name === first);
    if (named > 0) converted.unshift(...converted.splice(named, 1));
    return stringifyYaml({ ...parsed, views: converted }).trimEnd();
}

/**
 * The note's markdown with every Base drawn as cards: a `base` block's table
 * views, and an embed alone on its line as a `base` block copied from its file.
 * The rendered copy only: Bases cannot save a block rendered outside an editor.
 */
export async function rewriteBasesAsCards(
    markdown: string,
    readBase: (linkpath: string) => Promise<string | null>
): Promise<string> {
    const out: string[] = [];
    let fence: Fence | null = null;

    for (const line of markdown.split("\n")) {
        if (fence) {
            if (closes(fence, line)) {
                out.push(...closeFence(fence, line));
                fence = null;
            } else fence.body.push(line);
            continue;
        }

        const open = FENCE_OPEN.exec(line);
        if (open) {
            const [, indent = "", marker = "", info] = open;
            fence = { marker, indent, isBase: info === "base", opening: line, body: [] };
            continue;
        }

        const embed = BASE_EMBED.exec(line);
        const definition = embed ? await readBase(embed[1]!) : null;
        const cards = definition === null ? null : asCards(definition, embed?.[2]);
        out.push(...(cards === null ? [line] : ["```base", cards, "```"]));
    }

    if (fence) out.push(fence.opening, ...fence.body);
    return out.join("\n");
}

/** Closed by a fence of the same character, at least as long. */
function closes(fence: Fence, line: string): boolean {
    const trimmed = line.trim();
    return trimmed.length >= fence.marker.length && trimmed === fence.marker[0]!.repeat(trimmed.length);
}

function closeFence(fence: Fence, closing: string): string[] {
    const written = [fence.opening, ...fence.body, closing];
    if (!fence.isBase) return written;
    const definition = fence.body.map((line) =>
        line.startsWith(fence.indent) ? line.slice(fence.indent.length) : line
    );
    const cards = asCards(definition.join("\n"));
    if (cards === null) return written;
    return [fence.opening, ...cards.split("\n").map((line) => fence.indent + line), closing];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTable(view: unknown): view is Record<string, unknown> {
    return isRecord(view) && view.type === "table";
}
