# 0004. Serialize view mutations through one queue

- **Status:** Accepted
- **Date:** 2026-08-20 (recorded 2026-08-30)

## Context

`loadMoreNotes`, the four vault-event handlers and `refresh` all mutate the same
two things — `state` and the DOM — and all of them await mid-way (rendering
markdown, reading files). Interleaved, they corrupted each other: a delete
arriving during an in-flight batch was undone by that batch's `state.reset`, and
a note created mid-load could be dropped entirely. The invariant that
`state.notes` equals `service._sorted.slice(0, state.length)` broke, which
desynchronizes pagination — notes skipped or repeated on further scroll.

## Decision

Every mutating path runs through `enqueue()`, a promise chain that serializes
them in arrival order. `loadPending`, set synchronously, additionally stops a
still-visible sentinel from queueing a second load for the same batch.

## Consequences

- Ordering is arrival order, and a slow batch delays a delete behind it. For a
  read-only stream that is the right trade: correct beats immediate.
- Any new mutating path must be enqueued too. This is the rule most easily
  forgotten in later work, hence the note in `CLAUDE.md`.
- Reasoning about state is single-threaded: no handler observes another's
  half-applied change.

## Rejected alternatives

- **Per-note locks** — finer-grained, but the bug is about the shared ordered
  list, not individual notes.
- **Re-checking state after every await** — every mutating path grows the same
  defensive code, and one omission brings the bug back.
- **Debouncing vault events** — hides the race at small scale without removing
  it.
