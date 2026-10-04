# 0017. Forget a note's heights once it is edited

- **Status:** Accepted; supersedes [0010](0010-layout-memory.md) in part
- **Date:** 2026-10-03

## Context

ADR 0010 kept an edited note's last height: the layout's median was the only
other guess, and further off. A note grown since it was measured, on another
device or while the plugin was off, reserved its old height: a glide up past it
ran out of scroll short of the newest note (D-090). The estimate now errs tall
(D-092).

## Decision

`NoteHeights` keeps, with each note's heights, its mtime as measured, read from
the vault on `keep`. Once the vault is indexed, `retainOnly` drops a note whose
mtime moved, as it drops one deleted. In a session, the plugin forgets a note's
heights on `vault.on("modify")`, before any view hears of the edit; a view
holding the note unloaded estimates it afresh once the scroll is still. The
store format is version 5.

## Consequences

- A note edited elsewhere reserves the estimate until it renders here.
- Every save of a note re-reserves the placeholders at the next rest.
- A note re-measured at the same height keeps its new mtime only once something
  else is saved.

## Rejected alternatives

- **Keeping the old height (ADR 0010)** — short for a note grown since.
- **The taller of the old height and the estimate** — the estimate already errs
  tall.
- **Re-measuring off screen on edit** — renders a note no one is looking at.
- **Checking mtimes on every read** — every placeholder of a batch would look
  each note up in the vault, and the cached estimate would not notice.
