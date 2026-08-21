import { describe, it, expect, beforeEach, vi } from "vitest";
import { CollapsibleManager } from "../src/CollapsibleManager";
import type { CollapsibleStateStore } from "../src/CollapsibleStateStore";

function makeStore(collapsedByDefault = false): CollapsibleStateStore {
    return {
        isCollapsed: vi.fn().mockReturnValue(collapsedByDefault),
        collapsedOr: vi.fn().mockReturnValue(collapsedByDefault),
        setCollapsed: vi.fn(),
        clearForFile: vi.fn(),
    } as any;
}

/** Collapse toggles are bound to the chevron, not the whole heading/list item. */
function clickChevron(el: HTMLElement): void {
    (el.querySelector(":scope > .collapse-indicator") as HTMLElement).click();
}

describe("CollapsibleManager — keyboard and ARIA", () => {
    let store: ReturnType<typeof makeStore>;
    let manager: CollapsibleManager;

    function chevron(el: HTMLElement): HTMLElement {
        return el.querySelector(":scope > .collapse-indicator") as HTMLElement;
    }

    function press(el: HTMLElement, key: string): void {
        el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }

    beforeEach(() => {
        store = makeStore();
        manager = new CollapsibleManager(store as any);
    });

    it("exposes each chevron as a focusable button", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h2>Section</h2><p>Body</p>";
        manager.makeCollapsible(content, "file.md");

        const indicator = chevron(content.querySelector("h2") as HTMLElement);
        expect(indicator.getAttribute("role")).toBe("button");
        expect(indicator.getAttribute("tabindex")).toBe("0");
    });

    it("reports the section state through aria-expanded", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h2>Section</h2><p>Body</p>";
        manager.makeCollapsible(content, "file.md");
        const indicator = chevron(content.querySelector("h2") as HTMLElement);

        expect(indicator.getAttribute("aria-expanded")).toBe("true");
        indicator.click();
        expect(indicator.getAttribute("aria-expanded")).toBe("false");
    });

    it("starts with aria-expanded false for a stored collapsed section", () => {
        store = makeStore(true);
        manager = new CollapsibleManager(store as any);
        const content = document.createElement("div");
        content.innerHTML = "<h2>Section</h2><p>Body</p>";
        manager.makeCollapsible(content, "file.md");

        expect(chevron(content.querySelector("h2") as HTMLElement).getAttribute("aria-expanded")).toBe("false");
    });

    it("toggles on Enter and Space", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h2>Section</h2><p>Body</p>";
        manager.makeCollapsible(content, "file.md");
        const header = content.querySelector("h2") as HTMLElement;

        press(chevron(header), "Enter");
        expect(header.classList.contains("is-collapsed")).toBe(true);

        press(chevron(header), " ");
        expect(header.classList.contains("is-collapsed")).toBe(false);
    });

    it("ignores other keys", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h2>Section</h2><p>Body</p>";
        manager.makeCollapsible(content, "file.md");
        const header = content.querySelector("h2") as HTMLElement;

        press(chevron(header), "a");

        expect(header.classList.contains("is-collapsed")).toBe(false);
        expect(store.setCollapsed).not.toHaveBeenCalled();
    });

    it("prevents Space from scrolling the stream", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h2>Section</h2><p>Body</p>";
        manager.makeCollapsible(content, "file.md");
        const indicator = chevron(content.querySelector("h2") as HTMLElement);

        const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
        indicator.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    it("gives list-item chevrons the same treatment", () => {
        const content = document.createElement("div");
        content.innerHTML = "<ul><li>Task<ul><li>sub</li></ul></li></ul>";
        manager.makeCollapsible(content, "file.md");
        const li = content.querySelector("li") as HTMLElement;

        press(chevron(li), "Enter");

        expect(li.classList.contains("is-collapsed")).toBe(true);
        expect(chevron(li).getAttribute("aria-expanded")).toBe("false");
    });
});

