# Project Roadmap: Daily Notes Stream Plugin

## Overview
A read-only, infinite-scroll view of all Daily Notes in Obsidian, ordered chronologically (newest to oldest). Designed to work seamlessly on both Desktop and Mobile.

## Core Features
- [ ] **Stream View**: Single continuous stream of daily notes.
- [ ] **Chronological Order**: Newest notes appear at the top.
- [ ] **Infinite Scroll**: Dynamically load more notes as the user scrolls down.
- [ ] **Rich Rendering**: Full support for markdown, images, embeds, and other Obsidian features.
- [ ] **Mobile Compatibility**: Responsive design and touch-friendly interactions.

## Development Tasks

### Phase 1: Setup & Scaffolding
- [x] Clone and clean `obsidian-sample-plugin`.
- [x] Update `package.json` and `manifest.json`.
- [x] Install `obsidian-daily-notes-interface`.
- [ ] **Mobile**: Verify `isDesktopOnly: false` in `manifest.json`.

### Phase 2: Data Layer
- [ ] Implement `DailyNoteService`.
- [ ] Retrieve all daily notes using `obsidian-daily-notes-interface`.
- [ ] Implement sorting logic (descending by date).
- [ ] Implement pagination logic (batch retrieval).

### Phase 3: View Layer (Desktop & Mobile)
- [ ] Create `DailyNotesStreamView` class.
- [ ] Register view in `main.ts`.
- [ ] Add Ribbon Icon and Command to open the view.
- [ ] **Mobile**: Ensure the view handles mobile layout constraints (safe areas, narrower width).

### Phase 4: Rendering & Styling
- [ ] Implement note rendering using `MarkdownRenderer`.
- [ ] Add CSS for note containers, headers, and spacing.
- [ ] **Mobile**: Optimize CSS for touch targets and smaller screens.

### Phase 5: Infinite Scroll
- [ ] Implement `IntersectionObserver` to detect end of scroll.
- [ ] Fetch and append next batch of notes.
- [ ] **Mobile**: Tune scroll sensitivity/thresholds for touch scrolling.

### Phase 6: Polish & Verification
- [ ] Verify image/embed rendering.
- [ ] Check internal link navigation.
- [ ] **Mobile**: Test on mobile emulator or device if possible.

## Future Improvements
- [ ] **Editability**: Click to edit.
- [ ] **Date Navigation**: Jump to specific date.
- [ ] **Filtering**: Filter by tag/header.
