const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const VIDEO_ID = /^\/embed\/([\w-]{11})$/;
const SVG = "http://www.w3.org/2000/svg";
/** YouTube's stand-in for a thumbnail a video lacks is 120 px wide. */
const MISSING_WIDTH = 120;
/** The play button of YouTube's own player, in its 68 × 48 box. */
const PLAY_BUTTON =
    "M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55C3.97 2.33 2.27 4.81 1.48 7.74.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z";

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

    link.appendChild(thumbnailImage(id));
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

/** The 1,280 px thumbnail, sharp across a phone at 3x; `fallBackToSmallThumbnail` swaps it if missing. */
function thumbnailImage(id: string): HTMLImageElement {
    const image = document.createElement("img");
    image.alt = "";
    image.src = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
    return image;
}

const LARGE = /\/maxresdefault\.jpg$/;

/**
 * A video lacking the large thumbnail gets the 480 px one every video has,
 * which a 16:9 box crops of its black bars. YouTube answers a missing one
 * with an error or its 120 px grey stand-in. Fed the stream's `load` and
 * `error`, which do not bubble, from a capture listener.
 */
export function fallBackToSmallThumbnail(event: Event): void {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.parentElement?.matches(".daily-note-video")) return;
    // Only from the large one: the same src set again loads, and fails, again.
    if (!LARGE.test(image.src)) return;
    if (event.type === "load" && image.naturalWidth > MISSING_WIDTH) return;
    image.src = image.src.replace(LARGE, "/hqdefault.jpg");
}

function playButton(): SVGElement {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "daily-note-video-play");
    svg.setAttribute("viewBox", "0 0 68 48");
    svg.setAttribute("aria-hidden", "true");
    const button = svg.appendChild(document.createElementNS(SVG, "path"));
    button.setAttribute("d", PLAY_BUTTON);
    button.setAttribute("fill", "#f00");
    const triangle = svg.appendChild(document.createElementNS(SVG, "path"));
    triangle.setAttribute("d", "M45 24 27 14v20z");
    triangle.setAttribute("fill", "#fff");
    return svg;
}
