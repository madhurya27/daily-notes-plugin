/**
 * Frame timing for the README recording. A screencast sends a frame whenever
 * the page repaints, so motion arrives at up to 60 a second and stillness as
 * nothing at all; every frame kept costs a full image in the animated PNG.
 */

/** Float timestamps: 5 × 0.02 must count as a whole 0.1. */
const EPSILON = 1e-9;

/**
 * Chooses which frames to keep and how long each shows, in seconds. A frame
 * survives when it stays on screen for `minInterval`, or when that long has
 * passed since the last one kept, so motion thins out without losing the
 * state it settles on. The last frame holds for `hold` before the loop restarts.
 * @param {{ timestamp: number }[]} frames
 * @param {{ minInterval: number, hold: number }} options
 * @returns {{ index: number, delay: number }[]}
 */
export function pickFrames(frames, { minInterval, hold }) {
    /** @type {number[]} */
    const kept = [];
    frames.forEach(({ timestamp }, index) => {
        const next = frames[index + 1];
        const last = kept.length > 0 ? frames[kept[kept.length - 1]] : undefined;
        if (
            next === undefined ||
            last === undefined ||
            next.timestamp - timestamp >= minInterval - EPSILON ||
            timestamp - last.timestamp >= minInterval - EPSILON
        ) {
            kept.push(index);
        }
    });
    return kept.map((index, position) => {
        const following = kept[position + 1];
        const delay = following === undefined ? hold : frames[following].timestamp - frames[index].timestamp;
        return { index, delay };
    });
}
