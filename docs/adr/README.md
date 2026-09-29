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

| #                                             | Decision                                                           | Status             |
| --------------------------------------------- | ------------------------------------------------------------------ | ------------------ |
| [0001](0001-record-decisions.md)              | Keep architecture decisions in this log                            | Accepted           |
| [0002](0002-real-obsidian-e2e.md)             | Test against the real Obsidian app, not only mocks                 | Accepted           |
| [0003](0003-metadata-cache-rerender.md)       | Re-render from `metadataCache`, not `vault.modify`                 | Accepted           |
| [0004](0004-serialize-view-mutations.md)      | Serialize view mutations through one queue                         | Accepted           |
| [0005](0005-copy-button-clearance.md)         | Reserve the copy button's corner in rendered code                  | Accepted           |
| [0006](0006-unload-off-screen-notes.md)       | Unload the content of off-screen notes                             | Accepted           |
| [0007](0007-nothing-in-the-stream-scrolls.md) | Nothing inside the stream scrolls                                  | Superseded by 0008 |
| [0008](0008-nothing-scrolls-on-mobile.md)     | Nothing inside the stream scrolls, on mobile                       | Accepted           |
| [0009](0009-webkit-render-checks.md)          | Check the phone layout in WebKit, from a snapshot of real Obsidian | Accepted           |
| [0010](0010-layout-memory.md)                 | Remember every measured height across sessions                     | Accepted           |
