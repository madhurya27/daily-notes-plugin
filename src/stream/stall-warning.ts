/**
 * How long one change of the stream may run before the console hears of it.
 * Every change waits its turn in one queue (ADR 0004): one that never ends
 * leaves every note undrawn, and nothing else says why (D-164).
 */
export const STALL_MS = 5_000;

/** Runs `task` for its result; once it has run for `STALL_MS`, logs an error naming `what`, and again as it ends. */
export async function warnIfStalled<T>(what: string, task: () => Promise<T>): Promise<T> {
    const started = performance.now();
    let stalled = false;
    const timer = window.setTimeout(() => {
        stalled = true;
        console.error(`DailyNotesStream: ${what} has run for ${STALL_MS / 1000} s; no note draws until it ends`);
    }, STALL_MS);
    try {
        return await task();
    } finally {
        window.clearTimeout(timer);
        if (stalled) {
            const seconds = Math.round((performance.now() - started) / 1000);
            console.error(`DailyNotesStream: ${what} ended after ${seconds} s`);
        }
    }
}
