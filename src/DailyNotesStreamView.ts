import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer, setIcon } from "obsidian";
import { DailyNoteService } from "./DailyNoteService";
import type DailyNotesStreamPlugin from "./main";

export const VIEW_TYPE_DAILY_NOTES_STREAM = "daily-notes-stream-view";

export class DailyNotesStreamView extends ItemView {
    private notes: TFile[] = [];
    private offset: number = 0;
    private readonly BATCH_SIZE = 10;
    private streamContainerEl: HTMLElement;
    private sentinel: HTMLElement;
    private isLoading: boolean = false;
    private plugin: DailyNotesStreamPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: DailyNotesStreamPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_DAILY_NOTES_STREAM;
    }

    getDisplayText(): string {
        return "Daily notes stream";
    }

    getIcon(): string {
        return "calendar-days";
    }

    async onOpen() {
        this.streamContainerEl = this.contentEl.createDiv({ cls: "daily-notes-stream-container" });
        this.offset = 0;
        this.notes = [];
        
        // Handle internal links
        this.streamContainerEl.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            if (target.matches(".internal-link")) {
                event.preventDefault();
                const linkText = target.getAttribute("data-href");
                const sourceContainer = target.closest(".daily-note-content") as HTMLElement;
                const sourcePath = sourceContainer?.dataset.sourcePath || "";
                
                if (linkText) {
                    this.app.workspace.openLinkText(linkText, sourcePath, false);
                }
            }
        });

        // Setup sentinel and observer first so renderNote can insert before it
        // This will also trigger the initial load because the sentinel is visible
        this.setupInfiniteScroll();

        console.debug("DailyNotesStreamView: Opening view...");
    }

    async loadMoreNotes() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            console.debug(`DailyNotesStreamView: Loading more notes. Offset: ${this.offset}, Batch: ${this.BATCH_SIZE}`);
            const newBatch = DailyNoteService.getBatch(this.offset, this.BATCH_SIZE);
            console.debug(`DailyNotesStreamView: Found ${newBatch.length} notes in batch.`);

            if (newBatch.length === 0) {
                if (this.offset === 0) {
                    // If no notes at all, we can show a message. 
                    // We insert it before the sentinel so it looks correct.
                    const emptyState = document.createElement("div");
                    emptyState.addClass("daily-notes-empty-state");
                    emptyState.setText("No daily notes found. Please check your daily notes settings.");
                    this.streamContainerEl.insertBefore(emptyState, this.sentinel);
                }
                return;
            }

            for (const file of newBatch) {
                await this.renderNote(file);
            }

            this.offset += newBatch.length;
            this.notes.push(...newBatch);
        } finally {
            this.isLoading = false;
        }
    }

    async renderNote(file: TFile) {
        // Create the container element manually to avoid auto-appending
        const noteContainer = document.createElement("div");
        noteContainer.addClass("daily-note-block");
        
        // Insert before the sentinel to ensure sentinel stays at the bottom
        this.streamContainerEl.insertBefore(noteContainer, this.sentinel);
        
        // Header
        const header = noteContainer.createDiv({ cls: "daily-note-header" });
        const dateLink = header.createEl("a", { 
            text: file.basename,
            cls: "daily-note-title"
        });
        dateLink.onClickEvent(() => {
            this.app.workspace.getLeaf(false).openFile(file).catch((error) => {
                console.error("DailyNotesStream: Failed to open file", error);
            });
        });

        // Properties (Frontmatter)
        this.renderProperties(noteContainer, file);

        // Content
        const contentEl = noteContainer.createDiv({ cls: "daily-note-content" });
        contentEl.dataset.sourcePath = file.path;
        
        try {
            let markdown = await this.app.vault.read(file);
            
            // Strip frontmatter if it exists to avoid duplication or raw rendering
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatterPos = cache?.frontmatterPosition;
            if (frontmatterPos) {
                markdown = markdown.slice(frontmatterPos.end.offset).trim();
            }

            // Use MarkdownRenderer for high-fidelity rendering
            await MarkdownRenderer.render(
                this.app,
                markdown,
                contentEl,
                file.path,
                this
            );
        } catch (error) {
            console.error(`Failed to render note ${file.path}:`, error);
            contentEl.setText("Error rendering note");
        }
    }

    private renderProperties(container: HTMLElement, file: TFile) {
        if (!this.plugin.settings.showProperties) return;

        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache || !cache.frontmatter) return;

        const frontmatter = cache.frontmatter as unknown as Record<string, unknown>;
        // Filter out internal Obsidian keys if any (like position)
        const keys = Object.keys(frontmatter).filter(k => k !== "position");

        if (keys.length === 0) return;

        // Native Obsidian Reading View Properties Structure
        const metadataContainer = container.createDiv({ cls: "metadata-container" });

        const metadataContent = metadataContainer.createDiv({ cls: "metadata-content" });

        // Header / Heading
        const heading = metadataContent.createDiv({ cls: "metadata-properties-heading" });
        
        // Collapse Indicator (Icon)
        const headingIcon = heading.createDiv({ cls: "metadata-properties-heading-icon collapse-indicator" });
        setIcon(headingIcon, "chevron-right");
        
        // Label
        heading.createDiv({ cls: "metadata-properties-heading-label", text: "Properties" });

        const metadataProperties = metadataContent.createDiv({ cls: "metadata-properties" });
        
        // Initial state from settings
        let isCollapsed = this.plugin.settings.propertiesCollapsed;
        
        const updateCollapseState = () => {
            metadataContainer.toggleClass("is-collapsed", isCollapsed);
        };

        // Apply initial state
        updateCollapseState();

        heading.onClickEvent(() => {
            isCollapsed = !isCollapsed;
            updateCollapseState();
        });

        for (const key of keys) {
            const propertyRow = metadataProperties.createDiv({ cls: "metadata-property" });
            
            // Icon & Key Container
            const keyContainer = propertyRow.createDiv({ cls: "metadata-property-key" });
            
            const iconEl = keyContainer.createDiv({ cls: "metadata-property-icon" });
            
            // Basic Icon Mapping
            let iconName = "file-text"; // default
            const keyLower = key.toLowerCase();
            if (keyLower === "tags" || keyLower === "tag" || keyLower === "aliases") iconName = "tags";
            else if (keyLower.includes("date") || keyLower.includes("time") || keyLower === "created" || keyLower === "updated") iconName = "calendar";
            else if (keyLower === "link" || keyLower === "url") iconName = "link";
            else if (keyLower === "image" || keyLower === "cover") iconName = "image";
            
            setIcon(iconEl, iconName);

            keyContainer.createSpan({ cls: "metadata-property-key-input", text: key });

            // Value Container
            const valueEl = propertyRow.createDiv({ cls: "metadata-property-value" });
            
            const value = frontmatter[key];
            let displayValue = "";
            
            if (Array.isArray(value)) {
                // If tags, maybe render as pills? For now, list.
                displayValue = value.map(String).join(", ");
            } else if (typeof value === 'object' && value !== null) {
                displayValue = JSON.stringify(value);
            } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                displayValue = String(value);
            } else {
                displayValue = "";
            }
            
            valueEl.createSpan({ cls: "metadata-property-value-text", text: displayValue });
        }
    }

    private setupInfiniteScroll() {
        this.sentinel = this.streamContainerEl.createDiv({ cls: "daily-notes-stream-sentinel" });
        const observer = new IntersectionObserver((entries) => {
            const firstEntry = entries[0];
            if (firstEntry && firstEntry.isIntersecting) {
                this.loadMoreNotes().catch((error) => {
                    console.error("DailyNotesStream: Failed to load more notes", error);
                });
            }
        }, {
            root: this.contentEl,
            rootMargin: "100px"
        });
        
        observer.observe(this.sentinel);
        this.register(() => observer.disconnect());
    }

    async onClose() {
        // Cleanup if needed
    }
}
