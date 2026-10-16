# TODO

## Open

Ordered by priority. Frame-level iOS glitches wait on a recording (D-099).

- [ ] Publish to Obsidian community plugins — before the manual submission steps
      in `docs/IMPROVEMENTS.md`:
    - [ ] Make the GitHub repo public (private as of 2026-09) — **blocking**
    - [ ] Release `1.0.0`, the first public version (D-100). Delete the `0.x`
          entries from `versions.json` in the bump commit; write the notes from
          the README
    - [ ] Once listed, lead the README's Install with **Settings → Community
          plugins → Browse**; keep the manual download as the alternative
- [ ] A hard flick up the stream on the iPhone outruns the drawing of notes: a
      note waits its turn in the render queue (ADR 0004) while the glide moves
      200–800 px a frame, and shows undrawn for 0–11 frames a glide. A render
      margin of 3 panes was no clearly better. Reopen if it shows in use. The
      other blanks, over drawn text, Obsidian's reading view shows too (up to
      185 ms).
- [ ] On the iPhone, a flick up into a 10,000-line note never drawn, heights
      forgotten, moves the text at the pane's middle 5–111 px in some glides
      where the note lands with its top outside the pane's upper half: once 85
      px in the note above as that note drew. Once, 720 px at the anchor's
      hand-over; not seen again in ~25 runs. Measured with an element-following
      probe (a note drawn from its end defeats `followReader`'s by-index one).
- [ ] On the iPhone, heights forgotten, a 3-stroke flick up from 2026-09-16 in
      the harness's vault drops the text below the pane's top 603 px in about 1
      run in 5: 2026-09-28's Base, above its code block, fills in from 76 to 679
      px and its note re-pins, and the anchor owes nothing. What it held then is
      not known. Before it held the next note in the gap at a note's end, 13
      runs in 15.

## Rare, not reproduced

Picked up again if one comes back.

- [ ] `e2e/ios/search.spec.ts`, "a search paints every match", failed twice in
      ~110 runs: once a Search tap opened no bar, once the bar opened but no
      match was marked current. Neither came back in 50 cold starts, nor in 10
      runs on 2026-10-16.
- [ ] "ResizeObserver loop completed with undelivered notifications" logged on
      the iPhone in 2 of 11 glide probes while far content was hidden (ADR
      0023); not seen in ~60 probe runs after. Back on 2026-10-15 in 2 of ~30
      probes drawing notes of 3,000–16,000 lines; the phone suite fails on it.
      Not seen on 2026-10-16 in 22 such probes and 30 suite tests. Desktop never
      sees it: Chromium fires it as an uncaught `error` event.
- [ ] `e2e/ios/layout.spec.ts`, "a turn flips a wide Base", lost the place on
      the turn back by 6,316 px once, on 2026-10-08, in ~60 runs. Placing at
      every section of the note first, as the spec before it does, did not bring
      it back on `main`, nor did 10 runs on 2026-10-16.

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
      Persist it in `getState`; a stream opened fresh still starts at today.
- [ ] Open at today's note, not the newest: notes made ahead for future days sit
      above it, and scrolling up still reaches them. Through the jump's path
      (D-082), so the notes above load as for any jump. With no note today, the
      nearest older one (D-015); with no future notes, the top as now.
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
- [ ] Say under **Hide empty notes** whether the daily-notes template can be
      matched, naming the block that stops it (`if`, loops, `tp.web.*`,
      `tp.user.*`). A `tp.user.*` script may write one line or several: "may
      always show".
- [ ] Match `tp.file.include` by inlining the included file into the template
      pattern (D-117), its own blocks read the same way. Wait for a user who
      includes a file in their daily template.

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