describe("CollapsibleManager — duplicate section keys", () => {
    let store: ReturnType<typeof makeStore>;
    let manager: CollapsibleManager;

    beforeEach(() => {
        store = makeStore();
        manager = new CollapsibleManager(store as any);
    });

    it("suffixes repeated header text so each heading keeps its own state", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h2>Notes</h2><p>a</p><h2>Notes</h2><p>b</p><h2>Notes</h2><p>c</p>";
        manager.makeCollapsible(content, "file.md");

        const headers = content.querySelectorAll("h2");
        clickChevron(headers[0] as HTMLElement);
        clickChevron(headers[1] as HTMLElement);
        clickChevron(headers[2] as HTMLElement);

        expect(store.setCollapsed).toHaveBeenNthCalledWith(1, "file.md", "notes", true);
        expect(store.setCollapsed).toHaveBeenNthCalledWith(2, "file.md", "notes-2", true);
        expect(store.setCollapsed).toHaveBeenNthCalledWith(3, "file.md", "notes-3", true);
    });

    it("suffixes repeated list items at the same depth", () => {
        const content = document.createElement("div");
        content.innerHTML = "<ul><li>Task<ul><li>a</li></ul></li><li>Task<ul><li>b</li></ul></li></ul>";
        manager.makeCollapsible(content, "file.md");

        const items = content.querySelectorAll(":scope > ul > li");
        clickChevron(items[0] as HTMLElement);
        clickChevron(items[1] as HTMLElement);

        expect(store.setCollapsed).toHaveBeenNthCalledWith(1, "file.md", "li-1-task", true);
        expect(store.setCollapsed).toHaveBeenNthCalledWith(2, "file.md", "li-1-task-2", true);
    });

    it("counts headers and list items separately", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h2>Task</h2><ul><li>Task<ul><li>a</li></ul></li></ul>";
        manager.makeCollapsible(content, "file.md");

        clickChevron(content.querySelector("h2") as HTMLElement);
        clickChevron(content.querySelector("li") as HTMLElement);

        expect(store.setCollapsed).toHaveBeenNthCalledWith(1, "file.md", "task", true);
        expect(store.setCollapsed).toHaveBeenNthCalledWith(2, "file.md", "li-1-task", true);
    });
});

