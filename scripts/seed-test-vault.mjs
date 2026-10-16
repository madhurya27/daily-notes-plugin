/**
 * Rebuilds `.dev/vault/` — the local vault docs/TESTING.md's checklist is
 * written against — and installs the current build into it.
 *
 *   pnpm run seed --test [target-vault] [--days N]
 *
 * Destructive: it removes the vault's notes and rewrites them. Obsidian's own
 * config (.obsidian) is written only when absent, so a vault you have already
 * opened keeps its layout, theme and plugin settings.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { pdf } from "./pdf.mjs";
import { isMain } from "./reload-plugin.mjs";
import { PLUGIN_ID, installBuild, TEST_VAULT } from "./vaults.mjs";

const NOTES = "Notes";
const body = (...lines) => lines.join("\n") + "\n";

/** The daily-notes template setting: a path without `.md`, as Obsidian stores it. */
export const DAILY_TEMPLATE = "Templates/Daily";
const TEMPLATE = body("---", "mood:", "tags:", "  - daily", "---", "", "# {{date}}", "", "## Morning", "", "- ");
/** A note made from the template on `date`, as the daily-notes plugin fills it in. */
const fromTemplate = (date) => TEMPLATE.replace("{{date}}", date);

/** The stream loads 10 at a time, so this is a dozen batches of scrolling. */
const DEFAULT_DAYS = 120;

const fillerDate = (index) => {
    const date = new Date(Date.UTC(2026, 7, 29) - index * 86_400_000);
    return date.toISOString().slice(0, 10);
};

const frontmatter = (index) => ["---", `mood: day-${index + 1}`, "tags:", "  - daily", "---", ""];

/**
 * Notes of different shapes, cycled through the filler run: a stream of one
 * repeated note tests scrolling and nothing else. Each shape carries something
 * the checklist asks about — wide content that must fit without scrolling, deep
 * heading nesting, a note with no frontmatter (so no properties panel), Bases.
 */
const SHAPES = [
    (index) => [
        ...frontmatter(index),
        "## Morning",
        "",
        `Ran ${(index % 12) + 1} km before work.`,
        "",
        "## Evening",
        "",
        "- Groceries",
        "    - Milk",
        "    - Bread",
        "- Read a chapter",
    ],
    (index) => [
        ...frontmatter(index),
        "## Long read",
        "",
        ...Array.from(
            { length: 6 },
            (_, paragraph) =>
                `Paragraph ${paragraph + 1} of a note long enough that a single day fills more than ` +
                "one screen, which is what makes scroll-position restore worth checking.\n"
        ),
        "## Afterwards",
        "",
        "Short closing line.",
    ],
    (index) => [
        ...frontmatter(index),
        "## Wide code",
        "",
        "```ts",
        "const wide = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5, zeta: 6, eta: 7, theta: 8, iota: 9 };",
        "```",
        "",
        "It wraps, as in reading view.",
    ],
    (index) => [
        ...frontmatter(index),
        "## Wide table",
        "",
        "| Day | Distance | Pace | Heart rate | Weather | Route | Notes |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        `| ${index + 1} | 8 km | 5:12 | 148 | Overcast | Riverside loop | Felt easy |`,
    ],
    (index) => [
        ...frontmatter(index),
        "## Tasks",
        "",
        "- [x] Ship the thing",
        "- [ ] Write it up",
        "    - [ ] Draft",
        "    - [ ] Edit",
        "",
        "> A quote, for the blockquote styling.",
    ],
    (index) => [
        ...frontmatter(index),
        "# Top level",
        "",
        "## Second",
        "",
        "### Third",
        "",
        "Collapse the top one and everything below it should go with it.",
        "",
        "#### Fourth",
        "",
        "##### Fifth",
        "",
        "###### Sixth",
    ],
    // No frontmatter: the properties panel must simply not appear.
    () => ["A single line, no properties."],
];

