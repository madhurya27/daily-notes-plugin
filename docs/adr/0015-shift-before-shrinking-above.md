# 0015. Draw the notes above moving before re-reserving them

- **Status:** Accepted; supersedes
  [0014](0014-re-reserve-placeholders-at-rest.md) in part
- **Date:** 2026-10-01

## Context

ADR 0014 put off a re-reserve that would shrink the stream by more than lies
below the pane. After a turn near the end, a scroll up with no rest never
retried: the notes above rendered at the old width's heights, and a phone
reached the top owing 5.5k px, notes short of the newest.

WebKit and Chromium keep a shifted stream's scroll range. The clamp came from
`reserve()`'s order: it shrank the placeholders, then the anchor read the
layout, shortened and not yet shifted.

## Decision

`reserve()` sums how far the unloaded notes wholly above the pane move, and
`ScrollAnchor.anticipate()` draws that shift before any placeholder changes. The
anchor's next read finds nothing more owed, and the scroll takes the shift in
the same task: `reserve()` runs only once the scroll is still, so the write ends
no glide. Only a shrink below the pane's top larger than what lies below still
waits.

## Consequences

- A turn re-reserves at its first rest, wherever the reader is.
- Whatever was owed before, such as a Base redrawn late, goes with it.
- Each re-reserve reads the rect of every placeholder it changes.
- A note crossing the pane's top counts as below; unloaded there, it is rare.

## Rejected alternatives

- **A spacer at the stream's end** — the shift already keeps the range.
- **Handing over at the next rest** — a scroll begun within 300 ms carried 7.8k
  px to the top.
- **Waiting, as ADR 0014 did** — a scroll with no rest never retries.
