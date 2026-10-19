# 0020. A long note renders a slice at a time

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

One `MarkdownRenderer` call drew a whole note in one task. At phone speed (CPU
slowed 4x, `e2e-tests/edit-cost.spec.ts`) opening a 10,000-line note froze the
stream 2.4 s, and 4.2 s if it was today's, drawn section by section (ADR 0019).

## Decision

A note of 6,000 characters or more renders in runs: groups of whole sections, up
to 2,000 characters each, cut from the note's own text. A shorter note renders
whole. Today's note, and any note saved while rendered, renders one section at a
time, as before (ADR 0019). Between runs, once 25 ms have been spent, the
renderer yields the thread through a timer, so everything already waiting runs
first. If the note leaves the screen meanwhile, it stops at its next slice and
stays unloaded; if it is removed from the document, it stops drawing. A note
that is off the screen lets any note waiting on the screen draw between its
slices, then continues where it stopped. The block stays clipped at its reserved
or pinned height until the note is drawn, so nothing moves meanwhile. A note
whose sections cannot stand alone (ADR 0019) still renders in one call.

## Consequences

- At phone speed the longest task opening a 10,000-line note falls from 4.2 s to
  ~340 ms, and no timer waits over ~550 ms. On desktop, from 744 ms to ~200 ms.
- A glide past a long note no longer waits for the note to finish drawing. On an
  iPhone, tapping the title of a 16,000-line note showed its top blank for
  0.75–1.2 s; now it shows no blank (`e2e-tests/ios/header.spec.ts`).
- A glide up to a short newest note, past a 10,000-line note never measured,
  ended with the long note in the render margin, and the long note drew to its
  end first. On an iPhone the newest note waited 286–341 ms; now 44–49 ms.
- Below 6,000 characters, a whole render holds the thread no longer than a slice
  does, and finishes sooner. At phone speed (D-131), a 5,900-character note
  holds the thread 26–27 ms rendered whole, against 25–26 ms per slice, and
  finishes in 26 ms rather than 45–49 ms. A whole render first holds the thread
  50 ms somewhere between 10,000 and 15,000 characters, so the 6,000 cut-off
  leaves a margin.
- A 10,000-line note takes 1.3–1.7 times as long to finish: 6.9 s at phone speed
  for today's. It fills from the top, and its end is far below the screen; a
  note after it waits its turn to draw.
- Sections the reader collapsed show open until the note is drawn.
- The e2e specs wait for a long note from inside the page: Playwright's `expect`
  walks the whole page at each poll, and each poll lands between slices.

## Rejected alternatives

- **`scheduler.yield()`** — resumes the render ahead of every waiting timer:
  timers waited 4.4 s, then all ran at once after the whole note, in one 580–900
  ms task.
- **Every note one section at a time** — twice an old note's render cost (ADR
  0019).
- **Every note in slices** — a short note fits one slice anyway, and drew up to
  1.9 times slower.
- **Rendering detached, then inserting once** — the insert restyles and lays out
  the whole note in one task.
- **`requestIdleCallback`** — iOS lacks it, and while the reader scrolls no idle
  time comes.
- **Restarting a note that yielded to another** — loses the slices already
  drawn.
- **Hiding the note until drawn** — a blank note for seconds, where the top
  could already be read.
