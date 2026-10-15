# 0023. Far content leaves the layout as it goes, notes and runs alike

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

WebKit's composite step stalls an iPhone glide in proportion to the elements
laid out (ADR 0021), and nothing left the layout until the scroll was still
(D-032, ADR 0021). Stalls grew with the glide, 90 ms to 350 ms over 14 s; the
glide outran the paint and travelled half as far as Obsidian's reading view.

## Decision

Content past the hide margin, 4 panes, leaves the layout when the observer
reports it, mid-glide too:

- **A note** keeps its content and its pin (ADR 0013), its children taking
  `display: none`: the block's height is unchanged, so nothing is measured and
  the anchor owes nothing. Back within the render margin, it shows again,
  undrawn work spared.
- **A run** is watched by its first and last elements; once both are past the
  margin on one side, it hides behind a spacer measured from the observer's
  boxes. A run shown by a collapse, search step or save is watched again, and
  the observer's first report hides it once more.
- **Eviction** keeps ADR 0006's bound: a hidden note past the unload margin, 12
  panes, is emptied, once the scroll is still (D-032).

Supersedes the waits in D-032 and ADR 0021 for hiding; unloading still waits.

## Consequences

- iPhone, two eight-stroke glides: stalls over 80 ms fall from 18 to 2–4 past
  short notes, and from 21–26, climbing, to 2–6, flat, through a 10,000-line
  note. A glide travels 2.4× as far.
- The longest blank through that note is 239 ms, from 524–913 ms, once D-135
  stopped a long note setting every estimate. Most blank frames are over drawn
  text, as in Obsidian's reading view; the rest outrun the drawing
  (`docs/TODO.md`).
- A run's spacer reaches the screen for one frame, 2–8 times in two glides:
  after a WebKit stall of 70–200 ms, or where the glide moves farther between
  frames than the render margin. The next frame shows the run. A spacer margin
  of 3 panes took these to 0–1 but left the blank time unchanged (1.4–2.5 s
  either way) and stalls over 80 ms rose from 7–10 to 11–13: the screen is blank
  there unpainted all the same. `e2e/ios/far-runs.spec.ts` fails a spacer on
  screen two frames running.
- Desktop, 1,825 notes scrolled to the end: 6 notes drawn, not 4; 2,654 live
  nodes, not 2,378; heap grows 7.3 MB, not 5.8 MB.

## Rejected alternatives

- **A 300 ms sweep mid-glide** — rescans every run and forces layout each time.
- **`content-visibility: auto`** — tried again: the stalls did not change and
  the blanks grew.
- **Render every note up front** — ADR 0006: open time and memory.
- **Unloading mid-glide** — D-032: a third of flicks stalled.
