import {
    App,
    Component,
    type CachedMetadata,
    Keymap,
    MarkdownRenderer,
    Menu,
    Platform,
    TAbstractFile,
    TFile,
    parseLinktext,
    setIcon,
    type HoverParent,
    type PaneType,
    type View,
} from "obsidian";
import { CollapsibleManager, PROPERTIES_SECTION_KEY } from "./collapsible";
import type { SearchHighlighter } from "./search-highlights";
import { stackWideTables } from "./wide-tables";
import { fitWideEquations } from "./wide-equations";
import { fallBackToSmallThumbnail } from "./video-thumbnails";
import { extractBases, type BaseSource } from "./bases/bases-as-cards";
import { changedSpan, noteChunks, noteSections, type ChangedSpan } from "./note-sections";
import { TimeSlice } from "./time-slice";
import { NoteBases } from "./bases/note-bases";
import { NoteWidths } from "./note-widths";
import type { BaseMeasurements } from "./bases/base-measurements";
import { getPropertyIcon, openTagSearch } from "../obsidian-internals";
import { wrapTextBesideBlocks } from "./text-beside-blocks";
import type { DailyNotesStreamSettings } from "../settings";
import type { BacklinkIndex } from "../notes/backlink-index";
import { LinkedMentionsFooter } from "./linked-mentions";
import type { FarRuns } from "./far-runs";

/** A run of sections rendered at once: about 10 ms at phone speed (ADR 0020). */
const CHUNK_CHARS = 2000;

/** Shorter, a note renders whole, holding the thread no longer than a slice would (ADR 0020). */
const SLICED_FROM_CHARS = 6000;

/** How long a render holds the thread before letting input and painting in (ADR 0020). */
const SLICE_MS = 25;

/** A note's runs of sections; null where it renders whole, as a short one does. */
function chunksOf(markdown: string, cache: CachedMetadata | null): string[] | null {
    return markdown.length < SLICED_FROM_CHARS ? null : noteChunks(markdown, cache, CHUNK_CHARS);
}

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

/** The key Obsidian types as tags, so its pills take the tag colors; `tag` it dropped in 1.9.10. */
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

/** One section of a note, rendered on its own (ADR 0019). */
interface RenderedSection {
    source: string;
    /** What it rendered, flat among the note's other sections' nodes. */
    nodes: ChildNode[];
    /** Owns what the section registered; a child of the note's. */
    component: Component;
    bases: BaseSource[];
}

/** Where a section drawn before `sections` goes: before the first node they rendered. */
function firstNodeOf(sections: RenderedSection[]): ChildNode | null {
    return sections.find((section) => section.nodes.length > 0)?.nodes[0] ?? null;
}

/** Sections taken together from the end up to a run's length: a note drawn from there grows at its top, and only its topmost run changes. */
function groupByLength(sections: RenderedSection[]): RenderedSection[][] {
    const runs: RenderedSection[][] = [];
    let length = Infinity;
    for (const section of [...sections].reverse()) {
        if (length + section.source.length > CHUNK_CHARS) {
            runs.unshift([]);
            length = 0;
        }
        length += section.source.length;
        runs[0]!.unshift(section);
    }
    return runs;
}

/** Sections in runs, each starting at one of `starts` or at the note's top. */
function groupByStarts(sections: RenderedSection[], starts: WeakSet<RenderedSection>): RenderedSection[][] {
    const runs: RenderedSection[][] = [];
    for (const section of sections) {
        if (runs.length === 0 || starts.has(section)) runs.push([]);
        runs[runs.length - 1]!.push(section);
    }
    return runs;
}

/** What a note's rendered Markdown is drawn into, below its title and properties. */
export const NOTE_CONTENT_CLASS = "daily-note-content";

/** A note drawn in slices draws from its end first where the reader comes up into it. */
export type DrawOrder = "from-start" | "from-end";

/**
 * Marks a block drawing in slices from its end, for styles.css to lay it out
 * from its bottom; the stream unmarks it as it lands. One drawn whole has no
 * end to draw first.
 */
export const DRAWING_FROM_END = "is-drawing-from-end";

