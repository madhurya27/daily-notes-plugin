# TODO

## Open
Ordered by priority, from the 2026-09 comparison against
[Daily Notes Editor](https://github.com/Quorafind/Obsidian-Daily-Notes-Editor).

- [ ] Unload off-screen notes — nothing detaches rendered notes today, so a fully scrolled multi-year vault
  holds every Markdown subtree live. Keep the `state.notes === _sorted.slice(0, length)` invariant and detach
  only DOM, swapping in a fixed-height placeholder so scroll position survives. Needs an ADR.
- [ ] Date navigation: jump to specific date — spec'd as F1 in `docs/IMPROVEMENTS.md`. Also the mitigation for
  unbounded growth: an entry point other than the top.
- [ ] Refresh when the daily-note format or folder changes — `service.initialize()` runs once in `onOpen()`,
  so changing Obsidian's core daily-notes settings leaves the stream silently stale until the view reopens.
- [ ] Create today's note from the view — spec'd as F2 in `docs/IMPROVEMENTS.md`. Covers the empty state too:
  a vault with no daily notes currently renders blank.
- [ ] Filtering: filter by tag/header — land after note unloading; retrofitting it over windowing is harder.
- [ ] Tag click opens Obsidian search
- [ ] Per-note edit action — open in a split, or append to today's note. Read-only stream stays; see
  `docs/decisions.md` (2026-09-15).
- [ ] Publish to Obsidian community plugins — before the manual submission steps in `docs/IMPROVEMENTS.md`:
  - [ ] Mobile pass of `docs/TESTING.md` (iOS/Android) — **blocking**
  - [ ] Make the GitHub repo public (private as of 2026-09) — **blocking**; review the history first
  - [x] Dry-run the release workflow — `0.1.0` ran green and its draft release holds the three assets, each downloading to a byte-identical copy of the local build. Publish that draft once the repo is public
  - [x] README screenshots, desktop and phone — captured from the real app by `e2e/screenshots.spec.ts`
  - [x] GitHub repo description (mirrors the manifest's) and topics (`obsidian`, `obsidian-plugin`, `obsidian-md`, `daily-notes`, `typescript`)
- [ ] Position the README against Daily Notes Editor — a live-updating reading feed, not an inline editor.

## Features
New capability, as opposed to the fixes above. Embedded editors are ruled out by `docs/decisions.md`.

Surveyed 2026-09 against core and the community directory. **The filter: what operates on a *file* is already
solved elsewhere; only what operates on *the stream* is ours.** ★ marks the recommended first three.

- [ ] ★ Keyboard navigation — `j`/`k` between notes, `g`/`G` for ends. Nothing external reaches inside a view.
- [ ] ★ Skip empty notes — unwritten template dailies are noise; frontmatter-only is visible in the cache.
- [ ] ★ Sticky date header — a continuous feed loses track of which day it is in.
- [ ] On this day — one calendar date across years, a filter over `_sorted`.
  [Journal Review](https://github.com/Kageetai/obsidian-plugin-journal-review) shows ~200-char excerpts; ours
  is the full note. Better, not new.
- [ ] In-stream date seek, timeline in the gutter. [Calendar](https://github.com/liamcain/obsidian-calendar-plugin)
  and [Jump to Date](https://github.com/TfTHacker/obsidian42-jump-to-date) *open a file*; this scrolls. Pairs
  with F1; not another calendar widget.
- [ ] Export a contiguous range as one Markdown document — one pass over `_sorted`.
- [ ] Oldest-first toggle — mind the `state.notes` / `_sorted` pagination invariant.
- [ ] Period scope: this week / month / year — a slice of `_sorted`.
- [ ] Periodic Notes support — target [Journals](https://forum.obsidian.md/t/plugin-journals/76946) (active),
  not Periodic Notes (abandoned). Widens the audience most.
- [ ] Stats header — only scoped to the loaded stream; core Word count and the heatmap plugins own the rest.

Out of scope: random note (core ships it), task rollup (Tasks owns it, and read-only cannot check a box),
folder/tag modes (dilutes what the plugin is).

## Deferred code health
Reviewed 2026-07 and deliberately not fixed; each has a trigger for revisiting.
- [ ] Split `DailyNotesStreamView` (view vs. stream-update coordinator) — revisit when it outgrows ~400 lines (301 today), likely with inline editing or filtering.
- [ ] Replace per-lookup `querySelector` in `findNoteElement` with a path→element `Map` (`captureAnchor` is O(n²) on refresh) — revisit if settings refresh lags with hundreds of loaded notes, and unconditionally when note unloading or date navigation lands.
- [ ] `nextElementSibling as HTMLElement` casts in `CollapsibleManager.applyHeaderCollapse` — Obsidian augments `Element` with class helpers, so the casts can likely narrow to `Element`; fold into the next CollapsibleManager change.
