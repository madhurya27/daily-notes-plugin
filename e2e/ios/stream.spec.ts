import { test, expect } from "./phone";

test("flicks reach the oldest note, each note once, newest first", async ({ phone }) => {
    await phone.openStream();
    const total = await phone.run(
        () => window.app.workspace.getLeavesOfType("daily-notes-stream-view")[0].view.service.length
    );

    for (let flicks = 0; flicks < 100 && !(await phone.atEnd()); flicks++) await phone.flick("up", 3);

    const paths = await phone.run(() =>
        [...document.querySelectorAll<HTMLElement>(".daily-note-block")].map((block) => block.dataset.sourcePath!)
    );
    expect(paths).toHaveLength(total);
    expect(new Set(paths).size).toBe(total);
    expect(paths).toEqual([...paths].sort().reverse());
});

// Each flick starts on the newest notes, which hold what once stopped a
// glide dead within 0.4 s (STALLERS in vault.ts).
test("flicks from the top glide on", async ({ phone }) => {
    for (const flick of [1, 2, 3]) {
        await phone.openStream();
        expect(await phone.glidesPast("up", 500), `flick ${flick}`).toBe(true);
    }
});

for (const [what, target, depth] of [
    ["text", ".daily-note-content > p", -20],
    // A Base redraws on each turn, as cards or a table.
    ["a Base", ".daily-note-base", 300],
] as const)
    test(`a turn and back leaves what was in view, with ${what} at the top`, async ({ phone }) => {
        await phone.openStream();
        await phone.placeAt(target, depth);
        const seen = await phone.seen();

        await phone.turn("LANDSCAPE");
        await phone.turn("PORTRAIT");

        // As e2e/turn.spec.ts allows: a pixel's rounding is not a jump.
        const now = await phone.topOf(seen);
        expect(Math.abs(now - seen.top), `"${seen.text}" moved from ${seen.top} to ${now}`).toBeLessThan(5);
    });

// Deep in the stream, as a reader looking for an old note:
// the finger lands on a Base, which once ended a glide where it started. Its
// cards run some 1,250 px, so from 300 px in, it fills the screen under both strokes.
for (const direction of ["up", "down"] as const)
    test(`a flick ${direction} over a Base deep in the stream glides on`, async ({ phone }) => {
        // Three: what stops a glide stops some flicks, not all (D-085). Each
        // from the top: placeAt looks down the stream, and a glide may pass the Base.
        for (const flick of [1, 2, 3]) {
            await phone.openStream();
            await phone.placeAt('.daily-note-block[data-source-path="Journal/2026-09-13.md"] .daily-note-base', 300);
            expect(await phone.glidesPast(direction, 500), `flick ${flick}`).toBe(true);
        }
    });

/** A web page taller than its frame, so it could scroll inside it, in a note deep in the stream. */
const PAGE = "Pages/Tall page.html";
const FRAMED = "Journal/2026-09-05.md";

for (const direction of ["up", "down"] as const)
    test(`a flick ${direction} over a web page in a frame glides on`, async ({ phone }) => {
        await phone.runAsync(
            async (page: string, note: string) => {
                const { vault } = window.app;
                if (!vault.getFolderByPath("Pages")) await vault.createFolder("Pages");
                const lines = Array.from(
                    { length: 200 },
                    (_, i) => `<p>Line ${i + 1} of a page taller than its frame.</p>`
                );
                await vault.create(page, `<!doctype html><body style="font-size: 20px">${lines.join("")}</body>`);
                const src = vault.adapter.getResourcePath(page);
                await vault.create(note, `A page:\n\n<iframe src="${src}" width="560" height="1500"></iframe>\n`);
            },
            PAGE,
            FRAMED
        );
        try {
            for (const flick of [1, 2, 3]) {
                await phone.openStream();
                await phone.placeAt(`.daily-note-block[data-source-path="${FRAMED}"] iframe`, 300);
                // The frame loads its page once the stream is still (D-087).
                await expect
                    .poll(() =>
                        phone.run((note: string) => {
                            const frame = document.querySelector<HTMLIFrameElement>(
                                `.daily-note-block[data-source-path="${note}"] iframe`
                            );
                            const page = frame?.contentDocument?.scrollingElement;
                            return !!page && page.scrollHeight > page.clientHeight;
                        }, FRAMED)
                    )
                    .toBe(true);
                expect(await phone.glidesPast(direction, 500), `flick ${flick}`).toBe(true);
            }
        } finally {
            await phone.runAsync(
                async (...paths: string[]) => {
                    for (const path of paths) {
                        const file = window.app.vault.getAbstractFileByPath(path);
                        if (file) await window.app.vault.delete(file, true);
                    }
                },
                FRAMED,
                PAGE,
                "Pages"
            );
        }
    });
