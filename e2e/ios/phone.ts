import { test as base, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { connect, OBSIDIAN } from "./session";

/**
 * Obsidian on a USB-connected iPhone (ADR 0016). Touches are real ones, sent
 * through WebDriverAgent, so a flick glides as a thumb's does; what the stream
 * did is read from Obsidian's web view.
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VAULT = process.env.IOS_VAULT ?? "Demo";
const PLUGIN_ID = "daily-notes-stream";
const STREAM = ".daily-notes-stream-container:not(.daily-notes-stream-probe)";

type Orientation = "PORTRAIT" | "LANDSCAPE";

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
        const script = `const done = arguments[arguments.length - 1]; (${fn.toString()})(...arguments[0]).then(done);`;
        return (await this.driver.executeAsync(script, args)) as R;
    }

    /** Copies the repo's build into the vault and reloads the plugin. */
    async install(): Promise<void> {
        const files = Object.fromEntries(
            ["main.js", "manifest.json", "styles.css"].map((name) => [name, readFileSync(join(REPO, name), "utf8")])
        );
        await this.runAsync(
            async (id: string, built: Record<string, string>) => {
                const dir = `${window.app.vault.configDir}/plugins/${id}`;
                for (const [name, text] of Object.entries(built))
                    await window.app.vault.adapter.write(`${dir}/${name}`, text);
                await window.app.plugins.disablePlugin(id);
                await window.app.plugins.enablePlugin(id);
            },
            PLUGIN_ID,
            files
        );
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

    /** One quick thumb stroke, `up` to move down the stream; returns once the glide stops. */
    async flick(direction: "up" | "down"): Promise<void> {
        const before = await this.scrollTop();
        await this.native();
        const { width, height } = await this.driver.getWindowSize();
        const [from, to] = direction === "up" ? [0.75, 0.3] : [0.3, 0.75];
        await this.driver.performActions([
            {
                type: "pointer",
                id: "thumb",
                parameters: { pointerType: "touch" },
                actions: [
                    { type: "pointerMove", duration: 0, x: Math.round(width / 2), y: Math.round(height * from) },
                    { type: "pointerDown", button: 0 },
                    { type: "pointerMove", duration: 120, x: Math.round(width / 2), y: Math.round(height * to) },
                    { type: "pointerUp", button: 0 },
                ],
            },
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

    async turn(orientation: Orientation): Promise<void> {
        await this.native();
        await this.driver.setOrientation(orientation);
        await this.rest();
    }

    /** Scrolled to the bottom with nothing left to load. */
    atEnd(): Promise<boolean> {
        return this.run((s: string) => {
            const pane = document.querySelector(s)!.parentElement!;
            return pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1;
        }, STREAM);
    }

    /** The note at the pane's top, and how far its top is from the pane's. */
    place(): Promise<{ path: string; top: number }> {
        return this.run((s: string) => {
            const stream = document.querySelector(s)!;
            const pane = stream.parentElement!.getBoundingClientRect();
            const block = [...stream.querySelectorAll<HTMLElement>(".daily-note-block")].find(
                (b) => b.getBoundingClientRect().bottom > pane.top
            )!;
            return { path: block.dataset.sourcePath!, top: Math.round(block.getBoundingClientRect().top - pane.top) };
        }, STREAM);
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
                if ((await phone.run(() => window.app.vault.getName() as string)) !== VAULT) {
                    await driver.execute("mobile: deepLink", {
                        url: `obsidian://open?vault=${encodeURIComponent(VAULT)}`,
                        bundleId: OBSIDIAN,
                    });
                    await expect
                        .poll(() => phone.run(() => window.app?.vault?.getName() as string | undefined), {
                            timeout: 30_000,
                        })
                        .toBe(VAULT);
                }
                await phone.install();
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
