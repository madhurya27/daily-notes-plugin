import { DailyNotesStreamView } from "../src/DailyNotesStreamView";
import { TFile, WorkspaceLeaf, ItemView } from "./mocks/obsidian"; // Use local mocks
import { __setMockNotes, __setMockSettings } from "./mocks/daily-notes-interface";

// Mock global document and window for View
if (!global.document) {
    (global as any).document = {
        createElement: (tag: string) => {
            const createMockEl = (tagName: string = "div") => ({
                tagName: tagName.toUpperCase(),
                addClass: () => {},
                hasClass: () => false,
                toggleClass: () => {},
                createDiv: (params?: any) => createMockEl("div"),
                createEl: (tag: string, params?: any) => createMockEl(tag),
                createSpan: (params?: any) => createMockEl("span"),
                appendChild: () => {},
                insertBefore: () => {},
                removeChild: () => {},
                remove: () => {},
                onClickEvent: () => {},
                prepend: () => {},
                setText: () => {},
                closest: () => null,
                dataset: {},
                style: {},
                querySelector: () => null,
                querySelectorAll: () => [],
                children: [],
                nextElementSibling: null
            });
            return createMockEl(tag);
        }
    };
}
if (!global.IntersectionObserver) {
    (global as any).IntersectionObserver = class {
        observe() {}
        disconnect() {}
    };
}

function runTest(name: string, fn: () => Promise<void> | void) {
    Promise.resolve(fn()).then(() => {
        console.log(`PASS: ${name}`);
    }).catch(e => {
        console.error(`FAIL: ${name}`);
        console.error(e);
        process.exit(1);
    });
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(message);
    }
}

console.log("Starting DailyNotesStreamView Tests...");

// Mock App
class MockApp {
    vault = {
        on: () => {},
        read: () => Promise.resolve("Mock content"),
    };
    workspace = {
        openLinkText: () => Promise.resolve(),
        getLeaf: () => ({ openFile: () => Promise.resolve() })
    };
    metadataCache = {
        getFileCache: () => ({ frontmatter: {} })
    };
}

const mockPlugin = {
    settings: {
        showProperties: false,
        propertiesCollapsed: false
    }
} as any;

runTest("Should handle file creation (prepend new note)", async () => {
    __setMockSettings({ format: "YYYY-MM-DD" });
    const app = new MockApp();
    const leaf = new WorkspaceLeaf(app);
    const view = new DailyNotesStreamView(leaf, mockPlugin);
    
    // Simulate open
    await view.onOpen();
    
    // Manually set initial notes
    const note1 = new TFile("Notes/2025-01-01.md");
    (view as any).notes = [note1];
    
    // Test creating a newer note
    const newNote = new TFile("Notes/2025-01-02.md");
    await view.onFileCreate(newNote);
    
    const notes = (view as any).notes;
    assert(notes.length === 2, "Should have 2 notes now");
    assert(notes[0].basename === "2025-01-02", "New note should be first");
});

runTest("Should handle file creation (insert middle)", async () => {
    __setMockSettings({ format: "YYYY-MM-DD" });
    const app = new MockApp();
    const leaf = new WorkspaceLeaf(app);
    const view = new DailyNotesStreamView(leaf, mockPlugin);
    
    await view.onOpen();
    
    // Initial: 2025-01-03, 2025-01-01
    const note1 = new TFile("Notes/2025-01-03.md");
    const note2 = new TFile("Notes/2025-01-01.md");
    (view as any).notes = [note1, note2];
    
    // Insert 2025-01-02
    const newNote = new TFile("Notes/2025-01-02.md");
    await view.onFileCreate(newNote);
    
    const notes = (view as any).notes;
    assert(notes.length === 3, "Should have 3 notes");
    assert(notes[1].basename === "2025-01-02", "New note should be second");
});

runTest("Should handle file deletion", async () => {
    __setMockSettings({ format: "YYYY-MM-DD" });
    const app = new MockApp();
    const leaf = new WorkspaceLeaf(app);
    const view = new DailyNotesStreamView(leaf, mockPlugin);
    
    await view.onOpen();
    
    const note1 = new TFile("Notes/2025-01-01.md");
    (view as any).notes = [note1];
    
    await view.onFileDelete(note1);
    
    const notes = (view as any).notes;
    assert(notes.length === 0, "Should have 0 notes");
});

runTest("Should ignore non-daily notes", async () => {
    __setMockSettings({ format: "YYYY-MM-DD" });
    const app = new MockApp();
    const leaf = new WorkspaceLeaf(app);
    const view = new DailyNotesStreamView(leaf, mockPlugin);
    
    await view.onOpen();
    
    const note1 = new TFile("Notes/2025-01-01.md");
    (view as any).notes = [note1];
    
    const randomFile = new TFile("Notes/Template.md");
    await view.onFileCreate(randomFile);
    
    const notes = (view as any).notes;
    assert(notes.length === 1, "Should still have 1 note");
});

runTest("Should refresh view correctly (preserve state)", async () => {
    const app = new MockApp();
    const leaf = new WorkspaceLeaf(app);
    const view = new DailyNotesStreamView(leaf, mockPlugin);
    
    await view.onOpen();
    
    // Inject scrollTop into contentEl
    (view.contentEl as any).scrollTop = 100;

    const note1 = new TFile("Notes/2025-01-01.md");
    (view as any).notes = [note1];
    (view as any).offset = 1;
    
    let containerEmptied = false;
    (view as any).streamContainerEl.empty = () => { containerEmptied = true; };
    
    // Mock findNoteElement to return an element with offset properties
    (view as any).findNoteElement = (file: TFile) => {
        return {
            offsetTop: 50,
            offsetHeight: 100,
            closest: () => ({ remove: () => {} })
        };
    };

    await view.refresh();
    
    assert(containerEmptied === true, "Container should be emptied");
    assert((view as any).notes.length === 1, "Notes should be preserved");
    assert((view as any).offset === 1, "Offset should be preserved");
    assert((view.contentEl as any).scrollTop === 100, "Scroll position should be restored");
});
