# 0002. Test against the real Obsidian app, not only mocks

- **Status:** Accepted
- **Date:** 2026-08-21 (recorded 2026-08-30)

## Context

Unit tests run against a hand-written `obsidian` mock under jsdom. That mock is
the plugin's own idea of the API, so nothing verified the plugin against real
`MarkdownRenderer` output, real `moment` parsing, or real vault events — and
jsdom loads no stylesheet at all, so nothing could say whether anything was
actually *visible*. A rendered-list indent bug shipped for exactly this reason.

## Decision

`e2e/` drives the installed Obsidian app: Playwright attaches over CDP to an
instance launched with its own `--user-data-dir` and a throwaway seeded vault,
so the user's real vault and config are never touched. Every spec runs twice —
a `desktop` project and a `mobile` one applying `emulateMobile(true)` at an iPhone Pro's 402px —
because Obsidian's mobile stylesheet differs enough that a rule can be right on
one layout and wrong on the other.

Unit tests keep the mock and keep 100% coverage; anything about real rendering,
real events, or what is visible on screen belongs in e2e.

## Consequences

- Two suites with different contracts, and the split has to be honored: a
  visibility assertion in jsdom proves nothing.
- E2E needs Obsidian installed and is slower (~50s), so it is a task gate rather
  than a per-save one.
- The launch is fiddly by nature — window bounds, focus, the single-instance
  lock, first-run trust prompt — and that machinery lives in `e2e/obsidian.ts`.
- Obsidian internals can change under us. That is the point: the suite fails
  when they do.

## Rejected alternatives

- **Mocks only** — cheapest, but blind to the whole class of bugs that made this necessary.
- **A stricter mock, generated from Obsidian's typings** — still asserts our reading of the API, and still has no stylesheet.
- **Manual checks in a dev vault** — kept as `docs/TESTING.md` for what cannot be automated; too slow and too skippable to be the only net.
- **Running against the user's real vault** — a test that can corrupt real notes will eventually do so.
