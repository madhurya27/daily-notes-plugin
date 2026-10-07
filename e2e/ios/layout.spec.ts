import { test, expect, type Phone } from "./phone";
import { EMBEDS_NOTE } from "./vault";

const NOTE = `.daily-note-block[data-source-path="${EMBEDS_NOTE}"]`;

/**
 * What in the note of every embed shows past its text's right edge, as far
 * as the boxes clipping it let it, and whether the pane scrolls sideways.
 */
const overflow = (phone: Phone) =>
    phone.run((note: string) => {
        const block = document.querySelector(note)!;
        const content = block.querySelector(".daily-note-content")!;
        const right = content.getBoundingClientRect().right;
        const pane = block.closest(".daily-notes-stream-container")!.parentElement!;
        const over = [...content.querySelectorAll("*")]
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

/** The items of each Base's toolbar in the note that its toolbar clips: Obsidian shrinks the view name and count to fit. */
const toolbarCut = (phone: Phone) =>
    phone.run((note: string) => {
        const cut = [...document.querySelectorAll(`${note} .bases-toolbar`)].flatMap((bar) => {
            const right = bar.getBoundingClientRect().right;
            // An item's margin overhangs its button: the button, as the item clips it.
            return [...bar.children].filter((item) => {
                const button = item.firstElementChild!.getBoundingClientRect().right;
                return Math.min(button, item.getBoundingClientRect().right) > right + 1;
            });
        });
        return cut.map((item) => item.className);
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

/** Where the equation's section starts below the pane's top. */
const mathTop = (phone: Phone) =>
    phone.run((math: string) => {
        const el = document.querySelector(math)!;
        const pane = el.closest(".daily-notes-stream-container")!.parentElement!;
        return Math.round(el.getBoundingClientRect().top - pane.getBoundingClientRect().top);
    }, MATH);

/** How far a turn may move the place: the text above it re-wraps at the new width. */
const REWRAP_PX = 100;

/**
 * The Base's form and the equation's width in the orientation the phone is
 * in, once nothing reaches past the note. Ends placed at the equation.
 */
async function drawn(phone: Phone) {
    await phone.placeAt(FLIPPING, -100);
    const base = await form(phone);
    expect(await overflow(phone)).toEqual([]);
    await phone.placeAt(MATH, -20);
    return { base, ...(await widths(phone)) };
}

test("nothing in the note of every embed scrolls sideways, reaches past its text or is cut off", async ({ phone }) => {
    await phone.openStream();
    // Section by section: Bases draw only what is near the screen.
    for (let section = 1; section <= 6; section++) {
        await phone.placeAt(`${NOTE} .daily-note-content > h2:nth-of-type(${section})`, -20);
        expect(await overflow(phone), `section ${section}`).toEqual([]);
        expect(await toolbarCut(phone), `section ${section}'s Base toolbars`).toEqual([]);
    }
});

test("a turn flips a wide Base between cards and a table, and fits the equation to the note", async ({ phone }) => {
    await phone.openStream();
    const upright = await drawn(phone);
    expect(upright.base).toBe("cards");
    expect(upright.equation).toBeLessThanOrEqual(upright.text);

    const place = await mathTop(phone);
    await phone.turn("LANDSCAPE");
    expect(Math.abs((await mathTop(phone)) - place), "the place, on a turn").toBeLessThanOrEqual(REWRAP_PX);
    const onItsSide = await drawn(phone);
    expect(onItsSide.base).toBe("table");
    expect(onItsSide.equation).toBeGreaterThan(upright.equation);
    expect(onItsSide.equation).toBeLessThanOrEqual(onItsSide.text);

    await phone.turn("PORTRAIT");
    expect(Math.abs((await mathTop(phone)) - place), "the place, on the turn back").toBeLessThanOrEqual(REWRAP_PX);
    expect((await drawn(phone)).base).toBe("cards");
});

/** Sets Obsidian's text size on the phone, or back to the default with null. */
const setTextSize = (phone: Phone, size: number | null) =>
    phone.run((size: number | null) => {
        window.app.saveLocalStorage("base-font-size", size);
        window.app.updateFontSize();
    }, size);

/** How far the checkbox of the first task in the pane sits below its words' center. */
const checkboxOffset = (phone: Phone) =>
    phone.run(() => {
        const pane = document.querySelector(".daily-notes-stream-container")!.parentElement!.getBoundingClientRect();
        const li = [...document.querySelectorAll(".daily-note-content li.task-list-item")].find(
            (el) => el.getBoundingClientRect().top >= pane.top
        )!;
        const box = li.querySelector(":scope > input.task-list-item-checkbox")!;
        const words = [...li.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim())!;
        const range = document.createRange();
        range.selectNodeContents(words);
        const text = range.getBoundingClientRect();
        const check = box.getBoundingClientRect();
        return check.top + check.height / 2 - (text.top + text.height / 2);
    });

// iOS draws its own system font: Obsidian's fixed nudge left the box 5px high
// at 28px here, three times what Chromium's phone layout shows (D-104).
test("centers a task's checkbox on its words at the default and a large text size", async ({ phone }) => {
    await phone.openStream();
    try {
        for (const size of [16, 28]) {
            await setTextSize(phone, size);
            await phone.placeAt(".daily-note-content li.task-list-item", -100);
            expect(Math.abs(await checkboxOffset(phone)), `${size}px`).toBeLessThan(1);
        }
    } finally {
        await setTextSize(phone, null);
    }
});
