# 0021. A long note's far runs leave the layout

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

A drawn note stays whole in the page (ADR 0006 unloads whole notes only). On an
iPhone, WebKit stalls the page ~0.7 s about every second in proportion to the
elements laid out, wherever they are: 36 stalls over 200 ms in a glide past a
5,000-line note, none past a 200-line note padded to the same height. A glide
begun in a stall runs into unpainted tiles: 3.7 s blank over 5,000 lines, up to
2.4 s at a time over 10,000.

## Decision

`NoteWindowManager` treats a long note's render runs (ADR 0020), or its sections
grouped to their size, as it treats notes. Once the scroll is still, each run
past the unload margin gets `display: none` behind one spacer of its height and
outer margins (`render/far-runs.ts`); a spacer entering the render margin shows
its run again. The nodes stay where they are: collapsing a section, a search
step and an update in place each show the runs they touch first, and runs shown
that way hide again at the next rest. A new width shows every run: the spacers
measured the old one.

## Consequences

- iPhone, glide through a drawn note: 5,000 lines blank 0.13 s in all, longest
  50 ms (was 3.7 s, 584 ms); 10,000 lines 0.17 s, longest 83 ms.
- A note's height is unchanged by hiding, to 0.5 px (`e2e/far-runs.spec.ts`).
- A save shows only the runs it touches: iPhone, one task of 31–36 ms at 5,000
  lines, 40–43 ms at 10,000 (D-134).
- Selecting and copying across a hidden run copies none of it.

## Rejected alternatives

- **`content-visibility: auto`** — keeps every box: 20% less blank, and its
  resizes looped our ResizeObserver.
- **The note in its own layer** (`will-change`) — within run-to-run noise.
- **Emptying far runs, as notes unload** — redrawing is the cost ADR 0020 cut,
  and collapsing, search ranges and updates in place hold the nodes.
- **Hiding by an unload observer per run** — a run shown by a collapse or a
  search would never hide again: an observer reports changes only.
