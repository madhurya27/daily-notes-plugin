# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Watch mode (esbuild, outputs main.js with inline sourcemaps)
npm run build        # Type-check then production build (minified, no sourcemaps)
npm run lint         # Run ESLint across the project
npm test             # Compile and run unit tests (outputs to tests/dist/)
```

To deploy to the test vault (`PluginTest`):
```bash
npm run build
cp main.js manifest.json styles.css PluginTest/.obsidian/plugins/daily-notes-stream/
```

## Architecture

This is an Obsidian community plugin that renders an infinite-scroll, read-only stream of all daily notes.

**Entry point**: `src/main.ts` — minimal plugin lifecycle only. Registers the view, ribbon icon, command, and settings tab.

**Core modules** (`src/`):
- `DailyNoteService.ts` — Static service. Wraps `obsidian-daily-notes-interface` to fetch all daily notes, parse dates from filenames using the user's configured format (handles nested folder formats like `YYYY/MM/YYYY-MM-DD`), and return paginated batches sorted newest-first.
- `DailyNotesStreamView.ts` — `ItemView` subclass. Owns all rendering logic: infinite scroll via `IntersectionObserver` on a sentinel element (batch size 10), live vault event handlers (`modify`/`create`/`delete`/`rename`), `MarkdownRenderer.render()` for high-fidelity note content, collapsible headers (H1–H6) and nested lists, and frontmatter properties panel.
- `settings.ts` — `DailyNotesStreamSettings` interface, defaults, and `PluginSettingTab` implementation.

**Build pipeline**: esbuild bundles `src/main.ts` → `main.js` (CJS format, `obsidian` kept external). In dev mode, esbuild runs in watch mode with inline sourcemaps. Tests use a separate esbuild invocation (`run_tests.mjs`) that substitutes `obsidian` and `obsidian-daily-notes-interface` with mocks from `tests/mocks/`.

**Test framework**: No external test runner — tests are plain TypeScript files compiled by esbuild and imported directly via Node. Test helpers (`runTest`, `assert`) are defined inline. Tests only cover `DailyNoteService`; DOM-dependent view logic requires manual testing in Obsidian.

## Key patterns

- **Infinite scroll**: A sentinel `<div>` at the bottom of `streamContainerEl` is observed by `IntersectionObserver`. When it enters the viewport, `loadMoreNotes()` fetches the next batch and inserts elements before the sentinel. The sentinel must always remain the last child.
- **Live updates**: Vault events are registered with `this.registerEvent(...)` in `onOpen`. Each handler checks whether the file is a daily note before acting. On `modify`, the existing DOM element is replaced in-place. On `create`/`rename`, the note is inserted at the correct sorted position.
- **Collapsible sections**: After `MarkdownRenderer.render()`, `makeCollapsible()` post-processes the DOM to prepend `collapse-indicator` chevron spans and attach click handlers. Header collapse hides all subsequent siblings until a same-or-higher-level heading. List collapse uses CSS via `is-collapsed` class on the `<li>`.
- **Settings refresh**: `saveSettings()` in `main.ts` calls `view.refresh()` on all open stream leaves, which re-renders existing notes while preserving scroll position using an anchor-based strategy.
- **TypeScript strictness**: `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess` are all enabled — array index access returns `T | undefined`.
