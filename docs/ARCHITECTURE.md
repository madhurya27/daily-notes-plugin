# Architecture

An Obsidian plugin that shows every daily note, newest first, as one read-only
infinite scroll. Invariants that span files are in
[CLAUDE.md](../CLAUDE.md#invariants); rationale is in [adr/](adr/) and
[DECISIONS.md](DECISIONS.md). Files are kebab-case, grouped by job (D-023).

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

Per plugin, shared by views:

- `ParsedDates` — each path's date, so a later open parses only what is new.
- `BacklinkIndex` — inverted `resolvedLinks`.
- `EmptyNotes` — template-only verdicts; `template-match.ts` reads the template
  as a pattern.
- `LinkChanges` — which daily notes gained or lost a link.
- `LayoutMemory` — heights (`note-heights.ts`), too-wide Bases
  (`layout-table.ts`) and the template's height, per layout.
- `CollapsibleStateStore` — collapsed sections.

Per view: `DailyNoteService` (daily notes, nested folders included, newest
first), `NoteStream` with its window, blocks and state, `NoteRenderer`,
`CollapsibleManager`, `StreamSearch`, `SearchBar`.

The plugin registers its `vault`/`metadataCache` listeners before any view
opens, so a view's own handler always reads an index already updated.

## Flow

1. **Open.** The view awaits `service.initialize()`, which lists the vault's
   daily notes through the empty-notes filter
   ([ADR 0011](adr/0011-hide-template-only-notes.md)), then `stream.open()`.
2. **Load.** A sentinel after the last block (`infinite-scroll.ts`) comes into
   view; `NoteStream` appends the next batch of 10 as empty blocks, placed and
   indexed by path in `stream-blocks.ts`. `stream-state.ts` is the loaded range.
3. **Render.** `NoteWindowManager` (`note-window.ts`) renders blocks within a
   margin of the viewport and empties them well past it, keeping their height
   ([ADR 0006](adr/0006-unload-off-screen-notes.md)). Each rendered note owns a
   child `Component`, discarded on unload.
4. **Change.** Vault and metadata events become `NoteStream` mutations: insert,
   remove, re-render, reconsider whether a note is hidden. Saves are debounced
   per path. An open search re-reads after each.

Every mutation of the stream — batches, events, renders, jumps, rebuilds — runs
through one promise queue, so none interleaves at an `await`
([ADR 0004](adr/0004-serialize-view-mutations.md)).

## Rendering

- `note-renderer.ts` renders a note through Obsidian's `MarkdownRenderer` into
  `.markdown-rendered`, re-rendering on `metadataCache` "changed"
  ([ADR 0003](adr/0003-metadata-cache-rerender.md)).
- Gestures on titles, links and chevrons are delegated: one listener per gesture
  on the stream container. The view is the hover parent Page preview hangs
  popovers on.
- Wide content: tables become cards, equations shrink, and each Base draws in
  its own placeholder, as cards when too wide (D-033). `ScrollBoxGuard` reports
  Base layouts to the renderer.
- On mobile nothing inside a note scrolls: `ScrollBoxGuard` clips stray scroll
  boxes ([ADR 0008](adr/0008-nothing-scrolls-on-mobile.md)). Desktop keeps
  Obsidian's scroll boxes.
- The linked mentions footer draws after the note and redraws itself on
  `resolved`; `notes/linked-mentions.ts` finds each link's list item or section.

## Scroll position

Heights change constantly: a placeholder guess becomes a real note, a Base fills
in, an image loads. Three mechanisms keep the reader's place.

- `LayoutMemory` remembers each note's measured height per layout, across
  sessions, so placeholders start at the right size
  ([ADR 0010](adr/0010-layout-memory.md)). A note not measured at the layout is
  estimated from its text (`height-estimates.ts`, D-079).
- `HeightHold` holds a note or Base at its earlier height while it refills.
- `NoteWindowManager` pins each rendered note's height and changes it only in
  the task that tells `ScrollAnchor`
  ([ADR 0013](adr/0013-pin-rendered-note-heights.md)). Once the scroll is still,
  it re-reserves unloaded notes at what they are now expected at
  ([ADR 0014](adr/0014-re-reserve-placeholders-at-rest.md)), drawing the notes
  above moving first ([ADR 0015](adr/0015-shift-before-shrinking-above.md)).
- `ScrollAnchor` undoes shifts above the reader where the platform does not:
  Chromium anchors natively, iOS WebKit does not.

Jumps, search steps and Back (`getEphemeralState`) go through
`scroll-position.ts`: `scrollIntoPlace` re-applies the scroll until the stream
stops rendering, and `keepInPlace` holds a centered match while Bases fill in. A
jump starts in `jump-to-date-modal.ts`, which offers the vault's note dates in
the vault's own format.

## Search

`note-search.ts` finds notes whose title or source match; `stream-search.ts`
steps note to note; `search-highlights.ts` paints CSS highlight ranges, and
`text-beside-blocks.ts` wraps bare text so WebKit paints them. The bar opens on
the vault's "Search current file" hotkey (`hotkey.ts`).

## Persistence

| What                 | Where                          | Why there                  |
| -------------------- | ------------------------------ | -------------------------- |
| Settings             | plugin data (`data.json`)      | syncs with the vault       |
| Heights, Base widths | vault localStorage, per device | device-specific (ADR 0010) |
| Empty-note verdicts  | vault localStorage, per device | a cache (D-072)            |
| Collapsed sections   | vault localStorage             | `collapse-store.ts`        |

Every localStorage store saves through `saveLoggingOnce`: a refused save is
logged once, never thrown (D-071).

## Obsidian internals

Unsupported APIs are read only in `obsidian-internals.ts`: readable line length,
the vault config "raw" event, global search's `setQuery`, property icons,
hotkeys, a view's title element.
