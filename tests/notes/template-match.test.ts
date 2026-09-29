import { describe, it, expect } from "vitest";
import { isTemplateOnly, templatePattern } from "../../src/notes/template-match";

/** Whether `text` is `template` and nothing more. */
function matches(text: string, template: string | null): boolean {
    return isTemplateOnly(text, templatePattern(template));
}

const TEMPLATE = "---\ntags: daily\ncreated: {{date}}\n---\n# {{date:dddd, MMMM D}}\n\n## Log\n- \n";

describe("templatePattern", () => {
    it("holds for blank text, whatever the template", () => {
        expect(matches("", TEMPLATE)).toBe(true);
        expect(matches(" \n\t\n", TEMPLATE)).toBe(true);
    });

    it("holds for the template with its placeholders filled in", () => {
        const text = "---\ntags: daily\ncreated: 2026-09-28\n---\n# Monday, September 28\n\n## Log\n- \n";

        expect(matches(text, TEMPLATE)).toBe(true);
    });

    it.each(["{{date}}", "{{date:YYYY-MM-DD}}", "{{date+1d:YYYY-MM-DD}}", "{{yesterday}}", "{{ time }}"])(
        "reads %s as any text on its line",
        (placeholder) => {
            expect(matches("Day: 2026-09-27", `Day: ${placeholder}`)).toBe(true);
            expect(matches("Day: ", `Day: ${placeholder}`)).toBe(true);
            expect(matches("Day: 2026\nwritten", `Day: ${placeholder}`)).toBe(false);
        }
    );

    it("reads a Templater block as any text, across lines", () => {
        const template = "# <% tp.file.title %>\n<%* tR += tp.date.now() %>\nEnd";

        expect(matches("# 2026-09-28\n2026-09-28\n09:00\nEnd", template)).toBe(true);
    });

    it("ignores trailing whitespace on each line and at the end", () => {
        expect(matches("## Log\n-\n\n\n", "## Log\n- \n")).toBe(true);
        expect(matches("## Log  \n- ", "## Log\n-")).toBe(true);
    });

    it("ignores Windows line endings", () => {
        expect(matches("## Log\r\n- \r\n", "## Log\n- \n")).toBe(true);
    });

    it("takes the template's text literally, regex characters included", () => {
        expect(matches("Mood (1-5): [ ]", "Mood (1-5): [ ]")).toBe(true);
        expect(matches("Mood (1-5): x", "Mood (1-5): [ ]")).toBe(false);
    });

    it("fails for a filled-in prompt", () => {
        expect(matches("## Log\n- went running\n", "## Log\n- \n")).toBe(false);
    });

    it("fails for text added after the template", () => {
        expect(matches("## Log\n- \n\nA thought.", "## Log\n- \n")).toBe(false);
    });

    it("fails for a changed or an added property", () => {
        const changed = "---\ntags: work\ncreated: 2026-09-28\n---\n# Monday, September 28\n\n## Log\n- \n";
        const added = "---\ntags: daily\nmood: good\ncreated: 2026-09-28\n---\n# Monday, September 28\n\n## Log\n- \n";

        expect(matches(changed, TEMPLATE)).toBe(false);
        expect(matches(added, TEMPLATE)).toBe(false);
    });

    it("with no template set, holds only for blank text", () => {
        expect(matches("", null)).toBe(true);
        expect(matches("## Log", null)).toBe(false);
    });
});
