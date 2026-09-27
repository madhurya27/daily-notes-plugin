/**
 * Writes `.dev/demo-vault/` — a journal that reads like someone's real one, for
 * screenshots and screen recordings. `seed` is for testing: its notes are shaped
 * around edge cases and photograph as scaffolding.
 *
 *   node scripts/demo-vault.mjs [vault] [--days N] [--until YYYY-MM-DD]
 *
 * Each note is drawn from a generator seeded by its own date, so a date reads
 * the same on every run and a recording can be retaken. Destructive like `seed`:
 * the notes are rewritten, `.obsidian` is written only when absent.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { isMain } from "./reload-plugin.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "daily-notes-stream";
const JOURNAL = "Journal";
const DAY_MS = 86_400_000;

/** mulberry32, seeded by the date's digits: stable per date, varied across dates. */
const randomFor = (date) => {
    let seed = Number(date.replaceAll("-", ""));
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const picker = (random) => ({
    one: (items) => items[Math.floor(random() * items.length)],
    some: (items, count) => [...items].sort(() => random() - 0.5).slice(0, count),
    chance: (odds) => random() < odds,
    between: (low, high) => low + Math.floor(random() * (high - low + 1)),
});

const BOOKS = {
    "The Dispossessed": { author: "Ursula K. Le Guin", status: "reading", rating: 5 },
    Piranesi: { author: "Susanna Clarke", status: "finished", rating: 5 },
    "Four Thousand Weeks": { author: "Oliver Burkeman", status: "finished", rating: 4 },
    "The Design of Everyday Things": { author: "Don Norman", status: "reading", rating: 4 },
    "Tomorrow, and Tomorrow, and Tomorrow": { author: "Gabrielle Zevin", status: "up next", rating: 0 },
    "A Pattern Language": { author: "Christopher Alexander", status: "up next", rating: 0 },
};
const READING = Object.entries(BOOKS)
    .filter(([, book]) => book.status === "reading")
    .map(([title]) => title);

const PEOPLE = ["Priya", "Sam", "Jonah", "Mara"];
const PROJECTS = ["Project Atlas", "Kitchen renovation"];

const MOODS = ["focused", "calm", "tired", "energized", "scattered", "content", "restless"];

const MORNINGS = [
    "Up at 6:40 without the alarm. Coffee on the balcony while the street was still quiet.",
    "Slow start. Read in bed for half an hour before looking at my phone, which felt like a small win.",
    "Rain against the window all morning. Made porridge and wrote three pages longhand.",
    "Woke up with the whole [[Project Atlas]] navigation problem already rearranged in my head. Sketched it before it evaporated.",
    "Yoga, badly. Twenty minutes, most of it in child's pose.",
    "Walked to the bakery for sourdough. The owner remembered my order, which made my week.",
];

const RUNS = [
    ["Riverside loop", "Overcast, cool"],
    ["Park hill repeats", "Sunny, windy"],
    ["Canal towpath", "Light drizzle"],
    ["Old town circuit", "Clear and cold"],
];

const STANDUPS = [
    "Walked [[Priya]] through the new onboarding flow. She wants fewer steps; she's right.",
    "Pairing with [[Jonah]] on the sync bug — it's a race between two retries, not the cache.",
    "Design review for [[Project Atlas]]: the sidebar survives, the tab bar does not.",
    "Wrote up the research synthesis. Five interviews, one clear theme: people don't trust autosave.",
    "Cleared the review queue before lunch for the first time this month.",
    "Roadmap sync with [[Mara]]. We cut the export feature from this quarter, and everyone looked relieved.",
    "Shipped the settings redesign behind a flag. Watching the error dashboard like a hawk.",
    "Prototyped the empty states. Three variations, the plainest one tested best.",
    "Long 1:1 with [[Sam]] about career growth. Promised to find them a project with more ownership.",
];

const TASKS = [
    "Reply to the landlord about the boiler",
    "Send [[Priya]] the updated flows",
    "Book dentist appointment",
    "Review [[Jonah]]'s pull request",
    "Order tiles for the [[Kitchen renovation]]",
    "Renew library card",
    "Draft the quarterly update",
    "Water the plants",
    "Pick up the dry cleaning",
    "Write feedback for [[Sam]]",
    "Call Mum",
    "Back up the laptop",
];

const EVENINGS = [
    () => `Read forty pages of [[${READING[0]}]] and fell asleep with the lamp on.`,
    () => "Cooked the miso aubergine from the green book. Too much miso, will do it again anyway.",
    () => `Dinner with [[Mara]] at the Georgian place. We talked about everything except work.`,
    () => "Watched half a film, gave up, went to bed early. No regrets.",
    () => `Couple of chapters of [[${READING[1]}]] — slower going, but every page earns its place.`,
    () => "Long phone call with my sister. The kids have discovered knock-knock jokes.",
    () => "Played guitar for an hour. Finally got the barre chord in the bridge clean.",
];

const CALLOUTS = [
    ["idea", "Idea", "What if the daily note template asked one question instead of five?"],
    ["quote", "Quote", "“How we spend our days is, of course, how we spend our lives.” — Annie Dillard"],
    ["tip", "Note to self", "Block the first ninety minutes. Meetings can have the afternoon."],
    ["question", "Open question", "Is [[Project Atlas]] a redesign, or two products wearing one coat?"],
];

const GRATITUDE = [
    "Sunlight through the kitchen window at 5pm",
    "A kind message from an old colleague",
    "The good pen turning up in a coat pocket",
    "Fresh bread",
    "[[Priya]]'s patience in a long meeting",
    "A quiet train home",
    "The first cold, clear morning of autumn",
];

const WEEKEND = [
    "Farmers' market with [[Mara]]: figs, a ridiculous amount of cheese, flowers for the table.",
    "Hiked the ridge trail. 14 km, 600 m of climbing, one very muddy dog we didn't own.",
    "Spent the afternoon measuring the kitchen for the [[Kitchen renovation]]. The walls are not square. Nothing is square.",
    "Lazy one. Read in the park until the light went.",
    "Helped [[Sam]] move flat. Four flights of stairs, one sofa, zero lifts.",
    "Went to the museum's new photography exhibition. Stood in front of one print for ten minutes.",
];

const RECIPE = [
    "### Sunday pasta",
    "",
    "1. Soften two shallots and a lot of garlic in butter",
    "2. Add a tin of tomatoes and a pinch of chilli, cook down for 20 min",
    "3. Finish with cream and parmesan, loosen with pasta water",
];

const frontmatter = (properties) => [
    "---",
    ...Object.entries(properties).flatMap(([key, value]) =>
        Array.isArray(value) ? [`${key}:`, ...value.map((item) => `  - ${item}`)] : [`${key}: ${value}`]
    ),
    "---",
    "",
];

const tasks = (pick) =>
    pick.some(TASKS, pick.between(2, 4)).map((task) => `- [${pick.chance(0.55) ? "x" : " "}] ${task}`);

const runTable = (pick) => {
    const [route, weather] = pick.one(RUNS);
    const km = pick.between(5, 12);
    const pace = `${pick.between(4, 5)}:${String(pick.between(10, 55)).padStart(2, "0")}`;
    return [
        "## Run",
        "",
        "| Route | Distance | Pace | Weather |",
        "| --- | --- | --- | --- |",
        `| ${route} | ${km} km | ${pace} /km | ${weather} |`,
    ];
};

/** A quarter of weekdays get a line or two: a real journal has thin days, and several fit one screen. */
const weekday = (date, pick) => {
    const properties = frontmatter({
        tags: ["daily", "work"],
        mood: pick.one(MOODS),
        sleep: pick.between(10, 17) / 2,
    });
    const sketch = date.endsWith("-16") ? ["### Sketch", "", "![[atlas-wireframe.svg]]", ""] : [];
    if (pick.chance(0.25)) {
        return [...properties, "## Notes", "", `- ${pick.one(STANDUPS)}`, "", ...sketch, pick.one(EVENINGS)()];
    }
    const callout = pick.chance(0.35) ? pick.one(CALLOUTS) : null;
    return [
        ...properties,
        "## Morning",
        "",
        pick.one(MORNINGS),
        "",
        ...(pick.chance(0.3) ? [...runTable(pick), ""] : []),
        "## Work",
        "",
        ...pick.some(STANDUPS, pick.between(1, 2)).map((line) => `- ${line}`),
        "",
        ...sketch,
        "### To do",
        "",
        ...tasks(pick),
        "",
        ...(callout ? [`> [!${callout[0]}] ${callout[1]}`, `> ${callout[2]}`, ""] : []),
        "## Evening",
        "",
        pick.one(EVENINGS)(),
    ];
};

const saturday = (pick) => [
    ...frontmatter({ tags: ["daily", "weekend"], mood: pick.one(MOODS) }),
    "## Saturday",
    "",
    pick.one(WEEKEND),
    "",
    ...(pick.chance(0.5) ? [...runTable(pick), ""] : []),
    "## Grateful for",
    "",
    ...pick.some(GRATITUDE, 3).map((line, index) => `${index + 1}. ${line}`),
];

const sunday = (pick) => [
    ...frontmatter({ tags: ["daily", "weekend", "review"], mood: pick.one(MOODS) }),
    "## Week in review",
    "",
    "### Went well",
    "",
    ...pick.some(STANDUPS, 2).map((line) => `- ${line}`),
    "",
    "### Could be better",
    "",
    `- ${pick.one(["Too many late nights", "Skipped two runs", "Said yes to one meeting too many", "Barely read"])}`,
    "",
    "### Reading",
    "",
    "![[Reading.base]]",
    "",
    ...(pick.chance(0.5) ? [...RECIPE, ""] : []),
    "## Next week",
    "",
    ...tasks(pick),
];

const dailyNote = (date) => {
    const pick = picker(randomFor(date));
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const lines = day === 0 ? sunday(pick) : day === 6 ? saturday(pick) : weekday(date, pick);
    return lines.join("\n") + "\n";
};

const READING_BASE = [
    "filters:",
    "  and:",
    '    - file.inFolder("Books")',
    "views:",
    "  - type: table",
    "    name: Reading",
    "    order:",
    "      - file.name",
    "      - author",
    "      - status",
    "      - rating",
];

const WIREFRAME = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="280" viewBox="0 0 480 280" font-family="sans-serif">',
    '  <rect width="480" height="280" rx="12" fill="#f4f1ea" stroke="#8a8373" stroke-width="2"/>',
    '  <rect x="16" y="16" width="112" height="248" rx="6" fill="#e3ddd0"/>',
    ...[40, 64, 88, 112].map((y) => `  <rect x="28" y="${y}" width="80" height="10" rx="5" fill="#b8ae9a"/>`),
    '  <rect x="144" y="16" width="320" height="40" rx="6" fill="#e3ddd0"/>',
    '  <rect x="144" y="72" width="152" height="192" rx="6" fill="#fff" stroke="#b8ae9a"/>',
    '  <rect x="312" y="72" width="152" height="192" rx="6" fill="#fff" stroke="#b8ae9a"/>',
    '  <text x="220" y="172" font-size="14" fill="#8a8373" text-anchor="middle">list</text>',
    '  <text x="388" y="172" font-size="14" fill="#8a8373" text-anchor="middle">detail</text>',
    "</svg>",
];

