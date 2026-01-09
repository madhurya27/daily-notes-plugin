# Project Roadmap: Daily Notes Stream Plugin

## Overview
A read-only, infinite-scroll view of all Daily Notes in Obsidian, ordered chronologically (newest to oldest). Designed to work seamlessly on both Desktop and Mobile.

## Core Features
- [x] **Stream View**: Single continuous stream of daily notes.
- [x] **Chronological Order**: Newest notes appear at the top.
- [x] **Infinite Scroll**: Dynamically load more notes as the user scrolls down.
- [x] **Rich Rendering**: Full support for markdown, images, embeds, and other Obsidian features.
- [x] **Mobile Compatibility**: Responsive design and touch-friendly interactions.

## Development Tasks

### Phase 1: Setup & Scaffolding [DONE]
- [x] Clone and clean `obsidian-sample-plugin`.
- [x] Update `package.json` and `manifest.json`.
- [x] Install `obsidian-daily-notes-interface`.
- [x] Initialize Git repository.
- [x] Verify `isDesktopOnly: false` in `manifest.json`.

### Phase 2: Core Data Logic [DONE]
- [x] Implement `DailyNoteService`.
- [x] Retrieve all daily notes using `obsidian-daily-notes-interface`.
- [x] Implement sorting logic (descending by date).
- [x] Implement pagination logic (batch retrieval).

### Phase 3: View Layer (Desktop & Mobile) [DONE]
- [x] Create `DailyNotesStreamView` class.
- [x] Register view in `main.ts`.
- [x] Add Ribbon Icon and Command to open the view.
- [x] **Mobile**: Ensure the view handles mobile layout constraints.

### Phase 4: Rendering & Styling [DONE]
- [x] Implement note rendering using `MarkdownRenderer`.
- [x] Add CSS for note containers, headers, and spacing.
- [x] **Mobile**: Optimize CSS for touch targets and smaller screens.

### Phase 5: Infinite Scroll [DONE]
- [x] Implement `IntersectionObserver` to detect end of scroll.
- [x] Fetch and append next batch of notes.

### Phase 6: Polish & Verification [DONE]
- [x] Verify image/embed rendering.
- [x] Check internal link navigation.
- [x] Create `TESTING.md` with verification steps.

## Future Improvements
- [ ] **Live Updates**: Automatically detect new daily notes and insert them into the stream without reloading.
- [ ] **Editability**: Click to edit.
- [ ] **Date Navigation**: Jump to specific date.
- [ ] **Filtering**: Filter by tag/header.
