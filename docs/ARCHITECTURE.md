# Architecture

An Obsidian plugin that shows every daily note, newest first, as one read-only
infinite scroll. Invariants that span files are in
[.claude/rules/invariants.md](../.claude/rules/invariants.md); rationale is in
[adr/](adr/) and [DECISIONS.md](DECISIONS.md). Files are kebab-case, grouped by
job (D-023).

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

1. **Open.** The view listens for vault changes, then awaits
   `service.initialize()`, which lists the vault's daily notes through the
   empty-notes filter ([ADR 0011](adr/0011-hide-template-only-notes.md)), then
   `stream.open()`. The queue holds what it heard meanwhile until then.
2. **Load.** A sentinel after the last block (`infinite-scroll.ts`) comes into
   view; `NoteStream` appends the next batch of 10 as empty blocks, placed and
   indexed by path in `stream-blocks.ts`. The service counts how many it has
   loaded, its `streamLength` (D-118).
3. **Render.** `NoteWindowManager` (`note-window.ts`) works in three margins, in
   panes: it renders blocks within 1.5, hides what passes 4, and empties what
   passes 12 once the scroll is still, keeping every height
   ([ADR 0006](adr/0006-unload-off-screen-notes.md),
   [ADR 0023](adr/0023-hide-far-content-as-it-leaves.md)). A hidden note keeps
   its content out of the layout inside its pin; a long note's runs hide behind
   spacers (`far-runs.ts`, [ADR 0021](adr/0021-hide-far-runs-of-long-notes.md)),
   watched by `far-run-watch.ts`. Both show again as they near. Each rendered
   note owns a child `Component`, discarded on unload. A long note the reader
   comes up into draws from its end
   ([ADR 0022](adr/0022-draw-long-notes-from-the-end-met.md)).
4. **Change.** Vault and metadata events become `NoteStream` mutations: insert,
   remove, re-render, reconsider whether a note is hidden. Saves are debounced
   per path. An open search re-reads once the stream says its notes changed.

Every mutation of the stream — batches, events, renders, jumps, rebuilds — runs
through one promise queue, so none interleaves at an `await`
([ADR 0004](adr/0004-serialize-view-mutations.md)).

## Rendering

- `note-renderer.ts` renders a note through Obsidian's `MarkdownRenderer` into
  `.markdown-rendered`, re-rendering on `metadataCache` "changed"
  ([ADR 0003](adr/0003-metadata-cache-rerender.md)). A note saved since it
  opened renders section by section (`note-sections.ts`), and a save re-renders
  only the sections it changed
  ([ADR 0019](adr/0019-re-render-only-changed-sections.md)). Any other from
  6,000 characters renders as runs of sections, a shorter one whole; either
  gives the thread back between them once a slice of time is spent
  (`time-slice.ts`), and a note off the screen lets one waiting on it draw first
  ([ADR 0020](adr/0020-render-long-notes-in-slices.md)).
- Gestures on titles, links and chevrons are delegated: one listener per gesture
  on the stream container. The view is the hover parent Page preview hangs
  popovers on.
- Wide content: tables become cards, Dataview's too as they fill in (D-084),
  equations shrink, and each Base draws in its own placeholder, as cards when
  too wide (D-033, a kanban D-107). `ScrollBoxGuard` reports Base layouts to the
  renderer. Each refits when its note's width changes, heard through one
  observer per view (`note-widths.ts`).
- On mobile nothing inside a note scrolls: `ScrollBoxGuard` clips stray scroll
  boxes ([ADR 0008](adr/0008-nothing-scrolls-on-mobile.md)), and a PDF is its
  first page, opened by a tap (D-083). Desktop keeps Obsidian's scroll boxes.
- Nothing in the stream carries Obsidian's `.clickable-icon`: on an iPhone, a
  flick begun on one never scrolls (D-113).
- On mobile `FrameDeferral` holds back a frame's page until the scroll is still
  (D-087), puts a YouTube embed's thumbnail in its place (D-088), and makes a
  web page's frame a preview linking to the page (D-098).
- The linked mentions footer draws after the note and redraws itself on
  `resolved`; `notes/linked-mentions.ts` finds each link's list item or section.

## Scroll position

Heights change constantly: a placeholder guess becomes a real note, a Base fills
in, an image loads. Three mechanisms keep the reader's place.

- `LayoutMemory` remembers each note's measured height per layout, across
  sessions, so placeholders start at the right size
  ([ADR 0010](adr/0010-layout-memory.md)); an edit forgets a note's
  ([ADR 0017](adr/0017-forget-heights-of-edited-notes.md)). A note not measured
  at the layout reserves the 0.9 quantile of the heights measured there (D-092),
  capped at its size at the densest rate measured (D-135).
- `HeightHold` holds a note at its earlier height while it refills; a Base's box
  has a fixed height, the tallest it has been, until it settles (D-095, D-159).
- `NoteWindowManager` pins each rendered note's height and changes it only in
  the task that tells `ScrollAnchor`
  ([ADR 0013](adr/0013-pin-rendered-note-heights.md)). Once the scroll is still,
  it re-reserves unloaded notes at what they are now expected at
  (`reservations.ts`) ([ADR 0014](adr/0014-re-reserve-placeholders-at-rest.md)),
  drawing the notes above moving first
  ([ADR 0015](adr/0015-shift-before-shrinking-above.md)).
- `ScrollAnchor` undoes shifts above the reader where the platform does not:
  Chromium anchors natively, iOS WebKit does not.

Jumps, search steps and Back (`getEphemeralState`) go through
`scroll-position.ts`: `scrollIntoPlace` re-applies the scroll until the stream
stops rendering, and `keepInPlace` holds a centered match while Bases fill in. A
jump or step first draws its note whole, Bases filled (D-082). A jump starts in
`jump-to-date-modal.ts`, which offers the vault's note dates in the vault's own
format.

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
| Collapsed sections   | vault localStorage             | `collapse-store.ts`, D-121 |

Every localStorage store saves through `saveLoggingOnce`: a refused save is
logged once, never thrown (D-071).

## Obsidian internals

Unsupported APIs are read only in `obsidian-internals.ts`: the daily-notes
settings (D-127), readable line length, the vault config "raw" event, global
search's `setQuery`, property icons, hotkeys, a view's title element.
