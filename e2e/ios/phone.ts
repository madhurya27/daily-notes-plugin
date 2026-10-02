import { test as base, expect } from "@playwright/test";
import { connect, OBSIDIAN } from "./session";
import { useVault } from "./vault";

/**
 * Obsidian on a USB-connected iPhone (ADR 0016). Touches are real ones, sent
 * through WebDriverAgent, so a flick glides as a thumb's does; what the stream
 * did is read from Obsidian's web view.
 */

const STREAM = ".daily-notes-stream-container:not(.daily-notes-stream-probe)";

type Orientation = "PORTRAIT" | "LANDSCAPE";
type Seen = { path: string; index: number; text: string; top: number };

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

    /** The stream, at its top and at rest. */
    async openStream(): Promise<void> {
        await this.run(() => window.app.commands.executeCommandById("daily-notes-stream:open-stream"));
        await expect
            .poll(() => this.run((s: string) => document.querySelectorAll(`${s} .daily-note-block`).length, STREAM))
            .toBeGreaterThan(0);
        await this.run((s: string) => document.querySelector(s)!.parentElement!.scrollTo({ top: 0 }), STREAM);
        await this.rest();
    }

    /**
     * Quick thumb strokes, `up` to move down the stream, each caught mid-glide
     * by the next as a reader's are; returns once the last glide stops.
     */
    async flick(direction: "up" | "down", strokes = 1): Promise<void> {
        const before = await this.scrollTop();
        await this.native();
        const { width, height } = await this.driver.getWindowSize();
        const [from, to] = direction === "up" ? [0.85, 0.15] : [0.15, 0.85];
        const x = Math.round(width / 2);
        const stroke = [
            { type: "pointerMove", duration: 0, x, y: Math.round(height * from) },
            { type: "pointerDown", button: 0 },
            { type: "pointerMove", duration: 60, x, y: Math.round(height * to) },
            { type: "pointerUp", button: 0 },
        ];
        // One command per stroke: within one, WebDriverAgent drags the finger
        // back to the start between strokes, scrolling the stream back.
        for (let i = 0; i < strokes; i++)
            await this.driver.performActions([
                { type: "pointer", id: "thumb", parameters: { pointerType: "touch" }, actions: stroke },
            ]);
        await this.rest();
        const after = await this.scrollTop();
        const blocked = direction === "up" ? after <= before && !(await this.atEnd()) : after >= before && before > 0;
        if (blocked)
            throw new Error(
                "A flick did not move the stream: something is in front of Obsidian, such as its Face ID lock."
            );
    }

    /** Fails if iOS holds Obsidian behind Face ID: no touch reaches the app until someone looks at the phone. */
    async assertUnlocked(): Promise<void> {
        await this.native();
        const lock = await this.driver.$(
            `-ios predicate string:label BEGINSWITH "Face ID Required" OR label BEGINSWITH "Passcode Required"`
        );
        if (await lock.isExisting())
            throw new Error("Obsidian is behind Face ID: long-press its icon → Don't Require Face ID.");
    }

    private scrollTop(): Promise<number> {
        return this.run((s: string) => document.querySelector(s)!.parentElement!.scrollTop, STREAM);
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
        for (let screens = 0; screens < 20; screens++) {
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
        throw new Error(`No ${target} in the stream's first 20 screens.`);
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
    private rest(): Promise<void> {
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
            try {
                const phone = new Phone(driver);
                await phone.assertUnlocked();
                await useVault(phone);
                await use(phone);
            } finally {
                await driver.setOrientation("PORTRAIT");
                await driver.deleteSession();
            }
        },
        { scope: "worker" },
    ],
});

export { expect };
