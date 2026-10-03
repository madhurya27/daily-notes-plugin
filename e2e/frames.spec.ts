import { test, expect, openStream } from "./obsidian";

/** Newer than every seeded note, so it renders as the stream opens. */
const NOTE = "Notes/2026-03-16.md";
const PAGE = "about:blank#video";

// A frame starting its page mid-glide ends an iOS glide (D-087): on mobile
// the page waits for the scroll to be still, then loads; desktop loads it at once.
test("a frame in a note gets its page, on mobile once the stream is still, shaded until then", async ({
    obsidian,
    mobileLayout,
}) => {
    const { page } = obsidian;
    await page.evaluate(
        async ({ note, src }) => {
            const log: (string | null)[] = [];
            const shades: string[] = [];
            Object.assign(window, { frameSrcs: log, frameShades: shades });
            new MutationObserver((records) => {
                for (const { target, attributeName } of records) {
                    if (!(target instanceof HTMLIFrameElement)) continue;
                    if (attributeName === "src") log.push(target.getAttribute("src"));
                    else if (target.classList.contains("is-frame-held"))
                        shades.push(getComputedStyle(target).backgroundColor);
                }
            }).observe(document.body, { attributes: true, attributeFilter: ["src", "class"], subtree: true });
            await window.app.vault.create(
                note,
                `## Video\n\n<iframe src="${src}" width="560" height="315"></iframe>\n`
            );
        },
        { note: NOTE, src: PAGE }
    );
    try {
        const container = await openStream(page);
        const frame = container.locator(`.daily-note-block[data-source-path="${NOTE}"] iframe`);

        await expect(frame).toHaveAttribute("src", PAGE);
        const srcs = await page.evaluate(() => (window as unknown as { frameSrcs: (string | null)[] }).frameSrcs);
        expect(srcs).toEqual(mobileLayout ? [null, PAGE] : []);
        // Meanwhile a placeholder: Obsidian's secondary background.
        const [shades, secondary] = await page.evaluate(() => {
            const probe = document.body.appendChild(document.createElement("div"));
            probe.style.backgroundColor = "var(--background-secondary)";
            const color = getComputedStyle(probe).backgroundColor;
            probe.remove();
            return [(window as unknown as { frameShades: string[] }).frameShades, color];
        });
        expect(shades).toEqual(mobileLayout ? [secondary] : []);
    } finally {
        await page.evaluate(async (note) => {
            const file = window.app.vault.getFileByPath(note);
            if (file) await window.app.vault.delete(file);
        }, NOTE);
    }
});
