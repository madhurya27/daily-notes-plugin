# 0010. Remember every measured height across sessions

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

After a jump, the notes skipped over reserve a guess (ADR 0006). Scrolling back
up renders them at their real heights, and on iOS, which has no scroll
anchoring, `ScrollAnchor` draws the growth as a shift and hands it to the scroll
once it stops (docs/decisions.md, 2026-09-24). Near the top the glide runs out
of scroll room first: the probe owed 6,076px, so a hand scroll up stopped that
far short of the newest note. Heights were kept in four places, none of which
outlived the plugin: each block's reservation, a per-view median, Back's history
state, and `BaseMeasurements`.

## Decision

`LayoutMemory`, one per plugin, keeps every note's last measured height per
layout (content width and text size), and which Bases were too wide, in the vault's
localStorage on this device. A placeholder reserves the stored height, else the
layout's median, else 400px. An edited note keeps its last height: nearer than
any median. Back keeps only the place; the store holds its heights.

## Consequences

- Daily notes rarely change once written, so after the first scroll through at
  a layout, a jump reserves real heights and there is little to owe.
- A note never measured at this layout is still a guess; the shift covers it.
- Heights are per device: a phone never reserves what a laptop measured.
- The store is a cache. A new format bumps its version and starts empty.

## Rejected alternatives

- **Handing the owed shift over as an animation at the top** — the content still visibly races thousands of pixels.
- **A scroll buffer above the newest note** — its size is a guess; too big leaves a blank gap to glide into.
- **Measuring skipped notes ahead, off screen** — renders up to a thousand notes to learn what was measured before.
- **Plugin data (`data.json`)** — it syncs, so one device's heights would land on another.
- **Invalidating a height on edit** — the median it falls back to is further off than the old height.
