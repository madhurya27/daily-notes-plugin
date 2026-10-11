# TODO

## Open

Ordered by priority. Frame-level iOS glitches wait on a recording (D-099).

- [ ] `e2e/ios/search.spec.ts`, "a search paints every match", failed twice in
      ~110 runs: once a Search tap opened no bar, once the bar opened but no
      match was marked current. Neither came back in 50 cold starts.
- [ ] Code review findings: `docs/IMPROVEMENTS.md`, R — bugs.
- [ ] Publish to Obsidian community plugins — before the manual submission steps
      in `docs/IMPROVEMENTS.md`:
    - [ ] Make the GitHub repo public (private as of 2026-09) — **blocking**;
          review the history first
    - [ ] Release `1.0.0`, the first public version (D-100); the `0.x` drafts
          stay unpublished. Delete `0.6.0` from `versions.json` in the bump
          commit; write the notes from the README, not the log since `0.6.0`

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
- [ ] Keep the place across a restart. `StreamPlace` lives only in ephemeral
      state, so Back finds it but a restored tab opens at the newest note.
      Persist it in `getState`; a stream opened fresh still starts at the top.
- [ ] Show in stream: a command and a file-menu item on a daily note that open
      the stream at it, through the jump's path (D-082). From a note, only Back
      reaches the stream now.
- [ ] Labels on the title line: the weekday (`2026-03-14 · Saturday`, or
      "Yesterday") and the gap since the note before ("12 days later"). Decide
      first: from the file name, or a label the reader configures. Creating or
      deleting a note changes its neighbour's gap, so that note re-renders.
- [ ] Fold headings by name: a setting listing headings (`Tasks`, `Log`) that
      start folded in every note, for template sections read rarely. A default
      for `CollapsibleManager`; the reader's own fold or unfold wins.
- [ ] Fold a whole note to its title, from a chevron on its header, kept like a
      section's (`CollapsibleManager`).
- [ ] Notes as `article` landmarks labelled with their date, so a screen reader
      steps note to note.
- [ ] Keyboard navigation — `j`/`k` between notes, `g`/`G` for ends. Nothing
      external reaches inside a view.
- [ ] Jump by month or relative date: the prompt takes `2025-03`, `last week`,
      `a year ago`, landing on the nearest older note (D-015).
- [ ] Month and year dividers — a heading inside the header of a month's newest
      note, not a block of its own: the window manager and `StreamBlocks` take
      every block for a note.
- [ ] Leave out a note by property (`stream: false`): a `NoteFilter`, like
      hiding empty notes, for days not to show when the screen is shared.

Out of scope:

- Random note — core ships it.
- Task rollup — Tasks owns it, and read-only cannot check a box.
- Folder or tag modes — dilute what the plugin is.
- A tag or header filter — search does it.
- A sticky date header — D-012.
- Collapse-all — leaves a list of dates, which the file explorer already is.
- A gutter timeline — scrubbing writes the scroll, which iOS drops or undoes
  mid-glide (ADR 0013); the jump modal reaches any date.
- Journals support, or Periodic Notes' weekly and monthly notes — a second note
  source behind `DailyNoteService`. Revisit if users ask once it is published.
  Periodic Notes' daily settings already work (`e2e/periodic-notes.spec.ts`).
- Hiding untouched notes whose Templater blocks write several lines — D-117's
  rejected fingerprints. Revisit if users ask once it is published.
- Period scope — newest-first already opens on this week; the jump modal reaches
  past ones.
- Range export, a stats header — niche; core Word count and heatmap plugins
  cover stats.
- Oldest-first — newest-first is assumed by pagination, inserts and D-091's stop
  at the top.
