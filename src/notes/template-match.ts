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
    let source = "";
    let literalFrom = 0;
    let trimAfter: Trim;
    for (const match of normalized.matchAll(PLACEHOLDER)) {
        const block = match[0];
        const trimBefore = /^<%[-_]/.test(block) ? (block[2] as Trim) : undefined;
        const literal = trimEnd(trimStart(normalized.slice(literalFrom, match.index), trimAfter), trimBefore);
        // Filled in with nothing, a placeholder leaves the space before it trailing, and trimmed.
        source += escapeRegExp(literal).replace(/[ \t]+$/, "[ \\t]*");
        source += CURSOR.test(block) ? CURSOR_LEFT : ON_ONE_LINE;
        trimAfter = /[-_]%>$/.test(block) ? (block.at(-3) as Trim) : undefined;
        literalFrom = match.index + block.length;
    }
    source += escapeRegExp(trimStart(normalized.slice(literalFrom), trimAfter));
    return new RegExp(`^${source}$`);
}

/** Whether `text` holds nothing but what `pattern`'s template put there. */
export function isTemplateOnly(text: string, pattern: RegExp): boolean {
    const normalized = normalize(text);
    return normalized === "" || pattern.test(normalized);
}
