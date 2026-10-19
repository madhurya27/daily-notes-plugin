# 0014. Re-reserve placeholders once the scroll is still

- **Status:** Accepted; supersedes D-055. Superseded in part by
  [0015](0015-shift-before-shrinking-above.md)
- **Date:** 2026-10-01

## Context

A placeholder kept the height it was given when it was added, until its note
rendered (D-055). After a turn, notes above the reader kept the old width's
heights: recordings showed a blank gap of 1.75–4.75 s at the stream's top in
landscape. A better estimate learned later (D-079, D-080) never reached the
placeholders already made. D-055 left them alone because shrinking placeholders
shortened the stream under the scroll position, and the browser clamped the
scroll before `ScrollAnchor` could hold the reader's place.

## Decision

When the scroll is still after a turn, or after a height is kept,
`NoteWindowManager` gives each unloaded note the height it is now expected to
have: its stored height at this layout, else a fresh estimate. It changes them
all in one task and tells the anchor in that task, as `repin` does (ADR 0013).
If the change would shrink the stream by more than the content below the pane,
the browser would clamp the scroll, so the whole change waits for a later rest.

## Consequences

- A turn's placeholders hold the new width's heights from the first rest.
- If a note is added while a change is waiting, the change keeps waiting.
- Near the stream's end, a turn's shrink waits until more notes load below.
- At each rest after a height is stored, every unloaded note's estimate is read
  again; estimates are cached until the stored heights change.

## Rejected alternatives

- **On the turn itself** — the text reflows for several frames, and the anchor
  holds a place read before it (D-057).
- **A spacer at the stream's end, as tall as the shrink** — a second thing to
  remove at the right moment; waiting does the same near the end.
- **Correcting the scroll before shrinking** — a scroll write ends an iOS glide.
