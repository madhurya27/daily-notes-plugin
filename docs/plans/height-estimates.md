# Better placeholder heights

A note with no height stored at the current layout reserves 400px, or, after a
turn, whatever it measured at the old width. Both are far off, and every error
above the reader becomes a correction the anchor must make and, at the top of
the stream, a blank gap. Branch `feat/height-estimates`.

## Evidence

`e2e/estimates.spec.ts` (opt-in) renders the 90-note demo journal at a phone's
portrait (402×874) and landscape (874×402) and writes `.dev/estimates.json`;
`scripts/score-estimates.mjs` scores estimates against it. Mean error per note,
px, estimating each orientation from the other (portrait / landscape):

| Estimate                                    | 75 text-only notes | 15 with an embed |
| ------------------------------------------- | ------------------ | ---------------- |
| 400px (now, for a note never measured)      | 360 / 277          | 1440 / 598       |
| Height at the other width (now, after turn) | 84 / 84            | 842 / 842        |
| Template's height here                      | 577 / 367 (all)    |                  |
| Template + wrapped lines × line height      | 117 / 115          | 1156 / 350       |
| Template + lines × rate learned elsewhere   | 64 / 65            | 790 / 793        |
| Other width's height, text re-wrapped       | **5 / 5**          | 826 / 826        |

A buffer per embed, added to template + lines:

| Buffer per embed               | Portrait | Landscape |
| ------------------------------ | -------- | --------- |
| none                           | 1156     | 350       |
| 400px                          | 763      | 66        |
| one pane height (874 / 402)    | 413      | 67        |
| learned: median at this layout | 129      | 25        |

- The template alone (362px at both widths) is only a floor: every note shown is
  its template plus writing (ADR 0011).
- A turn changes a text note only by re-wrapping its text.
- An embed's height depends on the width (a Base is cards in portrait, a table
  in landscape: 1283 vs 341px). The demo repeats one Base, so the learned buffer
  above is optimistic; real vaults embed different Bases and images.

## The estimate

For a note with no height at the current layout, the first that applies:

1. **Stored at another layout:** that height + (wrapped lines here − wrapped
   lines there) × line height here. Of several layouts, the nearest width with
   the same text size.
2. **Never measured:** template height here + (wrapped lines of the note −
   wrapped lines of the template) × per-line rate + embeds × embed buffer.
3. **No template height measured yet at this layout:** as now (layout median,
   else `ESTIMATED_NOTE_HEIGHT_PX`).

Terms:

| Term            | Source                                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrapped lines   | From `metadataCache.getFileCache(file)`, synchronous: each `listItems` entry and each non-list, non-`yaml` `sections` entry is `max(1, ceil(chars × charWidth / width))`, chars from `position.end.offset − start.offset`.   |
| Width           | The layout key's width (`layoutOf`); the note text measured the column's width at both orientations.                                                                                                                         |
| charWidth       | Canvas `measureText` of a fixed sample in the note text's font at the key's text size; cached per text size.                                                                                                                 |
| Line height     | The note text's computed `line-height`, per text size.                                                                                                                                                                       |
| Template height | The daily-notes template (`getDailyNoteSettings().template`) rendered by `NoteRenderer.renderInto` into a hidden block at the column's width, once per layout, stored with the heights. No template: an empty note's height. |
| Per-line rate   | Median over text-only notes measured at any layout of (height − template height) ÷ extra wrapped lines; line height until one exists.                                                                                        |
| Embed buffer    | Per layout: median over notes with embeds measured at this layout of the residual per embed; until one exists, the pane's height. Count from the cache's `embeds`.                                                           |

## Steps

Test first throughout (red shown, then green), as `CLAUDE.md` requires.

1. **Benchmark.** Make the demo journal's embeds varied before tuning: a second
   and third Base (a short list, a wide table) and images of different sizes, in
   `scripts/demo-vault.mjs`, or in the spec's own vault. Re-run the spec and
   score; record the new baseline here.
2. **Line counting.** A pure `src/stream/note-lines.ts`: wrapped lines of a
   `CachedMetadata` at a width and charWidth. Unit tests with hand-built caches:
   a list, a paragraph wrapping, a code block, frontmatter ignored, embeds
   counted.
3. **Template height.** Measured by `NoteWindowManager` (or a small class it
   owns) once per layout after attach and on each new layout, through the
   renderer, then discarded. Stored in `LayoutMemory` (a new table, like
   `bases`). Bump `VERSION` in `layout-memory.ts`: the format changes.
4. **Estimator.** A pure function taking the terms above; `NoteHeights` (or a
   new `HeightEstimates`) supplies stored heights, rate and buffer.
   `NoteWindowManager.expect()` calls it in place of
   `heightOf ?? estimate ?? 400`. An estimate is never `measured`: nothing is
   held at a guess.
5. **Wire and measure.** Run the spec with the real estimator, called in the
   page, and score it. Acceptance, on the step 1 benchmark:
    - text-only notes, another layout stored: mean error ≤ 20px;
    - never measured, rate learned: ≤ 90px; line height only: ≤ 130px;
    - notes with embeds: better than both "now" rows at both orientations.
6. **Keep the benchmark.** Leave the spec opt-in; note its command in
   `CLAUDE.md` beside `test:memory`.

## Constraints

- **D-055 stays.** A turn re-reserves no placeholder already in the stream: a
  shrink above the reader clamps the scroll. The estimate reaches those notes
  only as the height they are held at, which needs `measured`, so not at all. It
  changes new placeholders: batches, jumps, rebuilds. Re-reserving on a turn is
  a separate decision, with its own e2e turn test (see Later).
- **Pinning (ADR 0013)** is untouched: estimates set placeholder heights only.
- `add()` stays synchronous: everything it reads is cached. A note whose cache
  is not ready yet takes step 3.
- Invariants in `CLAUDE.md` hold; no scroll writes.

## Records

- `docs/DECISIONS.md`: D-079, the estimate order, why, and rejected: the
  template alone, a fixed per-embed buffer, per-Base stored heights (a vault's
  Bases differ, and the height per Base still varies by what it draws).
- `docs/adr/0010-layout-memory.md` is append-only: link D-079 from nowhere else;
  `docs/ARCHITECTURE.md` "Scroll position" gets one line.
- `docs/TODO.md`: drop "Estimate per note from `TFile.stat.size`" in Deferred
  once this ships.

## Gates

Formatter, lint, unit tests at 100% coverage, `pnpm run test:e2e` in full
(`src/` changes), the benchmark before and after. Phone check: a build on the
Demo vault (the `phone-demo` skill), store version bumped, a recording scrolling
up after a jump and after a turn, compared with the last one.

## Later

- Re-reserving placeholders on a turn with the re-wrapped estimate (would fix
  the turn case the recordings show). Needs D-055's clamp solved first.
- Delete this plan once shipped.
