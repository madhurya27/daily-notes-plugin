/**
 * Lets everything already waiting run before the caller goes on: input,
 * painting and timers. `scheduler.yield()` would put the caller first, and
 * hold every timer until a long render ends (ADR 0020).
 */
export function yieldToMain(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
}

/** Work split into a task per slice of time, so no long render freezes the stream. */
export class TimeSlice {
    private start: number;

    constructor(
        private readonly budgetMs: number,
        private readonly now: () => number = () => performance.now(),
        private readonly giveBack: () => Promise<void> = yieldToMain
    ) {
        this.start = now();
    }

    /** Gives the thread back once the slice's time is spent; true if it did. */
    async yieldIfSpent(): Promise<boolean> {
        if (this.now() - this.start < this.budgetMs) return false;
        await this.giveBack();
        this.start = this.now();
        return true;
    }
}
