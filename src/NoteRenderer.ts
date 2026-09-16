import { App, Component, MarkdownRenderer, MarkdownView, TFile, setIcon } from "obsidian";
import { CollapsibleManager } from "./CollapsibleManager";
import type { DailyNotesStreamSettings } from "./settings";

/** Reserved key for the properties panel; a heading slug can never contain ":". */
const PROPERTIES_SECTION_KEY = ":properties";

const PROPERTY_ICONS: Record<string, string> = {
    tags: "tags",
    tag: "tags",
    aliases: "tags",
    created: "calendar",
    updated: "calendar",
    link: "link",
    url: "link",
    image: "image",
    cover: "image",
};

function propertyIcon(key: string): string {
    const name = key.toLowerCase();
    const known = PROPERTY_ICONS[name];
    if (known) return known;
    if (name.includes("date") || name.includes("time")) return "calendar";
    return "file-text";
}

function displayValue(value: unknown): string {
    if (Array.isArray(value)) return value.map(String).join(", ");
    if (typeof value === "object" && value !== null) return JSON.stringify(value);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

export class NoteRenderer {
    constructor(
        private readonly app: App,
        private readonly component: Component,
        private readonly collapsible: CollapsibleManager,
        private readonly getSettings: () => DailyNotesStreamSettings
    ) {}

    async createNoteElement(file: TFile): Promise<HTMLElement> {
        const noteContainer = document.createElement("div");
        noteContainer.addClass("daily-note-block");

        // Header
        const header = noteContainer.createDiv({ cls: "daily-note-header" });
        const dateLink = header.createEl("a", {
            text: file.basename,
            cls: "daily-note-title",
            // href keeps the title focusable and Enter-activatable; the click
            // handler opens the note itself.
            href: "#",
        });
        this.titles.set(dateLink, file);

        // Properties (frontmatter)
        this.renderProperties(noteContainer, file);

        // Content
        // "markdown-rendered" is how Obsidian scopes its whole reading-view
        // stylesheet — list indent included. Without it a rendered note falls
        // back to the browser's defaults.
        const contentEl = noteContainer.createDiv({ cls: "daily-note-content markdown-rendered" });
        contentEl.dataset.sourcePath = file.path;

        try {
            let markdown = await this.app.vault.cachedRead(file);

            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatterPos = cache?.frontmatterPosition;
            if (frontmatterPos) {
                markdown = markdown.slice(frontmatterPos.end.offset).trim();
            }

            await MarkdownRenderer.render(this.app, markdown, contentEl, file.path, this.component);

            this.collapsible.makeCollapsible(contentEl, file.path);
        } catch (error) {
            console.error(`DailyNotesStream: Failed to render note ${file.path}:`, error);
            contentEl.setText("Error rendering note");
        }

        return noteContainer;
    }

    private renderProperties(container: HTMLElement, file: TFile): void {
        if (!this.getSettings().showProperties) return;

        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return;

        const frontmatter = cache.frontmatter as unknown as Record<string, unknown>;
        const keys = Object.keys(frontmatter).filter((k) => k !== "position");
        if (keys.length === 0) return;

        const metadataContainer = container.createDiv({ cls: "metadata-container" });
        const metadataContent = metadataContainer.createDiv({ cls: "metadata-content" });

        const heading = metadataContent.createDiv({ cls: "metadata-properties-heading" });
        heading.createDiv({ cls: "metadata-properties-heading-label", text: "Properties" });

        const metadataProperties = metadataContent.createDiv({ cls: "metadata-properties" });
        for (const key of keys) {
            this.renderPropertyRow(metadataProperties, key, frontmatter[key]);
        }

        // The whole heading row toggles here — unlike a markdown heading it
        // holds no links or selectable prose.
        const toggle = this.collapsible.attachCollapseToggle(heading, {
            filePath: file.path,
            sectionKey: PROPERTIES_SECTION_KEY,
            defaultCollapsed: this.getSettings().propertiesCollapsed,
            apply: (collapsed) => metadataContainer.toggleClass("is-collapsed", collapsed),
        });
        this.collapsible.attachCollapseHost(heading, toggle);
    }

    /** Title → its note. Weak, so titles dropped by a re-render are collectable. */
    private readonly titles = new WeakMap<HTMLElement, TFile>();

    /**
     * One listener for the whole stream: a title per note would pile
     * registrations on the component until it unloads.
     */
    delegate(component: Component, root: HTMLElement): void {
        component.registerDomEvent(root, "click", (evt) => {
            const title = (evt.target as HTMLElement | null)?.closest<HTMLElement>(".daily-note-title");
            const file = title ? this.titles.get(title) : undefined;
            if (!file) return;
            evt.preventDefault();
            this.openNote(file);
        });
    }

    private openNote(file: TFile): void {
        const existing = this.app.workspace
            .getLeavesOfType("markdown")
            // A "markdown" leaf may still be deferred (unloaded) since 1.7.2.
            .find((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path);
        if (existing) {
            void this.app.workspace.revealLeaf(existing);
            return;
        }
        this.app.workspace
            .getLeaf(false)
            .openFile(file)
            .catch((error) => {
                console.error("DailyNotesStream: Failed to open file", error);
            });
    }

    private renderPropertyRow(container: HTMLElement, key: string, value: unknown): void {
        const propertyRow = container.createDiv({ cls: "metadata-property" });

        const keyContainer = propertyRow.createDiv({ cls: "metadata-property-key" });
        setIcon(keyContainer.createDiv({ cls: "metadata-property-icon" }), propertyIcon(key));
        keyContainer.createSpan({ cls: "metadata-property-key-input", text: key });

        const valueEl = propertyRow.createDiv({ cls: "metadata-property-value" });
        valueEl.createSpan({ cls: "metadata-property-value-text", text: displayValue(value) });
    }
}
