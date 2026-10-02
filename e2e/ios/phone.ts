import { test as base, expect } from "@playwright/test";
import { connect, OBSIDIAN } from "./session";
import { returnToTestersVault, useVault } from "./vault";

/**
 * Obsidian on a USB-connected iPhone (ADR 0016). Touches are real ones, sent
 * through WebDriverAgent, so a flick glides as a thumb's does; what the stream
 * did is read from Obsidian's web view.
 */

const STREAM = ".daily-notes-stream-container:not(.daily-notes-stream-probe)";

type Orientation = "PORTRAIT" | "LANDSCAPE";
type Seen = { path: string; index: number; text: string; top: number };
/** Where the stream is, as it keeps its place: a note, and its top's offset from the pane's. */
export type Place = { path: string; offset: number };

/** How far `placeAt` looks: past the first two batches of the harness's notes, some 20 screens each. */
const SCREENS = 60;

/** A note's blocks as the reader takes them in: its title, property rows, Markdown blocks and mentions. */
const TEXT_BLOCKS = ".daily-note-title, .metadata-property, .daily-note-content > *, .daily-note-mention";

export class Phone {
    constructor(private readonly driver: WebdriverIO.Browser) {}

    /** Runs `fn` in Obsidian's web view; like Playwright's `evaluate`, it closes over nothing. */
    async run<R, A extends unknown[]>(fn: (...args: A) => R, ...args: A): Promise<R> {
        await this.inWebView();
        return (await this.driver.execute(`return (${fn.toString()})(...arguments)`, ...args)) as R;
    }

    /** `run` for a function that settles later. */
    async runAsync<R, A extends unknown[]>(fn: (...args: A) => Promise<R>, ...args: A): Promise<R> {
        await this.inWebView();
        // A rejection has to answer too, or the driver waits out its script
        // timeout. Not as `error`: WebdriverIO takes that key for its own.
        const script = `const done = arguments[arguments.length - 1];
            (${fn.toString()})(...arguments[0]).then((value) => done({ value }), (e) => done({ failure: String(e) }));`;
        const { value, failure } = (await this.driver.executeAsync(script, args)) as { value: R; failure?: string };
        if (failure !== undefined) throw new Error(`On the phone: ${failure}\nin: ${fn.toString().slice(0, 200)}`);
        return value;
    }

    /** Opens `url` as a tapped link would, in whatever app claims it. */
    async openUrl(url: string): Promise<void> {
        await this.native();
        await this.driver.execute("mobile: deepLink", { url, bundleId: OBSIDIAN });
    }

    /** To the Home Screen for `seconds`, then back into Obsidian, as a reader switching apps. */
    async background(seconds: number): Promise<void> {
        await this.native();
        await this.driver.execute("mobile: backgroundApp", { seconds });
    }

    /** Quits Obsidian and opens it again, as from its icon; returns once the plugin is loaded. */
    async relaunch(): Promise<void> {
        await this.native();
        await this.driver.execute("mobile: terminateApp", { bundleId: OBSIDIAN });
        await this.driver.execute("mobile: activateApp", { bundleId: OBSIDIAN });
        await expect
            .poll(() => this.run(() => !!window.app?.plugins?.plugins?.["daily-notes-stream"]).catch(() => false), {
                timeout: 30_000,
            })
            .toBe(true);
    }

    /** Closes the stream and forgets every note's measured height: an open stream lays out by estimates. */
    async forgetHeights(): Promise<void> {
        await this.run(() => {
            window.app.workspace.detachLeavesOfType("daily-notes-stream-view");
            window.app.plugins.plugins["daily-notes-stream"].layoutMemory.notes.restore(null);
        });
    }

    /**
     * Shortens every unrendered note's placeholder, then waits for rest.
     * Measured on an earlier run, a placeholder is exact and a render moves
     * nothing; short, every note grows as it renders: the case that jumped.
     */
    async shortenPlaceholders(): Promise<void> {
        await this.run(() => {
            for (const block of document.querySelectorAll<HTMLElement>(".daily-note-block.is-unloaded"))
                block.style.setProperty("--daily-note-placeholder-height", "100px");
        });
        await this.rest();
    }

    /** The stream, at its top and at rest. */
    async openStream(): Promise<void> {
        await this.run(() => {
            // A pull past the top, as a flick up the stream can end, opens Obsidian's command palette.
            for (const modal of document.querySelectorAll<HTMLElement>(".modal-container .modal-bg")) modal.click();
            window.app.commands.executeCommandById("daily-notes-stream:open-stream");
        });
        await expect
            .poll(() => this.run((s: string) => document.querySelectorAll(`${s} .daily-note-block`).length, STREAM))
            .toBeGreaterThan(0);
        await this.run((s: string) => document.querySelector(s)!.parentElement!.scrollTo({ top: 0 }), STREAM);
        await this.rest();
    }

