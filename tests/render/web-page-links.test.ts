import { describe, it, expect } from "vitest";
import { webPageLink } from "../../src/render/web-page-links";

function frame(title?: string): HTMLIFrameElement {
    const el = document.createElement("iframe");
    if (title) el.setAttribute("title", title);
    return el;
}

describe("webPageLink", () => {
    it.each([
        ["https://example.com/map?z=3", "https://example.com/map?z=3"],
        ["http://example.com/", "http://example.com/"],
        ["//example.com/calendar", "https://example.com/calendar"],
    ])("links a frame showing %s to the page", (src, href) => {
        expect(webPageLink(frame(), src)?.href).toBe(href);
    });

    // Obsidian opens an external link in the browser.
    it("is an external link", () => {
        const link = webPageLink(frame(), "https://example.com/")!;

        expect(link.classList.contains("external-link")).toBe(true);
        expect(link.target).toBe("_blank");
        expect(link.rel).toBe("noopener");
    });

    it("is named by the frame's title, else the page's host", () => {
        expect(webPageLink(frame("Trail map"), "https://example.com/map")!.ariaLabel).toBe("Trail map");
        expect(webPageLink(frame(), "https://www.example.com/map")!.ariaLabel).toBe("www.example.com");
    });

    it.each(["about:blank", "app://local/page.html", "javascript:void(0)", "not a url"])(
        "gives a frame showing %s no link: no browser opens it",
        (src) => {
            expect(webPageLink(frame(), src)).toBeNull();
        }
    );
});
