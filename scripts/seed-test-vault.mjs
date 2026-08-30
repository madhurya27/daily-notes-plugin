/**
 * Rebuilds `PluginTest/` — the local vault docs/TESTING.md's checklist is
 * written against — and installs the current build into it.
 *
 *   node scripts/seed-test-vault.mjs [target-vault]
 *
 * Destructive: it removes the vault's notes and rewrites them. Obsidian's own
 * config (.obsidian) is written only when absent, so a vault you have already
 * opened keeps its layout, theme and plugin settings.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vault = resolve(process.argv[2] ?? join(REPO, "PluginTest"));
const NOTES = "Notes";
const PLUGIN_ID = "daily-notes-stream";
const ASSETS = ["main.js", "manifest.json", "styles.css"];

const write = (relative, contents) => {
    const target = join(vault, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
};

/** Writes Obsidian's own config only when it is missing, so a vault in use keeps its state. */
const writeConfigOnce = (relative, contents) => {
    if (!existsSync(join(vault, relative))) write(relative, contents);
};

const body = (...lines) => lines.join("\n") + "\n";

/** The stream loads 10 at a time; a filler run of this length forces a second batch. */
const FILLER_NOTES = 12;

const fillerDate = (index) => {
    const date = new Date(Date.UTC(2026, 7, 29) - index * 86_400_000);
    return date.toISOString().slice(0, 10);
};

const filler = (index) =>
    body(
        "---",
        `mood: day-${index + 1}`,
        "tags:",
        "  - daily",
        "---",
        "",
        "## Morning",
        "",
        `Ran ${index + 1} km before work.`,
        "",
        "## Evening",
        "",
        "- Groceries",
        "    - Milk",
        "    - Bread",
        "- Read a chapter"
    );

rmSync(join(vault, NOTES), { recursive: true, force: true });
rmSync(join(vault, "Elsewhere"), { recursive: true, force: true });

for (let index = 0; index < FILLER_NOTES; index++) {
    write(join(NOTES, `${fillerDate(index)}.md`), filler(index));
}

// The two notes docs/TESTING.md names by date, with the frontmatter it lists.
write(
    join(NOTES, "2026-02-01.md"),
    body(
        "---",
        "tags: test, image, link",
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
    )
);

write(
    join(NOTES, "2026-01-15.md"),
    body(
        "---",
        "tags: backlink, test",
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
    )
);

write(
    join(NOTES, "test-image.svg"),
    body(
        '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80">',
        '    <rect width="240" height="80" rx="8" fill="#7c3aed" />',
        '    <text x="120" y="48" font-family="sans-serif" font-size="20" fill="#fff" text-anchor="middle">test-image.svg</text>',
        "</svg>"
    )
);

// Neither of these is a daily note; neither may appear in the stream.
write(join(NOTES, "2026-01-20.png"), "not really a png");
write(join("Elsewhere", "2026-01-21.md"), body("Dated, but outside the daily-notes folder."));

writeConfigOnce(".obsidian/daily-notes.json", JSON.stringify({ folder: NOTES, format: "YYYY-MM-DD" }, null, 2));
writeConfigOnce(".obsidian/core-plugins.json", JSON.stringify({ "daily-notes": true }, null, 2));
writeConfigOnce(".obsidian/community-plugins.json", JSON.stringify([PLUGIN_ID], null, 2));
writeConfigOnce(".obsidian/appearance.json", JSON.stringify({ theme: "system" }, null, 2));

const missing = ASSETS.filter((asset) => !existsSync(join(REPO, asset)));
if (missing.length > 0) {
    console.error(`Build first — missing ${missing.join(", ")}. Run: pnpm run build`);
    process.exit(1);
}
for (const asset of ASSETS) {
    const target = join(vault, ".obsidian", "plugins", PLUGIN_ID, asset);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(REPO, asset), target);
}

console.log(`Seeded ${FILLER_NOTES + 2} daily notes and installed the plugin into ${vault}`);
