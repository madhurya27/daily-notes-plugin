# 0013. Pin each rendered note's height

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

On iOS, when a note above the reader changes height, `ScrollAnchor` makes up for
it by shifting the stream, set when a `ResizeObserver` reports the change.
Recordings showed the whole screen drawn a frame off by the change, then back,
at each such render: 15 times in one landscape scroll up. A test page outside
Obsidian did the same with the shift set in the observer, and never with the
shift set in the task that changed the height. Mid-glide, iOS paints a resize
before reporting it.

## Decision

A rendered block is pinned: a fixed `height` with `overflow-y: clip`, set by
`NoteWindowManager`. Nothing rendering inside moves the stream. The block takes
a new height only in `repin`: unpinned, measured and pinned again in one task,
which tells the anchor to shift in that task too. It runs when the render lands,
when the block's content reports a resize, and when a hold lets go.

## Consequences

- Content that sizes late (a Base filling in, an image or a PDF loading) grows
  inside a pinned block and moves nothing until its resize report re-pins the
  block.
- Growth shows cut off for the one frame between when it is painted and when it
  is reported.
- A change inside the note at the top of the pane still reaches the anchor
  through a resize report: pinning fixes a block's height, not where things sit
  inside it.
- On desktop, Chromium's native scroll anchoring handles each re-pin as it
  handled each render before.

## Rejected alternatives

- **The shift in a later frame** — iOS paints the change first all the same.
- **Measuring notes ahead, off screen** — Bases, images and PDFs size to where
  they are drawn (ADR 0010).
- **Rendering off screen and moving the note in** — a moved frame reloads, and
  Bases and images size again where they land.
- **A bottom-anchored stream (`column-reverse`)** — keeps growth above the
  reader from moving the screen, but growth below would move it instead; and it
  flips every scroll offset in the plugin.
- **Scroll writes** — iOS drops or undoes them mid-glide.
