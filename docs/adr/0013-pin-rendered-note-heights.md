# 0013. Pin each rendered note's height

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

On iOS, `ScrollAnchor` offsets a note above the reader changing height with a
shift of the stream, set when a `ResizeObserver` reports the change. Recordings
showed the whole screen drawn a frame off by the change, then back, at each such
render: 15 times in one landscape scroll up. A test page outside Obsidian did
the same with the shift set in the observer, and never with the shift set in the
task that changed the height. Mid-glide, iOS paints a resize before reporting
it.

## Decision

A rendered block is pinned: a fixed `height` with `overflow-y: clip`, set by
`NoteWindowManager`. Nothing rendering inside moves the stream. The block takes
a new height only in `repin`: unpinned, measured and pinned again in one task,
which tells the anchor to shift in that task too. It runs when the render lands,
when the block's content reports a resize, and when a hold lets go.

## Consequences

- Late content, a Base filling, an image or a PDF loading, sizes in a pinned
  block and moves nothing until its resize report re-pins it.
- Growth shows clipped for the frame between its paint and its report.
- A change inside the note the pane's top crosses still reaches the anchor by
  report: pinning the block does not hold its insides.
- On desktop, native anchoring takes each re-pin as it took the render before.

## Rejected alternatives

- **The shift in a later frame** — iOS paints the change first all the same.
- **Measuring notes ahead, off screen** — Bases, images and PDFs size to where
  they are drawn (ADR 0010).
- **Rendering off screen and moving the note in** — a moved frame reloads, and
  Bases and images size again where they land.
- **A bottom-anchored stream (`column-reverse`)** — holds growth above the
  reader, moves it below; flips every scroll offset in the plugin.
- **Scroll writes** — iOS drops or undoes them mid-glide.
