/** No resize for this long counts as done: Bases gives no sign it is. */
export const SETTLE_MS = 300;

/** Long enough for Bases to fill a view; short enough that a real shrink shows. */
export const HOLD_LIMIT_MS = 2000;

/**
 * Holds an element at least `height` tall while its contents refill, so a dip
 * is never drawn: on iOS, with no scroll anchoring, the text below would jump
 * and return. The owner releases it once they settle; the limit, if they never do.
 */
export class HeightHold {
    private readonly timer: number;
    private held = true;

    /**
     * styles.css turns the property into a note's `min-height`. `released`
     * runs once it lets go.
     */
    constructor(
        private readonly el: HTMLElement,
        height: number,
        private readonly released: () => void = () => {}
    ) {
        el.style.setProperty("--daily-note-held-height", `${height}px`);
        this.timer = window.setTimeout(() => this.release(), HOLD_LIMIT_MS);
    }

    get holding(): boolean {
        return this.held;
    }

    release(): void {
        if (!this.held) return;
        this.held = false;
        window.clearTimeout(this.timer);
        this.el.style.removeProperty("--daily-note-held-height");
        this.released();
    }
}
