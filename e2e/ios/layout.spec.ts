import { test, expect, type Phone } from "./phone";
import { EMBEDS_NOTE } from "./vault";

const NOTE = `.daily-note-block[data-source-path="${EMBEDS_NOTE}"]`;

/**
 * What in the note of every embed shows past its text's right edge, as far
 * as the boxes clipping it let it, and whether the pane scrolls sideways. A
 * Base's toolbar is left out: its New button, an edit in a read-only stream,
 * is clipped off a phone's width.
 */
const overflow = (phone: Phone) =>
    phone.run((note: string) => {
        const block = document.querySelector(note)!;
        const content = block.querySelector(".daily-note-content")!;
        const right = content.getBoundingClientRect().right;
        const pane = block.closest(".daily-notes-stream-container")!.parentElement!;
        const over = [...content.querySelectorAll("*")]
            .filter((el) => !el.closest(".bases-toolbar"))
            .filter((el) => {
                const box = el.getBoundingClientRect();
                let shown = box.right;
                // Clipped inside the text, as a Base's table cell clips its header;
                // the text's own clip is what this looks past.
                for (let clip = el.parentElement; clip && clip !== content; clip = clip.parentElement)
                    if (getComputedStyle(clip).overflowX !== "visible")
                        shown = Math.min(shown, clip.getBoundingClientRect().right);
                return box.width > 0 && shown > right + 1;
            })
            .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`);
        if (pane.scrollWidth > pane.clientWidth) over.unshift(`the pane, ${pane.scrollWidth} wide`);
        return over.slice(0, 10);
    }, NOTE);

/**
 * Narrow.base, the note's second Base: wider than a phone held upright, it
 * fits one on its side. Middle.base, which the note says flips, stays cards
 * on a phone either way: it flips on a tablet.
 */
const FLIPPING = `${NOTE} .daily-note-content > .daily-note-base:nth-child(2 of .daily-note-base)`;
const MATH = `${NOTE} .daily-note-content > h2:nth-of-type(4)`;

/** How `FLIPPING` draws now: as cards, or a table. */
const form = (phone: Phone) =>
    phone.run((base: string) => {
        const el = document.querySelector(base)!;
        if (el.querySelector(".bases-cards-item")) return "cards";
        return el.querySelector(".bases-table") ? "table" : "nothing";
    }, FLIPPING);

/** How wide the note's equation draws, and the note's text. */
const widths = (phone: Phone) =>
    phone.run((note: string) => {
        const block = document.querySelector(note)!;
        const width = (selector: string) => Math.round(block.querySelector(selector)!.getBoundingClientRect().width);
        return { equation: width("mjx-container[display]"), text: width(".daily-note-content") };
    }, NOTE);

/**
 * The Base's form and the equation's width in the orientation the phone is
 * in, once nothing reaches past the note. A turn does not keep the place in
 * this note (docs/TODO.md), so each is placed again.
 */
async function drawn(phone: Phone) {
    await phone.placeAt(FLIPPING, -100);
    const base = await form(phone);
    expect(await overflow(phone)).toEqual([]);
    await phone.placeAt(MATH, -20);
    return { base, ...(await widths(phone)) };
}

test("nothing in the note of every embed scrolls sideways or reaches past its text", async ({ phone }) => {
    await phone.openStream();
    // Section by section: Bases draw only what is near the screen.
    for (let section = 1; section <= 6; section++) {
        await phone.placeAt(`${NOTE} .daily-note-content > h2:nth-of-type(${section})`, -20);
        expect(await overflow(phone), `section ${section}`).toEqual([]);
    }
});

test("a turn flips a wide Base between cards and a table, and fits the equation to the note", async ({ phone }) => {
    await phone.openStream();
    const upright = await drawn(phone);
    expect(upright.base).toBe("cards");
    expect(upright.equation).toBeLessThanOrEqual(upright.text);

    await phone.turn("LANDSCAPE");
    const onItsSide = await drawn(phone);
    expect(onItsSide.base).toBe("table");
    expect(onItsSide.equation).toBeGreaterThan(upright.equation);
    expect(onItsSide.equation).toBeLessThanOrEqual(onItsSide.text);

    await phone.turn("PORTRAIT");
    expect((await drawn(phone)).base).toBe("cards");
});
