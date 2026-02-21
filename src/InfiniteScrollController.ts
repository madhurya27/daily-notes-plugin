/**
 * Wraps IntersectionObserver to implement infinite scroll with a sentinel element.
 *
 * The sentinel is always appended as the last child of the container on attach,
 * enforcing its position rather than assuming it.
 */
export class InfiniteScrollController {
    private sentinel: HTMLElement | null = null;
    private observer: IntersectionObserver | null = null;

    /**
     * Attaches the controller to a container.
     *
     * @param scrollRoot - The scrolling element (used as IntersectionObserver root)
     * @param container  - The element to append the sentinel into
     * @param onTrigger  - Called when the sentinel enters the viewport
     */
    attach(
        scrollRoot: HTMLElement,
        container: HTMLElement,
        onTrigger: () => Promise<void>
    ): void {
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

    /**
     * Disconnects the observer and removes the sentinel.
     */
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

    /**
     * Moves the sentinel back to the end of the container.
     * Call this after inserting any element at the end that may have displaced it.
     */
    enforceSentinelPosition(container: HTMLElement): void {
        if (this.sentinel && this.sentinel.parentElement === container) {
            container.appendChild(this.sentinel);
        }
    }
}
