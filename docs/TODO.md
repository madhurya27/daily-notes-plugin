# TODO

## Open

Ordered by priority. Frame-level iOS glitches wait on a recording (D-099).

- [ ] Publish to Obsidian community plugins — before the manual submission steps
      in `docs/IMPROVEMENTS.md`:
    - [ ] Make the GitHub repo public (private as of 2026-09) — **blocking**;
          review the history first, then publish the `0.1.0` draft release (its
          assets match the local build)
- [ ] Position the README against
      [Daily Notes Editor](https://github.com/Quorafind/Obsidian-Daily-Notes-Editor)
      — a live-updating reading feed, not an inline editor.
- [ ] A phone recording for the README, taken on a real iPhone: `e2e/ios/`
      drives it, title-bar taps included, and Appium can record its screen. The
      e2e mobile run is desktop Chromium, which doesn't look like a phone.

## Features

New capability, as opposed to the fixes above. Embedded editors are ruled out by
D-001.

Surveyed 2026-09 against core and the community directory. **The filter: what
operates on a _file_ is already solved elsewhere; only what operates on _the
stream_ is ours**, and only where it is worth its complexity. Ordered by
priority.

- [ ] On this day — one calendar date across years, a filter over `_sorted`.
      [Journal Review](https://github.com/Kageetai/obsidian-plugin-journal-review)
      shows ~200-char excerpts; ours is the full note. Better, not new.
- [ ] Weekday in the title — `2026-03-14 · Saturday`, or "Yesterday". Decide
      first: the file name, or a label the reader configures.
- [ ] Notes as `article` landmarks labelled with their date, so a screen reader
      steps note to note.
- [ ] Keyboard navigation — `j`/`k` between notes, `g`/`G` for ends. Nothing
      external reaches inside a view.

Out of scope:

- Random note — core ships it.
- Task rollup — Tasks owns it, and read-only cannot check a box.
- Folder or tag modes — dilute what the plugin is.
- A tag or header filter — search does it.
- A sticky date header — D-012.
- Gap markers, month or year dividers — blocks that aren't notes, inside the
  window manager and `StreamBlocks`.
- Folding a whole note — a height change outside `repin` (ADR 0013).
- A gutter timeline — the jump modal covers it.
- Periodic Notes or Journals support — a second note source.
- Period scope, range export, a stats header — niche.
- Oldest-first — inverts the `state.notes` pagination invariant.