describe("CollapsibleManager — headers", () => {
    let store: ReturnType<typeof makeStore>;
    let manager: CollapsibleManager;

    beforeEach(() => {
        store = makeStore();
        manager = new CollapsibleManager(store as any);
    });

    it("adds is-collapsible class to each header", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h1>Heading</h1>";
        manager.makeCollapsible(content, "file.md");
        expect(content.querySelector("h1")!.classList.contains("is-collapsible")).toBe(true);
    });

    it("prepends a collapse-indicator span inside the header", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h2>Section</h2>";
        manager.makeCollapsible(content, "file.md");
        expect(content.querySelector("h2 > .collapse-indicator")).not.toBeNull();
    });

    it("reads initial state from store and adds is-collapsed when true", () => {
        store = makeStore(true);
        manager = new CollapsibleManager(store as any);
        const content = document.createElement("div");
        content.innerHTML = "<h1>Title</h1><p>Content</p>";
        manager.makeCollapsible(content, "file.md");
        expect(content.querySelector("h1")!.classList.contains("is-collapsed")).toBe(true);
    });

    it("applies is-hidden to siblings when initially collapsed", () => {
        store = makeStore(true);
        manager = new CollapsibleManager(store as any);
        const content = document.createElement("div");
        content.innerHTML = "<h1>Title</h1><p>Body</p>";
        manager.makeCollapsible(content, "file.md");
        expect(content.querySelector("p")!.classList.contains("is-hidden")).toBe(true);
    });

    it("clicking inside the heading (not the chevron) does not toggle collapse", () => {
        const content = document.createElement("div");
        content.innerHTML = '<h1>Title <a class="internal-link">Link</a></h1><p>Body</p>';
        manager.makeCollapsible(content, "file.md");

        (content.querySelector("a") as HTMLElement).click();

        expect(content.querySelector("h1")!.classList.contains("is-collapsed")).toBe(false);
        expect(store.setCollapsed).not.toHaveBeenCalled();
    });

    it("clicking the chevron toggles the heading without bubbling the click", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h1>Title</h1><p>Body</p>";
        manager.makeCollapsible(content, "file.md");
        const onHeaderClick = vi.fn();
        content.querySelector("h1")!.addEventListener("click", onHeaderClick);

        (content.querySelector("h1 > .collapse-indicator") as HTMLElement).click();

        expect(content.querySelector("h1")!.classList.contains("is-collapsed")).toBe(true);
        expect(onHeaderClick).not.toHaveBeenCalled();
    });

    it("chevron click hides siblings until next same-level heading", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h1>A</h1><p>Para</p><h1>B</h1><p>After B</p>";
        manager.makeCollapsible(content, "file.md");
        const [h1a] = Array.from(content.querySelectorAll("h1")) as HTMLElement[];
        clickChevron(h1a!);
        const [p1, p2] = Array.from(content.querySelectorAll("p")) as HTMLElement[];
        expect(p1!.classList.contains("is-hidden")).toBe(true);
        expect(p2!.classList.contains("is-hidden")).toBe(false);
    });

    it("chevron click stops at a higher-level heading", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h2>Sub</h2><p>Body</p><h1>Top</h1>";
        manager.makeCollapsible(content, "file.md");
        clickChevron(content.querySelector("h2") as HTMLElement);
        expect(content.querySelector("p")!.classList.contains("is-hidden")).toBe(true);
        expect(content.querySelector("h1")!.classList.contains("is-hidden")).toBe(false);
    });

    it("chevron click persists state to store with slugified key", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h1>My Heading</h1>";
        manager.makeCollapsible(content, "file.md");
        clickChevron(content.querySelector("h1") as HTMLElement);
        expect(store.setCollapsed).toHaveBeenCalledWith("file.md", "my-heading", true);
    });

    it("second chevron click un-collapses header and removes is-hidden from siblings", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h1>Title</h1><p>Body</p>";
        manager.makeCollapsible(content, "file.md");
        const h1 = content.querySelector("h1") as HTMLElement;
        clickChevron(h1); // collapse
        clickChevron(h1); // uncollapse
        expect(h1.classList.contains("is-collapsed")).toBe(false);
        expect(content.querySelector("p")!.classList.contains("is-hidden")).toBe(false);
    });

    it("skips headers that are direct children of a list item (no chevron added)", () => {
        const content = document.createElement("div");
        content.innerHTML = "<ul><li><h2>Heading in list</h2></li></ul>";
        manager.makeCollapsible(content, "file.md");
        const h2 = content.querySelector("h2")!;
        expect(h2.classList.contains("is-collapsible")).toBe(false);
        expect(h2.querySelector(".collapse-indicator")).toBeNull();
    });

    it("processes all header levels h1–h6", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h1>1</h1><h2>2</h2><h3>3</h3><h4>4</h4><h5>5</h5><h6>6</h6>";
        manager.makeCollapsible(content, "file.md");
        for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
            expect(content.querySelector(tag)!.classList.contains("is-collapsible")).toBe(true);
        }
    });

    it("slugifies heading text: special chars are stripped, spaces become hyphens", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h1>Hello World!</h1>";
        manager.makeCollapsible(content, "file.md");
        clickChevron(content.querySelector("h1") as HTMLElement);
        expect(store.setCollapsed).toHaveBeenCalledWith("file.md", "hello-world", true);
    });

    it("leading and trailing hyphens are removed from slug", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h1>---Section---</h1>";
        manager.makeCollapsible(content, "file.md");
        clickChevron(content.querySelector("h1") as HTMLElement);
        // "---Section---" → lowercase "---section---" → replace non-alphanumeric runs → "-section-" → strip edges → "section"
        expect(store.setCollapsed).toHaveBeenCalledWith("file.md", "section", true);
    });

    it("uses empty string key when header textContent is null (covers ?? '' branch)", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h1></h1>";
        const h1 = content.querySelector("h1") as HTMLElement;
        // Override textContent to return null, forcing the ?? '' fallback (line 25)
        Object.defineProperty(h1, "textContent", { get: () => null, configurable: true });
        manager.makeCollapsible(content, "file.md");
        clickChevron(h1);
        expect(store.setCollapsed).toHaveBeenCalledWith("file.md", "", true);
    });

    it("hides lower-level headings during collapse (h2 after h1 is hidden, not a break)", () => {
        const content = document.createElement("div");
        content.innerHTML = "<h1>Top</h1><h2>Sub</h2><p>Body</p>";
        manager.makeCollapsible(content, "file.md");
        clickChevron(content.querySelector("h1") as HTMLElement);
        // h2 level (2) > h1 level (1): NOT a break — h2 must be hidden (covers the false branch at line 83)
        expect(content.querySelector("h2")!.classList.contains("is-hidden")).toBe(true);
        expect(content.querySelector("p")!.classList.contains("is-hidden")).toBe(true);
    });

    it("expanding a header keeps nested collapsed sections collapsed", () => {
        const content = document.createElement("div");
        content.innerHTML = '<h2>Top</h2><p id="a">A</p><h3>First</h3><p id="b">B</p><h3>Second</h3><p id="c">C</p>';
        manager.makeCollapsible(content, "file.md");
        const h2 = content.querySelector("h2") as HTMLElement;
        const [first, second] = Array.from(content.querySelectorAll("h3")) as HTMLElement[];

        clickChevron(first!); // collapse the first h3
        clickChevron(h2); // collapse the h2
        clickChevron(h2); // expand the h2

        expect(first!.classList.contains("is-hidden")).toBe(false);
        expect(second!.classList.contains("is-hidden")).toBe(false);
        expect(content.querySelector("#a")!.classList.contains("is-hidden")).toBe(false);
        expect(content.querySelector("#b")!.classList.contains("is-hidden")).toBe(true);
        expect(content.querySelector("#c")!.classList.contains("is-hidden")).toBe(false);
    });

    it("nested collapsed section stays collapsed only until a same-or-higher heading", () => {
        const content = document.createElement("div");
        content.innerHTML =
            '<h2>Top</h2><h3>Inner</h3><p id="b">B</p><h4>Deep</h4><p id="c">C</p><h3>Next</h3><p id="d">D</p>';
        manager.makeCollapsible(content, "file.md");
        const h2 = content.querySelector("h2") as HTMLElement;
        const inner = content.querySelector("h3") as HTMLElement;

        clickChevron(inner);
        clickChevron(h2);
        clickChevron(h2);

        expect(content.querySelector("#b")!.classList.contains("is-hidden")).toBe(true);
        expect(content.querySelector("h4")!.classList.contains("is-hidden")).toBe(true);
        expect(content.querySelector("#c")!.classList.contains("is-hidden")).toBe(true);
        expect(content.querySelector("#d")!.classList.contains("is-hidden")).toBe(false);
    });
});

