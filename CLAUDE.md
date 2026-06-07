# CLAUDE.md

## Commands

```bash
pnpm install       # install deps
pnpm run dev       # watch mode → main.js (inline sourcemaps)
pnpm run build     # type-check + production build (minified)
pnpm run lint      # ESLint
pnpm test          # vitest run (mocks in tests/mocks/, jsdom via tests/setup.ts)
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

**Build**: esbuild `src/main.ts` → `main.js` (CJS, `obsidian` external). **Tests**: Vitest with mocks for `obsidian` and `obsidian-daily-notes-interface` from `tests/mocks/` and jsdom (`tests/setup.ts`). 100% coverage required, including view logic.

## Documentation

Update docs in the same branch as the code change that makes them stale:
- `README.md` — user-facing features, install, usage.
- `TESTING.md` — manual verification checklist (mirrors current behavior).
- `DONE.md` / `TODO.md` — move items between shipped and planned as work completes.
- `AGENTS.md` — plugin-dev conventions (manifest, security, mobile); don't edit its wording — fix the code/config to match it instead.
- This file (`CLAUDE.md`) — architecture, key patterns, build/test setup.

## Key Patterns

- **Infinite scroll**: sentinel `<div>` at bottom of `streamContainerEl`; `loadMoreNotes()` inserts before it on intersection. Sentinel must always be last child.
- **Live updates**: vault events registered via `this.registerEvent(...)` in `onOpen`. `modify` replaces DOM element in-place. `create`/`delete`/`rename` route through `service.insertSorted`/`removeSorted` — single source of truth for sort order *and* keeping the service's full-note cache aligned with the view's `offset`. A note is rendered/tracked locally only when its returned global index falls within `[0, offset)`. **Invariant**: `state.notes` must always equal `service._sorted.slice(0, offset)` — breaking it desyncs `getBatch()` pagination (skipped/duplicated notes on further scroll). `rename` gets `(file, oldPath)`: Obsidian mutates `TFile` in place, so the rendered DOM's `data-source-path` (set at render time) is the *old* path — use `oldPath` for the DOM lookup, `file.path` for cache/state removal.
- **Collapsible sections**: `makeCollapsible()` post-processes rendered DOM — prepends `collapse-indicator` chevrons, attaches click handlers. Header collapse hides siblings until same-or-higher heading; list collapse uses `is-collapsed` CSS class on `<li>`.
- **Settings refresh**: `saveSettings()` calls `view.refresh()` on all open leaves; preserves scroll via anchor-based strategy.
- **TS strictness**: `strict: true` plus `noUncheckedIndexedAccess` (array index access returns `T | undefined`) and `noImplicitReturns`. Obsidian lifecycle properties assigned in `onload()` (not the constructor) need `!` definite-assignment assertions to satisfy `strictPropertyInitialization`.
