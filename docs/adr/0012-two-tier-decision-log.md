# 0012. Record big decisions as ADRs, small ones as numbered log entries

- **Status:** Accepted
- **Date:** 2026-09-29
- **Supersedes:** [0001](0001-record-decisions.md), which rejected a single
  decisions file

## Context

ADR 0001 kept every decision as a numbered record here and rejected a single
decisions file. Since 2026-09-15, small decisions have gone to
`docs/DECISIONS.md` instead: 70 entries in two weeks, too small for an ADR each.
Code and docs cited them by date, and one date held up to 13 entries, so a
citation did not say which entry it meant.

## Decision

- **ADR:** an architectural or larger design change, one whose reversal means
  migrating data or rewriting across layers. Numbered here, as before.
- **Log entry:** anything smaller, in `docs/DECISIONS.md`: decision, why,
  rejected, a few lines. Each carries an ID, `D-001` on, in the order the
  entries were written; the date stays in its heading.
- Both are append-only: a replaced decision is marked superseded, pointing at
  its replacement.
- A citation names the ID (`docs/DECISIONS.md, D-023`), never a date.

## Consequences

- An ID is short enough for a code comment, unique, and survives a retitle.
- The log is one file, searched rather than read through: `grep D-023`.
- A branch adding an entry picks the next free ID; two branches in flight can
  collide and one renumbers before merging.

## Rejected alternatives

- **Everything as an ADR** — a page each for 70 decisions nobody would write.
- **Citing by date and title** — long, and a retitle breaks it.
- **GitHub heading anchors** — they carry the title, so a retitle breaks them.
- **One file per log entry** — ADRs again, without the bar for writing one.
