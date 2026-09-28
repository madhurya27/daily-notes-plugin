/** A core `{{…}}` placeholder, or a Templater `<% … %>` block. */
const PLACEHOLDER = /(\{\{[^}\n]*\}\})|<%[\s\S]*?%>/g;

/** What a filled-in placeholder may be: any text on its line; a Templater block's, any text. */
const ON_ONE_LINE = "[^\\n]*";
const ANY_TEXT = "[\\s\\S]*";

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

/**
 * `template` read as a pattern for a note made from it (ADR 0011): its text
 * literally, each placeholder as what it may have been filled in with. With
 * no template, only blank text matches.
 */
export function templatePattern(template: string | null): RegExp {
    const normalized = normalize(template ?? "");
    let source = "";
    let literalFrom = 0;
    for (const match of normalized.matchAll(PLACEHOLDER)) {
        // Filled in with nothing, a placeholder leaves the space before it trailing, and trimmed.
        const literal = escapeRegExp(normalized.slice(literalFrom, match.index)).replace(/[ \t]+$/, "[ \\t]*");
        source += literal + (match[1] ? ON_ONE_LINE : ANY_TEXT);
        literalFrom = match.index + match[0].length;
    }
    source += escapeRegExp(normalized.slice(literalFrom));
    return new RegExp(`^${source}$`);
}

/** Whether `text` holds nothing but what `pattern`'s template put there. */
export function isTemplateOnly(text: string, pattern: RegExp): boolean {
    const normalized = normalize(text);
    return normalized === "" || pattern.test(normalized);
}
