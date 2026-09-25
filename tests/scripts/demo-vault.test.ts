import { describe, it, expect } from "vitest";
import { demoVault } from "../../scripts/demo-vault.mjs";

const UNTIL = new Date(Date.UTC(2026, 8, 25)); // a Friday
const vault = demoVault({ until: UNTIL, days: 60 });
const paths = Object.keys(vault);
const dailyPaths = paths.filter((path) => /^Journal\/\d{4}-\d{2}-\d{2}\.md$/.test(path));
const daily = (date: string) => vault[`Journal/${date}.md`] ?? "";

describe("demoVault", () => {
    it("writes one daily note per day, ending on the given date", () => {
        expect(dailyPaths).toHaveLength(60);
        expect(dailyPaths).toContain("Journal/2026-09-25.md");
        expect(dailyPaths).toContain("Journal/2026-07-28.md");
        expect(dailyPaths).not.toContain("Journal/2026-09-26.md");
    });

    it("gives a date the same note whatever the run ends on", () => {
        const later = demoVault({ until: new Date(Date.UTC(2026, 9, 3)), days: 60 });
        expect(later["Journal/2026-09-10.md"]).toBe(daily("2026-09-10"));
    });

    it("varies from day to day", () => {
        const bodies = new Set(dailyPaths.map((path) => vault[path]));
        expect(bodies.size).toBe(dailyPaths.length);
    });

    it("resolves every link and embed to a file in the vault", () => {
        const names = new Set(paths.map((path) => path.split("/").pop()!.replace(/\.md$/, "")));
        const targets = Object.values(vault).flatMap((body) =>
            [...body.matchAll(/!?\[\[([^\]|#]+)/g)].map((match) => match[1]!)
        );
        expect(targets.length).toBeGreaterThan(0);
        expect(targets.filter((target) => !names.has(target))).toEqual([]);
    });

    it("opens each weekday note with properties", () => {
        expect(daily("2026-09-24")).toMatch(/^---\ntags:\n {2}- daily\n[\s\S]*?\n---\n/);
    });

    it("reviews the week on Sundays, with the reading list as a Base", () => {
        expect(daily("2026-09-20")).toContain("## Week in review");
        expect(daily("2026-09-20")).toContain("![[Reading.base]]");
        expect(vault["Reading.base"]).toContain('file.inFolder("Books")');
    });

    it("gives the Base books with the properties it lists", () => {
        const books = paths.filter((path) => path.startsWith("Books/"));
        expect(books.length).toBeGreaterThanOrEqual(4);
        for (const book of books) expect(vault[book]).toMatch(/author: .+\nstatus: .+\nrating: /);
    });

    it("shows off headings, tasks, callouts and a table somewhere in the run", () => {
        const all = dailyPaths.map((path) => vault[path]).join("\n");
        expect(all).toMatch(/^### /m);
        expect(all).toMatch(/^- \[x\] /m);
        expect(all).toMatch(/^- \[ \] /m);
        expect(all).toMatch(/^> \[!\w+\]/m);
        expect(all).toMatch(/^\| .+ \|$/m);
    });
});