/** A note rendered a section, or a run of them, at a time. */
interface DrawnNote {
    contentEl: HTMLElement;
    /** As drawn so far, for the stream to hide between slices. */
    sections: RenderedSection[];
    /** The section each run starts at, fixed once it is drawn: a save changes no run it left alone. */
    runStarts: WeakSet<RenderedSection> | null;
    /**
     * Its text above the body, a change to which draws the properties again;
     * null where it rendered in runs, and a save renders it whole.
     */
    frontmatter: string | null;
}

/** On mobile a Base draws as cards (ADR 0008), into a slot its source leaves. */
function withoutBases(source: string): { markdown: string; bases: BaseSource[] } {
    return Platform.isMobile ? extractBases(source) : { markdown: source, bases: [] };
}

function hasBases(source: string): boolean {
    return extractBases(source).bases.length > 0;
}

/** The note's text up to its body: frontmatter, or nothing. */
function frontmatterOf(markdown: string, cache: CachedMetadata | null): string {
    return markdown.slice(0, cache?.frontmatterPosition?.end.offset ?? 0);
}

/** A rendered note: what frees it, and when its footer is drawn. */
export interface RenderedNote {
    component: Component;
    /** Resolves once the linked mentions are drawn; the note itself already is. */
    footer: Promise<void>;
}

export class NoteRenderer {
    /** Each view's own; what its Bases measured is shared, by layout. */
    private readonly bases: NoteBases;
    private readonly mentions: LinkedMentionsFooter;
    private readonly widths: NoteWidths;
    /** Notes drawn a section or a run at a time, by the component they were rendered into. */
    private readonly drawn = new WeakMap<Component, DrawnNote>();
    /**
     * Notes saved while rendered, by path: they render by section from then
     * on. Until a save a note renders whole, which for a long one costs half.
     */
    private readonly saved = new Set<string>();

    constructor(
        private readonly app: App,
        private readonly component: Component,
        private readonly collapsible: CollapsibleManager,
        private readonly getSettings: () => DailyNotesStreamSettings,
        private readonly highlighter: SearchHighlighter,
        baseMeasurements: BaseMeasurements,
        backlinks: BacklinkIndex,
        /** Whether a note will likely be saved while on screen: today's (ADR 0019). */
        private readonly expectsSaves: (file: TFile) => boolean = () => false
    ) {
        this.widths = new NoteWidths(component);
        this.bases = new NoteBases(app, baseMeasurements, this.widths);
        this.mentions = new LinkedMentionsFooter(app, backlinks, collapsible, getSettings, this.widths, (el) =>
            this.markUnresolvedLinks(el)
        );
    }

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
     * discarded, and otherwise outlives the DOM it belongs to. The footer is
     * left drawing: the render queue must not wait on other notes' reads.
     * Between slices it awaits `goOn`, and null where that said stop (ADR
     * 0020) or the note was deleted meanwhile: its block is left empty. A note
     * drawn in slices draws from its end first where the reader comes up into
     * it.
     */
    async renderInto(
        block: HTMLElement,
        file: TFile,
        goOn: (note: Component) => Promise<boolean> = () => Promise.resolve(true),
        order: DrawOrder = "from-start"
    ): Promise<RenderedNote | null> {
        const noteComponent = new Component();
        noteComponent.load();
        this.component.addChild(noteComponent);

        // A block left half-drawn would take a second header on the next render.
        try {
            this.renderHeader(block, file);
            this.renderProperties(block, file);
        } catch (error) {
            this.abandon(block, noteComponent);
            throw error;
        }

        // "markdown-rendered" is how Obsidian scopes its whole reading-view
        // stylesheet — list indent included. Without it a rendered note falls
        // back to the browser's defaults.
        const contentEl = block.createDiv({ cls: `${NOTE_CONTENT_CLASS} markdown-rendered` });

        try {
            const markdown = await this.app.vault.cachedRead(file);
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = frontmatterOf(markdown, cache);
            const bySection = this.saved.has(file.path) || this.expectsSaves(file);
            const sources = bySection ? noteSections(markdown, cache) : chunksOf(markdown, cache);
            if (sources) {
                if (order === "from-end") block.addClass(DRAWING_FROM_END);
                const note: DrawnNote = { contentEl, sections: [], runStarts: null, frontmatter: null };
                this.drawn.set(noteComponent, note);
                if (!(await this.renderSections(note, file, noteComponent, sources, goOn, order)))
                    return this.abandon(block, noteComponent);
                // One that failed to draw renders whole on a save.
                if (bySection) note.frontmatter = frontmatter;
            } else await this.renderWhole(contentEl, file, noteComponent, markdown.slice(frontmatter.length).trim());
            const sectionKeys = this.collapsible.makeCollapsible(contentEl, file.path);
            this.collapsible.forgetRemovedSections(file, sectionKeys);
        } catch (error) {
            if (this.isDeleted(file)) return this.abandon(block, noteComponent);
            console.error(`DailyNotesStream: Failed to render note ${file.path}:`, error);
            contentEl.setText("Error rendering note");
        }

        const footer = this.mentions.render(block, file, noteComponent);
        this.highlighter.track(block, noteComponent);
        return { component: noteComponent, footer };
    }

