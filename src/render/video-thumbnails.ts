const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const VIDEO_ID = /^\/embed\/([\w-]{11})$/;
const SVG = "http://www.w3.org/2000/svg";

/**
 * On mobile a YouTube embed is its thumbnail, a link to the video (D-088): the
 * player's page would end a glide as it starts, and fails inside the app.
 * Null for any other frame.
 */
export function youtubeThumbnail(frame: HTMLIFrameElement, src: string): HTMLElement | null {
    const url = parse(src);
    const id = url && YOUTUBE_HOSTS.has(url.hostname) ? VIDEO_ID.exec(url.pathname)?.[1] : undefined;
    // A playlist's embed: its name is as long as a video's ID.
    if (!url || !id || id === "videoseries") return null;

    const watch = new URL("https://www.youtube.com/watch");
    watch.searchParams.set("v", id);
    const start = url.searchParams.get("start");
    if (start) watch.searchParams.set("t", start);

    const link = document.createElement("a");
    link.className = "external-link daily-note-video";
    link.href = watch.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.ariaLabel = frame.getAttribute("title") || "YouTube video";
    sizeLike(link, frame);

    const image = link.appendChild(document.createElement("img"));
    image.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    image.alt = "";
    link.appendChild(playButton());
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

/** The player's box: its width, capped by the stylesheet, and its shape; else the stylesheet's 16:9. */
function sizeLike(link: HTMLElement, frame: HTMLIFrameElement): void {
    const width = Number(frame.getAttribute("width"));
    const height = Number(frame.getAttribute("height"));
    if (!(width > 0 && height > 0)) return;
    link.style.setProperty("--daily-note-video-width", `${width}px`);
    link.style.setProperty("--daily-note-video-ratio", `${width} / ${height}`);
}

/** YouTube's play button: a red rounded box around a white triangle. */
function playButton(): SVGElement {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "daily-note-video-play");
    svg.setAttribute("viewBox", "0 0 68 48");
    svg.setAttribute("aria-hidden", "true");
    const box = svg.appendChild(document.createElementNS(SVG, "rect"));
    for (const [name, value] of Object.entries({ width: "68", height: "48", rx: "12", fill: "#f00" }))
        box.setAttribute(name, value);
    const triangle = svg.appendChild(document.createElementNS(SVG, "path"));
    triangle.setAttribute("d", "M27 14v20l18-10z");
    triangle.setAttribute("fill", "#fff");
    return svg;
}
