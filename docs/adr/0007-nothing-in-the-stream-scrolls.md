# 0007. Nothing inside the stream scrolls

- **Status:** Superseded by [0008](0008-nothing-scrolls-on-mobile.md), which
  limits the rule to mobile
- **Date:** 2026-09-24

## Context

On iOS, once notes unload (ADR 0006), a flick stops 0.1–0.4 s after the finger
lifts. Obsidian's own notes do too: the cause is WebKit. Found by elimination
over ~15 phone builds:

| Build                      | Result                          |
| -------------------------- | ------------------------------- |
| Unloading off              | No stalls; stutters after sleep |
| Base embeds hidden         | No stalls                       |
| Every scroll box removed   | No stalls, bar inline math      |
| Only `.bases-view` clipped | Fewer, not none                 |

The trigger is any scroll container inside the scroller, `overflow: hidden`
included.

## Decision

No element inside the stream is a scroll container.

- Wide content fits: code wraps, too-wide tables stack as cards, Bases shrink
  their column cap, diagrams scale, embedded notes grow.
- The rest is clipped with `overflow: clip`, which is no scroll container.
- `ScrollBoxGuard` clips what the stylesheet misses, once the scroll is still: a
  style read mid-glide forces a page-wide recalc.

## Consequences

- Overflow is cut off, not reachable: a hand-resized Base column clips.
- `e2e-tests/scroll-boxes.spec.ts` checks no element computes `auto`, `scroll`
  or `hidden`.
- PDFs, iframes and canvases are unchecked.

## Rejected alternatives

- **Keep notes loaded** — memory stutters after sleep.
- **Clip Bases only mid-glide** — a swipe starting on a Base broke.
- **Fit `.bases-view` alone** — other boxes still stalled.
- **Stable re-render heights, deferred Bases, guarded Bases scroll writes, an
  inner scroller** — still stalled.
- **`* { overflow: clip }`** — cuts bullets, checkboxes and fold arrows.
