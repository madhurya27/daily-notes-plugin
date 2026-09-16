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
- [ ] Editability: click to edit inline — **decide before building.** Embedding editors is what forces Daily
  Notes Editor's four `prototype` patches and why its view cannot react to vault events; live updates,
  collapsing and testability are downstream of read-only rendering. Cheaper 80%: a per-note open/append
  action. Either way the outcome belongs in `docs/decisions.md`.
- [ ] Publish to Obsidian community plugins — before the manual submission steps in `docs/IMPROVEMENTS.md`:
  - [ ] Mobile pass of `docs/TESTING.md` (iOS/Android) — **blocking**
  - [ ] Make the GitHub repo public (private as of 2026-09) — **blocking**; review the history first
  - [x] Dry-run the release workflow — `0.1.0` ran green and its draft release holds the three assets, each downloading to a byte-identical copy of the local build. Publish that draft once the repo is public
  - [x] README screenshots, desktop and phone — captured from the real app by `e2e/screenshots.spec.ts`
  - [x] GitHub repo description (mirrors the manifest's) and topics (`obsidian`, `obsidian-plugin`, `obsidian-md`, `daily-notes`, `typescript`)
- [ ] Position the README against Daily Notes Editor — a live-updating reading feed, not an inline editor.

## Features
New capability, as opposed to the fixes above. Each fits the read-only reading feed; anything needing embedded
editors belongs with the editability decision in `## Open`.

Surveyed 2026-09 against core plugins and the community directory. **The filter: anything operating on a
*file* is already solved by core or an established plugin — only what operates on *the stream itself* is ours.**
**Recommended first three are marked ★.**

- [ ] Keyboard navigation — `j`/`k` between notes, `g`/`G` for ends. ★ Intra-view, so nothing external covers
  it, and no embedded editors compete for focus.
- [ ] Skip empty notes — template-created but unwritten dailies are noise in a feed; detectable as
  frontmatter-only from the metadata cache. ★ Uncontested.
- [ ] Sticky date header — a continuous feed loses track of which day it is in. ★ Uncontested.
- [ ] On this day — the same calendar date across previous years as its own stream. A filter over `_sorted`.
  [Journal Review](https://github.com/Kageetai/obsidian-plugin-journal-review) already does this with ~200-char
  excerpts and fixed spans; ours is the full rendered note in the stream. Better, not new — scope it that way.
- [ ] In-stream date seek, with a timeline in the gutter. [Calendar](https://github.com/liamcain/obsidian-calendar-plugin)
  and [Jump to Date](https://github.com/TfTHacker/obsidian42-jump-to-date) both *open a file*; this scrolls the
  stream instead. Pairs with F1 — do not rebuild a calendar widget.
- [ ] Export or copy a contiguous range as one Markdown document — one pass over `_sorted`.
- [ ] Oldest-first toggle — mind the `state.notes` / `_sorted` pagination invariant.
- [ ] Period scope: this week / month / year — a slice of `_sorted`.
- [ ] Periodic Notes support — weekly/monthly/quarterly interleaved. Target
  [Journals](https://forum.obsidian.md/t/plugin-journals/76946) (~110k installs, active), not Periodic Notes,
  which is abandoned. Widens the audience most.
- [ ] Stats header — only if scoped to the loaded stream. Core Word count, Better Word Count and the heatmap
  plugins already cover per-file and per-vault counts, and Calendar shows a per-day writing meter.

Out of scope: random note (core ships "Open random note"), task rollup (the Tasks plugin owns it, and
read-only cannot check a box), and folder/tag modes (dilutes what a plugin named Daily Notes Stream is).

## Deferred code health
Reviewed 2026-07 and deliberately not fixed; each has a trigger for revisiting.
- [ ] Split `DailyNotesStreamView` (view vs. stream-update coordinator) — revisit when it outgrows ~400 lines (301 today), likely with inline editing or filtering.
- [ ] Replace per-lookup `querySelector` in `findNoteElement` with a path→element `Map` (`captureAnchor` is O(n²) on refresh) — revisit if settings refresh lags with hundreds of loaded notes, and unconditionally when note unloading or date navigation lands.
- [ ] `nextElementSibling as HTMLElement` casts in `CollapsibleManager.applyHeaderCollapse` — Obsidian augments `Element` with class helpers, so the casts can likely narrow to `Element`; fold into the next CollapsibleManager change.
