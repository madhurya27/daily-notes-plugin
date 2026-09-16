# TODO

## Open
- [ ] Editability: click to edit inline
- [ ] Date navigation: jump to specific date — spec'd as F1 in `docs/IMPROVEMENTS.md`
- [ ] Create today's note from the view — spec'd as F2 in `docs/IMPROVEMENTS.md`
- [ ] Filtering: filter by tag/header
- [ ] Tag click opens Obsidian search
- [ ] Publish to Obsidian community plugins — M1–M6 done; before M7's manual submission steps:
  - [ ] Mobile pass of `docs/TESTING.md` (iOS/Android) — **blocking**
  - [ ] Make the GitHub repo public (private as of 2026-09) — **blocking**; review the history first
  - [x] Dry-run the release workflow — `0.1.0` ran green and its draft release holds the three assets, each downloading to a byte-identical copy of the local build. Publish that draft once the repo is public
  - [ ] README screenshot or GIF, desktop and phone layouts
  - [ ] GitHub repo description and topics (both empty)

## Deferred code health
Reviewed 2026-07 and deliberately not fixed; each has a trigger for revisiting.
- [ ] Split `DailyNotesStreamView` (view vs. stream-update coordinator) — revisit when it outgrows ~400 lines (301 today), likely with inline editing or filtering.
- [ ] Replace per-lookup `querySelector` in `findNoteElement` with a path→element `Map` (`captureAnchor` is O(n²) on refresh) — revisit if settings refresh lags with hundreds of loaded notes.
- [ ] `nextElementSibling as HTMLElement` casts in `CollapsibleManager.applyHeaderCollapse` — Obsidian augments `Element` with class helpers, so the casts can likely narrow to `Element`; fold into the next CollapsibleManager change (I4 and I20 shipped without it).
