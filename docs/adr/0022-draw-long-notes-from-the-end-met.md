# 0022. A long note draws from the end the reader meets

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

ADR 0020 draws a long note in slices from its top. A reader coming up into one
from below, as after a jump to an older day, meets its end, which draws last. On
an iPhone, with heights forgotten, a 10,000-line note left the screen white for
0.55–0.77 s in 3 of 10 glides. Once drawn, its runs stayed in the layout until
the scroll stopped (ADR 0021), so the glide stalled after.

## Decision

`NoteWindowManager` draws a note whose middle is above the pane's from its end:
`NoteRenderer` renders its runs, or sections, last first, each before the one
drawn before it. Meanwhile the block, still at its reserved height, lays out
from its bottom (`is-drawing-from-end`), so what is drawn sits where the reader
is, and its title and properties stay unseen. Before it lands, the scroll anchor
reads its place over what was drawn: nothing scrolled or resized while it drew.
Landing re-pins it, and the anchor holds that text through the height the note
truly takes. Where the pane's top falls in a gap in a note's content, the anchor
holds the text below it, never the content: its top rises with each slice drawn
above.

Only what is near the reader stays in the layout while it draws: between slices,
the stream hides each run drawn past the unload margin (ADR 0021), all but the
topmost, which may grow yet. Runs are grouped from a note's end, so those drawn
keep their bounds as it grows at its top. It hides the rest as it lands, after
the re-pin: far is measured from where the anchor put the reader.

## Consequences

- Text under a reader who comes up into a never-drawn 3,000-line note shows
  before it lands, from its last tenth, and stays within a pixel as it lands
  (`e2e/long-note-from-end.spec.ts`).
- At phone speed, under 10% of a 10,000-line note is laid out at any frame of
  its draw, against 98% hiding only once it lands.
- iPhone: see the merge's measurements.
- A note met from above, or by a jump, draws from its top as before.
- A save that redraws a long note whole still draws from its top.

## Rejected alternatives

- **Keep a left long note drawn, its runs all hidden** — instant to return to,
  but no help for one never drawn, the case met after a jump; memory grows with
  each long note passed, a turn shows every run at once (ADR 0021), and its
  embeds and queries keep running off screen.
- **Draw only the runs near the reader** — needs space held for the rest,
  collapsing over undrawn parts, and a search into them: the larger change, for
  the same white screen.
