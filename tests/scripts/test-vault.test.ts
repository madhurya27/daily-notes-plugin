import { describe, it, expect } from "vitest";
import { testVault } from "../../scripts/seed-test-vault.mjs";

const vault = testVault({ days: 120 });
const paths = Object.keys(vault);
const note = (path: string) => vault[path] ?? "";

describe("testVault", () => {
    it("writes the filler run, newest on 2026-08-29, and the notes docs/TESTING.md names", () => {
        const daily = paths.filter((path) => /^Notes\/\d{4}-\d{2}-\d{2}\.md$/.test(path));
        expect(daily).toContain("Notes/2026-08-29.md");
        expect(daily).toContain("Notes/2026-08-30.md");
        expect(daily).toContain("Notes/2026-02-01.md");
        expect(daily).toContain("Notes/2026-01-15.md");
        expect(daily.length).toBeGreaterThanOrEqual(120);
    });

    it("keeps the files that must stay out of the stream", () => {
        expect(paths).toContain("Notes/2026-01-20.png");
        expect(paths).toContain("Elsewhere/2026-01-21.md");
    });

    it("writes the Bases the notes embed", () => {
        for (const base of ["Wide", "Middle", "Narrow", "Resized", "Two"])
            expect(paths).toContain(`Bases/${base}.base`);
    });

    it("gives 2026-02-01 the frontmatter the checklist lists", () => {
        expect(note("Notes/2026-02-01.md")).toMatch(/aliases: Feb 1st Test\nmood: productive/);
    });

    it("resolves every link and embed but [[Someday]], which stays unresolved on purpose", () => {
        const names = new Set(paths.map((path) => path.split("/").pop()!.replace(/\.md$/, "")));
        const targets = Object.values(vault).flatMap((body) =>
            [...body.matchAll(/!?\[\[([^\]|#]+)/g)].map((match) => match[1]!)
        );
        expect(targets.filter((target) => !names.has(target))).toEqual(["Someday"]);
    });

    // One note of each case docs/TESTING.md's linked mentions checks, all on the newest note.
    describe("links to the newest note, for its linked mentions", () => {
        const newest = "[[2026-08-29]]";
        const linking = paths.filter((path) => !path.startsWith("Notes/") && note(path).includes(newest));

        it("from several notes, one outside any folder", () => {
            expect(linking.length).toBeGreaterThanOrEqual(3);
            expect(linking.some((path) => !path.includes("/"))).toBe(true);
        });

        it("from a nested list item, a paragraph, a property and a wide table", () => {
            const bodies = linking.map(note).join("\n");
            expect(bodies).toMatch(new RegExp(`^ {4}- .*\\[\\[2026-08-29\\]\\]`, "m"));
            expect(bodies).toMatch(new RegExp(`^\\w[^|\\n-].*\\[\\[2026-08-29\\]\\]`, "m"));
            expect(bodies).toMatch(/^\w+: "\[\[2026-08-29\]\]"$/m);
            expect(bodies).toMatch(/^\|.*\[\[2026-08-29\]\].*\|$/m);
        });

        it("from a note whose own link resolves beside it, not beside the daily note", () => {
            expect(paths).toContain("Projects/Agenda.md");
            expect(paths).toContain("Notes/Agenda.md");
            expect(linking.some((path) => path.startsWith("Projects/") && note(path).includes("[[Agenda]]"))).toBe(
                true
            );
        });
    });
});
