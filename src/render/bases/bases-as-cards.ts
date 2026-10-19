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
 * A Base's definition with its table and kanban views drawn as cards, at
 * `cardSize` when given, and `first`, the view an embed names, moved to the
 * front: a Base shows its first view. Null when no view converts, so the Base
 * keeps its fitted columns.
 */
export function asCards(definition: string, first?: string, cardSize?: number): string | null {
    const parsed = parseDefinition(definition);
    if (!parsed || !Array.isArray(parsed.views)) return null;

    const views: unknown[] = parsed.views;
    if (!views.some(drawsWide)) return null;
    const size = cardSize === undefined ? {} : { cardSize };
    const converted = views.map((view) => (drawsWide(view) ? { ...view, type: "cards", ...size } : view));
    const named = converted.findIndex((view) => isRecord(view) && view.name === first);
    // Stryker disable next-line EqualityOperator: the first view moved to the front stays where it is.
    if (named > 0) converted.unshift(...converted.splice(named, 1));
    // Stryker disable next-line MethodExpression: a blank line before the closing fence draws the same.
    return stringifyYaml({ ...parsed, views: converted }).trimEnd();
}

/** Where an extracted Base renders; each one is drawn into its own. */
export const BASE_SLOT_CLASS = "daily-note-base";
/** An HTML block ends at a blank line, so the line after the placeholder stays markdown. */
const SLOT = `<div class="${BASE_SLOT_CLASS}"></div>`;

/** A Base as the note writes it, and the markdown that draws it as written. */
export type BaseSource =
    | { kind: "block"; definition: string; markdown: string }
    | { kind: "embed"; link: string; view: string | undefined; markdown: string };

/**
 * The note's markdown with each Base — a `base` block, or an embed alone on its
 * line — swapped for an empty placeholder, and those Bases in order: each one
 * renders into its own placeholder, so it can be redrawn alone.
 */
export function extractBases(markdown: string): { markdown: string; bases: BaseSource[] } {
    const out: string[] = [];
    const bases: BaseSource[] = [];
    let fence: Fence | null = null;

    for (const line of markdown.split("\n")) {
        if (fence) {
            if (!closes(fence, line)) fence.body.push(line);
            else {
                if (fence.isBase) {
                    bases.push(baseBlock(fence, line));
                    out.push(fence.indent + SLOT, "");
                } else out.push(fence.opening, ...fence.body, line);
                fence = null;
            }
            continue;
        }

        const open = FENCE_OPEN.exec(line);
        if (open) {
            // Stryker disable next-line StringLiteral: both groups always match, if only nothing.
            const [, indent = "", marker = "", info] = open;
            fence = { marker, indent, isBase: info === "base", opening: line, body: [] };
            continue;
        }

        const embed = BASE_EMBED.exec(line);
        if (embed) {
            bases.push({ kind: "embed", link: embed[1]!, view: embed[2], markdown: line.trim() });
            out.push(SLOT, "");
        } else out.push(line);
    }

    if (fence) out.push(fence.opening, ...fence.body);
    return { markdown: out.join("\n"), bases };
}

/** Closed by a fence of the same character, at least as long. */
function closes(fence: Fence, line: string): boolean {
    const trimmed = line.trim();
    return trimmed.length >= fence.marker.length && trimmed === fence.marker[0]!.repeat(trimmed.length);
}

/** The block without the indent its placeholder keeps. */
function baseBlock(fence: Fence, closing: string): BaseSource {
    const dedent = (line: string) => (line.startsWith(fence.indent) ? line.slice(fence.indent.length) : line);
    const definition = fence.body.map(dedent).join("\n");
    const markdown = [dedent(fence.opening), definition, dedent(closing)].join("\n");
    return { kind: "block", definition, markdown };
}

/** A Base's YAML as an object, or null when it is not one. */
export function parseDefinition(definition: string): Record<string, unknown> | null {
    // Stryker disable BlockStatement: an empty catch returns undefined, as falsy to the caller as null.
    try {
        const parsed: unknown = parseYaml(definition);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
    // Stryker restore BlockStatement
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A view that can draw wider than its note; cards keep a kanban's columns as groups. */
function drawsWide(view: unknown): view is Record<string, unknown> {
    return isRecord(view) && (view.type === "table" || view.type === "kanban");
}