    /**
     * Re-renders only the sections of a note a save changed (ADR 0019). False
     * where the note must render whole: it was rendered whole, its sections
     * no longer stand alone, a Base changed, or on mobile its frontmatter
     * changed beside a Base. A failed
     * update may leave it part-drawn, until that whole render.
     */
    async update(block: HTMLElement, file: TFile, noteComponent: Component): Promise<boolean> {
        const note = this.drawn.get(noteComponent);
        if (note?.frontmatter == null) {
            this.saved.add(file.path);
            return false;
        }
        try {
            const markdown = await this.app.vault.cachedRead(file);
            const cache = this.app.metadataCache.getFileCache(file);
            const sources = noteSections(markdown, cache);
            if (!sources) return false;
            const frontmatter = frontmatterOf(markdown, cache);
            const frontmatterChanged = frontmatter !== note.frontmatter;
            const before = note.sections.map((section) => section.source);
            const span = changedSpan(before, sources);
            // Bases render across the note, each into its slot in order, and
            // a Base's formulas may read the note's properties: it draws again with them.
            const redrawn = frontmatterChanged
                ? [...before, ...sources]
                : [...before.slice(span.start, span.endBefore), ...sources.slice(span.start, span.endAfter)];
            if (Platform.isMobile && redrawn.some(hasBases)) return false;

            await this.replaceSections(note, span, sources, file, noteComponent);
            if (frontmatterChanged) {
                this.redrawProperties(block, note.contentEl, file);
                note.frontmatter = frontmatter;
            }

            const sectionKeys = this.collapsible.refreshCollapsible(note.contentEl, file.path);
            this.collapsible.forgetRemovedSections(file, sectionKeys);
            this.highlighter.refresh(block);
            return true;
        } catch (error) {
            if (this.isDeleted(file)) return false;
            console.error(`DailyNotesStream: Failed to update note ${file.path}:`, error);
            return false;
        }
    }

    /** Sections `span` of `note` drawn again from `sources`, in place. */
    private async replaceSections(
        note: DrawnNote,
        { start, endBefore, endAfter }: ChangedSpan,
        sources: string[],
        file: TFile,
        noteComponent: Component
    ): Promise<void> {
        // Sections replaced among hidden ones would show beside a spacer
        // still standing for them: the runs they and their neighbours are in show.
        for (const section of note.sections.slice(Math.max(0, start - 1), endBefore + 1))
            for (const node of section.nodes) this.farRuns.reveal(node);
        const removed = note.sections.slice(start, endBefore);
        const next = firstNodeOf(note.sections.slice(endBefore));
        for (const section of removed) {
            section.nodes.forEach((node) => node.remove());
            noteComponent.removeChild(section.component);
        }
        const rendered: RenderedSection[] = [];
        for (const source of sources.slice(start, endAfter)) {
            rendered.push(await this.renderSection(note.contentEl, next, source, file, noteComponent));
        }
        note.sections.splice(start, endBefore - start, ...rendered);
        const starts = note.runStarts;
        // A run that lost the section it started at starts at what took its place.
        const heir = note.sections[start];
        if (starts && heir && removed.some((section) => starts.has(section))) starts.add(heir);
    }

    /** The runs hidden when far, shared with collapsing (ADR 0021). */
    get farRuns(): FarRuns {
        return this.collapsible.farRuns;
    }

