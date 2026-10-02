# CLAUDE.md

Obsidian plugin: infinite-scroll, read-only stream of all daily notes. Design
and file map: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Path-scoped rules in
`.claude/rules/` load with the files they cover.

## Commands

```bash
pnpm install
pnpm run dev            # watch mode → main.js
pnpm run build          # type-check + production build (esbuild → CJS main.js, `obsidian` external)
pnpm run build:device   # the same, named on load by a notice (two words, from the code): for a phone test
pnpm run lint           # ESLint
pnpm run format         # Prettier --write; format:check verifies. Markdown wraps at 80, AGENTS.md aside.
pnpm test               # typecheck tests/ (tests/tsconfig.json), then vitest run
pnpm run test:coverage  # the same, 100% coverage required
pnpm run test:e2e       # build + typecheck e2e + playwright against real Obsidian; fetches Dataview into .dev/ once
pnpm exec playwright install webkit   # once, for e2e/webkit.spec.ts
pnpm run test:ios       # build + e2e/ios/ on a plugged-in, unlocked iPhone (ADR 0016); setup in docs/TESTING.md
pnpm run ios:release    # the phone's own Auto-Lock back: run at the end of a session that ran test:ios
pnpm run test:memory    # memory.spec.ts, render-cost.spec.ts on a seeded three-year vault (E2E_SEED_DAYS)
MEASURE_ESTIMATES=1 E2E_SHOW_WINDOW=1 pnpm exec playwright test estimates.spec.ts --project=mobile
node scripts/score-estimates.mjs   # the placeholder-estimate benchmark (D-079), after a build

pnpm run demo                     # open .dev/demo-vault/ (gitignored), reload the plugin on every save; Ctrl-C closes it
                                  # reseeds each run, builds if missing; --desktop, --ipad; --help lists the flags
pnpm run build && pnpm run seed   # reseed .dev/demo-vault/, a realistic journal, and install the build into it
# --test on demo and seed: .dev/vault/ instead, the edge cases docs/TESTING.md is written against
```

## Quality gates

`pnpm run test:e2e` runs in full only when what ships or what every spec shares
changes: `src/`, `styles.css`, `manifest.json`, the build (`esbuild.config.mjs`,
`tsconfig.json`, dependencies), `e2e/obsidian.ts`, `e2e/global-setup.ts`,
`playwright.config.ts`. Other e2e code runs the specs that use it. Anything else
needs the other gates, plus a run of whatever the change touches.

## Tests

- Unit: Vitest + jsdom, mocking `obsidian` and `obsidian-daily-notes-interface`
  from `tests/mocks/`. The mocks take their signatures from the real API, so
  tests typecheck against them (D-025).
- **The split is a contract** ([ADR 0002](docs/adr/0002-real-obsidian-e2e.md)):
  jsdom loads no stylesheet, so a visibility assertion there proves nothing.
  Real rendering, real events and what is visible on screen belong in `e2e/`,
  which drives the installed app against a throwaway vault.
- Every e2e spec runs twice, desktop and mobile, both Chromium. What iOS's
  engine paints or computes differently is checked in `e2e/webkit.spec.ts`, on a
  snapshot of the mobile run
  ([ADR 0009](docs/adr/0009-webkit-render-checks.md)).
- `e2e/ios/` drives Obsidian on a real iPhone: real touches, real glides, real
  turns ([ADR 0016](docs/adr/0016-drive-a-real-iphone.md)). Run it, with a phone
  plugged in, for any change to how the stream scrolls, loads or turns.
- **Look at a UI change before handing it over.** Screenshot it from the e2e
  harness, desktop and mobile, and inspect the image: measurements prove a rule
  was matched, not that the result looks right.

## Invariants

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
  ([ADR 0006](docs/adr/0006-unload-off-screen-notes.md)); the rest are empty
  `.daily-note-block`s reserving their height. Never assume or key anything off
  a block's children: `data-source-path` is on the block, and `StreamBlocks`'
  path→block index is the only lookup.
- **A rendered block's height changes only in `NoteWindowManager.repin`**
  ([ADR 0013](docs/adr/0013-pin-rendered-note-heights.md)), which tells the
  anchor in the same task. Anything that changes a block's height another way
  jumps the screen a frame on iOS.
- **Delegated listeners.** Chevrons, note titles and links are rebuilt on every
  re-render, so `CollapsibleManager.delegate()` and `NoteRenderer.delegate()`
  register one listener per gesture on the stream container, resolving the
  target through a `WeakMap` or the DOM. Per-element listeners would pile up on
  the view until it closes.
- **No scroll containers inside a note on mobile**
  ([ADR 0008](docs/adr/0008-nothing-scrolls-on-mobile.md)): one ends iOS glides
  early. Under `.is-mobile`, clip with `overflow: clip`, never `hidden` or
  `auto`; `e2e/scroll-boxes.spec.ts` enforces it. Desktop keeps Obsidian's
  scroll bars.
- **TS strictness**: `noUncheckedIndexedAccess` (indexing returns
  `T | undefined`) and `noImplicitReturns`. Lifecycle properties assigned in
  `onload()` need `!` assertions.

## Documentation

Update docs in the same branch as the change that makes them stale:

- `docs/adr/` — one numbered record per non-obvious decision. Rationale and
  rejected options live _only_ here; everything else links to it.
- `docs/DECISIONS.md` — smaller decisions: decision, why, rejected. Cite by ID:
  `D-023`.
- `README.md` — user-facing features, install, usage.
- `docs/TESTING.md` — manual verification checklist.
- `docs/TODO.md` — open work; delete an item when it ships. The merges on `main`
  record what shipped.
- `AGENTS.md` — the sample plugin's copy, verbatim; fix the code to match its
  wording, never the reverse. Its npm commands are the exception: this repo uses
  pnpm.
- `docs/ARCHITECTURE.md` — layers, ownership, flow, file map.
- This file and `.claude/rules/` — commands, invariants, instructions.
