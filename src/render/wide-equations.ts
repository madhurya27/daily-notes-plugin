import type { Component } from "obsidian";
import type { WidthWatch } from "./note-widths";

/**
 * Shrinks a display equation wider than the note until it fits, re-checked
 * when the note's width changes. It may not scroll sideways inside the stream
 * (ADR 0008), and clipped, its end would be lost. MathJax draws HTML, which
 * CSS cannot scale to fit, so this measures it.
 */
export function fitWideEquations(contentEl: HTMLElement, noteComponent: Component, widths: WidthWatch): void {
    const equations = Array.from(contentEl.querySelectorAll<HTMLElement>('mjx-container[display="true"] > mjx-math'));
    if (equations.length === 0) return;

    const fit = () => {
        for (const math of equations) {
            // Measured at its own size: shrunk, it is exactly as wide as the note.
            math.style.removeProperty("--daily-note-equation-zoom");
            const room = contentWidth(math.parentElement!);
            if (math.offsetWidth > room)
                math.style.setProperty("--daily-note-equation-zoom", String(room / math.offsetWidth));
        }
    };
    fit();
    widths.watch(contentEl, noteComponent, fit);
}

/** Inside the padding MathJax 4 gives a display equation's container. */
function contentWidth(el: HTMLElement): number {
    const { paddingLeft, paddingRight } = getComputedStyle(el);
    return el.clientWidth - (parseFloat(paddingLeft) || 0) - (parseFloat(paddingRight) || 0);
}
