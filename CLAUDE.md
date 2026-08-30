# CLAUDE.md

## Commands

```bash
pnpm install       # install deps
pnpm run dev       # watch mode → main.js (inline sourcemaps)
pnpm run build     # type-check + production build (minified)
pnpm run lint      # ESLint
pnpm run format    # Prettier (--write); format:check verifies. Prose (*.md) is hand-wrapped, so it is ignored.
pnpm test          # vitest run (mocks in tests/mocks/, jsdom via tests/setup.ts)
pnpm run test:coverage  # vitest run --coverage (100% required)
pnpm run test:e2e  # build + typecheck e2e + playwright against real Obsidian
```

Seed and deploy to the local test vault:
```bash
pnpm run build && pnpm run seed   # writes PluginTest/ (gitignored) and installs the build into it
```
`scripts/seed-test-vault.mjs` rewrites the notes `docs/TESTING.md`'s checklist names but leaves an existing `.obsidian` alone, so a vault you have opened keeps its settings. Takes an optional target path.

## Architecture

Obsidian plugin: infinite-scroll, read-only stream of all daily notes.

- `src/main.ts` — plugin lifecycle; registers view, ribbon icon, command, settings tab.
- `src/DailyNoteService.ts` — fetches/parses all daily notes via `obsidian-daily-notes-interface`, handles nested folder formats (e.g. `YYYY/MM/YYYY-MM-DD`), returns paginated batches sorted newest-first.
- `src/DailyNotesStreamView.ts` — `ItemView` subclass; infinite scroll (`IntersectionObserver`, batch 10), vault event handlers (`modify`/`create`/`delete`/`rename`), `MarkdownRenderer.render()`, collapsible headers (H1–H6) and lists, frontmatter panel.
- `src/obsidianInternals.ts` — the single place unsupported Obsidian internals are read (`getReadableLineLength`, which has no public API).
- `src/settings.ts` — `DailyNotesStreamSettings` interface, defaults, `PluginSettingTab`.

**E2E**: `e2e/` drives the *real* Obsidian app. `e2e/obsidian.ts` seeds a throwaway vault (14 daily notes + the built plugin), launches the installed Obsidian with its own `--user-data-dir` and `--remote-debugging-port`, and attaches Playwright over CDP — so the user's real vault and config are never touched. It answers the first-run trust prompt, enables the plugin through `app.plugins`, and closes the settings pane (an open modal keeps the leaf deferred, and a deferred view never renders). Tests share one instance and open a fresh view each via `openStream()`. The window is kept off the desktop and never takes focus: `open -n -g -j` stops LaunchServices activating the app, but Obsidian shows and focuses its own window twice while starting (first paint, then vault open), so the fixture seeds the vault's window bounds to Obsidian's 300x200 minimum parked in a screen corner (bounds fully off the screen are rejected outright, and the renderer is told over CDP to lay out at 1024x800 anyway) and `watchAndHide()` arms a bounded System Events loop *before* the window paints — it hides the window within ~50ms and hands focus back to whichever app had it, until startup ends and `hideApp()` settles the final state (macOS clamps offscreen window bounds back onto a display, and Electron leaves `document.visibilityState` at `"visible"` while hidden, so macOS is the only authority — `obsidian.isHidden()` and `isFrontmost()` ask it). Set `E2E_SHOW_WINDOW=1` to watch a run instead. Every instance is torn down even when startup throws, and `global-setup.ts` kills anything a crashed run stranded. Unit tests mock the `obsidian` module; only these exercise real `MarkdownRenderer` output, real `moment` parsing, and real vault events.

**Build**: esbuild `src/main.ts` → `main.js` (CJS, `obsidian` external). **Tests**: Vitest with mocks for `obsidian` and `obsidian-daily-notes-interface` from `tests/mocks/` and jsdom (`tests/setup.ts`). 100% coverage required, including view logic.

