# TODO

## Open

Ordered by priority. Frame-level iOS glitches wait on a recording (D-099).

- [ ] Raise `minAppVersion` to 1.14.4 at the next version bump (D-100).
- [ ] A turn to portrait near the stream's end loses the place by a screen:
      `e2e/ios/layout.spec.ts:103` fails ~1 in 3 on "the place, on the turn
      back". Notes still pinned at landscape heights leave the pane too short,
      the scroll clamps, and the re-pin ~50 ms later finds the place gone
      (`scroll-anchor.ts`; ADR 0013, 0015). Mid-stream turns hold.
- [ ] At a 22px text size, "goes to the end of the stream when no older note is
      left" (`empty-notes.spec.ts`) stops ~15,900px short on mobile. Set the
      size through localStorage `base-font-size`, not the vault config, which
      1.14 reads once.
- [ ] Check a 1.14 kanban Base for a sideways scroll box on mobile (ADR 0008);
      add it to `scroll-boxes.spec.ts`.
- [ ] At a 22px text size a task's checkbox sits 1.5px off its label's center on
      mobile (`stream.spec.ts`, "centers a task's checkbox"); test it at more
      than 16px.
- [ ] Cut `test:ios`'s ~4 min further: each stroke's `performActions` takes
      0.5–0.9 s in WebDriverAgent. Keep three flicks a test (D-085).
- [ ] `jump.spec.ts`'s flick up from an old date fails some full runs, never
      alone: the text under the thumb jumps ~3,000 px mid-glide, in 5 runs since
      2026-10-04.
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
- [ ] Group the settings in `SettingGroup` cards, rejected in D-078 for needing
      1.11; open once `minAppVersion` is raised (D-100).

## Features

New capability, as opposed to the fixes above. Embedded editors are ruled out by
D-001.

Surveyed 2026-09 against core and the community directory. **The filter: what
operates on a _file_ is already solved elsewhere; only what operates on _the
stream_ is ours**, and only where it is worth its complexity. Ordered by
priority.

- [ ] On this day — one calendar date across years: a `NoteFilter`, like hiding
      empty notes.
      [Journal Review](https://github.com/Kageetai/obsidian-plugin-journal-review)
      shows ~200-char excerpts; ours is the full note. Better, not new.
- [ ] Labels on the title line: the weekday (`2026-03-14 · Saturday`, or
      "Yesterday") and the gap since the note before ("12 days later"). Decide
      first: from the file name, or a label the reader configures. Creating or
      deleting a note changes its neighbour's gap, so that note re-renders.
- [ ] Fold a whole note to its title, from a chevron on its header, kept like a
      section's (`CollapsibleManager`).
- [ ] Notes as `article` landmarks labelled with their date, so a screen reader
      steps note to note.
- [ ] Keyboard navigation — `j`/`k` between notes, `g`/`G` for ends. Nothing
      external reaches inside a view.
- [ ] Month and year dividers — a heading inside the header of a month's newest
      note, not a block of its own: the window manager and `StreamBlocks` take
      every block for a note.

Out of scope:

- Random note — core ships it.
- Task rollup — Tasks owns it, and read-only cannot check a box.
- Folder or tag modes — dilute what the plugin is.
- A tag or header filter — search does it.
- A sticky date header — D-012.
- Collapse-all — leaves a list of dates, which the file explorer already is.
- A gutter timeline — scrubbing writes the scroll, which iOS drops or undoes
  mid-glide (ADR 0013); the jump modal reaches any date.
- Periodic Notes or Journals support — a second note source behind
  `DailyNoteService`. Revisit if users ask once it is published.
- Period scope — newest-first already opens on this week; the jump modal reaches
  past ones.
- Range export, a stats header — niche; core Word count and heatmap plugins
  cover stats.
- Oldest-first — newest-first is assumed by pagination, inserts and D-091's stop
  at the top.
