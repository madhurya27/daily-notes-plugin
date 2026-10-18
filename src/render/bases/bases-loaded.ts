import { BASE_SLOT_CLASS } from "./bases-as-cards";

/** Bases fills a view in tens of milliseconds; one that never does is not waited on past this. */
export const BASES_LOAD_LIMIT_MS = 500;

/** Bases marks a view whose query has not yet run, an empty "0 results" drawn in its place. */
const LOADING = `.${BASE_SLOT_CLASS} .is-loading`;

/**
 * Resolves once no Base in `note` is loading, or after `BASES_LOAD_LIMIT_MS`.
 * Checked again a frame on: a table too wide for its note is redrawn as cards
 * once it lays out, and loads again.
 */
export function basesLoaded(note: HTMLElement): Promise<void> {
    if (!note.querySelector(`.${BASE_SLOT_CLASS}`)) return Promise.resolve();
    return new Promise((resolve) => {
        const loading = () => note.querySelector(LOADING) !== null;
        let frame = 0;
        const check = () => {
            // One frame for every mutation in it, a Base making many.
            cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => loading() || done());
        };
        const observer = new MutationObserver(check);
        const limit = window.setTimeout(done, BASES_LOAD_LIMIT_MS);
        function done(): void {
            observer.disconnect();
            window.clearTimeout(limit);
            cancelAnimationFrame(frame);
            resolve();
        }
        observer.observe(note, { subtree: true, childList: true, attributeFilter: ["class"] });
        check();
    });
}
