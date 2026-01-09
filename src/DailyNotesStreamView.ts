import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer } from "obsidian";
import { DailyNoteService } from "./DailyNoteService";

export const VIEW_TYPE_DAILY_NOTES_STREAM = "daily-notes-stream-view";

export class DailyNotesStreamView extends ItemView {
    private notes: TFile[] = [];
    private offset: number = 0;
    private readonly BATCH_SIZE = 10;
    private streamContainerEl: HTMLElement;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_DAILY_NOTES_STREAM;
    }

    getDisplayText(): string {
        return "Daily Notes Stream";
    }

    getIcon(): string {
        return "calendar-days";
    }

    async onOpen() {
        this.streamContainerEl = this.contentEl.createDiv({ cls: "daily-notes-stream-container" });
        this.offset = 0;
        this.notes = [];
        await this.loadMoreNotes();
        
        this.setupInfiniteScroll();
    }

    async loadMoreNotes() {
        const newBatch = DailyNoteService.getBatch(this.offset, this.BATCH_SIZE);
        if (newBatch.length === 0) return;

        for (const file of newBatch) {
            await this.renderNote(file);
        }

        this.offset += newBatch.length;
        this.notes.push(...newBatch);
    }

    async renderNote(file: TFile) {
        const noteContainer = this.streamContainerEl.createDiv({ cls: "daily-note-block" });
        
        // Header
        const header = noteContainer.createDiv({ cls: "daily-note-header" });
        const dateLink = header.createEl("a", { 
            text: file.basename,
            cls: "daily-note-title"
        });
        dateLink.onClickEvent(() => {
            this.app.workspace.getLeaf(false).openFile(file);
        });

        // Content
        const contentEl = noteContainer.createDiv({ cls: "daily-note-content" });
        const markdown = await this.app.vault.read(file);
        
        // Use MarkdownRenderer for high-fidelity rendering
        await MarkdownRenderer.render(
            this.app,
            markdown,
            contentEl,
            file.path,
            this
        );
    }

    private setupInfiniteScroll() {
        const sentinel = this.streamContainerEl.createDiv({ cls: "daily-notes-stream-sentinel" });
        const observer = new IntersectionObserver((entries) => {
            const firstEntry = entries[0];
            if (firstEntry && firstEntry.isIntersecting) {
                this.loadMoreNotes();
            }
        }, {
            root: this.contentEl,
            rootMargin: "100px"
        });
        
        observer.observe(sentinel);
        this.register(() => observer.disconnect());
    }

    async onClose() {
        // Cleanup if needed
    }
}