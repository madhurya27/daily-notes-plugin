# Handoff: mobile scroll stalls

For the agent implementing the fix. Diagnosed on an iPhone 2026-09-24 over ~15 throwaway builds; delete this
file once the ADR below exists.

## Symptom

On iOS a flick stops dead 0.1–0.4 s after the finger lifts, instead of gliding 1–2 s. It starts once notes
have begun unloading (the first pause after scrolling far), then happens on most flicks.

**Obsidian's own notes stall the same way on the phone**, not just the stream. The cause is iOS WebKit, not the
plugin; the stream can only avoid the trigger inside itself. Worth reporting upstream.

## Cause

**A box that can scroll, inside the stream, ends iOS glides once notes unload.** Sideways-scrolling Bases,
Markdown tables and code blocks (our own `overflow-x: auto` rule), and `overflow: hidden` boxes with overflowing
content (Obsidian's table cells) all trigger it. Established by elimination on the phone:

| Build (`experiment/…` branch) | Result |
|---|---|
| `no-unload` — unloading off | No stalls; stutters after the phone sleeps (memory) |
| `no-bases` — Base embeds hidden | No stalls |
| `bases-clip-while-scrolling` — Bases `overflow: clip` during a glide | No stalls; a swipe starting on a just-scrolled Base broke |
| `no-sideways-scroll` — every scroll box removed | **No stalls**, except one note with inline math |
| `bases-no-scroll`, `bases-fit-width` — only `.bases-view` clipped/fitted | Fewer, not none: other boxes survived |
| `fix/lock-rerender-height`, `bases-when-still`, `guard-bases-scroll-writes`, `bases-clip-exempt-scrolled`, `inner-scroller` | Still stalled |

Not the cause, measured: plugin JS at the stall (none runs), listener leaks, Bases writing the stream's
`scrollTop` (it writes its own box), re-render height swings (real, 30 px, but fixing them changed nothing),
Obsidian's hooks on `.view-content`.

## Implement

One `fix/` branch from `main`, test-first. Crib from `experiment/no-sideways-scroll` (`13da083`) — its
`styles.css` and `src/stream/note-stream.ts` hold every piece below, untested.

| Part | How |
|---|---|
| No scroll boxes in notes | Code: `white-space: pre-wrap`. Tables: `width: 100%`, `--table-column-min-width: 0px` (Obsidian's floor overruns a phone), break between words only, no ellipsis. Embeds: `max-height: none`. Bases and everything in them, table cells, unloaded placeholders: `overflow: clip` — never `hidden` or `auto` |
| Bases fit the width | Per `.bases-view`, shrink `--bases-table-column-max-width` until its `.bases-thead` fits; Bases reads it on its next layout, triggered by a `scroll` event on the view. Hand-resized columns (`columnSize`) ignore the cap: they clip |
| Tables as cards | Label each body cell from its header (`data-column`); add `is-stacked` only when the grid is wider than the note; re-check on width change (`ResizeObserver`, released with the note's component) |
| Safety net | After the scroll is still, clip anything else whose computed overflow is `auto`/`scroll`/`hidden` (skip SVG) |

Replace, don't add to: the `:is(table, pre) { overflow-x: auto }` rule in `styles.css` and its TESTING.md check
("code blocks and tables scroll inside themselves").

## Traps

- A catch-all `* { overflow: clip }` cuts list bullets, task checkboxes and heading fold arrows — they paint
  outside their box. Clip named selectors plus the safety net.
- Never read computed styles mid-glide: a read forced a 17–20 ms page-wide recalc right before stalls, and made
  a link's fade animate (the e2e `fade a link` test failed).
- Bases draws its table from absolutely positioned `div`s at a fixed row height; CSS cannot restyle it into
  cards. Native cards are a backlog item (`docs/TODO.md`).
- e2e scroll events need `E2E_SHOW_WINDOW=1`; the hidden window draws no frames.
- Playwright empties `test-results/` on every run — keep phone traces elsewhere.

## Acceptance

- e2e census: no element inside the stream computes `overflow` `auto`, `scroll` or `hidden` (SVG aside), on
  desktop and mobile, with the seeded notes plus wide, narrow and hand-resized Bases.
- e2e: the stream never scrolls sideways; a too-wide table stacks on mobile and stays a grid on desktop.
- Unit tests at 100% coverage; full e2e green.
- By hand on an iPhone: scroll far, pause, flick both ways past notes with Bases and tables.

## Records to write

- ADR 0007: nothing inside the stream may scroll; the table above as evidence, one line per rejected build.
- CLAUDE.md invariant: no scroll containers inside a note.
- `docs/TESTING.md`, `docs/DONE.md`.

## Known issue, not to fix

A note with inline math (`$CO_2$`) in a table still stalls. Harness shows no scroll box, stylesheet change, late
insertion or height change for it. One untested lead: iOS dropping MathJax's web fonts after the note unloads
(`experiment/warm-math-fonts`, `5da0863`).

## Cleanup

Once merged, delete every `experiment/*` branch and `fix/lock-rerender-height`.
