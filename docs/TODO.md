# TODO

## Open
- [ ] Editability: click to edit inline
- [ ] Date navigation: jump to specific date — spec'd as F1 in `docs/IMPROVEMENTS.md`
- [ ] Create today's note from the view — spec'd as F2 in `docs/IMPROVEMENTS.md`
- [ ] Filtering: filter by tag/header
- [ ] Tag click opens Obsidian search
- [ ] Publish to Obsidian community plugins — see M items in `docs/IMPROVEMENTS.md`

## Deferred code health
Reviewed 2026-07 and deliberately not fixed; each has a trigger for revisiting.
- [ ] Split `DailyNotesStreamView` (view vs. stream-update coordinator) — revisit when it outgrows ~400 lines (301 today), likely with inline editing or filtering.
- [ ] Replace per-lookup `querySelector` in `findNoteElement` with a path→element `Map` (`captureAnchor` is O(n²) on refresh) — revisit if settings refresh lags with hundreds of loaded notes.
- [ ] Split `tests/DailyNotesStreamView.test.ts` (1137 lines) by concern — **due**: I1–I6 have shipped.
- [ ] `nextElementSibling as HTMLElement` casts in `CollapsibleManager.applyHeaderCollapse` — Obsidian augments `Element` with class helpers, so the casts can likely narrow to `Element`; fold into the next CollapsibleManager change (I4 and I20 shipped without it).
