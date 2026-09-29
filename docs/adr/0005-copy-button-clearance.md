# 0005. Reserve the copy button's corner in rendered code

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

Obsidian wraps rendered code (`white-space: pre-wrap`) and pins its
`.copy-code-button` absolutely to the block's top-right corner, so the end of a
long first line sits under the icon and cannot be read.

Core hides the button until hover, then re-shows it unconditionally under
`.is-mobile` where there is no hover. So the overlap is permanent on a phone and
lasts as long as the pointer is over the block on desktop (8px of text covered).

## Decision

`.daily-note-content pre::before` floats an empty box in that corner, 3em wide
and 1.5em tall, for the first line to wrap around. It applies on every platform,
hover or not: no character is ever hidden.

The height is load-bearing: `pre` has `overflow-x: auto` and contains the float,
so at 2.5em a one-line block grew from 48px to 64px. At 1.5em neither a one-line
nor a wrapped block changes height and the float still spans the button. An e2e
test asserts zero overlap between text and button rects.

## Consequences

- The first line is ~3em narrower everywhere, including desktop before hover —
  the price of a rule with no state to depend on.
- Stricter than core Obsidian, so the stream and a normal reading view wrap a
  long first line at different points.
- If Obsidian restyles or moves the button, the reserved corner is stale — the
  e2e test is what catches it.

## Rejected alternatives

- **Scope the float to `.is-mobile`** — matches core exactly and leaves desktop
  untouched, but keeps core's hover overlap and makes the rule depend on a class
  the e2e mobile project cannot exercise at 420px.
- **`padding-right` on `pre`** — shortens every line, not just the one beside
  the button.
- **Hide the button in the stream** — the stream is read-only, so copying code
  is one of the few useful actions left.
- **Restyle or reposition the button** — fighting a core element that core
  updates without warning.
