/** A core `{{…}}` placeholder, or a Templater `<% … %>` block: either fills in any text on its line. */
const PLACEHOLDER = /\{\{[^}\n]*\}\}|<%[\s\S]*?%>/g;

/** Templater's cursor marker in a template. */
const CURSOR = /^<%[-_*]?\s*tp\.file\.cursor\([^)]*\)\s*[-_]?%>$/;
/** What a cursor marker fills in: the marker Templater writes back, or nothing once it jumps there. */
const CURSOR_LEFT = "(?:<% tp\\.file\\.cursor\\([^)\\n]*\\) %>)?";

const ON_ONE_LINE = "[^\\n]*";

/** Line endings made `\n`, and each line's trailing whitespace dropped. */
function normalize(text: string): string {
    return text
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+$/gm, "")
        .trimEnd();
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** How a Templater block trims the text beside it: `-` one newline, `_` all whitespace. */
type Trim = "-" | "_" | undefined;

function trimEnd(literal: string, trim: Trim): string {
    if (trim === "-") return literal.replace(/\n$/, "");
    return trim === "_" ? literal.replace(/\s+$/, "") : literal;
}

function trimStart(literal: string, trim: Trim): string {
    if (trim === "-") return literal.replace(/^\n/, "");
    return trim === "_" ? literal.replace(/^\s+/, "") : literal;
}

/**
 * `template` read as a pattern for a note made from it (ADR 0011, D-117): its
 * text literally, each placeholder as what it may have been filled in with,
 * trimmed as Templater's whitespace control says. With no template, only
 * blank text matches.
 */
export function templatePattern(template: string | null): RegExp {
    const normalized = normalize(template ?? "");
    const parts: Part[] = [];
    let literalFrom = 0;
    let trimAfter: Trim;
    for (const match of normalized.matchAll(PLACEHOLDER)) {
        const block = match[0];
        // Stryker disable next-line Regex: a placeholder opens with its one "<%".
        const trimBefore = /^<%[-_]/.test(block) ? (block[2] as Trim) : undefined;
        parts.push(
            ...literalParts(trimEnd(trimStart(normalized.slice(literalFrom, match.index), trimAfter), trimBefore))
        );
        parts.push({ isText: false, source: CURSOR.test(block) ? CURSOR_LEFT : ON_ONE_LINE });
        // Stryker disable next-line Regex: a placeholder closes with its one "%>".
        trimAfter = /[-_]%>$/.test(block) ? (block.at(-3) as Trim) : undefined;
        literalFrom = match.index + block.length;
    }
    parts.push(...literalParts(trimStart(normalized.slice(literalFrom), trimAfter)));
    return new RegExp(`^${joinParts(parts)}$`);
}

/** A piece of the pattern: template text, or the whitespace after it or a placeholder. */
interface Part {
    isText: boolean;
    source: string;
}

/** A literal as its text and the whitespace closing it. */
function literalParts(literal: string): Part[] {
    // Stryker disable next-line StringLiteral,Regex: both groups always match, from the start: lazy, the first group is.
    const [, text = "", gap = ""] = /^([\s\S]*?)(\s*)$/.exec(literal)!;
    const parts: Part[] = [];
    if (text) parts.push({ isText: true, source: escapeRegExp(text) });
    // Filled in with nothing, a placeholder leaves the space before it trailing, and trimmed.
    // Stryker disable next-line Regex: normalize leaves spaces only after a gap's last line break.
    parts.push({ isText: false, source: escapeRegExp(gap).replace(/[ \t]+$/, "[ \\t]*") });
    return parts;
}

/**
 * The parts in order. Past the last text, placeholders filled in with
 * nothing leave the note ending in whitespace, which `normalize` trims: each
 * part there may be missing, with all that follows it.
 */
function joinParts(parts: Part[]): string {
    let tail = parts.length;
    while (tail > 0 && !parts[tail - 1]!.isText) tail--;
    const text = parts.slice(0, tail).map((part) => part.source);
    const rest = parts.slice(tail).map((part) => `(?:${part.source}`);
    return text.join("") + rest.join("") + ")?".repeat(rest.length);
}

/** Whether `text` holds nothing but what `pattern`'s template put there. */
export function isTemplateOnly(text: string, pattern: RegExp): boolean {
    const normalized = normalize(text);
    return normalized === "" || pattern.test(normalized);
}