**Release**: `.github/workflows/release.yml` fires on a pushed tag matching the manifest version exactly (no leading `v` — `pnpm version` writes both files through `version-bump.mjs`). It verifies tag against manifest, installs from the frozen lockfile, runs format/lint/tests, builds, and drafts a GitHub release with `main.js`, `manifest.json` and `styles.css` attached individually. Actions are pinned to full commit SHAs; checkout does not persist credentials, and pnpm's version comes from `package.json#packageManager` (the setup action passes no version input — without the field the job fails).

## Documentation

Update docs in the same branch as the code change that makes them stale:
- `README.md` — user-facing features, install, usage.
- `docs/TESTING.md` — manual verification checklist (mirrors current behavior).
- `docs/DONE.md` / `docs/TODO.md` — move items between shipped and planned as work completes.
- `AGENTS.md` — plugin-dev conventions (manifest, security, mobile); don't edit its wording — fix the code/config to match it instead.
- This file (`CLAUDE.md`) — architecture, key patterns, build/test setup.

## Key Patterns

- **Infinite scroll**: sentinel `<div>` at bottom of `streamContainerEl`; `loadMoreNotes()` inserts before it on intersection. Sentinel must always be last child. `IntersectionObserver` fires only on intersection *changes*, so `scroll.recheck()` re-observes after non-empty batches and out-of-range creates — never on an empty batch (loops).
- **Live updates**: vault events registered via `this.registerEvent(...)` in `onOpen`. Re-render is driven by `metadataCache.on("changed")`, not `vault.on("modify")` — the cache lags the write and the renderer reads it; it replaces the DOM element in-place. `create`/`delete`/`rename` route through `service.insertSorted`/`removeSorted` — single source of truth for sort order *and* keeping the service's full-note cache aligned with the view's loaded range (`state.length`). A note is rendered/tracked locally only when its returned global index falls within `[0, offset)`. **Invariant**: `state.notes` must always equal `service._sorted.slice(0, state.length)` — breaking it desyncs `getBatch()` pagination (skipped/duplicated notes on further scroll). `rename` gets `(file, oldPath)`: Obsidian mutates `TFile` in place, so the rendered DOM's `data-source-path` (set at render time) is the *old* path — use `oldPath` for the DOM lookup, `file.path` for cache/state removal.
- **Collapsible sections**: `CollapsibleManager.attachCollapseToggle()` is the single wiring point for every chevron — headers, list items, and the properties panel (which also toggles from its whole heading row and persists under the reserved key `:properties`, defaulting to `settings.propertiesCollapsed`). It prepends the `collapse-indicator` chevron and binds the toggle to the chevron only (headers and lists alike), so links and text selection inside a heading still work. It applies stored state only when collapsed: the rendered DOM starts expanded, and an expand pass would reveal content hidden by a collapsed ancestor. Header collapse hides siblings until same-or-higher heading, and expanding skips over nested `is-collapsed` sections so their content stays hidden; list collapse uses `is-collapsed` CSS class on `<li>`. Stored state is keyed by slugified text, so repeats within a note are suffixed (`slug`, `slug-2`) — the first occurrence keeps the bare key and existing saved state.
- **Mutation queue**: `loadMoreNotes`, the vault-event handlers, and `refresh` all mutate state + DOM across awaits, so each runs through `enqueue()` — a promise chain that serializes them. Without it a delete arriving mid-batch is re-added by the batch's `state.reset`. `loadPending` (set synchronously) keeps a visible sentinel from queueing duplicate loads.
- **Settings refresh**: `saveSettings()` calls `view.refresh()` on all open leaves; preserves scroll via anchor-based strategy.
- **TS strictness**: `strict: true` plus `noUncheckedIndexedAccess` (array index access returns `T | undefined`) and `noImplicitReturns`. Obsidian lifecycle properties assigned in `onload()` (not the constructor) need `!` definite-assignment assertions to satisfy `strictPropertyInitialization`.
