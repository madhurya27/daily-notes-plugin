# TODO

## Open
Ordered by priority, from the 2026-09 comparison against
[Daily Notes Editor](https://github.com/Quorafind/Obsidian-Daily-Notes-Editor).

- [ ] Time a search step on a real phone: 4–6 s in e2e mobile, 85 ms on desktop. Likely the hidden window's
  frame rate; loading is not the cost, so preloading would not help.
- [ ] Per-note edit action — open in a split, or append to today's note. Read-only stream stays; see
  `docs/decisions.md` (2026-09-15).
- [ ] Publish to Obsidian community plugins — before the manual submission steps in `docs/IMPROVEMENTS.md`:
  - [ ] Mobile pass of `docs/TESTING.md` (iOS/Android) — **blocking**; includes the jump suggester's date
        wheel, which the e2e mobile project cannot reach (desktop Chromium)
  - [ ] Make the GitHub repo public (private as of 2026-09) — **blocking**; review the history first
  - [x] Dry-run the release workflow — `0.1.0` ran green and its draft release holds the three assets, each downloading to a byte-identical copy of the local build. Publish that draft once the repo is public
  - [x] README screenshots, desktop and phone — captured from the real app by `e2e/screenshots.spec.ts`
  - [x] GitHub repo description (mirrors the manifest's) and topics (`obsidian`, `obsidian-plugin`, `obsidian-md`, `daily-notes`, `typescript`)
- [ ] Position the README against Daily Notes Editor — a live-updating reading feed, not an inline editor.
- [ ] Typecheck and lint `tests/`: `tsconfig.json` includes only `src/`, and ESLint ignores `tests/`.

## Features
New capability, as opposed to the fixes above. Embedded editors are ruled out by `docs/decisions.md`.

Surveyed 2026-09 against core and the community directory. **The filter: what operates on a *file* is already
solved elsewhere; only what operates on *the stream* is ours.** ★ marks the recommended first two.

- [ ] ★ Keyboard navigation — `j`/`k` between notes, `g`/`G` for ends. Nothing external reaches inside a view.
- [ ] ★ Skip empty notes — unwritten template dailies are noise; frontmatter-only is visible in the cache.
- [ ] On this day — one calendar date across years, a filter over `_sorted`.
  [Journal Review](https://github.com/Kageetai/obsidian-plugin-journal-review) shows ~200-char excerpts; ours
  is the full note. Better, not new.
- [ ] In-stream date seek, timeline in the gutter. [Calendar](https://github.com/liamcain/obsidian-calendar-plugin)
  and [Jump to Date](https://github.com/TfTHacker/obsidian42-jump-to-date) *open a file*; this scrolls. The
  modal already jumps — this is the continuous version of it, not another calendar widget.
- [ ] Export a contiguous range as one Markdown document — one pass over `_sorted`.
- [ ] Oldest-first toggle — mind the `state.notes` / `_sorted` pagination invariant.
- [ ] Period scope: this week / month / year — a slice of `_sorted`.
- [ ] Periodic Notes support — target [Journals](https://forum.obsidian.md/t/plugin-journals/76946) (active),
  not Periodic Notes (abandoned). Widens the audience most.
- [ ] Stats header — only scoped to the loaded stream; core Word count and the heatmap plugins own the rest.

Out of scope: random note (core ships it), task rollup (Tasks owns it, and read-only cannot check a box),
folder/tag modes (dilutes what the plugin is), a tag/header filter (search does it),
sticky date header (`docs/decisions.md`, 2026-09-21).

## Deferred, contingent on how unloading behaves in real use
Only worth doing if the placeholder estimate proves visibly wrong; Chromium's
own scroll anchoring absorbs most of it today
([ADR 0006](adr/0006-unload-off-screen-notes.md)).
- [ ] Correct `scrollTop` by the delta when a block **above** the viewport renders and changes height — removes the jump whatever the estimate. Needs `overflow-anchor: none` on the container, which means owning behaviour Chromium currently handles.
- [ ] Estimate per note from `TFile.stat.size` — only if the median proves too coarse for a vault of uneven notes.
