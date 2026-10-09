/**
 * The README recordings: which frames to keep, and the animated WebP they
 * make. Motion arrives at up to 60 frames a second and stillness as few or
 * none; every frame kept costs space in the file.
 */
import { execFileSync } from "child_process";

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

/**
 * `img2webp`'s arguments for `frames`, each shown for its delay in seconds:
 * looped forever, lossless unless given a `quality` for lossy. Delays round
 * by their running total, so the whole lasts as long as the frames.
 * @param {{ path: string, delay: number }[]} frames
 * @param {string} output
 * @param {{ quality?: number }} [options]
 * @returns {string[]}
 */
export function webpArgs(frames, output, { quality } = {}) {
    const mode = quality === undefined ? ["-lossless"] : ["-lossy", "-q", String(quality)];
    let elapsed = 0;
    const timed = frames.flatMap(({ path, delay }) => {
        const from = Math.round(elapsed * 1000);
        elapsed += delay;
        return ["-d", String(Math.round(elapsed * 1000) - from), path];
    });
    return ["-loop", "0", ...mode, ...timed, "-o", output];
}

/**
 * Writes `frames`, image files timed in seconds, to `output` as an animated
 * WebP, thinned to ten a second at most. Needs `img2webp` (`brew install webp`).
 * @param {{ timestamp: number, path: string }[]} frames
 * @param {string} output
 * @param {{ quality?: number }} [options]
 */
export function writeWebp(frames, output, options) {
    const kept = pickFrames(frames, { minInterval: 0.1, hold: 2 }).map(({ index, delay }) => ({
        path: frames[index].path,
        delay,
    }));
    execFileSync("img2webp", webpArgs(kept, output, options), { stdio: ["ignore", "ignore", "inherit"] });
}
