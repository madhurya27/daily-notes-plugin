/**
 * The name a phone build shows in its notice on load: two words, easier to
 * match at a glance than a commit and a time. The same code gets the same name.
 *
 * Run directly, it prints the name of the working tree: the commit, plus any
 * uncommitted change to a tracked file.
 */
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { isMain } from "./reload-plugin.mjs";

const ADJECTIVES = [
    "amber",
    "bold",
    "brisk",
    "calm",
    "coral",
    "crisp",
    "dusty",
    "eager",
    "fuzzy",
    "gentle",
    "golden",
    "happy",
    "hazel",
    "icy",
    "jolly",
    "keen",
    "lively",
    "lucky",
    "mellow",
    "misty",
    "noble",
    "olive",
    "plucky",
    "proud",
    "quiet",
    "rapid",
    "rosy",
    "rusty",
    "sandy",
    "silver",
    "sleepy",
    "smoky",
    "snowy",
    "sunny",
    "swift",
    "tawny",
    "tidy",
    "velvet",
    "wild",
    "witty",
];

const ANIMALS = [
    "badger",
    "beaver",
    "bison",
    "camel",
    "cobra",
    "crane",
    "dingo",
    "eagle",
    "ferret",
    "finch",
    "gecko",
    "gibbon",
    "heron",
    "hippo",
    "ibis",
    "jackal",
    "koala",
    "lemur",
    "llama",
    "lynx",
    "marmot",
    "moose",
    "newt",
    "otter",
    "panda",
    "parrot",
    "pelican",
    "puffin",
    "quail",
    "raven",
    "salmon",
    "seal",
    "sloth",
    "tapir",
    "tiger",
    "toucan",
    "turtle",
    "walrus",
    "wombat",
    "zebra",
];

/** Two words picked by `seed`'s hash. */
export function buildName(seed) {
    const hash = createHash("sha256").update(seed).digest();
    return `${ADJECTIVES[hash.readUInt16BE(0) % ADJECTIVES.length]} ${ANIMALS[hash.readUInt16BE(2) % ANIMALS.length]}`;
}

function main() {
    const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
    console.log(buildName(git("rev-parse", "HEAD") + git("diff", "HEAD")));
}

if (isMain(import.meta.url)) main();