describe("CollapsibleManager — lists", () => {
    let store: ReturnType<typeof makeStore>;
    let manager: CollapsibleManager;

    beforeEach(() => {
        store = makeStore();
        manager = new CollapsibleManager(store as any);
    });

    it("adds is-collapsible to li that has a nested list", () => {
        const content = document.createElement("div");
        content.innerHTML = "<ul><li>Parent<ul><li>Child</li></ul></li></ul>";
        manager.makeCollapsible(content, "file.md");
        expect(content.querySelector("ul > li")!.classList.contains("is-collapsible")).toBe(true);
    });

    it("does not add is-collapsible to li without a nested list", () => {
        const content = document.createElement("div");
        content.innerHTML = "<ul><li>Leaf item</li></ul>";
        manager.makeCollapsible(content, "file.md");
        expect(content.querySelector("li")!.classList.contains("is-collapsible")).toBe(false);
    });

    it("prepends collapse-indicator inside collapsible li", () => {
        const content = document.createElement("div");
        content.innerHTML = "<ul><li>Item<ul><li>Sub</li></ul></li></ul>";
        manager.makeCollapsible(content, "file.md");
        expect(content.querySelector("ul > li > .collapse-indicator")).not.toBeNull();
    });

    it("applies is-collapsed from store to list item", () => {
        store = makeStore(true);
        manager = new CollapsibleManager(store as any);
        const content = document.createElement("div");
        content.innerHTML = "<ul><li>Item<ul><li>Sub</li></ul></li></ul>";
        manager.makeCollapsible(content, "file.md");
        expect(content.querySelector("ul > li")!.classList.contains("is-collapsed")).toBe(true);
    });

    it("indicator click collapses list item and calls store.setCollapsed", () => {
        const content = document.createElement("div");
        content.innerHTML = "<ul><li>Item<ul><li>Sub</li></ul></li></ul>";
        manager.makeCollapsible(content, "file.md");
        const indicator = content.querySelector("ul > li > .collapse-indicator") as HTMLElement;
        indicator.click();
        expect(content.querySelector("ul > li")!.classList.contains("is-collapsed")).toBe(true);
        expect(store.setCollapsed).toHaveBeenCalledWith("file.md", "li-1-item", true);
    });

    it("second indicator click un-collapses list item", () => {
        const content = document.createElement("div");
        content.innerHTML = "<ul><li>Item<ul><li>Sub</li></ul></li></ul>";
        manager.makeCollapsible(content, "file.md");
        const indicator = content.querySelector("ul > li > .collapse-indicator") as HTMLElement;
        indicator.click();
        indicator.click();
        expect(content.querySelector("ul > li")!.classList.contains("is-collapsed")).toBe(false);
    });

    it("uses a depth-and-text-based key: top-level list item has depth 1", () => {
        const content = document.createElement("div");
        content.innerHTML = "<ul><li>A<ul><li>Sub</li></ul></li></ul>";
        manager.makeCollapsible(content, "file.md");
        (content.querySelector("ul > li > .collapse-indicator") as HTMLElement).click();
        expect(store.setCollapsed).toHaveBeenCalledWith("file.md", "li-1-a", true);
    });

    it("derives the key from the item's own text, ignoring nested sub-list content (stable across edits elsewhere)", () => {
        const content = document.createElement("div");
        content.innerHTML = `
            <ul>
                <li>Alpha<ul><li>Sub-A</li></ul></li>
                <li>Beta<ul><li>Sub-B</li></ul></li>
            </ul>`;
        manager.makeCollapsible(content, "file.md");
        const indicators = Array.from(content.querySelectorAll("ul > li > .collapse-indicator")) as HTMLElement[];
        indicators[0]!.click();
        indicators[1]!.click();
        expect(store.setCollapsed).toHaveBeenCalledWith("file.md", "li-1-alpha", true);
        expect(store.setCollapsed).toHaveBeenCalledWith("file.md", "li-1-beta", true);
    });

    it("handles ol (ordered list) as nested container", () => {
        const content = document.createElement("div");
        content.innerHTML = "<ol><li>Item<ol><li>Sub</li></ol></li></ol>";
        manager.makeCollapsible(content, "file.md");
        expect(content.querySelector("ol > li")!.classList.contains("is-collapsible")).toBe(true);
    });
});
