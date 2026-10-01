# 0015. Draw the notes above moving before re-reserving them

- **Status:** Accepted; supersedes
  [0014](0014-re-reserve-placeholders-at-rest.md) in part
- **Date:** 2026-10-01

## Context

ADR 0014 put off a re-reserve while the stream would shrink by more than lies
below the pane. A turn near the stream's end waited; scrolled up without a rest,
every note above then rendered at its old width's height. A phone's log showed
5.5k px owed on reaching the top: the scroll stopped notes short of the newest.

A shifted stream still counts toward the scroll range, in WebKit and Chromium.
The clamp came from the order: `reserve()` shrank the placeholders, then the
anchor read the layout, shortened and not yet shifted, to measure the move.

## Decision

`reserve()` sums how far the unloaded notes wholly above the pane move, and
`ScrollAnchor.anticipate()` draws that shift before any placeholder changes. The
anchor's measure after finds nothing more owed; the scroll takes the shift at
the next rest, as before. Only a shrink below the pane's top, larger than what
lies below the pane, still waits.

## Consequences

- A turn re-reserves at its first rest, wherever the reader is.
- Each re-reserve reads the rect of every placeholder it changes.
- A note crossing the pane's top counts as below: unloaded there, it is rare.

## Rejected alternatives

- **A spacer at the stream's end, as tall as the shrink past it** — the shift
  already holds the range; a spacer is one more thing to remove.
- **Waiting, as ADR 0014 did** — a scroll up without a rest never retries.
