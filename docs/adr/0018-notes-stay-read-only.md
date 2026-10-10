# 0018. Notes stay read-only; a note is edited where it opens

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

Editing in the stream was spiked twice (2026-10-08 to 10-09), with Obsidian's
own editor embedded as a Canvas card has it. That editor draws only the lines
near the screen, estimates the rest, and corrects its estimates by scrolling its
own scroller. In the stream the pane scrolls instead, so each correction was
lost: drawing a note's Bases threw the reader thousands of px, and every fix to
the anchor, the pinned heights or the keyboard surfaced the next case. Opening a
note already costs little: a title opens it, ⌘-click in a tab, ⌘⌥-click in a
split beside the stream, and Back returns to the place left
(`e2e/history.spec.ts`).

## Decision

Every note renders read-only. A note is edited where Obsidian opens it, from its
title; the stream redraws it on the save (ADR 0003).

## Consequences

- No editor lives in the stream: the anchor, the pinned heights (ADR 0013) and
  the no-scroll-boxes rule on mobile (ADR 0008) answer to reading alone.
- On a phone, writing means leaving the stream and coming back.
- Nothing relies on Obsidian's internal markdown embed.

## Rejected alternatives

- **Today's note as an editor in the stream** — the embed's tap, not the
  stream's, and today's note drawn unlike the rest.
- **A pencil opening any note's editor in place** — the lost corrections above.
- **The open note in a box as tall as the pane, scrolling itself** — the editor
  keeps the place, but a box in the stream needs its own keyboard handling, an
  edge to show and a place to sit.
- **A pop-up editor** — on a phone a full-screen sheet, as opening the note is,
  through the same internal embed.
- **A hidden workspace leaf per note, as Daily Notes Editor does** — workspace
  patches and a faked hover popover.
