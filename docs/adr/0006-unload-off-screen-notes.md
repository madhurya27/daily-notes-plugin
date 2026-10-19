# 0006. Unload the content of off-screen notes

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

Nothing detached a rendered note. Every note the user scrolled past kept its
whole Markdown subtree in the DOM, plus the child components
`MarkdownRenderer.render()` registers — which hang off the view until it closes,
so detaching DOM alone would not have freed them. A fully scrolled multi-year
vault held all of it at once, which is the ceiling on how far the stream can
usefully scroll.

## Decision

Every loaded note has a `.daily-note-block`; only blocks near the viewport hold
content. `NoteWindowManager` renders a block when it comes within 1.5 viewports
and empties it once it is 4 viewports away, reserving the height it measured so
nothing below moves. The margins are viewports rather than pixels — how far
ahead of the reader the stream works is the same question on a phone and on a
tall monitor — recomputed from the pane's height on `onResize`. Each note
renders into its own `Component`, discarded with its DOM.

The block element, not its content, carries `data-source-path` and is what the
view's path→element index holds, so a note stays addressable while unloaded.
`loadBatch` appends placeholders rather than rendered notes: appending is O(1)
DOM per note, which is what keeps a jump to a distant date cheap.

## Consequences

- Scroll extent is approximate until a note has rendered once: a never-rendered
  block reserves the median of what this vault's notes measured, corrected on
  first render. The fixed constant it replaced was 400px against notes that
  measure ~709px.
- A settings refresh rebuilds the stream as placeholders, so it costs the same
  at ten notes and at a thousand.
- Anything that scrolls to a note may land on a placeholder. That works — the
  observer fills it in — but only because the block always exists.
- A flick can carry a block past both margins between two frames. An
  IntersectionObserver reports only changes, so the block gets one report, the
  unload, and no other until it comes back. A render already under way records
  the unload and carries it out when it finishes; a render still queued is
  skipped instead of holding up the queue.
- jsdom lays nothing out, so unloading is provable only in `e2e-tests/` (ADR
  0002).

## Rejected alternatives

- **Full virtualization** (absolute positioning, a windowed DOM) — the block set
  is already bounded by what was scrolled to, and absolute positioning fights
  Obsidian's reading-view CSS.
- **Remove blocks entirely and rebuild on scroll-back** — loses the scroll
  height, so the scrollbar jumps on every unload.
- **Cap the number of loaded notes** — breaks the stream premise; the vault
  should be scrollable to its end.
- **One observer for both edges** — a block sitting on the boundary renders and
  unloads on every jitter.
- **Fixed pixel margins** — a phone and a tall monitor would get a different
  number of screenfuls of lead.
