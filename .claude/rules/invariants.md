---
paths:
    - "src/**"
    - "tests/**"
    - "styles.css"
---

# Invariants

Traps that span files, so no single file's comments can hold them.

- **The blocks are `service.streamedNotes()`, in order** (D-118). Load through
  `service.extendStream`; `create`/`delete`/`rename` through
  `service.insertSorted`/`removeSorted`, which keep `streamLength`. A block is
  placed only when `insertSorted` reports the note `inStream`.
- **Each view owns its `DailyNoteService`.** Its list must change in step with
  its DOM, inside its queue
  ([ADR 0004](../../docs/adr/0004-serialize-view-mutations.md)). A list shared
  by views would shift under one that is mid-load, and pagination would skip or
  repeat notes.
- **`rename` gets `(file, oldPath)`.** Obsidian mutates `TFile` in place, so the
  DOM's `data-source-path` is the _old_ path: look the element up by `oldPath`,
  remove from the service by `file.path`.
- **A note re-renders on `metadataCache.on("changed")`, not
  `vault.on("modify")`**: the cache lags the write, and the renderer reads the
  cache. `modify` only redraws cards copied from a `.base` file, which has no
  metadata.
- **A block may hold no content.** Only notes near the viewport are rendered
  ([ADR 0006](../../docs/adr/0006-unload-off-screen-notes.md)); the rest are
  empty `.daily-note-block`s reserving their height. Never assume or key
  anything off a block's children: `data-source-path` is on the block, and
  `StreamBlocks`' path→block index is the only lookup.
- **A rendered block's height changes only in `NoteWindowManager.repin`**
  ([ADR 0013](../../docs/adr/0013-pin-rendered-note-heights.md)), which tells
  the anchor in the same task. Anything that changes a block's height another
  way jumps the screen a frame on iOS. A Base sets its own height only where it
  dispatches `BASE_RESIZED`, which re-pins its note there (D-108).
- **No scroll containers inside a note on mobile**
  ([ADR 0008](../../docs/adr/0008-nothing-scrolls-on-mobile.md)): one ends iOS
  glides early. Under `.is-mobile`, clip with `overflow: clip`, never `hidden`
  or `auto`; `e2e/scroll-boxes.spec.ts` enforces it. Desktop keeps Obsidian's
  scroll bars.
