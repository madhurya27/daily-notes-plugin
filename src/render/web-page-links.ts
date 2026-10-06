const WEB = new Set(["http:", "https:"]);

/**
 * On mobile a web page in a frame is a preview, a link to the page: the frame
 * takes no touch, which would scroll the page inside instead of the stream.
 * Null for a frame no browser could open.
 */
export function webPageLink(frame: HTMLIFrameElement, src: string): HTMLAnchorElement | null {
    const url = parse(src);
    if (!url || !WEB.has(url.protocol)) return null;

    const link = document.createElement("a");
    link.className = "external-link daily-note-frame-link";
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.ariaLabel = frame.getAttribute("title") || url.hostname;
    return link;
}

/** `//` borrows the page's scheme, which in the app is not the web's. */
function parse(src: string): URL | null {
    try {
        return new URL(src.startsWith("//") ? `https:${src}` : src);
    } catch {
        return null;
    }
}
