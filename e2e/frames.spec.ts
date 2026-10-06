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

// The player fails inside the app, and its page would end a glide (D-088).
test("on mobile a YouTube embed is its thumbnail, a link to the video", async ({ obsidian, mobileLayout }) => {
    const { page } = obsidian;
    await page.evaluate(
        // Returning the TFile would serialize the whole app.
        async (note) => {
            await window.app.vault.create(
                note,
                '## Video\n\n<iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ?start=30" width="560" height="315"></iframe>\n'
            );
        },
        NOTE
    );
    try {
        const block = (await openStream(page)).locator(`.daily-note-block[data-source-path="${NOTE}"]`);
        await expect(block.locator(".daily-note-content")).toBeVisible();

        if (!mobileLayout) {
            await expect(block.locator("iframe")).toHaveAttribute("src", /youtube\.com\/embed/);
            return;
        }
        await expect(block.locator("iframe")).toHaveCount(0);
        const link = block.locator("a.daily-note-video");
        await expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=30");
        // The player's shape, across the note, the play button at its middle.
        const [box, play, content] = await Promise.all([
            link.boundingBox(),
            link.locator(".daily-note-video-play").boundingBox(),
            block.locator(".daily-note-content").boundingBox(),
        ]);
        expect(box!.width).toBeCloseTo(Math.min(560, content!.width), 0);
        expect(box!.height).toBeCloseTo((box!.width * 315) / 560, 0);
        expect(play!.x + play!.width / 2).toBeCloseTo(box!.x + box!.width / 2, 0);
        expect(play!.y + play!.height / 2).toBeCloseTo(box!.y + box!.height / 2, 0);
        // Spaced as a paragraph is, where the player sat in a line of its own.
        const [margins, paragraph] = await link.evaluate((el) => {
            const probe = document.body.appendChild(document.createElement("p"));
            probe.style.marginBlock = "var(--p-spacing)";
            const spacing = getComputedStyle(probe).marginTop;
            probe.remove();
            const style = getComputedStyle(el);
            return [[style.marginTop, style.marginBottom], spacing];
        });
        expect(margins).toEqual([paragraph, paragraph]);
        // No arrow after it, as Obsidian draws after a web link.
        expect(await link.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");
    } finally {
        await page.evaluate(async (note) => {
            const file = window.app.vault.getFileByPath(note);
            if (file) await window.app.vault.delete(file);
        }, NOTE);
    }
});

// A page in a frame would scroll inside it, ending the flick that should
// scroll the stream: on mobile it is a preview, a link to the page.
test("on mobile a web page in a frame is a preview, a tap on it the link's", async ({ obsidian, mobileLayout }) => {
    const { page } = obsidian;
    const site = "https://example.com/map";
    await page.evaluate(
        async ({ note, src }) => {
            await window.app.vault.create(note, `A map:\n\n<iframe src="${src}" width="560" height="400"></iframe>\n`);
        },
        { note: NOTE, src: site }
    );
    try {
        const block = (await openStream(page)).locator(`.daily-note-block[data-source-path="${NOTE}"]`);
        const frame = block.locator("iframe");
        await expect(frame).toHaveAttribute("src", site);

        const link = block.locator("a.daily-note-frame-link");
        if (!mobileLayout) {
            await expect(link).toHaveCount(0);
            return;
        }
        await expect(link).toHaveAttribute("href", site);
        // What a finger lands on at the frame's middle, and the link's box against the frame's.
        const [tapped, linkBox, frameBox] = await Promise.all([
            frame.evaluate((el) => {
                const box = el.getBoundingClientRect();
                const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                if (hit === el) return "frame";
                return hit?.closest("a.daily-note-frame-link") ? "link" : (hit?.tagName.toLowerCase() ?? null);
            }),
            link.boundingBox(),
            frame.boundingBox(),
        ]);
        expect(tapped).toBe("link");
        expect(linkBox).toEqual(frameBox);
    } finally {
        await page.evaluate(async (note) => {
            const file = window.app.vault.getFileByPath(note);
            if (file) await window.app.vault.delete(file);
        }, NOTE);
    }
});
