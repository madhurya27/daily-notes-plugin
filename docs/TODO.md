# TODO

## Open

Ordered by priority, from the 2026-09 comparison against
[Daily Notes Editor](https://github.com/Quorafind/Obsidian-Daily-Notes-Editor).

- [ ] iOS still stalls on inline math in a table. Lead: MathJax fonts dropped on
      unload (`experiment/warm-math-fonts`, `5da0863`); keep that branch when
      deleting the other experiments.
- [ ] iOS: a Base's table draws some rows blank for a frame as a note above it
      renders mid-glide. Bases draws only rows it measured in view, and
      re-measures after the paint. The probe that traced it is `src/probe.ts` on
      `experiment/stream-layer`; keep that branch until this is fixed.
- [ ] iOS: a change inside the note the pane's top crosses, such as an image
      loading above the reader, can still jump a frame: pinning holds only the
      notes around it (ADR 0013).
- [ ] PDF, iframe, canvas, Dataview: check for scroll boxes; give what cannot
      fit a preview that opens on tap.
- [ ] Mermaid's "Allow" doesn't redraw the stream: re-render on
      `post-processor-change`.
- [ ] Desktop: a setting toggled within ~3 s of scrolling loses the reader's
      place. The notes above have no remembered height yet, and Chromium's
      anchoring does not absorb their growth once they render.
- [x] Time a search step on a real phone: 4–6 s in e2e mobile, 85 ms on desktop.
      Likely the hidden window's frame rate; loading is not the cost, so
      preloading would not help.
- [ ] Publish to Obsidian community plugins — before the manual submission steps
      in `docs/IMPROVEMENTS.md`:
    - [ ] Mobile pass of `docs/TESTING.md` (iOS/Android) — **blocking**;
          includes the jump suggester's date wheel, which the e2e mobile project
          cannot reach (desktop Chromium), and the scroll stall on Android
    - [ ] Make the GitHub repo public (private as of 2026-09) — **blocking**;
          review the history first
    - [x] Dry-run the release workflow — `0.1.0` ran green and its draft release
          holds the three assets, each downloading to a byte-identical copy of
          the local build. Publish that draft once the repo is public
    - [x] README screenshots, desktop and phone — captured from the real app by
          `e2e/screenshots.spec.ts`
    - [x] GitHub repo description (mirrors the manifest's) and topics
          (`obsidian`, `obsidian-plugin`, `obsidian-md`, `daily-notes`,
          `typescript`)
- [ ] Position the README against Daily Notes Editor — a live-updating reading
      feed, not an inline editor.
- [ ] A phone recording for the README. Desktop Chromium can't fake a phone
      convincingly: a touch swipe lacks a thumb's feel, there is no on-screen
      keyboard to type with, and the phone's own chrome (tapping the title bar
      to scroll to the top) can't be tapped.
- [x] Show the features in the README: `e2e/screenshots.spec.ts` captures a
      still per feature and a recording of the stream updating live, scrolling
      and searching, from the demo vault.

## Features

New capability, as opposed to the fixes above. Embedded editors are ruled out by
D-001.

Surveyed 2026-09 against core and the community directory. **The filter: what
operates on a _file_ is already solved elsewhere; only what operates on _the
stream_ is ours.** ★ marks the recommended first two.

- [ ] ★ Keyboard navigation — `j`/`k` between notes, `g`/`G` for ends. Nothing
      external reaches inside a view.
- [ ] On this day — one calendar date across years, a filter over `_sorted`.
      [Journal Review](https://github.com/Kageetai/obsidian-plugin-journal-review)
      shows ~200-char excerpts; ours is the full note. Better, not new.
- [ ] In-stream date seek, timeline in the gutter.
      [Calendar](https://github.com/liamcain/obsidian-calendar-plugin) and
      [Jump to Date](https://github.com/TfTHacker/obsidian42-jump-to-date) _open
      a file_; this scrolls. The modal already jumps — this is the continuous
      version of it, not another calendar widget.
- [ ] Export a contiguous range as one Markdown document — one pass over
      `_sorted`.
- [ ] Oldest-first toggle — mind the `state.notes` / `_sorted` pagination
      invariant.
- [ ] Period scope: this week / month / year — a slice of `_sorted`.
- [ ] Periodic Notes support — target
      [Journals](https://forum.obsidian.md/t/plugin-journals/76946) (active),
      not Periodic Notes (abandoned). Widens the audience most.
- [ ] Stats header — only scoped to the loaded stream; core Word count and the
      heatmap plugins own the rest.

Out of scope: random note (core ships it), task rollup (Tasks owns it, and
read-only cannot check a box), folder/tag modes (dilutes what the plugin is), a
tag/header filter (search does it), sticky date header (D-012).
