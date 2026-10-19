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

When a note's middle is above the pane's middle, `NoteWindowManager` draws it
from its end: `NoteRenderer` renders its runs, or sections, last first, each
inserted before the one drawn before it. Meanwhile the block, still at its
reserved height, lays out from its bottom (`is-drawing-from-end`), so what is
drawn sits where the reader is, and the note's title and properties stay out of
view. Before the note lands, the scroll anchor reads the reader's place in what
was drawn; nothing scrolled or resized while it drew, so nothing else would have
told it. Landing re-pins the block, and the anchor keeps that text in place as
the note takes its real height.

If a glide brought the note's top into the pane meanwhile, the anchor holds
whichever of this note and the note above is at the pane's middle, since that is
what the reader is reading; the other moves away to make room. With the scroll
at the top there is no note above, so the stream's top is held, as a tap on the
title would leave it. If the pane's top falls in a gap in the note's content,
the anchor holds the text below the gap, never the content element, whose top
rises with each slice drawn above.

Only content near the reader stays in the layout while the note draws. Between
slices, the stream hides each run drawn past the unload margin (ADR 0021),
except the topmost, which may still grow. Runs are grouped from the note's end,
so runs already drawn keep their bounds as the note grows at its top. The stream
hides the remaining far runs when the note lands, after the re-pin, since how
far a run is depends on where the anchor put the reader.

## Consequences

- When a reader comes up into a never-drawn 3,000-line note, the text under
  them, in the note's last tenth, shows before the note lands, and moves less
  than a pixel when it lands (`e2e-tests/long-note-from-end.spec.ts`).
- At phone speed, under 10% of a 10,000-line note is laid out at any frame of
  its draw, against 98% hiding only once it lands.
- The iPhone measurements are in the merge commit.
- A note met from above, or by a jump, draws from its top as before.
- A save that redraws a long note whole still draws from its top.

## Rejected alternatives

- **Keep a long note drawn after the reader leaves it, with all its runs
  hidden** — instant to return to, but no help for one never drawn, the case met
  after a jump; memory grows with each long note passed, a turn shows every run
  at once (ADR 0021), and its embeds and queries keep running off screen.
- **Draw only the runs near the reader** — needs space held for the rest,
  collapsing sections that span undrawn parts, and search into them: a larger
  change, for the same white screen.