/** A table view of `columns`, as a Base's YAML lists it. */
const tableView = (name, columns, ...extra) => [
    "  - type: table",
    `    name: ${name}`,
    ...extra,
    "    order:",
    ...columns.map((column) => `      - ${column}`),
];

/** Headers alone overrun a phone and a desktop note: straight to cards. */
const WIDE = ["file.name", "file.path", "file.folder", "file.ext", "file.size", "file.ctime", "file.mtime"];
/** Fits a tablet's note, not a phone's: rotate to flip it. */
const MIDDLE = ["file.name", "file.path", "file.folder", "file.ext", "file.size"];

/** The Bases the notes embed, one of each case docs/TESTING.md lists. */
const BASES = {
    "Wide.base": ["views:", ...tableView("Wide", WIDE)],
    "Middle.base": ["views:", ...tableView("Middle", MIDDLE)],
    // With a summary row, for the check that it stays on its table.
    "Narrow.base": [
        "views:",
        ...tableView("Narrow", ["file.name", "file.size"], "    summaries:", "      file.size: Sum"),
    ],
    // A hand-sized column: drawn as a table, it is cut at the note's edge.
    "Resized.base": [
        "views:",
        ...tableView("Resized", ["file.name", "file.path"], "    columnSize:", "      file.path: 900"),
    ],
    // An embed names the second view; `this` is the embedding note.
    "Two.base": [
        "views:",
        ...tableView("First", ["file.name"]),
        ...tableView("This note", WIDE, "    filters: file.path == this.file.path"),
    ],
    // A column per file extension: wider than a phone either way up (D-107).
    "Kanban.base": [
        "views:",
        "  - type: kanban",
        "    name: Kanban",
        "    order:",
        "      - file.name",
        "    groupBy:",
        "      property: file.ext",
        "      direction: ASC",
    ],
};

/** Short headers, long values: only a drawn table shows it is too wide. */
const VALUES_WIDE = [
    "```base",
    "formulas:",
    ...["a", "b", "c", "d"].map((formula) => `  ${formula}: file.path + " " + file.path`),
    "views:",
    ...tableView("Values", ["formula.a", "formula.b", "formula.c", "formula.d"]),
    "```",
];

/** Bases recur all the way down, for the scroll-stall check. */
SHAPES.push((index) => [
    ...frontmatter(index),
    "## Bases",
    "",
    "![[Wide.base]]",
    "",
    "![[Narrow.base]]",
    "",
    ...VALUES_WIDE,
]);

const filler = (index) => body(...SHAPES[index % SHAPES.length](index));

/**
 * The vault as `{ path: contents }`: `days` filler notes ending on 2026-08-29,
 * and the notes, Bases and files docs/TESTING.md names.
 * @param {{ days: number }} options
 * @returns {Record<string, string>}
 */