    /** As the jump modal would, to the newest note on or before `date` (`YYYY-MM-DD`), at rest. */
    async jumpTo(date: string): Promise<void> {
        await this.runAsync(
            (d: string) =>
                window.app.workspace
                    .getLeavesOfType("daily-notes-stream-view")[0]
                    .view.stream.jumpToDate(window.moment(d, "YYYY-MM-DD")),
            date
        );
        await this.rest();
    }

    /**
     * Starts following the text at the pane's middle, each frame, as the
     * reader's eye would; `stopFollowing` reports it. By its place in its
     * note, as `topOf` finds it: a note may render again under the reader.
     */
    async followReader(): Promise<void> {
        await this.run(
            (s: string, blocks: string) => {
                const pane = document.querySelector(s)!.parentElement!;
                const box = pane.getBoundingClientRect();
                const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)!;
                const note = at.closest<HTMLElement>(".daily-note-block")!;
                const index = [...note.querySelectorAll(blocks)].indexOf(at.closest(blocks)!);
                if (index === -1) throw new Error("No text at the pane's middle.");
                const path = CSS.escape(note.dataset.sourcePath!);
                const reader = () =>
                    pane.querySelector(`.daily-note-block[data-source-path="${path}"]`)!.querySelectorAll(blocks)[
                        index
                    ]!;
                const unloaded = () => pane.querySelectorAll(".daily-note-block.is-unloaded").length;
                const start = reader().getBoundingClientRect().top;
                const from = pane.scrollTop;
                const follow = { drifts: [] as number[], unloaded: unloaded(), rendered: 0, on: true };
                (window as unknown as { streamReader: typeof follow }).streamReader = follow;
                const frame = () => {
                    if (!follow.on) return;
                    // Where the text is, against where the scroll alone puts it.
                    const top = reader().getBoundingClientRect().top;
                    follow.drifts.push(Math.round(top - start - (from - pane.scrollTop)));
                    follow.rendered = Math.max(follow.rendered, follow.unloaded - unloaded());
                    requestAnimationFrame(frame);
                };
                requestAnimationFrame(frame);
            },
            STREAM,
            TEXT_BLOCKS
        );
    }

    /** How far, each frame since `followReader`, the text moved other than with the scroll, and how many notes rendered. */
    stopFollowing(): Promise<{ drifts: number[]; rendered: number }> {
        return this.run(() => {
            const follow = (window as unknown as { streamReader: { drifts: number[]; rendered: number; on: boolean } })
                .streamReader;
            follow.on = false;
            return { drifts: follow.drifts, rendered: follow.rendered };
        });
    }

    /** The stream's place: the first note reaching into the pane. */
    place(): Promise<Place> {
        return this.run((s: string) => {
            const pane = document.querySelector(s)!.parentElement!;
            const paneTop = pane.getBoundingClientRect().top;
            const first = [...pane.querySelectorAll<HTMLElement>(".daily-note-block")].find(
                (block) => block.getBoundingClientRect().bottom > paneTop
            )!;
            return { path: first.dataset.sourcePath!, offset: Math.round(first.getBoundingClientRect().top - paneTop) };
        }, STREAM);
    }

    /**
     * Starts noting each place the stream shows, frame by frame, as `place`
     * reads it, even before a stream is open; `places` reports them. From
     * `now`, or from Obsidian's return from the background: a still stream
     * would be done before it left.
     */
    async followPlaces(from: "now" | "return" = "now"): Promise<void> {
        await this.run(
            (s: string, start: "now" | "return") => {
                const place = () => {
                    const pane = document.querySelector(s)?.parentElement;
                    if (!pane) return undefined;
                    const paneTop = pane.getBoundingClientRect().top;
                    const first = [...pane.querySelectorAll<HTMLElement>(".daily-note-block")].find(
                        (block) => block.getBoundingClientRect().bottom > paneTop
                    );
                    return (
                        first &&
                        `${first.dataset.sourcePath}\n${Math.round(first.getBoundingClientRect().top - paneTop)}`
                    );
                };
                const seen: string[] = [];
                const returned = new Promise<void>((resolve) => {
                    const back = () =>
                        document.hidden || resolve(document.removeEventListener("visibilitychange", back));
                    document.addEventListener("visibilitychange", back);
                });
                (window as unknown as { streamPlaces: Promise<Place[]> }).streamPlaces = (async () => {
                    if (start === "return") await returned;
                    const deadline = performance.now() + 15_000;
                    for (let quiet = 0; quiet < 30 && performance.now() < deadline;) {
                        await new Promise(requestAnimationFrame);
                        const now = place();
                        if (now === undefined) continue;
                        quiet = now === seen.at(-1) ? quiet + 1 : 0;
                        seen.push(now);
                    }
                    return [...new Set(seen)].map((key) => {
                        const [path, offset] = key.split("\n");
                        return { path: path!, offset: Number(offset) };
                    });
                })();
            },
            STREAM,
            from
        );
    }

    /** Each place the stream showed since `followPlaces`, once it held still 30 frames. */
    places(): Promise<Place[]> {
        return this.runAsync(() => (window as unknown as { streamPlaces: Promise<Place[]> }).streamPlaces);
    }

    /**
     * Quick thumb strokes, `up` to move down the stream, each caught mid-glide
     * by the next as a reader's are; returns once the last glide stops.
     */
    async flick(direction: "up" | "down", strokes = 1): Promise<void> {
        const before = await this.scrollTop();
        for (let i = 0; i < strokes; i++) await this.stroke(direction, 0.7, 60);
        await this.rest();
        const after = await this.scrollTop();
        const blocked = direction === "up" ? after <= before && !(await this.atEnd()) : after >= before && before > 0;
        if (blocked)
            throw new Error(
                `A flick ended no further than ${before}, at ${after}: the stream moved itself back, ` +
                    "or something is in front of Obsidian, such as its Face ID lock."
            );
    }

    /**
     * One stroke, and whether the stream still moved `ms` after the finger
     * lifted. A thumb then catches the glide: the web view runs no script
     * until a glide ends, and a full one runs 1–3.5 s.
     */
    async glidesPast(direction: "up" | "down", ms: number): Promise<boolean> {
        await this.run((s: string) => {
            const pane = document.querySelector(s)!.parentElement!;
            const glide = { touches: [] as number[], lifts: [] as number[], scrolls: [] as number[] };
            const done = new AbortController();
            (window as unknown as { streamGlide: typeof glide & { done: AbortController } }).streamGlide = {
                ...glide,
                done,
            };
            const now = (log: number[]) => () => log.push(performance.now());
            const { signal } = done;
            document.addEventListener("touchstart", now(glide.touches), { capture: true, signal });
            document.addEventListener("touchend", now(glide.lifts), { capture: true, signal });
            pane.addEventListener("scroll", now(glide.scrolls), { passive: true, signal });
        }, STREAM);
        await this.stroke(direction, 0.7, 60);
        await new Promise((resolve) => setTimeout(resolve, ms + 100));
        // Slow and short: it stops the glide without a flick or a tap of its own.
        await this.stroke(direction, 0.02, 100);
        const [moved, failure] = await this.run((wait: number) => {
            const { touches, lifts, scrolls, done } = (
                window as unknown as {
                    streamGlide: { touches: number[]; lifts: number[]; scrolls: number[]; done: AbortController };
                }
            ).streamGlide;
            done.abort();
            const [lift] = lifts;
            if (lift === undefined) return [false, "the stroke never lifted"];
            // A touch that stops a glide stays with iOS: the page sees it only if the stream had stopped.
            const caught = touches[1] ?? Infinity;
            if (caught < lift + wait) return [false, `the glide was caught ${Math.round(caught - lift)} ms in`];
            return [scrolls.some((t) => t > lift + wait && t < caught), ""];
        }, ms);
        if (failure) throw new Error(`Cannot tell how far a flick glided: ${failure}.`);
        return moved;
    }

    /** A thumb stroke `share` of the screen tall over `duration` ms, centred; returns as the finger lifts. */
    private async stroke(direction: "up" | "down", share: number, duration: number): Promise<void> {
        await this.native();
        const { width, height } = await this.driver.getWindowSize();
        const [from, to] = direction === "up" ? [0.5 + share / 2, 0.5 - share / 2] : [0.5 - share / 2, 0.5 + share / 2];
        const x = Math.round(width / 2);
        // One command per stroke: within one, WebDriverAgent drags the finger
        // back to the start between strokes, scrolling the stream back.
        await this.driver.performActions([
            {
                type: "pointer",
                id: "thumb",
                parameters: { pointerType: "touch" },
                actions: [
                    { type: "pointerMove", duration: 0, x, y: Math.round(height * from) },
                    { type: "pointerDown", button: 0 },
                    { type: "pointerMove", duration, x, y: Math.round(height * to) },
                    { type: "pointerUp", button: 0 },
                ],
            },
        ]);
    }

    /** Fails if iOS holds Obsidian behind Face ID or Touch ID: no touch reaches the app until someone unlocks it. */
    async assertUnlocked(): Promise<void> {
        await this.native();
        const lock = await this.driver.$(
            // In English only; flick() catches a lock in any language by the stream not moving.
            `-ios predicate string:label CONTAINS " ID Required" OR label BEGINSWITH "Passcode Required"`
        );
        if (await lock.isExisting())
            throw new Error("Obsidian is locked behind Face ID or Touch ID: long-press its icon → Don't Require.");
    }

    /**
     * A finger's tap, as iOS delivers one: touches, then a click. On the
     * middle of the first `selector` a finger could reach there, on screen
     * and under nothing else.
     */
    async tap(selector: string): Promise<void> {
        const at = await this.run((sel: string) => {
            for (const el of document.querySelectorAll(sel)) {
                const { left, top, width, height } = el.getBoundingClientRect();
                const [x, y] = [left + width / 2, top + height / 2];
                const hit = document.elementFromPoint(x, y);
                if (hit && el.contains(hit)) return { x, y, viewport: window.innerWidth };
            }
            throw new Error(`Nothing to tap: no ${sel} on screen.`);
        }, selector);
        await this.native();
        // The web view fills the screen, so a CSS pixel is a point, scaled only if the page is zoomed.
        const scale = (await this.driver.getWindowSize()).width / at.viewport;
        await this.driver.performActions([
            {
                type: "pointer",
                id: "finger",
                parameters: { pointerType: "touch" },
                actions: [
                    { type: "pointerMove", duration: 0, x: Math.round(at.x * scale), y: Math.round(at.y * scale) },
                    { type: "pointerDown", button: 0 },
                    { type: "pause", duration: 50 },
                    { type: "pointerUp", button: 0 },
                ],
            },
        ]);
    }

    /** Escape, as a hardware keyboard sends it, at `selector`: what closes a modal or the search bar. */
    async escape(selector: string): Promise<void> {
        await this.run(
            (sel: string) =>
                document
                    .querySelector(sel)!
                    .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })),
            selector
        );
    }

    /** Whether anything matches `selector`. */
    has(selector: string): Promise<boolean> {
        return this.run((sel: string) => !!document.querySelector(sel), selector);
    }

    scrollTop(): Promise<number> {
        return this.run((s: string) => document.querySelector(s)!.parentElement!.scrollTop, STREAM);
    }

    /** How far the newest note's top sits below the pane's. */
    newestOffset(): Promise<number> {
        return this.run((s: string) => {
            const stream = document.querySelector(s)!;
            const newest = stream.querySelector(".daily-note-block")!.getBoundingClientRect().top;
            return Math.round(newest - stream.parentElement!.getBoundingClientRect().top);
        }, STREAM);
    }

    /** Returns once the pane has its new width and holds still: a turn starts some frames after it is asked for. */
    async turn(orientation: Orientation): Promise<void> {
        const width = () => this.run((s: string) => document.querySelector(s)!.parentElement!.clientWidth, STREAM);
        const before = await width();
        await this.native();
        await this.driver.setOrientation(orientation);
        await expect.poll(width).not.toBe(before);
        await this.rest();
    }

    /**
     * Scrolls the pane's top `depth` px into the first `target` at least a
     * screen down the stream, or with a negative `depth` that far above it,
     * and waits for it to hold still. Only notes near the screen are rendered
     * (ADR 0006), so it goes a screen at a time until one is.
     */
    async placeAt(target: string, depth: number): Promise<void> {
        for (let screens = 0; screens < SCREENS; screens++) {
            const placed = await this.run(
                (s: string, t: string, d: number) => {
                    const stream = document.querySelector(s)!;
                    const pane = stream.parentElement!;
                    const top = (el: Element) => el.getBoundingClientRect().top - pane.getBoundingClientRect().top;
                    const el = [...stream.querySelectorAll(t)].find((e) => top(e) + pane.scrollTop > pane.clientHeight);
                    pane.scrollTop += el ? top(el) + d : pane.clientHeight;
                    return !!el;
                },
                STREAM,
                target,
                depth
            );
            await this.rest();
            if (placed) return;
        }
        throw new Error(`No ${target} in the stream's first ${SCREENS} screens.`);
    }

    /** Whether a `selector` spans the pane's top edge. */
    atTop(selector: string): Promise<boolean> {
        return this.run(
            (s: string, sel: string) => {
                const stream = document.querySelector(s)!;
                const top = stream.parentElement!.getBoundingClientRect().top;
                return [...stream.querySelectorAll(sel)].some((el) => {
                    const box = el.getBoundingClientRect();
                    return box.top <= top && box.bottom > top;
                });
            },
            STREAM,
            selector
        );
    }

    /** Scrolled to the bottom with nothing left to load. */
    atEnd(): Promise<boolean> {
        return this.run((s: string) => {
            const pane = document.querySelector(s)!.parentElement!;
            return pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1;
        }, STREAM);
    }

    /**
     * What the reader sees at the pane's top: the first of the top note's
     * blocks still in view, by its text, and how far its top is from the
     * pane's. A turn reflows the note, so the note's own offset says nothing
     * about which text is in view; follow it with `topOf`.
     */
    seen(): Promise<Seen> {
        return this.run(
            (s: string, blocks: string) => {
                const stream = document.querySelector(s)!;
                const pane = stream.parentElement!.getBoundingClientRect();
                for (const note of stream.querySelectorAll<HTMLElement>(".daily-note-block")) {
                    if (note.getBoundingClientRect().bottom <= pane.top) continue;
                    const all = [...note.querySelectorAll<HTMLElement>(blocks)];
                    const index = all.findIndex((b) => b.getBoundingClientRect().bottom > pane.top);
                    if (index === -1) continue;
                    const el = all[index]!;
                    const top = Math.round(el.getBoundingClientRect().top - pane.top);
                    return { path: note.dataset.sourcePath!, index, text: el.innerText.trim().slice(0, 60), top };
                }
                throw new Error("No text in view.");
            },
            STREAM,
            TEXT_BLOCKS
        );
    }

    /** Where `seen`'s block is now, from the pane's top: found by its place in the note, since a Base redraws its text on a turn. */
    topOf(seen: Seen): Promise<number> {
        return this.run(
            (s: string, blocks: string, { path, index, text }: Seen) => {
                const stream = document.querySelector(s)!;
                const note = stream.querySelector(`.daily-note-block[data-source-path="${CSS.escape(path)}"]`)!;
                const el = note.querySelectorAll<HTMLElement>(blocks)[index];
                if (!el) throw new Error(`"${text}" is gone from ${path}.`);
                return Math.round(el.getBoundingClientRect().top - stream.parentElement!.getBoundingClientRect().top);
            },
            STREAM,
            TEXT_BLOCKS,
            seen
        );
    }

    /** Until the pane has held still for half a second: a glide, a turn and the loads they set off are over. */
    rest(): Promise<void> {
        return this.runAsync(async (s: string) => {
            const pane = document.querySelector(s)!.parentElement!;
            let last = "";
            let stillSince = performance.now();
            for (const deadline = performance.now() + 10_000; performance.now() < deadline;) {
                await new Promise(requestAnimationFrame);
                const now = `${pane.scrollTop} ${pane.scrollHeight} ${pane.clientWidth}`;
                if (now !== last) [last, stillSince] = [now, performance.now()];
                else if (performance.now() - stillSince > 500) return;
            }
        }, STREAM);
    }

    private async inWebView(): Promise<void> {
        const contexts = (await this.driver.getContexts()) as string[];
        const webView = contexts.find((c) => c.startsWith("WEBVIEW"));
        if (!webView) throw new Error(`Obsidian's web view is not inspectable: ${contexts.join(", ")}`);
        if ((await this.driver.getContext()) !== webView) await this.driver.switchContext(webView);
    }

    private async native(): Promise<void> {
        if ((await this.driver.getContext()) !== "NATIVE_APP") await this.driver.switchContext("NATIVE_APP");
    }
}

export const test = base.extend<object, { phone: Phone }>({
    phone: [
        async ({}, use) => {
            const driver = await connect();
            // WebDriverAgent otherwise waits after each gesture for animations
            // to end, 15 s in Obsidian; rest() waits for the stream instead.
            await driver.updateSettings({ animationCoolOffTimeout: 0, waitForIdleTimeout: 0 });
            const phone = new Phone(driver);
            try {
                await phone.assertUnlocked();
                await useVault(phone);
                await use(phone);
            } finally {
                await driver.setOrientation("PORTRAIT");
                // The phone as the tester left it: their vault, Obsidian closed, the Home Screen.
                await returnToTestersVault(phone);
                await driver.execute("mobile: terminateApp", { bundleId: OBSIDIAN });
                await driver.execute("mobile: pressButton", { name: "home" });
                await driver.deleteSession();
            }
        },
        { scope: "worker" },
    ],
});

export { expect };
