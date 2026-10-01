# 0014. Re-reserve placeholders once the scroll is still

- **Status:** Accepted; supersedes D-055. Superseded in part by
  [0015](0015-shift-before-shrinking-above.md)
- **Date:** 2026-10-01

## Context

A placeholder kept the height it was given when added until its note rendered
(D-055). After a turn, notes above the reader held the old width's heights:
recordings showed a blank gap of 1.75–4.75 s at the stream's top in landscape.
An estimate learned since (D-079, D-080) reached no placeholder already made.
D-055 kept them because placeholders shrinking shortened the stream under the
scroll, and the browser clamped it before `ScrollAnchor` could hold the place.

## Decision

When the scroll is still after a turn, or after a height is kept,
`NoteWindowManager` gives each unloaded note what it is expected at now: its
stored height at the layout, else a fresh estimate. It changes them in one task
and tells the anchor in it, as `repin` does (ADR 0013). The whole change waits
for a later rest while the stream would shrink by more than lies below the pane:
that is when the browser clamps.

## Consequences

- A turn's placeholders hold the new width's heights from the first rest.
- A note added while a change waits keeps it waiting.
- Near the stream's end, a turn's shrink waits until more loads below.
- Each rest after a height is kept re-reads every unloaded note's estimate,
  cached per change to the heights.

## Rejected alternatives

- **On the turn itself** — the text reflows for several frames, and the anchor
  holds a place read before it (D-057).
- **A spacer at the stream's end, as tall as the shrink** — a second thing to
  remove at the right moment; waiting does the same near the end.
- **Correcting the scroll before shrinking** — a scroll write ends an iOS glide.
