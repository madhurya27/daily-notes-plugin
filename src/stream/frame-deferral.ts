import { debounce } from "obsidian";
import { SCROLL_IDLE_MS } from "./scroll-anchor";

/** What shows in a frame's place for good, such as a video's thumbnail; null keeps the frame. */
export type FrameStandIn = (frame: HTMLIFrameElement, src: string) => HTMLElement | null;
/** What a kept frame is put in, such as a link to its page; null leaves it where it is. */
export type FrameWrapper = (frame: HTMLIFrameElement, src: string) => HTMLElement | null;

/**
 * Loads a frame's page only once the scroll is still (D-087): on iOS, a frame
 * starting its page as a note renders mid-glide ends the glide. A frame with a
 * stand-in never starts it.
 */
export class FrameDeferral {
    private observer: MutationObserver | null = null;
    /** Each frame held back, with the page it was given. */
    private readonly held = new Map<HTMLIFrameElement, string>();
    private readonly loadOnceStill = debounce(() => this.load(), SCROLL_IDLE_MS, true);

    constructor(
        private readonly standIn: FrameStandIn,
        private readonly wrapper: FrameWrapper
    ) {}

    attach(container: HTMLElement): void {
        this.detach();
        // Reported before the frame's page can start: a microtask after the insert.
        this.observer = new MutationObserver((records) => this.onMutations(records));
        this.observer.observe(container, { childList: true, subtree: true });
    }

    detach(): void {
        this.observer?.disconnect();
        this.observer = null;
        this.loadOnceStill.cancel();
        this.held.clear();
    }

    /** Postpones the load until the scroll stops. */
    onScroll(): void {
        if (this.held.size > 0) this.loadOnceStill();
    }

    private onMutations(records: MutationRecord[]): void {
        for (const record of records) {
            for (const node of Array.from(record.addedNodes)) {
                if (!(node instanceof HTMLElement)) continue;
                const frames = node instanceof HTMLIFrameElement ? [node] : node.querySelectorAll("iframe");
                for (const frame of Array.from(frames)) this.hold(frame);
            }
        }
        if (this.held.size > 0) this.loadOnceStill();
    }

    private hold(frame: HTMLIFrameElement): void {
        const src = frame.getAttribute("src");
        if (src === null) return;
        const standIn = this.standIn(frame, src);
        if (standIn) {
            frame.replaceWith(standIn);
            return;
        }
        this.held.set(frame, src);
        frame.removeAttribute("src");
        frame.addClass("is-frame-held");
        // Moved with no page: the move reports it again, and it is passed over.
        const wrapper = this.wrapper(frame, src);
        if (wrapper) {
            frame.replaceWith(wrapper);
            wrapper.appendChild(frame);
        }
    }

    private load(): void {
        for (const [frame, src] of this.held) {
            if (!frame.isConnected) continue;
            frame.removeClass("is-frame-held");
            frame.setAttribute("src", src);
        }
        this.held.clear();
    }
}
