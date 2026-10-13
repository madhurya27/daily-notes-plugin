/// <reference path="./global.d.ts" />

/**
 * The phone the specs time against: slower than any iPhone iOS 26 runs on,
 * the iPhone 11 half an iPhone 16 Pro's single-core speed on Geekbench 6, and
 * as fast as the quicker mid-range Androids (D-131). A laptop is slowed until
 * the same workload takes it as long.
 */

/** A day's entries, about 5,000 characters: a note the stream draws whole. */
export const WORKLOAD_NOTE = Array.from({ length: 10 }, (_, n) =>
    [
        `## Entry ${n}`,
        "",
        "Woke early, walked to the [[Notes|river]] and back. The light was flat and grey, the kind that makes everything look closer than it is.",
        "",
        "- coffee with **Sam**, talked about the move",
        "    - the boxes, again",
        "- [ ] call the landlord",
        "",
        "```js",
        "const total = items.reduce((sum, item) => sum + item.price, 0);",
        "```",
        "",
        "| Meal | What |",
        "| --- | --- |",
        "| Lunch | soup |",
        "",
        "> Some days are just for getting through. #mood/tired",
    ].join("\n")
).join("\n\n");

/** What the workload takes that phone, in ms: an iPhone 16 Pro's, about 2.3 times. */
export const TARGET_PHONE_WORKLOAD_MS = 20;

/** How much to slow a machine whose workload takes `machineMs` to one taking `targetMs`. */
export function cpuSlowdown(machineMs: number, targetMs: number): number {
    return Math.max(1, targetMs / machineMs);
}

/**
 * Runs in the page, open stream required: the ms the stream's renderer takes
 * to draw `text` as a note and lay it out, the median of three batches of ten.
 * Timed by the batch: Safari rounds the clock to a millisecond. The first draw
 * warms caches and is not counted.
 */
export async function timeWorkload(text: string): Promise<number> {
    const { vault, metadataCache, workspace } = window.app;
    const path = "phone-speed-workload.md";
    const existing = vault.getFileByPath(path);
    await new Promise<void>((indexed) => {
        const ref = metadataCache.on("changed", (changed: { path: string }) => {
            if (changed.path !== path) return;
            metadataCache.offref(ref);
            indexed();
        });
        void (existing ? vault.modify(existing, text) : vault.create(path, text));
    });
    const file = vault.getFileByPath(path);
    const renderer = workspace.getLeavesOfType("daily-notes-stream-view")[0].view.renderer;
    const container = document.querySelector(".daily-notes-stream-container")!;
    const draw = async () => {
        const block = renderer.createBlock(file);
        container.append(block);
        const { component } = await renderer.renderInto(block, file);
        void block.offsetHeight;
        renderer.discard(component);
        block.remove();
    };
    const batches: number[] = [];
    try {
        await draw();
        for (let batch = 0; batch < 3; batch++) {
            const start = performance.now();
            for (let i = 0; i < 10; i++) await draw();
            batches.push((performance.now() - start) / 10);
        }
    } finally {
        await vault.delete(file);
    }
    return batches.sort((a, b) => a - b)[1]!;
}
