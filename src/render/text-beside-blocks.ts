/** Elements that lay out as blocks in a rendered note. */
const BLOCK = /^(BLOCKQUOTE|DETAILS|DIV|DL|FIGURE|H[1-6]|HR|OL|P|PRE|SECTION|TABLE|UL)$/;

/**
 * Wraps each bare text run that shares its parent with a block — a list
 * item's own words above its sub-list, mostly. WebKit paints no CSS highlight
 * on such text, so on iOS search marked nothing there.
 */
export function wrapTextBesideBlocks(root: HTMLElement): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const bare: Text[] = [];
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const parent = node.parentElement!;
        if (node.data.trim() && [...parent.children].some((el) => BLOCK.test(el.tagName))) bare.push(node);
    }
    for (const text of bare) {
        const run = document.createElement("span");
        run.addClass("daily-note-text-run");
        text.replaceWith(run);
        run.append(text);
    }
}
