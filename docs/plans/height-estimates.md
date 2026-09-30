# Better placeholder heights

A note with no height stored at the current layout reserves 400px, or, after a
turn, whatever it measured at the old width. Both are far off, and every error
above the reader becomes a correction the anchor must make and, at the top of
the stream, a blank gap. Branch `feat/height-estimates`.

## Evidence

`e2e/estimates.spec.ts` (opt-in) renders the 90-note demo journal, its embeds
varied (three Bases, four images of different shapes), at a phone's portrait
(402×874) and landscape (874×402) and writes `.dev/estimates.json`;
`scripts/score-estimates.mjs` scores estimates against it. Mean error per note,
px, estimating each orientation from the other (portrait / landscape):

| Estimate                                    | 61 text-only notes | 29 with an embed |
| ------------------------------------------- | ------------------ | ---------------- |
| 400px (now, for a note never measured)      | 369 / 284          | 1048 / 665       |
| Height at the other width (now, after turn) | 85 / 85            | 389 / 389        |
| Template's height here                      | 624 / 443 (all)    |                  |
| Template + wrapped lines × line height      | 121 / 119          | 782 / 454        |
| Template + lines × rate learned elsewhere   | 63 / 70            | 506 / 365        |
| Other width's height, text re-wrapped       | **5 / 5**          | 376 / 376        |

A buffer per embed, added to template + lines:

| Buffer per embed               | Portrait | Landscape |
| ------------------------------ | -------- | --------- |
| none                           | 782      | 454       |
| 400px                          | 491      | 178       |
| one pane height (874 / 402)    | 648      | 178       |
| learned: median at this layout | 492      | 167       |

- The template alone (362px at both widths) is only a floor: every note shown is
  its template plus writing (ADR 0011).
- A turn changes a text note only by re-wrapping its text.
- An embed's height depends on the width, and differs by embed: a Base drawn as
  cards in portrait and a table in landscape (Reading: ~1300 vs ~340px), a
  banner image scaling with the width, a small image the same at both. No buffer
  gets within ~490px in portrait; the learned median is the least bad.

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

## Status

Steps 1–6 done on this branch: the benchmark (embeds varied in the spec's own
vault, so the demo and README captures stay), `note-lines.ts`,
`template-height.ts`, `height-estimates.ts`, wired through `NoteStream`, and the
benchmark command in `CLAUDE.md`. Left: the phone check under Gates.

Scored with the plugin's own estimator, called in the page (mean error, px,
portrait / landscape):

| Case                                | Target       | Result        |
| ----------------------------------- | ------------ | ------------- |
| Text, stored at the other layout    | ≤ 20         | 18 / 18       |
| Text, never measured, rate learned  | ≤ 90         | 44 / 50       |
| Text, never measured, line height   | ≤ 130        | **149 / 135** |
| Embeds, stored at the other layout  | < 389        | 378 / 378     |
| Embeds, never measured, learned     | < 1048 / 665 | 531 / 174     |
| Embeds, never measured, nothing yet | < 1048 / 665 | 577 / 182     |

The line-height case misses, and the target is relaxed to it: a note's line
costs ~35px, not 24 (headings, spacing, properties), and it lasts only until the
first notes at this text size are measured. A starting multiplier on the line
height (~1.45) was rejected: fitted to the demo journal and theme, for a case
gone after the first screen.

Where the code differs from the terms above:

- Wrapped lines: each source line of a section, at the section's average length
  (a table's rows wrap one by one).
- No template: the median, as step 3.
- The template is measured by `TemplateHeight`, owned by `NoteStream`, without
  waiting for the linked mentions. Its probe copies the column's class, so e2e
  locators exclude `.daily-notes-stream-probe`.
- charWidth comes from a sample sentence in a probe paragraph's font: 7.8px
  against the demo text's 7.3.

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
- Measuring notes in the background while the reader is still: render each note
  never measured at this layout into the probe, keep its height, discard it.
  Every placeholder then holds a real height. Open: CPU and battery on a phone
  (render-cost.spec measures Base draws at ~16ms each, and a three-year vault
  has 1,095 notes); images and Bases settle late; no `requestIdleCallback` on
  iOS. Its own ADR.
- Delete this plan once shipped.