    /**
     * A note's elements in runs of about one render slice each, in order, for
     * the stream to hide when far (ADR 0021); none for a note rendered whole.
     */
    runsOf(noteComponent: Component): Element[][] {
        const note = this.drawn.get(noteComponent);
        if (!note) return [];
        const { sections, runStarts } = note;
        return (runStarts ? groupByStarts(sections, runStarts) : groupByLength(sections))
            .map((run) => run.flatMap((section) => section.nodes.filter((node) => node instanceof Element)))
            .filter((run) => run.length > 0);
    }

    /** Leaves `block` empty, freeing what its note registered. */
    private abandon(block: HTMLElement, noteComponent: Component): null {
        this.discard(noteComponent);
        block.empty();
        return null;
    }

    /** Gone from the vault: its read fails, and its block is about to go. */
    private isDeleted(file: TFile): boolean {
        return this.app.vault.getFileByPath(file.path) === null;
    }

    /** A note as one render, Obsidian's way. */
    private async renderWhole(contentEl: HTMLElement, file: TFile, noteComponent: Component, markdown: string) {
        // On mobile nothing in the stream may scroll (ADR 0008); desktop
        // draws wide content as Obsidian does, scrolling in its own box.
        const { markdown: body, bases } = withoutBases(markdown);
        await MarkdownRenderer.render(this.app, body, contentEl, file.path, noteComponent);
        this.markUnresolvedLinks(contentEl);
        await this.finishNote(contentEl, file, noteComponent, bases);
        if (Platform.isMobile) fitWideEquations(contentEl, noteComponent, this.widths);
        wrapTextBesideBlocks(contentEl);
    }

    /** Once the whole note is drawn: its Bases as cards, and its tables stacked, on mobile. */
    private async finishNote(
        contentEl: HTMLElement,
        file: TFile,
        noteComponent: Component,
        bases: BaseSource[]
    ): Promise<void> {
        if (!Platform.isMobile) return;
        await this.bases.render(contentEl, file, noteComponent, bases);
        stackWideTables(contentEl, noteComponent, this.widths);
    }

    /**
     * A note a section, or a run of them, at a time: a save can redraw part of
     * it (ADR 0019), and no long note freezes the stream (ADR 0020). Null
     * once `goOn` says stop; one taken out of the document is left
     * part-drawn, for its discard.
     */
    private async renderSections(
        note: DrawnNote,
        file: TFile,
        noteComponent: Component,
        sources: string[],
        goOn: (note: Component) => Promise<boolean>,
        order: DrawOrder
    ): Promise<boolean> {
        const slice = new TimeSlice(SLICE_MS);
        const fromEnd = order === "from-end";
        const { contentEl, sections } = note;
        for (const source of fromEnd ? [...sources].reverse() : sources) {
            if (await slice.yieldIfSpent()) {
                if (!(await goOn(noteComponent))) return false;
                if (!contentEl.isConnected) return true;
            }
            if (!fromEnd) sections.push(await this.renderSection(contentEl, null, source, file, noteComponent));
            else
                sections.unshift(
                    await this.renderSection(contentEl, firstNodeOf(sections), source, file, noteComponent)
                );
        }
        note.runStarts = new WeakSet(groupByLength(sections).map((run) => run[0]!));
        await this.finishNote(
            contentEl,
            file,
            noteComponent,
            sections.flatMap((section) => section.bases)
        );
        return true;
    }

    /**
     * Renders one section before `next`, into a holder that then gives way to
     * what it holds: the note's elements stay siblings, as a whole render
     * leaves them, for collapsing and Obsidian's stylesheet.
     */
    private async renderSection(
        contentEl: HTMLElement,
        next: ChildNode | null,
        source: string,
        file: TFile,
        noteComponent: Component
    ): Promise<RenderedSection> {
        const component = noteComponent.addChild(new Component());
        const holder = contentEl.insertBefore(document.createElement("div"), next);
        const { markdown, bases } = withoutBases(source);
        await MarkdownRenderer.render(this.app, markdown, holder, file.path, component);
        this.markUnresolvedLinks(holder);
        if (Platform.isMobile) fitWideEquations(contentEl, component, this.widths, holder);
        wrapTextBesideBlocks(holder);
        const nodes = Array.from(holder.childNodes);
        holder.replaceWith(...nodes);
        return { source, nodes, component, bases };
    }

