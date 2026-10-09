import { writeFileSync, mkdirSync } from "fs";
import { test } from "./phone";
import { EMBEDS_NOTE } from "./vault";

// Spike (docs/TODO.md): do Bases and tables that scroll sideways end glides
// early, deep in the stream with notes unloaded? Run once per build; compare
// the lengths it writes.

const TABLES_NOTE = "Journal/2026-09-01.md";
const ROW =
    "| Old town circuit | 12.4 km | 5:12 /km | 148 bpm | Drizzle, then sun | River path, bridge, market | Cobbles after the bridge, then the long climb |";
const TABLE = [
    "| Day | Distance | Pace | Heart rate | Weather | Route | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ROW,
    ROW,
    ROW,
].join("\n");
const TABLES = Array.from({ length: 6 }, (_, i) => `## Run ${i + 1}\n\n${TABLE}\n`).join("\n");

/** Outermost Bases, in either build's drawing, then tables. */
const TARGETS = [
    `.daily-note-block[data-source-path="${EMBEDS_NOTE}"] :is(.daily-note-base, .block-language-base, .bases-embed)`,
    `.daily-note-block[data-source-path="${TABLES_NOTE}"] table`,
];
const FLICKS = Number(process.env.SIDEWAYS_FLICKS ?? 24);

test("flicks over wide Bases and tables, deep in the stream", async ({ phone }) => {
    test.setTimeout(FLICKS * 60_000);
    await phone.runAsync(
        (path: string, text: string) => window.app.vault.create(path, text).then(() => undefined),
        TABLES_NOTE,
        TABLES
    );
    const lengths: { target: string; index: number; direction: string; ms: number }[] = [];
    try {
        for (let flick = 0; flick < FLICKS; flick++) {
            const target = TARGETS[flick % 2]!;
            // Toward the newer notes, unloaded since the jump; the other way soon meets the oldest.
            const direction = "down";
            const index = Math.floor(flick / 2);
            await phone.openStream();
            await phone.jumpTo("2026-09-10");
            // Its note first, then again as notes render and move it.
            for (let pass = 0; pass < 3; pass++) {
                await phone.run(
                    (s: string, t: string, i: number) => {
                        const pane = document.querySelector(s)!.parentElement!;
                        const all = [...pane.querySelectorAll<HTMLElement>(t)].filter(
                            (el) => !el.parentElement!.closest(t)
                        );
                        const el = all[i % all.length] ?? pane.querySelector(t.slice(0, t.indexOf(" ")));
                        if (!el) throw new Error(`no ${t}`);
                        pane.scrollTop += el.getBoundingClientRect().top - pane.getBoundingClientRect().top - 150;
                    },
                    ".daily-notes-stream-container",
                    target,
                    index
                );
                await phone.rest();
            }
            const ms = await phone.glideLength(direction);
            lengths.push({ target: flick % 2 ? "table" : "Base", index, direction, ms });
            console.log(`flick ${flick + 1}: ${flick % 2 ? "table" : "Base"} ${index} ${direction} ${ms} ms`);
        }
    } finally {
        mkdirSync("test-results", { recursive: true });
        writeFileSync(`test-results/sideways-${process.env.SIDEWAYS_LABEL ?? "run"}.json`, JSON.stringify(lengths));
        await phone.runAsync(
            (path: string) => window.app.vault.delete(window.app.vault.getFileByPath(path)!, true),
            TABLES_NOTE
        );
    }
    const short = lengths.filter((l) => l.ms < 800);
    console.log(`${short.length} of ${lengths.length} glides ended under 0.8 s`);
});
