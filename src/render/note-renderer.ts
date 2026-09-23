import {
    App,
    Component,
    Keymap,
    MarkdownRenderer,
    MarkdownView,
    Menu,
    TFile,
    getLinkpath,
    setIcon,
    type HoverParent,
    type PaneType,
    type View,
} from "obsidian";
import { CollapsibleManager, PROPERTIES_SECTION_KEY } from "./collapsible";
import type { SearchHighlighter } from "./search-highlights";
import { getPropertyIcon, openTagSearch } from "../obsidian-internals";
import type { DailyNotesStreamSettings } from "../settings";

/** The fallback, for an Obsidian that resolves no property type. */
const PROPERTY_ICONS: Record<string, string> = {
    tags: "tags",
    aliases: "tags",
    created: "calendar",
    updated: "calendar",
    link: "link",
    url: "link",
    image: "image",
    cover: "image",
};

function fallbackIcon(key: string): string {
    const name = key.toLowerCase();
    const known = PROPERTY_ICONS[name];
    if (known) return known;
    if (name.includes("date") || name.includes("time")) return "calendar";
    return "file-text";
}

/**
 * What a title's right-click offers ahead of Obsidian's file menu, in its own
 * words. The file menu adds "Open in new window" itself, where windows exist.
 */
const OPEN_ITEMS: { title: string; icon: string; pane: PaneType }[] = [
    { title: "Open in new tab", icon: "file-plus", pane: "tab" },
    { title: "Open to the right", icon: "separator-vertical", pane: "split" },
];

/** A title or an internal link: something in the stream that points at a note. */
interface NoteTarget {
    /** Null for a link to a note not yet created. */
    file: TFile | null;
    /** Obsidian's name for where the file menu opened, which other plugins read. */
    menuSource: string;
    open(pane: PaneType | boolean): void;
}

/** The view the stream's gestures belong to; Page preview hangs popovers on it. */
type HoverView = Component & HoverParent & Pick<View, "getViewType">;

/** Marks the values whose pills search, so a click can tell them apart. */
const TAG_VALUE_CLASS = "daily-note-tags-value";

/** The key Obsidian types as tags, so its pills take the tag colours; `tag` it dropped in 1.9.10. */
const TAG_KEY = "tags";

/**
 * The items a list property shows a pill for. The tags key is always a list,
 * and a scalar is one item: `tags: work, daily` is the one tag "work, daily".
 */
function pillItems(key: string, value: unknown): string[] | null {
    if (Array.isArray(value)) return value.map(String);
    if (key.toLowerCase() === TAG_KEY && typeof value === "string") return [value];
    return null;
}

