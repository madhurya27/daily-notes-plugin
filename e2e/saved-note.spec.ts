import { test, expect, openStream, restoreNote, seededDate, todayNote, writeNote } from "./obsidian";

/**
 * A note re-renders only the sections a save changed (ADR 0019): what it draws
 * must be what a whole render of the saved note draws.
 */
/**
 * Today's renders by section from the start; an older note renders as runs of
 * sections (ADR 0020), then by section from its first save, so its fresh
 * render is in runs.
 */
const NOTES = [
    ["today's", todayNote],
    ["an older", async () => `Notes/${seededDate(0)}.md`],
] as const;

/** One day of a journal kept in one note, `n` telling the days apart. */
function day(n: number): string {
    return [
        `## Day ${n}`,
        "",
        `Walked to the [[Notes|river]] and back, entry ${n}. The light was flat and grey.`,
        "",
        "- coffee with **Sam**",
        "    - talked about the move",
        "- [ ] call the landlord",
        "",
        "```js",
        `const day = ${n};`,
        "```",
        "",
        "| Meal | What |",
        "| --- | --- |",
        "| Lunch | soup |",
        "",
        "> [!note] Mood",
        "> Tired, but fine.",
        "",
    ].join("\n");
}

const DAYS = 40;
const journal = (days = Array.from({ length: DAYS }, (_, i) => day(i))) => days.join("\n");

for (const [which, pathOf] of NOTES) {
    test.describe(`${which} note saved while on screen`, () => {
        let NOTE = "";
        let original: string | null = null;

        test.beforeEach(async ({ obsidian }) => {
            NOTE = await pathOf(obsidian.page);
            original = await writeNote(obsidian.page, NOTE, journal());
        });

        test.afterEach(async ({ obsidian }) => restoreNote(obsidian.page, NOTE, original));

        async function save(page: import("@playwright/test").Page, edit: (text: string) => string) {
            await page.evaluate(
                async ({ path, edit }) => {
                    const file = window.app.vault.getAbstractFileByPath(path);
                    await window.app.vault.process(
                        file,
                        new Function("text", `return (${edit})(text)`) as (t: string) => string
                    );
                },
                { path: NOTE, edit: edit.toString() }
            );
        }

        const content = (page: import("@playwright/test").Page) =>
            page.locator(`.daily-note-block[data-source-path="${NOTE}"] .daily-note-content`);

        test("keeps what a save left alone, and draws what a fresh render draws", async ({ obsidian }) => {
            const { page } = obsidian;
            await openStream(page);
            await expect(content(page)).toContainText("entry 39");

            // Updated in place by the second save at the latest.
            await save(page, (text) => text.replace("entry 3.", "entry 3, edited."));
            await expect(content(page)).toContainText("entry 3, edited.");
            await content(page).evaluate((el) => el.querySelector("h2")!.setAttribute("data-kept", ""));
            await save(page, (text) =>
                text
                    .replace("entry 20.", "entry 20, edited.")
                    .replace("## Day 30", "## Day 30\n\nA paragraph of its own.")
                    .replace(/## Day 35[\s\S]*?(?=## Day 36)/, "")
            );
            await expect(content(page)).toContainText("A paragraph of its own.");
            await expect(content(page)).not.toContainText("entry 35");
            await expect(content(page).locator("h2").first()).toHaveAttribute("data-kept", "");

            // What differs only in markup: a whole render leaves a line break
            // between blocks, and Obsidian marks a table's cells with their
            // direction when the table is all it renders, as a section alone is.
            const drawn = () =>
                content(page).evaluate((el) => {
                    const copy = el.cloneNode(true) as HTMLElement;
                    for (const node of Array.from(copy.childNodes)) {
                        if (node instanceof Text && !node.data.trim()) node.remove();
                    }
                    return copy.innerHTML.replace(/(<t[hd]) dir="(?:ltr|rtl)"/g, "$1");
                });
            await content(page).evaluate((el) => el.querySelector("[data-kept]")!.removeAttribute("data-kept"));
            // On mobile, stray scroll boxes are clipped once the stream is still.
            let inPlace = "";
            await expect
                .poll(async () => {
                    const before = inPlace;
                    await page.waitForTimeout(1000);
                    inPlace = await drawn();
                    return inPlace === before;
                })
                .toBe(true);
            await openStream(page);
            await expect(content(page)).toContainText("A paragraph of its own.");
            // Code blocks and links finish drawing after the note's render.
            await expect.poll(drawn).toBe(inPlace);
        });

        test("keeps a collapsed section collapsed over what a save drew in it", async ({ obsidian }) => {
            const { page } = obsidian;
            await openStream(page);
            await save(page, (text) => text.replace("entry 3.", "entry 3, edited."));
            await expect(content(page)).toContainText("entry 3, edited.");

            const day5 = content(page).locator("h2", { hasText: "Day 5" });
            await day5.locator(".collapse-indicator").click();
            await save(page, (text) => text.replace("entry 5.", "entry 5, edited."));

            const edited = content(page).locator("p", { hasText: "entry 5, edited." });
            await expect(edited).toBeAttached();
            await expect(edited).toBeHidden();
            await expect(day5.locator(".collapse-indicator")).toHaveAttribute("aria-expanded", "false");
            await day5.locator(".collapse-indicator").click();
        });
    });
}
