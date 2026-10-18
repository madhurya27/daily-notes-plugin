# 0020. A long note renders a slice at a time

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

One `MarkdownRenderer` call drew a whole note in one task. At phone speed (CPU
slowed 4x, `e2e-tests/edit-cost.spec.ts`) opening a 10,000-line note froze the
stream 2.4 s, and 4.2 s if it was today's, drawn section by section (ADR 0019).

## Decision

A note of 6,000 characters or more renders as runs of whole sections of up to
2,000 characters, each cut from the note's own text, and a shorter one whole;
today's, and any saved, one section at a time as before. Between runs the
renderer gives the thread back once 25 ms are spent, through a timer, so
everything already waiting runs first. A note that leaves the screen meanwhile
stops at its next slice and stays unloaded; one taken out of the document stops
drawing. A note off the screen first draws, between its slices, any note waiting
on the screen, then goes on where it stopped. The block stays clipped at its
reserved or pinned height until the note is drawn, so nothing moves meanwhile. A
note whose sections cannot stand alone (ADR 0019) still renders in one call.

## Consequences

- At phone speed the longest task opening a 10,000-line note falls from 4.2 s to
  ~340 ms, and no timer waits over ~550 ms. Desktop: 744 ms to ~200.
- A glide past a long note no longer finishes drawing it first: tapping the
  title over 16,000 lines showed the top blank for 0.75–1.2 s on an iPhone, now
  for none (`e2e-tests/ios/header.spec.ts`).
- A glide to a short newest note over a 10,000-line note never measured ended
  with it in the render margin, drawing to its end first: the newest waited
  286–341 ms on an iPhone, now 44–49.
- Below 6,000 characters a whole render holds the thread no longer than a slice
  does, and is done sooner: at phone speed (D-131), 5,900 characters hold 26–27
  ms whole, against slices' 25–26, and are done in 26 rather than 45–49. A whole
  render first holds 50 ms between 10,000 and 15,000, so the cut leaves margin.
- A 10,000-line note takes 1.3–1.7 times as long to finish: 6.9 s at phone speed
  for today's. It fills from the top, and its end is far below the screen; a
  note after it waits its turn to draw.
- Sections the reader collapsed show open until the note is drawn.
- The e2e specs wait in the page for a long note: `expect` walks the whole page
  at each poll, landing between slices.

## Rejected alternatives

- **`scheduler.yield()`** — resumes the render ahead of every timer: timers
  waited 4.4 s, then ran at once over the whole note, in a 580–900 ms task.
- **Every note one section at a time** — twice an old note's render cost (ADR
  0019).
- **Every note in slices** — a short note fits one slice anyway, and drew up to
  1.9 times slower.
- **Rendering detached, then inserting once** — the insert restyles and lays out
  the whole note in one task.
- **`requestIdleCallback`** — iOS lacks it, and while the reader scrolls no idle
  time comes.
- **Restarting the note that gave way** — loses the slices already drawn.
- **Hiding the note until drawn** — a blank note for seconds, where the top
  could already be read.
