# TODO

## Open

Ordered by priority, from the 2026-09 comparison against
[Daily Notes Editor](https://github.com/Quorafind/Obsidian-Daily-Notes-Editor).

- [ ] iOS still stalls on inline math in a table. Lead: MathJax fonts dropped on
      unload (`experiment/warm-math-fonts`, `5da0863`).
- [ ] iOS: a Base's table draws some rows blank for a frame as a note above it
      renders mid-glide. Bases draws only rows it measured in view, and
      re-measures after the paint. The probe that traced it is `src/probe.ts` on
      `experiment/stream-layer`; keep that branch until this is fixed.
- [ ] iOS: a change inside the note the pane's top crosses, such as an image
      loading above the reader, can still jump a frame: pinning holds only the
      notes around it (ADR 0013).
- [ ] iOS: a web page in an iframe may scroll inside its frame, where the scroll
      box guard cannot see; a video player does not. Check that a flick over one
      still glides.
- [ ] Publish to Obsidian community plugins — before the manual submission steps
      in `docs/IMPROVEMENTS.md`:
    - [ ] Mobile pass of `docs/TESTING.md` (iOS/Android) — **blocking**;
          includes the jump suggester's date wheel, which the e2e mobile project
          cannot reach (desktop Chromium), and the scroll stall on Android.
          `pnpm run test:ios` runs the items marked **[ios]**
    - [ ] Make the GitHub repo public (private as of 2026-09) — **blocking**;
          review the history first, then publish the `0.1.0` draft release (its
          assets match the local build)
- [ ] Position the README against Daily Notes Editor — a live-updating reading
      feed, not an inline editor.
- [ ] Move the rest of the Mobile checklist in `docs/TESTING.md` into `e2e/ios/`
      specs (ADR 0016). First: jump to an old date then flick up, nothing jumps;
      the title-bar tap; backgrounding and returning; the date wheel, a native
      picker XCUITest can turn.
- [ ] A phone recording for the README. Desktop Chromium can't fake a phone
      convincingly; `e2e/ios/` drives a real one, title-bar taps included, and
      Appium can record its screen.

## Features

New capability, as opposed to the fixes above. Embedded editors are ruled out by
D-001.

Surveyed 2026-09 against core and the community directory. **The filter: what
operates on a _file_ is already solved elsewhere; only what operates on _the
stream_ is ours.** Ordered by priority: worth per cost, journal-specific first.
★ marks the first two.

- [ ] ★ On this day — one calendar date across years, a filter over `_sorted`.
      [Journal Review](https://github.com/Kageetai/obsidian-plugin-journal-review)
      shows ~200-char excerpts; ours is the full note. Better, not new.
- [ ] ★ Gap markers — "12 days without a note" between notes. Not a block: the
      window manager and `StreamBlocks` must not take it for a note.
- [ ] Month and year dividers — a break that scrolls with the notes, unlike the
      sticky header D-012 rejected. Same caveat; build with gap markers.
- [ ] Keyboard navigation — `j`/`k` between notes, `g`/`G` for ends. Nothing
      external reaches inside a view.
- [ ] Notes as `article` landmarks labelled with their date, so a screen reader
      steps note to note. Pairs with keyboard navigation.
- [ ] Fold a whole note to its title, with collapse-all and expand-all commands
      — skimming a stretch of weeks. Builds on `CollapsibleManager`.
- [ ] Weekday in the title — `2026-03-14 · Saturday`, or "Yesterday". Decide
      first: the file name, or a label the reader configures.
- [ ] In-stream date seek, timeline in the gutter.
      [Calendar](https://github.com/liamcain/obsidian-calendar-plugin) and
      [Jump to Date](https://github.com/TfTHacker/obsidian42-jump-to-date) _open
      a file_; this scrolls. The modal already jumps — this is the continuous
      version of it, not another calendar widget.
- [ ] Periodic Notes support — target
      [Journals](https://forum.obsidian.md/t/plugin-journals/76946) (active),
      not Periodic Notes (abandoned). Widens the audience most.
- [ ] Period scope: this week / month / year — a slice of `_sorted`.
- [ ] Export a contiguous range as one Markdown document — one pass over
      `_sorted`.
- [ ] Oldest-first toggle — mind the `state.notes` / `_sorted` pagination
      invariant.
- [ ] Stats header — only scoped to the loaded stream; core Word count and the
      heatmap plugins own the rest.

Out of scope: random note (core ships it), task rollup (Tasks owns it, and
read-only cannot check a box), folder/tag modes (dilutes what the plugin is), a
tag/header filter (search does it), sticky date header (D-012).
