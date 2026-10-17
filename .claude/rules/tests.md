---
paths:
    - "tests/**"
    - "e2e/**"
---

# Tests

- Unit: Vitest + jsdom, mocking `obsidian` from `tests/mocks/`, where
  `daily-notes.ts` holds the vault's notes and daily-notes settings. The mocks
  take their signatures from the real API, so tests typecheck against them
  (D-025).
- **The split is a contract**
  ([ADR 0002](../../docs/adr/0002-real-obsidian-e2e.md)): jsdom loads no
  stylesheet, so a visibility assertion there proves nothing. Real rendering,
  real events and what is visible on screen belong in `e2e/`, which drives the
  installed app against a throwaway vault.
- Every e2e spec runs twice, desktop and mobile, both Chromium. What iOS's
  engine paints or computes differently is checked in `e2e/webkit.spec.ts`, on a
  snapshot of the mobile run
  ([ADR 0009](../../docs/adr/0009-webkit-render-checks.md)).
- A mutation run leaves no survivor (D-149): kill it with a test, or, when no
  test can tell it apart, a `// Stryker disable next-line <mutator>: <why>` on
  it, its reason checked against the code.