    /** A Base file changed: the copies of it drawn as cards redraw. */
    onBaseModified(file: TAbstractFile): Promise<void> {
        return this.bases.onBaseModified(file);
    }

    /** Bases laid a table out: cards if it is too wide for its note, else fitted columns. */
    onBaseLayout(view: HTMLElement): void {
        this.bases.onLayout(view);
    }

    /** Frees everything the note registered while it was rendered. */
    discard(noteComponent: Component): void {
        this.component.removeChild(noteComponent);
    }

    private renderHeader(block: HTMLElement, file: TFile): void {
        const header = block.createDiv({ cls: "daily-note-header" });
        const dateLink = header.createEl("a", {
            text: file.basename,
            cls: "daily-note-title",
            // href keeps the title focusable and Enter-activatable; the click
            // handler opens the note itself.
            href: "#",
        });
        this.titles.set(dateLink, file);
    }

    /** The properties box, drawn again from the cache above the note's content. */
    private redrawProperties(block: HTMLElement, contentEl: HTMLElement, file: TFile): void {
        block.querySelector(":scope > .metadata-container")?.remove();
        this.renderProperties(block, file);
        const properties = block.querySelector(":scope > .metadata-container");
        if (properties) contentEl.before(properties);
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

    /** One listener per gesture for the whole stream, so a re-rendered title or link needs none of its own. */
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

        // On mobile a video is its thumbnail (D-088); load and error do not bubble.
        view.registerDomEvent(root, "load", fallBackToSmallThumbnail, { capture: true });
        view.registerDomEvent(root, "error", fallBackToSmallThumbnail, { capture: true });

        view.registerDomEvent(root, "contextmenu", (evt) => {
            const note = this.noteAt(evt.target as HTMLElement);
            if (!note) return;
            evt.preventDefault();
            this.showNoteMenu(note, evt);
        });

        // A note created, deleted or renamed can resolve or break a link in
        // any rendered note; the cache says so once, after it re-resolves.
        view.registerEvent(this.app.metadataCache.on("resolved", () => this.markUnresolvedLinks(root)));

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

    /**
     * Fades the links whose note does not exist yet. The reading view does
     * this after rendering; MarkdownRenderer leaves it to its caller.
     */
    private markUnresolvedLinks(root: HTMLElement): void {
        for (const el of Array.from(root.querySelectorAll<HTMLElement>(".internal-link"))) {
            const link = this.linkAt(el);
            if (!link) continue;
            const { path } = parseLinktext(link.linktext);
            el.toggleClass("is-unresolved", !this.app.metadataCache.getFirstLinkpathDest(path, link.sourcePath));
        }
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
            file: this.app.metadataCache.getFirstLinkpathDest(parseLinktext(linktext).path, sourcePath),
            menuSource: "link-context-menu",
            open: (pane) => this.openLink(linktext, sourcePath, pane),
        };
    }

    /**
     * An internal link, and the note it was written in, which resolves it: a
     * linked mention's excerpt was written in its source, not the daily note.
     * On mobile a PDF embed is a preview, a link to its file (D-083).
     */
    private linkAt(target: HTMLElement): { el: HTMLElement; linktext: string; sourcePath: string } | null {
        const pdf = Platform.isMobile ? target.closest<HTMLElement>(".pdf-embed") : null;
        const el = pdf ?? target.closest<HTMLElement>(".internal-link");
        const linktext = pdf ? pdf.getAttribute("src") : el?.getAttribute("data-href");
        const sourcePath =
            el?.closest<HTMLElement>("[data-link-source]")?.dataset.linkSource ??
            el?.closest<HTMLElement>(".daily-note-block")?.dataset.sourcePath;
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

    /** A plain click opens in the stream's own tab, as a link in a note opens in its note's. */
    private openNote(file: TFile, pane: PaneType | boolean): void {
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
        // The key is a flex box, and WebKit paints no CSS highlight on a bare
        // text run inside one (D-038): search marked no key on iOS.
        keyContainer.createSpan({ cls: "metadata-property-key-input" }).createSpan({ text: key });

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
