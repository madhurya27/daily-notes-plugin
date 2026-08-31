# 0003. Re-render from `metadataCache`, not `vault.modify`

- **Status:** Accepted
- **Date:** 2026-08-20 (recorded 2026-08-30)

## Context

The view re-rendered a note on `vault.on("modify")`. That event fires as soon as
the file is written, before `metadataCache` catches up — and the renderer reads
the cache to slice frontmatter off the body. The result was a note re-rendered
at a stale frontmatter offset: outdated properties, and body text that had been
part of the frontmatter block a moment earlier.

## Decision

Drive re-render from `metadataCache.on("changed")`, which fires after the cache
holds the new parse of that file. The handler replaces the note's DOM element
in place rather than rebuilding the batch.

`create`, `delete` and `rename` stay on vault events: they change *which* notes
exist, not what a note's parsed content is, and they route through
`service.insertSorted` / `removeSorted` so sort order and the cached range stay
in step.

## Consequences

- Re-render lags the keystroke by the cache's own debounce. In a read-only
  stream that is invisible.
- Anything else reading `metadataCache` during a render is reading the same
  version the event announced.
- The two event families must not be merged back together on the grounds that
  they look similar; they answer different questions.

## Rejected alternatives

- **Keep `vault.modify`, re-read the file directly** — bypasses the cache the renderer already uses, so the offset can still disagree.
- **Keep `vault.modify` with a delay** — a guess at the cache's timing, wrong under load.
- **Re-render the whole batch on any change** — loses scroll position and collapse state for an edit to one note.
