import { test, expect, type Phone } from "./phone";
import { KANBAN, KANBAN_FILE, MIDDLE, SHORT_KANBAN, SHORT_NOTE } from "./vault";

/** A file the Base lists: it shows every note in `Books/`. */
const NEW_ROW = "Books/A new book.md";

const after = `.daily-note-block[data-source-path="${SHORT_NOTE}"] .daily-note-title`;

/** The places a list went through, each run of one place as one. */
const path = (tops: number[]) => tops.filter((top, i) => top !== tops[i - 1]);

/** Whether the places only ever moved one way: none came back. */
const oneWay = (tops: number[]) => {
    const steps = path(tops).flatMap((top, i, all) => (i === 0 ? [] : [Math.sign(top - all[i - 1]!)]));
    return steps.every((step) => step === steps[0]);
};

/** Where on screen the text the reader follows was, each frame, as another pane adds a row to every `Reading.base`. */
async function placesAsARowIsAdded(phone: Phone): Promise<number[]> {
    await phone.followReader();
    try {
        // Nothing back: a TFile reaches the whole vault, too much for the driver to send.
        await phone.runAsync(async (path: string) => {
            await window.app.vault.create(path, "author: Someone new\n");
        }, NEW_ROW);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return (await phone.stopFollowing()).moves;
    } finally {
        await phone.runAsync(async (path: string) => {
            await window.app.vault.delete(window.app.vault.getFileByPath(path)!);
        }, NEW_ROW);
    }
}

test("a Base on screen gains a row: the text below it never jumps and returns", async ({ phone }) => {
    await phone.openStream();
    // The Base's end on screen, the next note's text at the pane's middle.
    await phone.placeAt(after, -400);

    const tops = await placesAsARowIsAdded(phone);

    expect(oneWay(tops), `on screen at ${path(tops).join(", ")}`).toBe(true);
});

// Bases empties a view and fills it again as it redraws, now a row taller:
// above the screen's top, only the stream's anchor keeps that from moving the
// text in view.
test("a Base gaining a row just above the screen's top leaves the text below still", async ({ phone }) => {
    await phone.openStream();
    await phone.placeAt(after, 50);
    expect(await phone.atTop(".daily-note-base"), "the Base reaches into the screen").toBe(false);

    const tops = await placesAsARowIsAdded(phone);

    expect(Math.max(...tops.map(Math.abs)), `on screen at ${path(tops).join(", ")}`).toBeLessThan(2);
});

/** A table whose headers fit a phone and whose values do not: only a drawn table shows it is too wide. */
const VALUES_WIDE = [
    "formulas:",
    ...["a", "b", "c", "d"].map((formula) => `  ${formula}: file.path + " " + file.path`),
    "views:",
    "  - type: table",
    "    name: Values",
    "    order:",
    ...["a", "b", "c", "d"].map((formula) => `      - formula.${formula}`),
    "",
].join("\n");

/**
 * Where on screen the text the reader follows was, each frame, as `file` is
 * rewritten as `body` and its copy in `slot` redrawn, measured afresh: as
 * written, then as cards (D-033). The file is put back after.
 */
async function placesAsRedrawn(phone: Phone, slot: string, file: string, body: (was: string) => string) {
    const was = await phone.runAsync(
        (path: string): Promise<string> => window.app.vault.cachedRead(window.app.vault.getFileByPath(path)!),
        file
    );
    const write = (body: string) =>
        phone.runAsync(
            async (path: string, body: string) => {
                await window.app.vault.modify(window.app.vault.getFileByPath(path)!, body);
            },
            file,
            body
        );
    // Whether it drew as written on the way: the redraw is over within a frame or two.
    await phone.run((slot: string) => {
        const el = document.querySelector(slot)!;
        const seen = new MutationObserver(() => {
            if (!el.querySelector('.bases-view:not([data-view-type="cards"])')) return;
            el.setAttribute("data-drew-as-written", "");
            seen.disconnect();
        });
        seen.observe(el, { childList: true, subtree: true });
    }, slot);
    await phone.followReader();
    try {
        await phone.run(() => window.app.plugins.plugins["daily-notes-stream"].layoutMemory.bases.restore(null));
        await write(body(was));
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const tops = (await phone.stopFollowing()).moves;
        expect(await phone.has(`${slot}[data-drew-as-written]`), "drawn as written first").toBe(true);
        expect(await phone.has(`${slot} .bases-view[data-view-type="cards"]`), "then as cards").toBe(true);
        return tops;
    } finally {
        await write(was);
    }
}

// Measured afresh, a kanban draws as a board, then again as cards (D-107):
// above the screen's top, only the stream's anchor keeps the text in view still.
test("a kanban redrawn as cards just above the screen's top leaves the next note still", async ({ phone }) => {
    await phone.openStream();
    await phone.placeAt(after, 50);
    expect(await phone.atTop(".daily-note-base"), "a Base reaches into the screen").toBe(false);

    const tops = await placesAsRedrawn(phone, SHORT_KANBAN, KANBAN_FILE, (was) => `${was}# Changed\n`);

    expect(Math.max(...tops.map(Math.abs)), `on screen at ${path(tops).join(", ")}`).toBeLessThan(2);
});

// The redraw changes the Base's height inside a pinned note: the note re-pins,
// and the anchor shifts, in the task that changed it (ADR 0013).
for (const [what, slot, file, body] of [
    ["a table", MIDDLE, "Bases/Middle.base", () => VALUES_WIDE],
    ["a kanban", KANBAN, KANBAN_FILE, (was: string) => `${was}# Changed\n`],
] as const)
    test(`${what} redrawn as cards above the screen's top leaves the text below it in its note still`, async ({
        phone,
    }) => {
        await phone.openStream();
        await phone.placeAt(`${slot} ~ h2`, -200);
        expect(await phone.atTop(slot), "the Base reaches into the screen").toBe(false);

        const tops = await placesAsRedrawn(phone, slot, file, body);

        expect(Math.max(...tops.map(Math.abs)), `on screen at ${path(tops).join(", ")}`).toBeLessThan(2);
    });