const personNote = (name) =>
    [...frontmatter({ tags: ["person"] }), `# ${name}`, "", "Works with me on [[Project Atlas]]."].join("\n") + "\n";

const bookNote = ([title, { author, status, rating }]) =>
    [...frontmatter({ author, status, rating: rating || "", tags: ["book"] }), `# ${title}`, ""].join("\n") + "\n";

/**
 * The vault as `{ path: contents }`: `days` daily notes ending on `until`, and all they link to.
 * @param {{ until: Date, days: number }} range
 * @returns {Record<string, string>}
 */
export function demoVault({ until, days }) {
    /** @type {Record<string, string>} */
    const vault = {};
    for (let index = 0; index < days; index++) {
        const date = new Date(until.getTime() - index * DAY_MS).toISOString().slice(0, 10);
        vault[`${JOURNAL}/${date}.md`] = dailyNote(date);
    }
    for (const book of Object.entries(BOOKS)) vault[`Books/${book[0]}.md`] = bookNote(book);
    for (const name of PEOPLE) vault[`People/${name}.md`] = personNote(name);
    for (const name of PROJECTS) vault[`Projects/${name}.md`] = `# ${name}\n`;
    vault["Reading.base"] = READING_BASE.join("\n") + "\n";
    vault["Attachments/atlas-wireframe.svg"] = WIREFRAME.join("\n") + "\n";
    return vault;
}

