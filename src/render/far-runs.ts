/** A shown element's border box, and the margins it collapses with its neighbours. */
export interface Box {
    top: number;
    bottom: number;
    marginTop: number;
    marginBottom: number;
}

/** Null where the element is not shown: a collapse hid it. */
function boxOf(el: Element): Box | null {
    if (el.getClientRects().length === 0) return null;
    const { top, bottom } = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return { top, bottom, marginTop: parseFloat(style.marginTop), marginBottom: parseFloat(style.marginBottom) };
}

const SPACER = "daily-note-far-run";

interface Run {
    spacer: HTMLElement;
    elements: Element[];
}

/**
 * Runs of a long note's elements taken out of the layout, each behind a
 * spacer of the room it took (ADR 0021). The elements stay in the note, so
 * collapsing, search and an update in place still find them.
 */
export class FarRuns {
    /** Each hidden element, and each spacer, to its run. */
    private readonly runs = new WeakMap<Element, Run>();

    /** jsdom lays nothing out, so measurement is the one seam tests replace. */
    constructor(private readonly box: (el: Element) => Box | null = boxOf) {}

    /**
     * Hides `elements`, consecutive siblings, behind one spacer; null where
     * none is shown. The spacer carries the outer margins of the first and
     * last shown, so they collapse with the neighbours as before. A caller
     * hiding several measures each first: a hide between two reads lays the
     * note out again.
     */
    hide(elements: Element[], box: Box | null = this.measure(elements)): HTMLElement | null {
        if (!box) return null;

        const spacer = document.createElement("div");
        spacer.addClass(SPACER);
        spacer.style.setProperty("--daily-note-far-height", `${box.bottom - box.top}px`);
        spacer.style.setProperty("--daily-note-far-margin-top", `${box.marginTop}px`);
        spacer.style.setProperty("--daily-note-far-margin-bottom", `${box.marginBottom}px`);
        elements[0]!.before(spacer);

        const run: Run = { spacer, elements };
        this.runs.set(spacer, run);
        for (const el of elements) {
            el.addClass("is-far");
            this.runs.set(el, run);
        }
        return spacer;
    }

    /**
     * Where `elements` lie, from the first shown to the last, with the outer
     * margins of those two; null where none is shown.
     */
    measure(elements: Element[]): Box | null {
        const boxes = elements.map((el) => this.box(el)).filter((box): box is Box => box !== null);
        if (boxes.length === 0) return null;
        const [first, last] = [boxes[0]!, boxes[boxes.length - 1]!];
        return { top: first.top, bottom: last.bottom, marginTop: first.marginTop, marginBottom: last.marginBottom };
    }

    /** Whether a hidden run holds `node`. */
    hides(node: Node): boolean {
        return this.runOf(node) !== undefined;
    }

    /** Shows again the run holding `node`, or the one it is the spacer of. */
    reveal(node: Node): void {
        const run = this.runOf(node);
        if (!run) return;
        run.spacer.remove();
        this.runs.delete(run.spacer);
        for (const el of run.elements) {
            el.removeClass("is-far");
            this.runs.delete(el);
        }
    }

    /** The spacers in `root`, top to bottom. */
    spacersIn(root: Element): HTMLElement[] {
        return Array.from(root.querySelectorAll<HTMLElement>(`.${SPACER}`));
    }

    revealAll(root: Element): void {
        for (const spacer of this.spacersIn(root)) this.reveal(spacer);
    }

    private runOf(node: Node): Run | undefined {
        for (let el = node instanceof Element ? node : node.parentElement; el; el = el.parentElement) {
            const run = this.runs.get(el);
            if (run) return run;
        }
        return undefined;
    }
}
