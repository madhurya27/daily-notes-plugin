import { test, expect, type Phone } from "./phone";
import { SHORT_NOTE } from "./vault";

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
