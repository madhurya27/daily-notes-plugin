import { App, Component, MarkdownRenderer, MarkdownView, TFile, setIcon } from "obsidian";
import { CollapsibleManager } from "./CollapsibleManager";
import type { DailyNotesStreamSettings } from "./settings";

export class NoteRenderer {
    constructor(
        private readonly app: App,
        private readonly component: Component,
        private readonly collapsible: CollapsibleManager,
        private readonly settings: DailyNotesStreamSettings
    ) {}

    async createNoteElement(file: TFile): Promise<HTMLElement> {
        const noteContainer = document.createElement("div");
        noteContainer.addClass("daily-note-block");

        // Header
        const header = noteContainer.createDiv({ cls: "daily-note-header" });
        const dateLink = header.createEl("a", {
            text: file.basename,
            cls: "daily-note-title",
        });
        dateLink.onClickEvent(() => {
            const existing = this.app.workspace
                .getLeavesOfType("markdown")
                // A "markdown" leaf may still be deferred (unloaded) since 1.7.2.
                .find(leaf => leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path);
            if (existing) {
                void this.app.workspace.revealLeaf(existing);
                return;
            }
            this.app.workspace.getLeaf(false).openFile(file).catch((error) => {
                console.error("DailyNotesStream: Failed to open file", error);
            });
        });

        // Properties (frontmatter)
        this.renderProperties(noteContainer, file);

        // Content
        const contentEl = noteContainer.createDiv({ cls: "daily-note-content" });
        contentEl.dataset.sourcePath = file.path;

        try {
            let markdown = await this.app.vault.cachedRead(file);

            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatterPos = cache?.frontmatterPosition;
            if (frontmatterPos) {
                markdown = markdown.slice(frontmatterPos.end.offset).trim();
            }

            await MarkdownRenderer.render(
                this.app,
                markdown,
                contentEl,
                file.path,
                this.component
            );

            this.collapsible.makeCollapsible(contentEl, file.path);
        } catch (error) {
            console.error(`Failed to render note ${file.path}:`, error);
            contentEl.setText("Error rendering note");
        }

        return noteContainer;
    }

    private renderProperties(container: HTMLElement, file: TFile): void {
        if (!this.settings.showProperties) return;

        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return;

        const frontmatter = cache.frontmatter as unknown as Record<string, unknown>;
        const keys = Object.keys(frontmatter).filter(k => k !== "position");
        if (keys.length === 0) return;

        const metadataContainer = container.createDiv({ cls: "metadata-container" });
        const metadataContent = metadataContainer.createDiv({ cls: "metadata-content" });

        const heading = metadataContent.createDiv({ cls: "metadata-properties-heading" });
        const headingIcon = heading.createDiv({ cls: "metadata-properties-heading-icon collapse-indicator" });
        setIcon(headingIcon, "chevron-right");
        heading.createDiv({ cls: "metadata-properties-heading-label", text: "Properties" });

        const metadataProperties = metadataContent.createDiv({ cls: "metadata-properties" });

        let isCollapsed = this.settings.propertiesCollapsed;
        const updateCollapseState = () => {
            metadataContainer.toggleClass("is-collapsed", isCollapsed);
        };
        updateCollapseState();

        heading.onClickEvent(() => {
            isCollapsed = !isCollapsed;
            updateCollapseState();
        });

        for (const key of keys) {
            const propertyRow = metadataProperties.createDiv({ cls: "metadata-property" });

            const keyContainer = propertyRow.createDiv({ cls: "metadata-property-key" });
            const iconEl = keyContainer.createDiv({ cls: "metadata-property-icon" });

            let iconName = "file-text";
            const keyLower = key.toLowerCase();
            if (keyLower === "tags" || keyLower === "tag" || keyLower === "aliases") iconName = "tags";
            else if (keyLower.includes("date") || keyLower.includes("time") || keyLower === "created" || keyLower === "updated") iconName = "calendar";
            else if (keyLower === "link" || keyLower === "url") iconName = "link";
            else if (keyLower === "image" || keyLower === "cover") iconName = "image";
            setIcon(iconEl, iconName);

            keyContainer.createSpan({ cls: "metadata-property-key-input", text: key });

            const valueEl = propertyRow.createDiv({ cls: "metadata-property-value" });
            const value = frontmatter[key];
            let displayValue = "";
            if (Array.isArray(value)) {
                displayValue = value.map(String).join(", ");
            } else if (typeof value === "object" && value !== null) {
                displayValue = JSON.stringify(value);
            } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                displayValue = String(value);
            }
            valueEl.createSpan({ cls: "metadata-property-value-text", text: displayValue });
        }
    }
}
