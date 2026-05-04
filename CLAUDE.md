# CLAUDE.md

## Commands

```bash
pnpm install       # install deps
pnpm run dev       # watch mode → main.js (inline sourcemaps)
pnpm run build     # type-check + production build (minified)
pnpm run lint      # ESLint
pnpm test          # compile + run tests (→ tests/dist/)
```

Deploy to test vault:
```bash
pnpm run build && cp main.js manifest.json styles.css PluginTest/.obsidian/plugins/daily-notes-stream/
```

## Architecture

Obsidian plugin: infinite-scroll, read-only stream of all daily notes.

- `src/main.ts` — plugin lifecycle; registers view, ribbon icon, command, settings tab.
- `src/DailyNoteService.ts` — fetches/parses all daily notes via `obsidian-daily-notes-interface`, handles nested folder formats (e.g. `YYYY/MM/YYYY-MM-DD`), returns paginated batches sorted newest-first.
- `src/DailyNotesStreamView.ts` — `ItemView` subclass; infinite scroll (`IntersectionObserver`, batch 10), vault event handlers (`modify`/`create`/`delete`/`rename`), `MarkdownRenderer.render()`, collapsible headers (H1–H6) and lists, frontmatter panel.
- `src/settings.ts` — `DailyNotesStreamSettings` interface, defaults, `PluginSettingTab`.

**Build**: esbuild `src/main.ts` → `main.js` (CJS, `obsidian` external). Tests use a separate esbuild invocation (`run_tests.mjs`) with mocks for `obsidian` and `obsidian-daily-notes-interface` from `tests/mocks/`. No external test runner — plain TS files imported via Node with inline `runTest`/`assert` helpers. Tests cover `DailyNoteService` only; view logic requires manual Obsidian testing.

## Key Patterns

- **Infinite scroll**: sentinel `<div>` at bottom of `streamContainerEl`; `loadMoreNotes()` inserts before it on intersection. Sentinel must always be last child.
- **Live updates**: vault events registered via `this.registerEvent(...)` in `onOpen`. `modify` replaces DOM element in-place; `create`/`rename` inserts at correct sorted position.
- **Collapsible sections**: `makeCollapsible()` post-processes rendered DOM — prepends `collapse-indicator` chevrons, attaches click handlers. Header collapse hides siblings until same-or-higher heading; list collapse uses `is-collapsed` CSS class on `<li>`.
- **Settings refresh**: `saveSettings()` calls `view.refresh()` on all open leaves; preserves scroll via anchor-based strategy.
- **TS strictness**: `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess` — array index access returns `T | undefined`.
