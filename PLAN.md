# Development Plan: Daily Notes Stream Plugin

## Objective
Build an Obsidian plugin that provides a read-only, infinite-scroll view of all Daily Notes, ordered chronologically (newest to oldest). This mimics the journal view found in tools like Logseq. The plugin must be fully compatible with both Desktop and Mobile versions of Obsidian.

## User Requirements
1.  **View**: Single continuous stream of daily notes.
2.  **Ordering**: Newest note at the top.
3.  **Interaction**: Initially read-only.
4.  **Rendering**: High fidelity (must support embedded files, code blocks, images, Dataview, etc.).
5.  **Properties**: Option to display and collapse frontmatter metadata.
6.  **Tech Stack**: TypeScript, official Obsidian API patterns.
7.  **Base**: Fork/Clone of `obsidian-sample-plugin`.
8.  **Mobile Support**: Responsive design and performance optimized for mobile devices.

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
    *   `isLoading`: Flag to prevent concurrent batch loads.
*   **Components**:
    *   **Container**: Main scrollable div.
    *   **Note Block**:
        *   *Header*: Date/Title (clickable link to original file).
        *   *Properties*: Collapsible metadata container (native-styled).
        *   *Body*: Rendered Markdown content (frontmatter stripped).
    *   **Sentinel**: Invisible element at the bottom to trigger infinite scroll.

### 3. Rendering Engine
*   **Core**: `MarkdownRenderer.render(app, markdownContent, containerEl, sourcePath, component)`
    *   *Why*: This is the official API to ensure all Obsidian features (wikilinks, embeds, plugins) render correctly.
*   **Lifecycle**: The `component` passed to the renderer must be the `DailyNotesStreamView` instance to handle lifecycle events (loading/unloading of child components like graphs or Dataview blocks).

## Implementation Phases

### Phase 1: Scaffolding & Setup [DONE]
1.  Clone `obsidianmd/obsidian-sample-plugin`.
2.  Clean up `.git` directory to start fresh.
3.  Update `package.json` and `manifest.json` with new plugin metadata.
4.  Install `obsidian-daily-notes-interface`.
5.  Initialize git repository and commit initial state.

### Phase 2: Core Data Logic [DONE]
1.  Implement `DailyNoteService` to gather all daily notes from the vault.
2.  Implement sorting logic (Newest -> Oldest).
3.  Ensure compatibility with mobile file system access via Obsidian API.
4.  Ensure `DailyNoteService` handles nested folder paths (e.g. `YYYY/MM/YYYY-MM-DD.md`) correctly during date parsing.

### Phase 3: The View Skeleton [DONE]
1.  Create `DailyNotesStreamView.ts`.
2.  Register the view in `main.ts`.
3.  Add a Ribbon Icon and Command to "Open Daily Notes Stream".
4.  Verify an empty view opens successfully on both Desktop and Mobile.

### Phase 4: Basic Rendering [DONE]
1.  Load the first 10 notes.
2.  Read their content using `app.vault.read(file)`.
3.  Render them using `MarkdownRenderer`.
4.  Add basic CSS for separation, ensuring mobile responsiveness.

### Phase 5: Infinite Scroll & Polish [DONE]
1.  Implement `IntersectionObserver` in the View.
2.  Detect when the user reaches the bottom.
3.  Fetch the next batch of 10 notes.
4.  Fix race conditions/duplicates using `isLoading` flag.
5.  Append them to the DOM and render.

### Phase 6: Metadata Properties [DONE]
1.  Add settings for `showProperties` and `propertiesCollapsed`.
2.  Implement native-styled metadata container.
3.  Add collapsible header for properties section.
4.  Strip frontmatter from markdown body to avoid duplication.

### Phase 7: Polish & Verification [DONE]
1.  Verify image/embed rendering.
2.  Check internal link navigation.
3.  Create `TESTING.md` with verification steps.
4.  **Nested Folders**: Ensure parsing logic handles `YYYY/MM/` structure.
5.  **Automated Testing**: Implement unit tests for `DailyNoteService`.

### Phase 8: Live Updates [DONE]
1.  **Live Updates**: Automatically detect new daily notes and insert them into the stream without reloading.

## Future Roadmap (Post-MVP)
*   **Editability**: Allow clicking into the view to edit text directly.
*   **Date Navigation**: A calendar or timeline sidebar to jump to specific dates.
*   **Filtering**: Show/Hide specific headers or tags.
