---
paths:
    - "src/**"
    - "tests/**"
    - "e2e/**"
    - "styles.css"
---

# Architecture

Files are kebab-case, grouped by job in `src/` (docs/DECISIONS.md, D-023).

- `main.ts` — plugin lifecycle; registers view, ribbon icon, command, settings
  tab.
- `settings.ts` — settings interface, defaults, `PluginSettingTab`.
- `obsidian-internals.ts` — the only place unsupported internals are read:
  `getReadableLineLength`; the `vault` "raw" event (`onVaultConfigChange`); the
  core global-search plugin and the `search` view's `setQuery`
  (`openTagSearch`); `metadataTypeManager` (`getPropertyIcon`); `hotkeyManager`
  (`getSearchHotkeys`); a view's `titleEl` (`getViewTitle`).
- `local-storage.ts` — `saveLoggingOnce`, which every localStorage store saves
  through: a refused save is logged once, never thrown (D-071).

## `notes/`

- `daily-note-service.ts` — the vault's daily notes, nested folders
  (`YYYY/MM/YYYY-MM-DD`) included, newest-first in batches.
- `backlink-index.ts` — which notes link to each path, inverted from
  `resolvedLinks`, one per plugin; `linked-mentions.ts` finds each link's list
  item or section in them.
- `empty-notes.ts` — which daily notes hold only their template, one per plugin,
  kept in the vault's localStorage on this device, and the filter each view's
  service lists through
  ([ADR 0011](../../docs/adr/0011-hide-template-only-notes.md)).
  `template-match.ts` reads the template as a pattern; `link-changes.ts` tells
  each view which daily notes gained or lost a link, so a linked empty note
  shows.
- `parsed-dates.ts` — each path's parsed date, shared by every view's service,
  so a later open parses only what is new.
- `note-search.ts` — matches sources for search.

## `ui/`

- `stream-view.ts` — `ItemView` subclass; wires vault events and header actions
  to the stream. The hover parent Page preview hangs popovers on.
- `jump-to-date-modal.ts` — the `SuggestModal` behind the header action and the
  `jump-to-date` command; offers the dates the vault has notes for, in the
  vault's own format.
- `search-bar.ts` is the search bar; `hotkey.ts` matches the vault's binding.

## `stream/`

- `note-stream.ts` — the stream's contents: batches, vault-event updates, jumps,
  rebuilds, all through one queue.
- `stream-blocks.ts` — where blocks sit: the path→block index, placement ahead
  of the sentinel, the empty state.
- `note-window.ts` — renders a block near the viewport, empties it well past;
  owns each note's `Component`.
- `scroll-box-guard.ts` — reports Base layouts to the renderer; clips stray
  scroll boxes once still.
- `layout-memory.ts` — every note's last measured height (`note-heights.ts`) and
  which Bases were too wide, each per layout (`layout-table.ts`), kept in the
  vault's localStorage on this device
  ([ADR 0010](../../docs/adr/0010-layout-memory.md)).
- `height-hold.ts` — holds a note or a Base at an earlier height while it
  refills, until it settles.
- `stream-search.ts` steps search note to note; `stream-state.ts` is the loaded
  range; `infinite-scroll.ts` the sentinel; `scroll-position.ts` scroll places;
  `scroll-anchor.ts` scroll anchoring where the platform has none.

## `render/`

- `note-renderer.ts` — a note's markdown, properties, and the gestures on its
  title and links.
- `wide-tables.ts` — wide tables as cards; `wide-equations.ts` — wide equations
  shrunk to fit.
- `bases/` — each Base in its own placeholder, as cards when too wide.
- `collapsible.ts` — collapsible sections; `collapse-store.ts` persists their
  state.
- `search-highlights.ts` — paints CSS highlight ranges; `text-beside-blocks.ts`
  wraps bare text beside a block so WebKit paints highlights on it.
- `linked-mentions.ts` — the linked mentions footer; draws after the note and
  redraws itself on `resolved`.
