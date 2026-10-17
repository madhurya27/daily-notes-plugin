/** Infinite scroll via a sentinel, re-appended as the last child on every attach. */
export class InfiniteScrollController {
    private sentinel: HTMLElement | null = null;
    private observer: IntersectionObserver | null = null;

    attach(scrollRoot: HTMLElement, container: HTMLElement, onTrigger: () => Promise<void>): void {
        this.detach();

        this.sentinel = document.createElement("div");
        this.sentinel.addClass("daily-notes-stream-sentinel");
        container.appendChild(this.sentinel);

        this.observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry?.isIntersecting) {
                    onTrigger().catch((error) => {
                        console.error("DailyNotesStream: Failed to load more notes", error);
                    });
                }
            },
            {
                root: scrollRoot,
                rootMargin: "200px",
            }
        );

        this.observer.observe(this.sentinel);
    }

    /** Forces a fresh callback: IntersectionObserver fires only on *changes*. */
    recheck(): void {
        // Stryker disable next-line LogicalOperator: attach and detach set and clear both together.
        if (!this.observer || !this.sentinel) return;
        this.observer.unobserve(this.sentinel);
        this.observer.observe(this.sentinel);
    }

    detach(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.sentinel) {
            this.sentinel.remove();
            this.sentinel = null;
        }
    }

    /**
     * Returns the sentinel element (always the last child of the container).
     */
    getSentinel(): HTMLElement | null {
        return this.sentinel;
    }
}
