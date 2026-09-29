# Architecture Decision Records

One record per decision that was not obvious — the why, and what was rejected.
Everything else has a home already: `CLAUDE.md` and `docs/TESTING.md` say what
is true now, commit messages say why _this change_. An ADR is the only place a
rejected alternative is written down, so link to it rather than restating it.

Rules:

- One page, ~300 words, one line per rejected alternative. Longer usually means
  it is two decisions.
- Numbered in order, never renumbered. A decision that is replaced gets a new
  record and the old one is marked superseded — records are append-only history,
  not a description of the current system.
- Written in the branch that makes the decision, alongside the code.
