/** How long something must not resize before it counts as done: Bases gives no sign it is. */
export const SETTLE_MS = 300;

/** Long enough for Bases to fill a view; short enough that a real shrink shows. */
export const HOLD_LIMIT_MS = 2000;

/**
 * Holds an element at least `height` tall while what is in it refills, so a
 * dip is never drawn: iOS has no scroll anchoring, and everything below would
 * jump and return. Its owner releases it once the contents hold still; the
 * limit lets go of contents that never do.
 */
export class HeightHold {
    private readonly timer: number;
    private held = true;

    /** styles.css turns the custom property into a `min-height`, for notes and Bases alike. */
    constructor(
        private readonly el: HTMLElement,
        height: number
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
    }
}
