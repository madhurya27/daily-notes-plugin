---
paths:
    - "src/**"
    - "tests/**"
    - "styles.css"
---

# Invariants

Traps that span files, so no single file's comments can hold them.

- **`state.notes` always equals `service.getBatch(0, state.length)`.** Breaking
  it desyncs `getBatch()` pagination: notes skipped or duplicated on further
  scroll. `create`/`delete`/`rename` must route through
  `service.insertSorted`/`removeSorted`, and a note is rendered only when its
  global index falls in `[0, offset)`.
- **Each view owns its `DailyNoteService`.** Every view gets every vault event;
  a shared cache hands the second view's `insertSorted` a -1.
- **`rename` gets `(file, oldPath)`.** Obsidian mutates `TFile` in place, so the
  DOM's `data-source-path` is the _old_ path: look the element up by `oldPath`,
  remove from cache and state by `file.path`.
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
- **Delegated listeners.** Chevrons, note titles and links are rebuilt on every
  re-render, so `CollapsibleManager.delegate()` and `NoteRenderer.delegate()`
  register one listener per gesture on the stream container, resolving the
  target through a `WeakMap` or the DOM. Per-element listeners would pile up on
  the view until it closes.
- **No scroll containers inside a note on mobile**
  ([ADR 0008](../../docs/adr/0008-nothing-scrolls-on-mobile.md)): one ends iOS
  glides early. Under `.is-mobile`, clip with `overflow: clip`, never `hidden`
  or `auto`; `e2e/scroll-boxes.spec.ts` enforces it. Desktop keeps Obsidian's
  scroll bars.