export function testVault({ days }) {
    /** @type {Record<string, string>} */
    const vault = {};
    for (let index = 0; index < days; index++) vault[`${NOTES}/${fillerDate(index)}.md`] = filler(index);

    for (const [name, lines] of Object.entries(BASES)) vault[`Bases/${name}`] = body(...lines);

    // The newest note: one of each embed, each drawn so that nothing scrolls.
    vault[`${NOTES}/2026-08-30.md`] = body(
        "## Bases",
        "",
        "On a phone or tablet each is a table while it fits the note, and cards once it does not.",
        "On desktop each is a table, scrolling sideways when wide.",
        "",
        "```base",
        ...BASES["Wide.base"],
        "```",
        "",
        "```base",
        ...BASES["Narrow.base"],
        "```",
        "",
        ...VALUES_WIDE,
        "",
        "On a tablet a table, on a phone cards; rotate to flip it:",
        "",
        "![[Middle.base]]",
        "",
        "![[Resized.base]]",
        "",
        "The embed's named view, filtered to this note:",
        "",
        "![[Two.base#This note]]",
        "",
        "A kanban, a column per file extension; on a phone, cards in a group per column:",
        "",
        "![[Kanban.base]]",
        "",
        "Inline, so always a table, its columns fitted: ![[Wide.base]]",
        "",
        "## Embedded notes",
        "",
        "![[Reading list]]",
        "",
        "![[Reading list#Later]]",
        "",
        "## Files and frames",
        "",
        "On a phone the PDF is its first page, and a tap opens it:",
        "",
        "![[Manual.pdf]]",
        "",
        "Wider than a phone, so it shrinks to the note:",
        "",
        '<iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ" width="560" height="315"></iframe>',
        "",
        "## Math",
        "",
        "$$\\sum_{i=1}^{n} x_i + \\sum_{j=1}^{m} y_j + \\sum_{k=1}^{p} z_k + \\sum_{l=1}^{q} w_l + \\int_0^1 f(t)\\,dt$$",
        "",
        "## Diagram",
        "",
        "Obsidian asks once before drawing Mermaid; Allow draws it.",
        "",
        "```mermaid",
        "flowchart LR",
        "  A[Alpha step] --> B[Beta step] --> C[Gamma step] --> D[Delta step] --> E[Epsilon step] --> F[Zeta step]",
        "```",
        "",
        "## Wide table",
        "",
        "| Column one | Column two | Column three | Column four | Column five | Column six | Column seven |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| a | b | c | d | e | f | g |"
    );

    // The two notes docs/TESTING.md names by date, with the frontmatter it lists.
    vault[`${NOTES}/2026-02-01.md`] = body(
        "---",
        "tags:",
        "  - test",
        "  - image",
        "  - link",
        "aliases: Feb 1st Test",
        "mood: productive",
        "---",
        "",
        "## Morning",
        "",
        "![[test-image.svg]]",
        "",
        "## Evening",
        "",
        "Backlink to [[2026-01-15]].",
        "",
        "Read a chapter of [[Reading list]], then [[Someday]], then [[Reading list#Later|what's next]].",
        "",
        "## Notes",
        "",
        "- Parent bullet",
        "    - Child one",
        "    - Child two",
        "",
        "## Notes",
        "",
        "Second heading with the same text: these collapse independently.",
        "",
        "## A heading holding a [link](https://obsidian.md)",
        "",
        "Clicking that link must not collapse this section."
    );

    vault[`${NOTES}/2026-01-15.md`] = body(
        "---",
        "tags:",
        "  - backlink",
        "  - test",
        "type: daily",
        "location: Home Office",
        "---",
        "",
        "## Morning",
        "",
        "### Nested deeper",
        "",
        "Collapse this, collapse its parent, then expand the parent: this stays hidden.",
        "",
        "## Evening",
        "",
        "Nothing to report."
    );

    vault[`${NOTES}/test-image.svg`] = body(
        '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80">',
        '    <rect width="240" height="80" rx="8" fill="#7c3aed" />',
        '    <text x="120" y="48" font-family="sans-serif" font-size="20" fill="#fff" text-anchor="middle">test-image.svg</text>',
        "</svg>"
    );

    // What 2026-02-01 links to. Long, so its #Later link has somewhere to scroll;
    // main() removes Someday.md, so that link stays unresolved even after a click made it.
    vault["Attachments/Manual.pdf"] = pdf(3);
    vault["Reading list.md"] = body(
        "# Reading list",
        "",
        ...Array.from({ length: 80 }, (_, i) => `- Book ${i + 1}`),
        "",
        "## Later",
        "",
        "- Middlemarch"
    );

    // Neither of these is a daily note; neither may appear in the stream.
    vault[`${NOTES}/2026-01-20.png`] = "not really a png";
    vault["Elsewhere/2026-01-21.md"] = body("Dated, but outside the daily-notes folder.");

    // The newest note's linked mentions, one of each case docs/TESTING.md lists.
    // Agenda exists twice: Plan's [[Agenda]] must open the one beside Plan.
    const newest = `[[${fillerDate(0)}]]`;
    vault["Projects/Plan.md"] = body(
        "# Plan",
        "",
        "- Launch",
        `    - Review ${newest} with the team at the [[Agenda]]`,
        "- Only this item shows under the newest note, not the whole list",
        "",
        `A paragraph that mentions ${newest} in the middle of a sentence long enough to wrap on a phone.`,
        "",
        "| Column one | Column two | Column three | Column four | Column five | Column six | Column seven |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        `| ${newest} | b | c | d | e | f | g |`
    );
    vault["Projects/Agenda.md"] = body("# Projects agenda", "", "The link in Plan opens this one.");
    vault[`${NOTES}/Agenda.md`] = body(
        "# Notes agenda",
        "",
        "Not a daily note: the stream leaves it out.",
        "",
        "Nothing written on [[2026-08-21]] yet."
    );

    // "Empty notes" in the checklist: hidden, but for a property or a link.
    vault[`${DAILY_TEMPLATE}.md`] = TEMPLATE;
    vault[`${NOTES}/2026-08-27.md`] = fromTemplate("2026-08-27");
    vault[`${NOTES}/2026-08-25.md`] = fromTemplate("2026-08-25").replace("mood:", "mood: rested");
    vault[`${NOTES}/2026-08-23.md`] = "";
    vault[`${NOTES}/2026-08-21.md`] = fromTemplate("2026-08-21");
    vault["Trip.md"] = body("---", `started: "${newest}"`, "---", "", "Packed.");
    vault["Inbox.md"] = body(`Follow up on ${newest}.`);
    return vault;
}

