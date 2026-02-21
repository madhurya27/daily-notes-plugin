import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer, setIcon, TAbstractFile } from "obsidian";
import { DailyNoteService } from "./DailyNoteService";
import { getDateFromFile } from "obsidian-daily-notes-interface";
import type DailyNotesStreamPlugin from "./main";

export const VIEW_TYPE_DAILY_NOTES_STREAM = "daily-notes-stream-view";

export class DailyNotesStreamView extends ItemView {
    private notes: TFile[] = [];
    private offset: number = 0;
    private readonly BATCH_SIZE = 10;
    private streamContainerEl: HTMLElement;
    private sentinel: HTMLElement;
    private observer: IntersectionObserver | null = null;
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
                    this.app.workspace.openLinkText(linkText, sourcePath, false).catch((error) => {
                        console.error("DailyNotesStream: Failed to open link", error);
                    });
                }
            }
        });

        // Register vault events for live updates
        this.registerEvent(this.app.vault.on("modify", this.onFileModify.bind(this)));
        this.registerEvent(this.app.vault.on("create", this.onFileCreate.bind(this)));
        this.registerEvent(this.app.vault.on("delete", this.onFileDelete.bind(this)));
        this.registerEvent(this.app.vault.on("rename", this.onFileRename.bind(this)));

        // Setup sentinel and observer first so renderNote can insert before it
        // This will also trigger the initial load because the sentinel is visible
        this.setupInfiniteScroll();

        console.debug("DailyNotesStreamView: Opening view...");
    }

    onFileModify(file: TAbstractFile) {
        if (!(file instanceof TFile)) return Promise.resolve();
        
        // Check if this file is currently displayed in the stream
        const noteElement = this.findNoteElement(file);
        if (noteElement) {
            console.debug(`DailyNotesStreamView: Updating modified note: ${file.path}`);
            return this.refreshNote(file, noteElement).catch(error => {
                console.error("DailyNotesStream: Failed to refresh note", error);
            });
        }
        return Promise.resolve();
    }

    onFileCreate(file: TAbstractFile) {
        if (!(file instanceof TFile)) return Promise.resolve();

        const date = getDateFromFile(file, "day");
        if (!date) return Promise.resolve(); // Not a daily note

        // If we haven't loaded any notes yet, the infinite scroll will handle it or loadMoreNotes will
        if (this.notes.length === 0) return Promise.resolve();

        const newestNote = this.notes[0];
        const oldestNote = this.notes[this.notes.length - 1];

        if (!newestNote || !oldestNote) return Promise.resolve();
        
        const newestDate = getDateFromFile(newestNote, "day");
        const oldestDate = getDateFromFile(oldestNote, "day");

        if (!newestDate || !oldestDate) return Promise.resolve();

        // Check if the new note is newer than the newest loaded note
        if (date.isAfter(newestDate)) {
             console.debug(`DailyNotesStreamView: Prepending new daily note: ${file.path}`);
             return this.insertNote(file, 0).catch(error => {
                console.error("DailyNotesStream: Failed to insert new note", error);
             });
        } 
        // Check if it fits within the currently loaded range
        else if (date.isBefore(newestDate) && date.isAfter(oldestDate)) {
            console.debug(`DailyNotesStreamView: Inserting new daily note in stream: ${file.path}`);
            // Find insertion index
            let insertIndex = this.notes.length;
            for (let i = 0; i < this.notes.length; i++) {
                const note = this.notes[i];
                if (!note) continue;
                
                const currentNoteDate = getDateFromFile(note, "day");
                if (currentNoteDate && date.isAfter(currentNoteDate)) {
                    insertIndex = i;
                    break;
                }
            }
            return this.insertNote(file, insertIndex).catch(error => {
                console.error("DailyNotesStream: Failed to insert new note", error);
            });
        }
        return Promise.resolve();
    }

    onFileDelete(file: TAbstractFile) {
        if (!(file instanceof TFile)) return Promise.resolve();

        const index = this.notes.findIndex(n => n.path === file.path);
        if (index !== -1) {
            console.debug(`DailyNotesStreamView: Removing deleted note: ${file.path}`);
            const noteElement = this.findNoteElement(file);
            if (noteElement) {
                noteElement.remove();
            }
            this.notes.splice(index, 1);
            this.offset--;
        }
        return Promise.resolve();
    }

    onFileRename(file: TAbstractFile) {
        if (!(file instanceof TFile)) return Promise.resolve();
        
        const index = this.notes.findIndex(n => n === file);
        
        if (index !== -1) {
             const date = getDateFromFile(file, "day");
             if (!date) {
                 return this.onFileDelete(file);
             } else {
                 // Delete then re-create
                 // onFileDelete is synchronous-ish (returns resolved promise)
                 // onFileCreate returns a promise.
                 return this.onFileDelete(file).then(() => this.onFileCreate(file));
             }
        } else {
            return this.onFileCreate(file);
        }
    }

    private findNoteElement(file: TFile): HTMLElement | null {
        const selector = `.daily-note-content[data-source-path="${file.path.replace(/"/g, '\\"')}"]`;
        const contentEl = this.streamContainerEl.querySelector(selector);
        return contentEl?.closest(".daily-note-block") as HTMLElement || null;
    }

    private async refreshNote(file: TFile, oldElement: HTMLElement) {
        const newElement = await this.createNoteElement(file);
        this.streamContainerEl.insertBefore(newElement, oldElement);
        oldElement.remove();
    }

    private async insertNote(file: TFile, index: number) {
        const newElement = await this.createNoteElement(file);
        
        if (index === 0) {
             this.streamContainerEl.insertBefore(newElement, this.streamContainerEl.firstChild);
        } else if (index >= this.notes.length) {
             this.streamContainerEl.insertBefore(newElement, this.sentinel);
        } else {
            const nextNote = this.notes[index];
            const nextElement = nextNote ? this.findNoteElement(nextNote) : null;
            
            if (nextElement) {
                this.streamContainerEl.insertBefore(newElement, nextElement);
            } else {
                this.streamContainerEl.insertBefore(newElement, this.sentinel);
            }
        }
        
        this.notes.splice(index, 0, file);
        this.offset++;
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
        const noteContainer = await this.createNoteElement(file);
        // Insert before the sentinel to ensure sentinel stays at the bottom
        this.streamContainerEl.insertBefore(noteContainer, this.sentinel);
    }

    private async createNoteElement(file: TFile): Promise<HTMLElement> {
        // Create the container element manually to avoid auto-appending
        const noteContainer = document.createElement("div");
        noteContainer.addClass("daily-note-block");
        
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

            // Post-process to add collapsible behavior
            this.makeCollapsible(contentEl);
        } catch (error) {
            console.error(`Failed to render note ${file.path}:`, error);
            contentEl.setText("Error rendering note");
        }
        
        return noteContainer;
    }

    private makeCollapsible(contentEl: HTMLElement) {
        // 1. Headers
        const headers = contentEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
        headers.forEach((header: HTMLElement) => {
            header.addClass("is-collapsible");
            const indicator = document.createElement("span");
            indicator.addClass("collapse-indicator");
            setIcon(indicator, "chevron-right");
            header.prepend(indicator);

            header.onClickEvent(() => {
                header.toggleClass("is-collapsed", !header.hasClass("is-collapsed"));
                this.toggleHeaderSection(header);
            });
        });

        // 2. Lists
        const listItems = contentEl.querySelectorAll("li");
        listItems.forEach((li: HTMLElement) => {
            const subList = li.querySelector("ul, ol");
            if (subList) {
                li.addClass("is-collapsible");
                const indicator = document.createElement("span");
                indicator.addClass("collapse-indicator");
                setIcon(indicator, "chevron-right");
                // Insert before the text content of the li
                li.prepend(indicator);

                indicator.onClickEvent((e) => {
                    e.stopPropagation();
                    li.toggleClass("is-collapsed", !li.hasClass("is-collapsed"));
                });
            }
        });
    }

    private toggleHeaderSection(header: HTMLElement) {
        const isCollapsed = header.hasClass("is-collapsed");
        const level = parseInt(header.tagName.substring(1));
        let nextEl = header.nextElementSibling as HTMLElement;

        while (nextEl) {
            if (nextEl.tagName.match(/^H[1-6]$/)) {
                const nextLevel = parseInt(nextEl.tagName.substring(1));
                if (nextLevel <= level) {
                    break;
                }
            }
            
            if (nextEl) {
                nextEl.toggleClass("is-hidden", isCollapsed);
            }
            nextEl = nextEl.nextElementSibling as HTMLElement;
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
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        this.sentinel = this.streamContainerEl.createDiv({ cls: "daily-notes-stream-sentinel" });
        this.observer = new IntersectionObserver((entries) => {
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
        
        this.observer.observe(this.sentinel);
    }

    async refresh() {
        // 1. Capture current scroll position anchor
        const scrollTop = this.contentEl.scrollTop;
        let anchorFile: TFile | null = null;
        let anchorRelativeTop = 0;

        // Find the first visible note
        for (const note of this.notes) {
            const el = this.findNoteElement(note);
            if (el) {
                const elementTop = el.offsetTop;
                const elementBottom = elementTop + el.offsetHeight;
                
                // Check if this element is visible or just above the viewport
                if (elementBottom > scrollTop) {
                    anchorFile = note;
                    anchorRelativeTop = scrollTop - elementTop;
                    break;
                }
            }
        }

        // 2. Clear DOM but keep data (notes and offset)
        this.streamContainerEl.empty();

        // 3. Re-render existing notes
        for (const note of this.notes) {
             const el = await this.createNoteElement(note);
             this.streamContainerEl.appendChild(el);
        }

        // 4. Re-initialize sentinel
        this.setupInfiniteScroll();

        // 5. Restore scroll position
        if (anchorFile) {
            const newEl = this.findNoteElement(anchorFile);
            if (newEl) {
                this.contentEl.scrollTop = newEl.offsetTop + anchorRelativeTop;
            }
        } else {
             // Fallback if no anchor found (e.g. at top)
             this.contentEl.scrollTop = 0;
        }
    }

    async onClose() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
