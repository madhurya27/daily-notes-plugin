# TODO

## Open

Ordered by priority. Frame-level iOS glitches wait on a recording (D-099).

- [ ] `e2e/ios/search.spec.ts`, "a search paints every match", failed twice in
      ~110 runs: once a Search tap opened no bar, once the bar opened but no
      match was marked current. Neither came back in 50 cold starts.
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
      `phone.type()` types what it shows written, key by key.
- [ ] Can reading drop cards and stacked tables for sideways scrolling? ADR 0007
      found any scroll box, `hidden` included, ends iOS glides 0.1–0.4 s after
      the lift once notes unload, intermittently. Yet in the editing spike's
      open note (tag `archive/edit-today`), nothing clipped, flicks over its
      wide Bases glided in full: 24 of 24, then 8 of 8. On the iPhone, two
      builds: today's, and one where every wide Base (`.bases-view`) and table
      scrolls sideways, without `asCards` or `stackWideTables`. Same vault,
      notes unloading: jump deep, many flicks over Bases and tables, count
      glides stopping early (`phone.glidesPast`; `e2e/ios/jump.spec.ts` sets up
      the jump). Its 0.5 s check can miss a short stop: check below it too, or
      record the screen (D-099). Equal: an ADR superseding 0008's cards. Not:
      keep cards, and note the numbers in ADR 0008.

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