export function main() {
    const args = process.argv.slice(2);
    /** Reads `--flag value` and `--flag=value` alike. */
    const flagValue = (name) => {
        const inline = args.find((arg) => arg.startsWith(`${name}=`));
        if (inline) return inline.slice(name.length + 1);
        const index = args.indexOf(name);
        return index === -1 ? undefined : args[index + 1];
    };
    const positional = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--days");
    const vault = resolve(positional[0] ?? TEST_VAULT);
    const days = Number(flagValue("--days") ?? DEFAULT_DAYS);
    if (!Number.isInteger(days) || days < 1) {
        console.error(`--days wants a positive whole number, got: ${flagValue("--days")}`);
        process.exit(1);
    }

    const write = (relative, contents) => {
        const target = join(vault, relative);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, contents);
    };
    /** Writes Obsidian's own config only when it is missing, so a vault in use keeps its state. */
    const writeConfigOnce = (relative, contents) => {
        if (!existsSync(join(vault, relative))) write(relative, contents);
    };

    rmSync(join(vault, NOTES), { recursive: true, force: true });
    rmSync(join(vault, "Elsewhere"), { recursive: true, force: true });
    rmSync(join(vault, "Bases"), { recursive: true, force: true });
    rmSync(join(vault, "Templates"), { recursive: true, force: true });
    for (const [relative, contents] of Object.entries(testVault({ days }))) write(relative, contents);
    rmSync(join(vault, "Someday.md"), { force: true });

    writeConfigOnce(
        ".obsidian/daily-notes.json",
        JSON.stringify({ folder: NOTES, format: "YYYY-MM-DD", template: DAILY_TEMPLATE }, null, 2)
    );
    writeConfigOnce(".obsidian/core-plugins.json", JSON.stringify({ "daily-notes": true }, null, 2));
    writeConfigOnce(".obsidian/community-plugins.json", JSON.stringify([PLUGIN_ID], null, 2));
    writeConfigOnce(".obsidian/appearance.json", JSON.stringify({ theme: "system" }, null, 2));

    installBuild(vault);

    console.log(
        `Seeded ${days + 3} daily notes (${fillerDate(days - 1)} to ${fillerDate(0)}, plus the three the docs name).`
    );
    console.log(`Installed the plugin into ${vault}`);
}

if (isMain(import.meta.url)) main();
