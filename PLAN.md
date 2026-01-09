# Development Plan: Daily Notes Stream Plugin

## Objective
Build an Obsidian plugin that provides a read-only, infinite-scroll view of all Daily Notes, ordered chronologically (newest to oldest). This mimics the journal view found in tools like Logseq. The plugin must be fully compatible with both Desktop and Mobile versions of Obsidian.

## User Requirements
1.  **View**: Single continuous stream of daily notes.
2.  **Ordering**: Newest note at the top.
3.  **Interaction**: Initially read-only.
4.  **Rendering**: High fidelity (must support embedded files, code blocks, images, Dataview, etc.).
5.  **Tech Stack**: TypeScript, official Obsidian API patterns.
6.  **Base**: Fork/Clone of `obsidian-sample-plugin`.
7.  **Mobile Support**: Responsive design and performance optimized for mobile devices.

## Architecture

### 1. Data Layer
*   **Dependency**: `obsidian-daily-notes-interface` (Community standard for locating daily notes safely).
*   **Service**: `DailyNoteService`
    *   `getAllDailyNotes()`: Retrieve all markdown files identified as daily notes.
    *   `getSortedDailyNotes()`: Returns list sorted by date (descending).
    *   `getBatch(offset, limit)`: Returns a subset of notes for pagination.

### 2. View Layer
*   **Class**: `DailyNotesStreamView` (extends `ItemView`).
*   **Identifier**: `daily-notes-stream-view`.
*   **State**:
    *   `notes`: Array of currently loaded `TFile` objects.
    *   `offset`: Current pagination index.
*   **Components**:
    *   **Container**: Main scrollable div.
    *   **Note Block**:
        *   *Header*: Date/Title (clickable link to original file).
        *   *Body*: Rendered Markdown content.
    *   **Sentinel**: Invisible element at the bottom to trigger infinite scroll.

### 3. Rendering Engine
*   **Core**: `MarkdownRenderer.render(app, markdownContent, containerEl, sourcePath, component)`
    *   *Why*: This is the official API to ensure all Obsidian features (wikilinks, embeds, plugins) render correctly.
*   **Lifecycle**: The `component` passed to the renderer must be the `DailyNotesStreamView` instance to handle lifecycle events (loading/unloading of child components like graphs or Dataview blocks).

## Implementation Phases

### Phase 1: Scaffolding & Setup
1.  Clone `obsidianmd/obsidian-sample-plugin`. [DONE]
2.  Clean up `.git` directory to start fresh. [DONE]
3.  Update `package.json` and `manifest.json` with new plugin metadata. [DONE]
4.  Install `obsidian-daily-notes-interface`. [DONE]
5.  Initialize git repository and commit initial state. [DONE]

### Phase 2: Core Data Logic
1.  Implement `DailyNoteService` to gather all daily notes from the vault.
2.  Implement sorting logic (Newest -> Oldest).
3.  Ensure compatibility with mobile file system access via Obsidian API.

### Phase 3: The View Skeleton
1.  Create `DailyNotesStreamView.ts`.
2.  Register the view in `main.ts`.
3.  Add a Ribbon Icon and Command to "Open Daily Notes Stream".
4.  Verify an empty view opens successfully on both Desktop and Mobile.

### Phase 4: Basic Rendering
1.  Load the first 10 notes.
2.  Read their content using `app.vault.read(file)`.
3.  Render them using `MarkdownRenderer`.
4.  Add basic CSS for separation, ensuring mobile responsiveness.

### Phase 5: Infinite Scroll
1.  Implement `IntersectionObserver` in the View.
2.  Detect when the user reaches the bottom.
3.  Fetch the next batch of 10 notes.
4.  Append them to the DOM and render.

### Phase 6: Polish & Assets
1.  Verify embedded images/PDFs work.
2.  Verify internal links work.
3.  Clean up styles for both light/dark modes and mobile UI.

## Future Roadmap (Post-MVP)
*   **Editability**: Allow clicking into the view to edit text directly.
*   **Date Navigation**: A calendar or timeline sidebar to jump to specific dates.
*   **Filtering**: Show/Hide specific headers or tags.