/**
 * Where the stream's blocks sit: in note order, ahead of the infinite-scroll
 * sentinel, and indexed by the path each was rendered under. A block's
 * children may be unloaded (ADR 0006), so the index — never a DOM query — is
 * the lookup.
 */
export class StreamBlocks {
    private container!: HTMLElement;
    private readonly byPath = new Map<string, HTMLElement>();

    /** The sentinel is recreated on every scroll attach, so it is looked up each time. */
    constructor(private readonly sentinel: () => HTMLElement | null) {}

    get el(): HTMLElement {
        return this.container;
    }

    attach(container: HTMLElement): void {
        this.container = container;
    }

    get(path: string): HTMLElement | null {
        return this.byPath.get(path) ?? null;
    }

    /** Every indexed block, by path. */
    entries(): IterableIterator<[string, HTMLElement]> {
        return this.byPath.entries();
    }

    /** Places `block` last among the notes. */
    append(path: string, block: HTMLElement): void {
        this.byPath.set(path, block);
        this.insertBeforeSentinel(block);
    }

    /** Places `block` ahead of the note at `nextPath`, or last when it has none. */
    insertBefore(path: string, block: HTMLElement, nextPath: string | undefined): void {
        this.byPath.set(path, block);
        // Stryker disable next-line ConditionalExpression: no note has an undefined path, so get finds none either.
        const next = nextPath === undefined ? null : this.get(nextPath);
        if (next) {
            this.container.insertBefore(block, next);
        } else {
            this.insertBeforeSentinel(block);
        }
    }

    /** Takes the block at `path` out of the stream; null when none is there. */
    remove(path: string): HTMLElement | null {
        const block = this.get(path);
        if (!block) return null;
        block.remove();
        this.byPath.delete(path);
        return block;
    }

    /** Forgets every block without touching the DOM. */
    clear(): void {
        this.byPath.clear();
    }

    /** Empties the container and forgets every block. */
    empty(): void {
        this.container.empty();
        this.clear();
    }

    /** Shows `text` as the one message, in place of the stream's notes. */
    showEmptyState(text: string): void {
        const shown = this.findEmptyState();
        if (shown) shown.setText(text);
        else this.insertBeforeSentinel(this.container.createDiv({ cls: "daily-notes-empty-state", text }));
    }

    hideEmptyState(): void {
        this.findEmptyState()?.remove();
    }

    private findEmptyState(): HTMLElement | null {
        return this.container.querySelector(".daily-notes-empty-state");
    }

    /** The sentinel must stay the last child, so everything lands before it. */
    private insertBeforeSentinel(el: HTMLElement): void {
        // Before null is last.
        this.container.insertBefore(el, this.sentinel());
    }
}

/** The block `paneTop` crosses, by halving: blocks stack, and a stream holds thousands. */
export function blockAt(stream: HTMLElement, paneTop: number): Element | null {
    const blocks = stream.children;
    let low = 0;
    let high = blocks.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (blocks[mid]!.getBoundingClientRect().bottom > paneTop) high = mid;
        else low = mid + 1;
    }
    return blocks[low] ?? null;
}