function main() {
    const args = process.argv.slice(2);
    const flag = (name) => {
        const index = args.indexOf(name);
        return index === -1 ? undefined : args[index + 1];
    };
    const positional = args.filter((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
    const vault = resolve(positional[0] ?? join(REPO, ".dev", "demo-vault"));
    const days = Number(flag("--days") ?? 60);
    const now = new Date();
    const until = flag("--until")
        ? new Date(`${flag("--until")}T00:00:00Z`)
        : new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    if (!Number.isInteger(days) || days < 1 || Number.isNaN(until.getTime())) {
        console.error("Usage: pnpm run seed:demo [vault] [--days N] [--until YYYY-MM-DD]");
        process.exit(1);
    }

    const write = (relative, contents) => {
        const target = join(vault, relative);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, contents);
    };
    const writeConfigOnce = (relative, value) => {
        if (!existsSync(join(vault, relative))) write(relative, JSON.stringify(value, null, 2));
    };

    for (const folder of [JOURNAL, "Books", "People", "Projects", "Attachments"]) {
        rmSync(join(vault, folder), { recursive: true, force: true });
    }
    for (const [path, contents] of Object.entries(demoVault({ until, days }))) write(path, contents);

    writeConfigOnce(".obsidian/daily-notes.json", { folder: JOURNAL, format: "YYYY-MM-DD" });
    writeConfigOnce(".obsidian/core-plugins.json", { "daily-notes": true, bases: true });
    writeConfigOnce(".obsidian/community-plugins.json", [PLUGIN_ID]);
    writeConfigOnce(".obsidian/app.json", { attachmentFolderPath: "Attachments" });

    const assets = ["main.js", "manifest.json", "styles.css"];
    const missing = assets.filter((asset) => !existsSync(join(REPO, asset)));
    if (missing.length > 0) {
        console.error(`Build first — missing ${missing.join(", ")}. Run: pnpm run build`);
        process.exit(1);
    }
    const pluginDir = join(vault, ".obsidian", "plugins", PLUGIN_ID);
    mkdirSync(pluginDir, { recursive: true });
    for (const asset of assets) copyFileSync(join(REPO, asset), join(pluginDir, asset));

    console.log(`Wrote ${days} journal entries up to ${until.toISOString().slice(0, 10)} into ${vault}`);
    console.log(`Open it: pnpm run open ${vault}`);
}

if (isMain(import.meta.url)) main();
