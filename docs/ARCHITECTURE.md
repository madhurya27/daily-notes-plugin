# Architecture

An Obsidian plugin that shows every daily note, newest first, as one read-only
infinite scroll. Invariants that span files are in
[CLAUDE.md](../CLAUDE.md#invariants); rationale is in [adr/](adr/) and
[DECISIONS.md](DECISIONS.md).

## Layers

```
main.ts               plugin: shared indexes and stores, one per plugin
└─ ui/stream-view     one per open tab: Obsidian events → the stream
   ├─ notes/          which files are daily notes, in what order, which hidden
   ├─ stream/         what is loaded, where blocks sit, what is rendered, scroll
   └─ render/         one note's DOM: markdown, properties, Bases, footer
```

`stream/` knows notes as `TFile`s and hands a block to `render/` to fill. The
one crossing back is Bases: `render/bases/` shares the height hold and layout
memory with `stream/`, which in turn finds Base placeholders by their class.

## Ownership

| Per plugin, shared by views                            | Per view                                     |
| ------------------------------------------------------ | -------------------------------------------- |
| `ParsedDates`: each path's parsed date                 | `DailyNoteService`: the sorted list, a cache |
| `BacklinkIndex`: inverted `resolvedLinks`              | `NoteStream` and its window, blocks, state   |
| `EmptyNotes`: template-only verdicts                   | `NoteRenderer`, `CollapsibleManager`         |
| `LinkChanges`: which daily notes gained or lost a link | `StreamSearch`, `SearchBar`                  |
| `LayoutMemory`: measured heights, too-wide Bases       |                                              |
| `CollapsibleStateStore`: collapsed sections            |                                              |

The plugin registers its `vault`/`metadataCache` listeners before any view
opens, so a view's own handler always reads an index already updated.

## Flow

1. **Open.** The view awaits `service.initialize()`, which lists the vault's
   daily notes through the empty-notes filter
   ([ADR 0011](adr/0011-hide-template-only-notes.md)), then `stream.open()`.
2. **Load.** A sentinel after the last block (`infinite-scroll.ts`) comes into
   view; `NoteStream` appends the next batch of 10 as empty blocks.
3. **Render.** `NoteWindowManager` renders blocks within a margin of the
   viewport and empties them well past it, keeping their height
   ([ADR 0006](adr/0006-unload-off-screen-notes.md)). Each rendered note owns a
   child `Component`, discarded on unload.
4. **Change.** Vault and metadata events become `NoteStream` mutations: insert,
   remove, re-render, reconsider whether a note is hidden. Saves are debounced
   per path. An open search re-reads after each.

Every mutation of the stream — batches, events, renders, jumps, rebuilds — runs
through one promise queue, so none interleaves at an `await`
([ADR 0004](adr/0004-serialize-view-mutations.md)).

## Rendering

- A note renders through Obsidian's `MarkdownRenderer` into
  `.markdown-rendered`, re-rendering on `metadataCache` "changed"
  ([ADR 0003](adr/0003-metadata-cache-rerender.md)).
- Gestures on titles, links and chevrons are delegated: one listener per gesture
  on the stream container.
- Wide content: tables become cards, equations shrink, and each Base draws in
  its own placeholder, as cards when too wide (D-033).
- On mobile nothing inside a note scrolls: `ScrollBoxGuard` clips stray scroll
  boxes ([ADR 0008](adr/0008-nothing-scrolls-on-mobile.md)). Desktop keeps
  Obsidian's scroll boxes.

## Scroll position

Heights change constantly: a placeholder guess becomes a real note, a Base fills
in, an image loads. Three mechanisms keep the reader's place.

- `LayoutMemory` remembers each note's measured height per layout, across
  sessions, so placeholders start at the right size
  ([ADR 0010](adr/0010-layout-memory.md)).
- `HeightHold` holds a note or Base at its earlier height while it refills.
- `ScrollAnchor` undoes shifts above the reader where the platform does not:
  Chromium anchors natively, iOS WebKit does not.

Jumps, search steps and Back (`getEphemeralState`) go through `scrollIntoPlace`,
which re-applies the scroll until the stream stops rendering.

## Persistence

| What                 | Where                          | Why there                  |
| -------------------- | ------------------------------ | -------------------------- |
| Settings             | plugin data (`data.json`)      | syncs with the vault       |
| Heights, Base widths | vault localStorage, per device | device-specific (ADR 0010) |
| Empty-note verdicts  | vault localStorage, per device | a cache (ADR 0011)         |
| Collapsed sections   | vault localStorage             | `collapse-store.ts`        |

Every localStorage store saves through `saveLoggingOnce` (D-071).

## Obsidian internals

Unsupported APIs are read only in `obsidian-internals.ts`: readable line length,
the vault config "raw" event, global search's `setQuery`, property icons,
hotkeys, a view's title element.

## Files

Kebab-case, grouped by job (D-023).

| File                                         | Holds                                                              |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `main.ts`                                    | lifecycle; registers view, ribbon, commands, settings tab          |
| `settings.ts`                                | settings, defaults, `PluginSettingTab`                             |
| `local-storage.ts`                           | `saveLoggingOnce`: a refused save is logged once, never thrown     |
| `notes/daily-note-service.ts`                | daily notes, nested folders included, newest first, in batches     |
| `notes/parsed-dates.ts`                      | parsed dates shared by views: a later open parses only what is new |
| `notes/empty-notes.ts`                       | template-only verdicts; `hideEmptyNotes`, the filter               |
| `notes/template-match.ts`                    | the template read as a pattern                                     |
| `notes/link-changes.ts`                      | tells views which daily notes gained or lost a link                |
| `notes/backlink-index.ts`                    | which notes link to each path                                      |
| `notes/linked-mentions.ts`                   | each link's list item or section in the linking note               |
| `notes/note-search.ts`                       | notes whose title or source match a query                          |
| `ui/stream-view.ts`                          | the `ItemView`; hover parent for Page preview popovers             |
| `ui/jump-to-date-modal.ts`                   | `SuggestModal` of the vault's note dates, in its own format        |
| `ui/search-bar.ts`, `ui/hotkey.ts`           | the search bar; matches the vault's "Search current file" binding  |
| `stream/note-stream.ts`                      | the queue and every mutation                                       |
| `stream/stream-state.ts`                     | the loaded range                                                   |
| `stream/stream-blocks.ts`                    | path→block index, placement ahead of the sentinel, empty state     |
| `stream/infinite-scroll.ts`                  | the sentinel                                                       |
| `stream/note-window.ts`                      | renders near the viewport, empties past it                         |
| `stream/height-hold.ts`                      | holds a refilling note or Base at its height                       |
| `stream/layout-memory.ts`                    | `note-heights.ts` and `layout-table.ts`, per layout                |
| `stream/scroll-position.ts`                  | places for Back; `scrollIntoPlace`, `keepInPlace`                  |
| `stream/scroll-anchor.ts`                    | scroll anchoring where the platform has none                       |
| `stream/scroll-box-guard.ts`                 | reports Base layouts; clips stray scroll boxes on mobile           |
| `stream/stream-search.ts`                    | steps a search note to note                                        |
| `render/note-renderer.ts`                    | markdown, properties, title and link gestures                      |
| `render/bases/`                              | each Base in its placeholder, table or cards                       |
| `render/wide-tables.ts`, `wide-equations.ts` | wide tables as cards; wide equations shrunk                        |
| `render/collapsible.ts`, `collapse-store.ts` | collapsible sections; their saved state                            |
| `render/search-highlights.ts`                | CSS highlight ranges                                               |
| `render/text-beside-blocks.ts`               | wraps bare text beside a block so WebKit paints highlights on it   |
| `render/linked-mentions.ts`                  | the footer; draws after the note, redraws on `resolved`            |
