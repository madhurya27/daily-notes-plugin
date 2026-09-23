# CLAUDE.md

## Commands

```bash
pnpm install       # install deps
pnpm run dev       # watch mode → main.js
pnpm run build     # type-check + production build
pnpm run lint      # ESLint
pnpm run format    # Prettier (--write); format:check verifies. Prose (*.md) is ignored — hand-wrapped.
pnpm test          # typecheck tests/ (tests/tsconfig.json), then vitest run
pnpm run test:coverage  # the same, 100% coverage required
pnpm run test:e2e  # build + typecheck e2e + playwright against real Obsidian
pnpm run test:memory    # e2e/memory.spec.ts against a seeded three-year vault (E2E_SEED_DAYS)

pnpm run build && pnpm run seed   # write PluginTest/ (gitignored) and install the build into it
pnpm run open                     # launch Obsidian on it; --help lists the flags
pnpm run dev:vault                # link the build into PluginTest/, watch it, reload the plugin on save
pnpm run reload                   # reload the plugin in the open window, once

CAPTURE_SCREENSHOTS=1 E2E_SHOW_WINDOW=1 pnpm run test:e2e screenshots.spec.ts  # rewrite docs/images/
```

Screenshots need both variables: without `E2E_SHOW_WINDOW` the window is hidden, produces no frames, and
`page.screenshot()` waits until the test times out.

## Architecture

Obsidian plugin: infinite-scroll, read-only stream of all daily notes.

Files are kebab-case, grouped by job in `src/` (docs/decisions.md, 2026-09-23).

- `main.ts` — plugin lifecycle; registers view, ribbon icon, command, settings tab.
- `settings.ts` — settings interface, defaults, `PluginSettingTab`.
- `obsidian-internals.ts` — the single place unsupported internals are read (`getReadableLineLength`, the
  `vault` "raw" event behind `onVaultConfigChange`, the core global-search plugin and the `search` view's
  `setQuery` behind `openTagSearch`, `metadataTypeManager` behind `getPropertyIcon`, `hotkeyManager` behind
  `getSearchHotkeys`).
- `notes/daily-note-service.ts` — picks the daily notes out of the vault's markdown files, by the format
  `obsidian-daily-notes-interface` reads, nested folders (`YYYY/MM/YYYY-MM-DD`) included; returns batches
  sorted newest-first.
- `ui/stream-view.ts` — `ItemView` subclass; wires vault events, links and header actions to the stream.
- `ui/jump-to-date-modal.ts` — the `SuggestModal` behind the header action and the `jump-to-date` command;
  offers the dates the vault has notes for, in the vault's own format.
- Search: `notes/note-search.ts` matches sources, `stream/stream-search.ts` steps note to note,
  `render/search-highlights.ts` paints CSS highlight ranges, `ui/search-bar.ts` is the bar, `ui/hotkey.ts`
  matches the vault's binding.
- `stream/note-stream.ts` — the stream's contents: batches, vault-event updates, jumps, rebuilds, all through
  one queue.
- `stream/stream-blocks.ts` — where blocks sit: the path→block index, placement ahead of the sentinel, the
  empty state.
- `stream/note-window.ts` — renders a block near the viewport, empties it well past; owns each note's
  `Component`.
- `stream/` also holds the loaded range (`stream-state.ts`), the sentinel (`infinite-scroll.ts`) and scroll
  anchoring (`scroll-position.ts`).
- `render/` — a note's markdown and properties (`note-renderer.ts`), collapsible sections (`collapsible.ts`)
  and their persisted state (`collapse-store.ts`).

Build: esbuild → `main.js` (CJS, `obsidian` external). Unit tests: Vitest + jsdom, mocking `obsidian` and
`obsidian-daily-notes-interface` from `tests/mocks/`. Tests typecheck against the mocks, which take their
signatures from the real API (docs/decisions.md, 2026-09-23).

**The test split is a contract** ([ADR 0002](docs/adr/0002-real-obsidian-e2e.md)): jsdom loads no stylesheet, so
a visibility assertion there proves nothing. Anything about real rendering, real events, or what is visible on
screen belongs in `e2e/`, which drives the installed app against a throwaway vault. Every spec runs twice,
desktop and mobile.

**Look at a UI change before handing it over.** Screenshot it from the e2e harness, desktop and mobile, and
inspect the image: measurements prove a rule was matched, not that the result looks right.

## Invariants

Traps that span files, so no single file's comments can hold them.

- **`state.notes` always equals `service._sorted.slice(0, state.length)`.** Breaking it desyncs `getBatch()`
  pagination — notes skipped or duplicated on further scroll. `create`/`delete`/`rename` must route through
  `service.insertSorted`/`removeSorted`, and a note is rendered only when its global index falls in
  `[0, offset)`.
- **`rename` gets `(file, oldPath)`.** Obsidian mutates `TFile` in place, so the DOM's `data-source-path` is the
  *old* path: look the element up by `oldPath`, remove from cache and state by `file.path`.
- **Re-render is driven by `metadataCache.on("changed")`, not `vault.on("modify")`** — the cache lags the write,
  and the renderer reads the cache.
- **A block may hold no content.** Only notes near the viewport are rendered ([ADR 0006](docs/adr/0006-unload-off-screen-notes.md));
  everything else is an empty `.daily-note-block` reserving its height. Never assume a block's children exist,
  and never key anything off them — `data-source-path` is on the block, and `StreamBlocks`' path→block index is the
  only lookup.
- **Delegated listeners**: chevrons and note titles are rebuilt on every re-render, so nothing binds a
  listener per element — `CollapsibleManager.delegate()` and `NoteRenderer.delegate()` register one listener
  each on the stream container, resolving the target through a `WeakMap`. Binding per element would pile
  registrations on the view until it closes.
- **TS strictness**: `noUncheckedIndexedAccess` (indexing returns `T | undefined`) and `noImplicitReturns`.
  Lifecycle properties assigned in `onload()` need `!` assertions.

## Release

Tag must equal the manifest version exactly, no leading `v`; `pnpm version` writes every file through
`version-bump.mjs`. The workflow gates on format, lint and coverage before drafting the release.
`tests/release-workflow.test.ts` guards its shape.

## Documentation

Update docs in the same branch as the change that makes them stale:

- `docs/adr/` — one numbered record per non-obvious decision. Rationale and rejected options live *only* here; everything else links to it.
- `docs/decisions.md` — smaller design decisions: decision, why, rejected. Bigger ones are an ADR.
- `README.md` — user-facing features, install, usage.
- `docs/TESTING.md` — manual verification checklist.
- `docs/DONE.md` / `docs/TODO.md` — move items as work completes.
- `AGENTS.md` — the sample plugin's copy, verbatim; don't edit its wording, fix the code to match it. Its npm
  commands are the exception: this repo uses pnpm.
- This file — commands, architecture, invariants.
