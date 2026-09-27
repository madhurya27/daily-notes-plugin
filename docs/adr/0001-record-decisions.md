# 0001. Keep architecture decisions in this log

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

Decisions were being rediscovered from commit bodies and `CLAUDE.md` prose.
Both record *what* the code does; neither records what was considered and
rejected, so a later change re-argues a settled question — or quietly undoes it.
`CLAUDE.md` had started to absorb rationale, which pushed it towards a design
document instead of a map of the current system.

## Decision

Numbered records under `docs/adr/`, one per non-obvious decision, written in the
same branch as the code. Each holds context, the decision, its consequences, and
one line per rejected alternative. Records are append-only: a reversal is a new
record that supersedes the old one, never an edit to it.

`CLAUDE.md` and `docs/TESTING.md` stay descriptions of the present and link here
for the why. Commit messages stay scoped to their own change.

## Consequences

- The cost of a decision is one page, written while the reasoning is fresh.
- Two places to update when a decision changes: the ADR (superseded) and the
  docs that describe current behavior.
- Not everything qualifies. A decision with one plausible option is not an ADR;
  formatting, naming and library choices the ecosystem already settles are not
  either.
- The existing log is backfilled only where the reasoning still matters and is
  still recoverable; silence about an old decision is not consent to change it.

## Rejected alternatives

- **A single `DECISIONS.md`** — grows into a file nobody reads, and a per-decision status is hard to keep straight.
- **Rationale in `CLAUDE.md`** — the status quo; it mixes "what is true now" with "why we chose it" and has no room for rejected options.
- **Commit messages alone** — the reasoning survives, but only for whoever thinks to run `git log` on the right file.
- **GitHub issues or the PR description** — off-repo, unversioned, and invisible to anyone reading the code offline.