/** Whitespace, ASCII punctuation but `-`, `/` and `_`, and the two Unicode punctuation blocks. */
const NOT_IN_A_TAG = /[\s!-,.:-@[-^`{-~\u2000-\u206F\u2E00-\u2E7F]/u;

/** Whether Obsidian takes this as a tag; `#work` it shows, but marks invalid. */
function isTagName(tag: string): boolean {
    return !NOT_IN_A_TAG.test(tag) && !/^\d+$/.test(tag);
}

function displayValue(value: unknown): string {
    if (typeof value === "object" && value !== null) return JSON.stringify(value);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

export class NoteRenderer {
    constructor(
        private readonly app: App,
        private readonly component: Component,
        private readonly collapsible: CollapsibleManager,
        private readonly getSettings: () => DailyNotesStreamSettings,
        private readonly highlighter: SearchHighlighter
    ) {}

    /**
     * The block a note always has, rendered or not: `renderInto` fills it and
     * unloading empties it, so the path stays resolvable either way.
     */
    createBlock(file: TFile): HTMLElement {
        const block = document.createElement("div");
        block.addClass("daily-note-block");
        block.dataset.sourcePath = file.path;
        return block;
    }

    /**
     * Fills an empty block. The note renders into a child component, not the
     * view: what MarkdownRenderer registers lives until that child is
     * discarded, and otherwise outlives the DOM it belongs to.
     */
    async renderInto(block: HTMLElement, file: TFile): Promise<Component> {
        const noteComponent = new Component();
        noteComponent.load();
        this.component.addChild(noteComponent);

        const header = block.createDiv({ cls: "daily-note-header" });
        const dateLink = header.createEl("a", {
            text: file.basename,
            cls: "daily-note-title",
            // href keeps the title focusable and Enter-activatable; the click
            // handler opens the note itself.
            href: "#",
        });
        this.titles.set(dateLink, file);

        this.renderProperties(block, file);

        // "markdown-rendered" is how Obsidian scopes its whole reading-view
        // stylesheet — list indent included. Without it a rendered note falls
        // back to the browser's defaults.
        const contentEl = block.createDiv({ cls: "daily-note-content markdown-rendered" });

        try {
            let markdown = await this.app.vault.cachedRead(file);

            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatterPos = cache?.frontmatterPosition;
            if (frontmatterPos) {
                markdown = markdown.slice(frontmatterPos.end.offset).trim();
            }

            await MarkdownRenderer.render(this.app, markdown, contentEl, file.path, noteComponent);

            const sectionKeys = this.collapsible.makeCollapsible(contentEl, file.path);
            this.collapsible.forgetRemovedSections(file, sectionKeys);
        } catch (error) {
            console.error(`DailyNotesStream: Failed to render note ${file.path}:`, error);
            contentEl.setText("Error rendering note");
        }

        this.highlighter.track(block, noteComponent);
        return noteComponent;
    }

    /** Frees everything the note registered while it was rendered. */
    discard(noteComponent: Component): void {
        this.component.removeChild(noteComponent);
    }

    private renderProperties(container: HTMLElement, file: TFile): void {
        if (!this.getSettings().showProperties) return;

        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return;

        const frontmatter = cache.frontmatter as unknown as Record<string, unknown>;
        const keys = Object.keys(frontmatter).filter((k) => k !== "position");
        if (keys.length === 0) return;

        const metadataContainer = container.createDiv({ cls: "metadata-container" });

        // Obsidian's own shape: the heading is a sibling above the box, not a
        // row inside it, and the whole row is the control. It stays out of the
        // tab order — Obsidian rings it on :focus, and a click would then leave
        // that ring behind — so the chevron is what takes focus.
        const heading = metadataContainer.createDiv({ cls: "metadata-properties-heading" });
        heading.createDiv({ cls: "metadata-properties-title", text: "Properties" });

        const metadataContent = metadataContainer.createDiv({ cls: "metadata-content" });
        const metadataProperties = metadataContent.createDiv({ cls: "metadata-properties" });
        for (const key of keys) {
            this.renderPropertyRow(metadataProperties, key, frontmatter[key]);
        }

        const toggle = this.collapsible.attachCollapseToggle(heading, {
            filePath: file.path,
            sectionKey: PROPERTIES_SECTION_KEY,
            defaultCollapsed: this.getSettings().propertiesCollapsed,
            apply: (collapsed) => metadataContainer.toggleClass("is-collapsed", collapsed),
            hides: (node) => metadataContent.contains(node),
        });
        this.collapsible.attachCollapseHost(heading, toggle);
    }

    /** Title → its note. Weak, so titles dropped by a re-render are collectable. */
    private readonly titles = new WeakMap<HTMLElement, TFile>();

    /**
     * One listener per gesture for the whole stream: a title or link per
     * note would pile registrations on the view until it closes.
     */
    delegate(view: HoverView, root: HTMLElement): void {
        view.registerDomEvent(root, "click", (evt) => {
            // A click's target is the element under the pointer, never a text node.
            const target = evt.target as HTMLElement;

            const tag = this.tagAt(target);
            if (tag) {
                evt.preventDefault();
                void openTagSearch(this.app, tag, Keymap.isModEvent(evt));
                return;
            }

            const note = this.noteAt(target);
            if (!note) return;
            evt.preventDefault();
            note.open(Keymap.isModEvent(evt));
        });

        // A middle button fires auxclick, never click.
        view.registerDomEvent(root, "auxclick", (evt) => {
            const note = evt.button === 1 ? this.noteAt(evt.target as HTMLElement) : null;
            if (!note) return;
            evt.preventDefault();
            note.open("tab");
        });

        view.registerDomEvent(root, "contextmenu", (evt) => {
            const note = this.noteAt(evt.target as HTMLElement);
            if (!note) return;
            evt.preventDefault();
            this.showNoteMenu(note, evt);
        });

        // Page preview decides from here whether to show, per its own settings.
        view.registerDomEvent(root, "mouseover", (evt) => {
            const link = this.linkAt(evt.target as HTMLElement);
            if (!link) return;
            this.app.workspace.trigger("hover-link", {
                event: evt,
                source: view.getViewType(),
                hoverParent: view,
                targetEl: link.el,
                linktext: link.linktext,
                sourcePath: link.sourcePath,
            });
        });
    }

    /** The note a title or an internal link under the pointer points at. */
    private noteAt(target: HTMLElement): NoteTarget | null {
        const title = target.closest<HTMLElement>(".daily-note-title");
        const file = title ? this.titles.get(title) : undefined;
        if (file) return { file, menuSource: "daily-notes-stream", open: (pane) => this.openNote(file, pane) };

        const link = this.linkAt(target);
        if (!link) return null;
        const { linktext, sourcePath } = link;
        return {
            file: this.app.metadataCache.getFirstLinkpathDest(getLinkpath(linktext), sourcePath),
            menuSource: "link-context-menu",
            open: (pane) => this.openLink(linktext, sourcePath, pane),
        };
    }

    /** An internal link, and the note it was written in, which resolves it. */
    private linkAt(target: HTMLElement): { el: HTMLElement; linktext: string; sourcePath: string } | null {
        const el = target.closest<HTMLElement>(".internal-link");
        const linktext = el?.getAttribute("data-href");
        const sourcePath = el?.closest<HTMLElement>(".daily-note-block")?.dataset.sourcePath;
        if (!el || !linktext || !sourcePath) return null;
        return { el, linktext, sourcePath };
    }

    /**
     * The tag a click landed on, inline in the note or as a property pill.
     * A pill only counts where the property is one Obsidian types as tags:
     * an alias pill carries no tag.
     */
    private tagAt(target: HTMLElement): string | null {
        const inline = target.closest<HTMLElement>("a.tag");
        if (inline) return inline.textContent;

        const pill = target.closest<HTMLElement>(`.${TAG_VALUE_CLASS} .multi-select-pill:not(.is-invalid)`);
        return pill?.textContent ?? null;
    }

    /** Where the note can open, then Obsidian's file menu for it once it exists. */
    private showNoteMenu(note: NoteTarget, evt: MouseEvent): void {
        const menu = new Menu();
        for (const { title, icon, pane } of OPEN_ITEMS) {
            menu.addItem((item) =>
                item
                    .setTitle(title)
                    .setIcon(icon)
                    .setSection("open")
                    .onClick(() => note.open(pane))
            );
        }
        if (note.file) this.app.workspace.trigger("file-menu", menu, note.file, note.menuSource);
        menu.showAtMouseEvent(evt);
    }

    /** A link to a note not yet created creates it, as Obsidian's links do. */
    private openLink(linktext: string, sourcePath: string, pane: PaneType | boolean): void {
        this.app.workspace.openLinkText(linktext, sourcePath, pane).catch((error) => {
            console.error("DailyNotesStream: Failed to open link", error);
        });
    }

    /**
     * A plain click reuses a tab already showing the note; a chosen pane
     * always gets its own, as Obsidian's links do.
     */
    private openNote(file: TFile, pane: PaneType | boolean): void {
        const existing = pane
            ? undefined
            : this.app.workspace
                  .getLeavesOfType("markdown")
                  // A "markdown" leaf may still be deferred (unloaded) since 1.7.2.
                  .find((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path);
        if (existing) {
            void this.app.workspace.revealLeaf(existing);
            return;
        }
        this.app.workspace
            .getLeaf(pane)
            .openFile(file)
            .catch((error) => {
                console.error("DailyNotesStream: Failed to open file", error);
            });
    }

    private renderPropertyRow(container: HTMLElement, key: string, value: unknown): void {
        const propertyRow = container.createDiv({ cls: "metadata-property" });

        const keyContainer = propertyRow.createDiv({ cls: "metadata-property-key" });
        const iconEl = keyContainer.createDiv({ cls: "metadata-property-icon" });
        setIcon(iconEl, getPropertyIcon(this.app, key, value) ?? fallbackIcon(key));
        keyContainer.createSpan({ cls: "metadata-property-key-input", text: key });

        const valueEl = propertyRow.createDiv({ cls: "metadata-property-value" });
        const items = pillItems(key, value);
        if (items) {
            this.renderPills(valueEl, key, items);
            return;
        }
        valueEl.createSpan({ cls: "metadata-property-value-text", text: displayValue(value) });
    }

    /** Obsidian's multi-select shape, minus the editing affordances it has. */
    private renderPills(valueEl: HTMLElement, key: string, items: string[]): void {
        const isTags = key.toLowerCase() === TAG_KEY;
        if (isTags) {
            valueEl.dataset.propertyType = "tags";
            valueEl.addClass(TAG_VALUE_CLASS);
        }
        const pills = valueEl.createDiv({ cls: "multi-select-container" });
        for (const item of items) {
            const pill = pills.createDiv({ cls: "multi-select-pill" });
            pill.createDiv({ cls: "multi-select-pill-content" }).createSpan({
                text: isTags ? item.replace(/^#/, "") : item,
            });
            if (isTags && !isTagName(item)) {
                pill.addClass("is-invalid");
                pill.setAttribute("aria-label", "Invalid tag name");
            }
        }
    }
}
