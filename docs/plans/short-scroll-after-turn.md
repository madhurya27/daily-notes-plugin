# Handoff: the short scroll after a turn (iOS)

Kept current at each step; read this first, then the last phone log. Delete it
with the TODO item when the fix ships.

**Bug:** after a turn, scrolling up to the newest note stops short until the
notes above render. Each note above that renders shorter than its placeholder
adds to what `ScrollAnchor` owes, drawn as a shift; the scroll takes it only at
rest, so a glide hits `scrollTop` 0 still owing it.

## State (2026-10-01, after run 2)

| What                         | Where                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Fix (ADR 0015), phone-proven | `fix/shift-before-shrink`; gates pass. **Not merged: asked the user to merge now or after estimates.** |
| Probe                        | `experiment/height-probe`; never merge                                                                 |
| On the phone (Demo vault)    | both combined, notice "golden salmon", store version 4                                                 |
| Waiting on                   | the user: merge now or later; whether the stop looked ~700 px short                                    |

## Findings

1. **Run 1, store cleared** (log `load` 18:20Z): the turn logged
   `re-reserve waits … shrink 5863 below 3572`; the scroll up never rested, so
   every note above rendered at its portrait height. Top:
   `rest scroll 0 … shift 5545.75px`.
2. **Cause of the wait:** WebKit and Chromium keep a shifted stream's scroll
   range; the clamp came from reading the layout between the shrink and the
   shift. Test page: `.dev/clamp.mjs` (gitignored). Fix: ADR 0015.
3. **Run 2, fix + probe** (`load` 19:31Z): re-reserve applied at the first rest
   (`above move -7286`), handed over at the next (`settle owed -7495`). Top
   still owed **722 px** (`settle owed -722 scroll 0->0`).
4. **The 722 px**, from `settled` rows of the 32 notes rendered going up: 4
   Reading-Base notes +1036 (~265 too tall each), 28 others −736 (~25 too short
   each), net +300; ~420 unaccounted. Base error is cold-start: the store was
   cleared, so D-080 had no note measured at both widths. Bases render 240–510
   px short and grow back as they fill.

## Next

1. Probe: log each change the anchor owes (`owe()`), and each `repin` that
   changes a height, so the debt at the top adds up.
2. Run 3 **without** clearing the store (landscape now measured): the user's
   original ~200 px case. Turn near the end, scroll up without stopping.
3. Fix the estimate it blames, likely D-079's text-only rate (~25 px short),
   scored with `scripts/score-estimates.mjs`.
4. Merge `fix/shift-before-shrink` (`--no-ff`) when the user approves.

Log:
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Demo/stream-heights.log`,
appended across sessions; take rows after the last `load`. iCloud can lag the
phone by minutes: check the file's time first.

## Probe log

Device builds only (`BUILD_LABEL` set); flushed every 2 s. Rows: ms since load,
then:

| Row                      | Says                                                                     |
| ------------------------ | ------------------------------------------------------------------------ |
| `add` / `unload`         | placeholder height, source (`stored`/`text`/`median`/`default`/`unload`) |
| `render`                 | reserved (source), expected now (source), rendered, error, top in pane   |
| `settled`                | height kept, against reserved and first rendered                         |
| `resize`                 | the turn: layout, pane size, scroll                                      |
| `re-reserve` / `… waits` | each change, or the shrink below against the room below                  |
| `settle owed`            | the anchor's hand-over: scroll before → after                            |
| `rest`                   | scroll, shift, first four notes: state, top, height                      |

## Gotchas

- Combining the branches conflicts in `NoteWindowManager.reserve()`: keep the
  fix's `movedAbove`/`shrinkBelow` and `anticipate()`, wrap the probe's rows
  around them. Build steps: the phone-demo skill.
- Clearing stored heights: build with `VERSION` in `layout-memory.ts` other than
  what the phone last ran (it has 4 now), uncommitted.
