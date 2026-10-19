---
paths:
    - "tests/**"
    - "e2e-tests/**"
---

# Tests

- Unit: Vitest + jsdom, mocking `obsidian` from `tests/mocks/`, where
  `daily-notes.ts` holds the vault's notes and daily-notes settings. The mocks
  take their signatures from the real API, so tests typecheck against them
  (D-025).
- **The split is a contract**
  ([ADR 0002](../../docs/adr/0002-real-obsidian-e2e.md)): jsdom loads no
  stylesheet, so a visibility assertion there proves nothing. Real rendering,
  real events and what is visible on screen belong in `e2e-tests/`, which drives
  the installed app against a throwaway vault.
- Every e2e spec runs twice, desktop and mobile, both Chromium. What iOS's
  engine paints or computes differently is checked in
  `e2e-tests/webkit.spec.ts`, on a snapshot of the mobile run
  ([ADR 0009](../../docs/adr/0009-webkit-render-checks.md)).
- A mutation run leaves no surviving mutant (D-149). Kill each one with a test.
  If no test can tell the mutant from the original, disable it with
  `// Stryker disable next-line <mutator>: <why>`, and check that the reason is
  true of the code.
