# Handoff: the short scroll after a turn (iOS)

Kept current at each step; read this first, then the last phone log. Delete it
with the TODO item when the fix ships.

**Bug:** after a turn, scrolling up to the newest note stops short until the
notes above render. Each note above that renders shorter than its placeholder
adds to what `ScrollAnchor` owes, drawn as a shift; the scroll takes it only at
rest, so a glide hits `scrollTop` 0 still owing it.

## State (2026-10-01)

| What                                                     | Where                                                                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Fix: re-reserve never waits on a shrink above (ADR 0015) | `fix/shift-before-shrink`; all gates pass. **Not merged: needs the user's approval, after the phone run.**        |
| Probe: logs heights to the vault                         | `experiment/height-probe`; never merge                                                                            |
| On the phone (Demo vault)                                | both branches combined, notice **"golden salmon"**; height store version 4 (clears the phone's version-5 heights) |
| Waiting on                                               | the user's phone run: turn near the stream's end, scroll up without stopping                                      |

## Findings

1. **Run 1, store cleared** (`stream-heights.log`, 2026-10-01 18:20Z). The turn
   logged `re-reserve waits … shrink 5863 below 3572`; the scroll up never
   rested, so every note above rendered at its portrait height (text notes
   ~100–170 px too tall, Bases ~1,300). At the top:
   `rest scroll 0 … shift 5545.75px`.
2. **Cause of the wait:** WebKit and Chromium keep a shifted stream's scroll
   range; the clamp came from reading the layout between the shrink and the
   shift. Test page: `.dev/clamp.mjs` (gitignored). Fix and rejected spacer:
   ADR 0015.
3. **Open:** the original ~200 px gap, with the re-reserve applied, is estimate
   error. Run 2 measures it.

## Next

1. Read
   `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Demo/stream-heights.log`
   (appended across sessions; take the rows after the last `load`). Expect no
   `re-reserve waits`, a `re-reserve … above move` at the first rest after the
   turn, and a small shift on the `rest` at the top.
2. Sum `reserved - rendered` over the `render` lines above the reader;
   `expected` beside each is the landscape estimate. Too tall overall → tune
   D-079/D-080's estimates, scored with `scripts/score-estimates.mjs`.
3. Ask to merge `fix/shift-before-shrink` (`--no-ff`).

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
