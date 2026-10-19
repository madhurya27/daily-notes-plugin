# 0021. A long note's far runs leave the layout

- **Status:** Accepted; superseded in part by
  [0023](0023-hide-far-content-as-it-leaves.md): runs hide as they leave, not
  once the scroll is still
- **Date:** 2026-10-13

## Context

A drawn note stays whole in the page (ADR 0006 unloads whole notes only). On an
iPhone, WebKit stalls the page for up to ~0.7 s about once a second, longer the
more elements are laid out, on screen or not: 36 stalls over 200 ms in a glide
past a 5,000-line note, none past a 200-line note padded to the same height. A
glide begun in a stall runs into unpainted tiles: 3.7 s blank over 5,000 lines,
up to 2.4 s at a time over 10,000.

## Decision

`NoteWindowManager` treats the runs of a long note (ADR 0020), or its sections
grouped to the same size, the way it treats notes. Once the scroll is still,
each run past the unload margin is hidden with `display: none`, and one spacer
with the run's height and outer margins takes its place (`render/far-runs.ts`).
When a spacer enters the render margin, its run shows again. The hidden nodes
stay in the page. Collapsing a section, a search step and an update in place
each first show the runs they touch; runs shown that way hide again at the next
rest. A width change shows every run, because the spacers were measured at the
old width.

## Consequences

- On an iPhone, gliding through a drawn note: over 5,000 lines the screen is
  blank 0.13 s in all, 50 ms at longest (was 3.7 s and 584 ms); over 10,000
  lines, 0.17 s, 83 ms at longest.
- A note's height is unchanged by hiding, to 0.5 px
  (`e2e-tests/far-runs.spec.ts`).
- A save shows only the runs it touches: on an iPhone, one task of 31–36 ms at
  5,000 lines, 40–43 ms at 10,000 (D-134).
- Selecting and copying across a hidden run copies none of it.

## Rejected alternatives

- **`content-visibility: auto`** — keeps every box in the layout: it cut the
  blank time by only 20%, and its size changes set off a loop in our
  ResizeObserver.
- **The note in its own layer** (`will-change`) — within run-to-run noise.
- **Emptying far runs, as notes unload** — redrawing them is the cost ADR 0020
  cut, and collapsing, search ranges and updates in place keep references to the
  nodes.
- **Hiding by an unload observer per run** — a run shown by a collapse or a
  search would never hide again: an observer reports changes only.
