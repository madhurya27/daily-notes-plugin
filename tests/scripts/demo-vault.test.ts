import { describe, it, expect } from "vitest";
import { demoVault } from "../../scripts/demo-vault.mjs";

const UNTIL = new Date(Date.UTC(2026, 8, 25)); // a Friday
const vault = demoVault({ until: UNTIL, days: 90 });
const paths = Object.keys(vault);
const dailyPaths = paths.filter((path) => /^Journal\/\d{4}-\d{2}-\d{2}\.md$/.test(path));
const daily = (date: string) => vault[`Journal/${date}.md`] ?? "";

describe("demoVault", () => {
    it("writes one daily note per day, ending on the given date", () => {
        expect(dailyPaths).toHaveLength(90);
        expect(dailyPaths).toContain("Journal/2026-09-25.md");
        expect(dailyPaths).toContain("Journal/2026-06-28.md");
        expect(dailyPaths).not.toContain("Journal/2026-09-26.md");
    });

    it("gives a date the same note whatever the run ends on", () => {
        const later = demoVault({ until: new Date(Date.UTC(2026, 9, 3)), days: 90 });
        expect(later["Journal/2026-09-10.md"]).toBe(daily("2026-09-10"));
    });

    it("varies from day to day", () => {
        const bodies = new Set(dailyPaths.map((path) => vault[path]));
        expect(bodies.size).toBe(dailyPaths.length);
    });

    // Several notes fit one screen, and a reader scrolls months: a line seen twice reads as filler.
    describe("repetition", () => {
        const dates = dailyPaths.map((path) => path.slice("Journal/".length, -".md".length)).sort();
        // Sentences, not task lines, table rows or properties: a recurring chore is how journals read.
        const prose = (date: string) =>
            new Set(
                daily(date)
                    .split("\n")
                    .filter((line) => line.length > 40 && !/^(- \[|\||\w+:)/.test(line))
            );

        it("repeats no sentence within three days", () => {
            const close = dates.flatMap((date, index) =>
                dates
                    .slice(index + 1, index + 4)
                    .flatMap((later) => [...prose(date)].filter((line) => prose(later).has(line)))
            );
            expect(close).toEqual([]);
        });

        it("puts no sentence in more than a tenth of the notes", () => {
            const counts = new Map<string, number>();
            for (const date of dates) for (const line of prose(date)) counts.set(line, (counts.get(line) ?? 0) + 1);
            const frequent = [...counts].filter(([, count]) => count > dates.length / 10);
            expect(frequent).toEqual([]);
        });

        it("tells a dozen pieces of news once each", () => {
            const work = dates.flatMap((date) =>
                [...daily(date).matchAll(/^- (?!\[)(.+)$/gm)].map((match) => match[1]!)
            );
            const once = work.filter((line) => work.indexOf(line) === work.lastIndexOf(line));
            expect(once.length).toBeGreaterThanOrEqual(12);
        });
    });

    it("resolves every link and embed to a file in the vault", () => {
        const names = new Set(paths.map((path) => path.split("/").pop()!.replace(/\.md$/, "")));
        const targets = Object.values(vault).flatMap((body) =>
            [...body.matchAll(/!?\[\[([^\]|#]+)/g)].map((match) => match[1]!)
        );
        expect(targets.length).toBeGreaterThan(0);
        expect(targets.filter((target) => !names.has(target))).toEqual([]);
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

    // The newest days open the stream, so they are the ones worth a footer.
    it("links the newest days from other notes, in the body and in a property", () => {
        const others = paths.filter((path) => !dailyPaths.includes(path)).map((path) => vault[path]!);
        const linking = (date: string) => others.filter((body) => body.includes(`[[${date}]]`));

        expect(linking("2026-09-25").length).toBeGreaterThanOrEqual(2);
        expect(linking("2026-09-24").length).toBeGreaterThanOrEqual(1);
        expect(others.some((body) => /^\w+: "\[\[2026-09-\d\d\]\]"$/m.test(body))).toBe(true);
    });

    it("links only days it wrote, on a run shorter than the log", () => {
        const short = demoVault({ until: UNTIL, days: 1 });
        const projects = Object.entries(short).filter(([path]) => path.startsWith("Projects/"));
        const targets = projects.flatMap(([, body]) => [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]));

        expect(targets.length).toBeGreaterThan(0);
        expect(new Set(targets)).toEqual(new Set(["2026-09-25"]));
    });
});
