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
xcrun devicectl list devices   # is the iPhone connected? Not system_profiler, which misses it
pnpm run test:memory    # memory.spec.ts, render-cost.spec.ts on a seeded three-year vault (E2E_SEED_DAYS)

pnpm run demo                     # open .dev/demo-vault/ (gitignored), reload the plugin on every save; Ctrl-C closes it
                                  # reseeds each run, builds if missing; --desktop, --ipad; --help lists the flags
pnpm run build && pnpm run seed   # reseed .dev/demo-vault/, a realistic journal, and install the build into it
# --test on demo and seed: .dev/vault/ instead, the edge cases docs/TESTING.md is written against
```

## Releases

Bump with `pnpm version`, merge, push the tag: the workflow drafts the release
with its assets. Write its notes from `git log --first-parent <last tag>..` —
what a reader notices, in plain words — then publish (D-115).

## Quality gates

`pnpm run test:e2e` runs in full only when what ships or what every spec shares
changes: `src/`, `styles.css`, `manifest.json`, the build (`esbuild.config.mjs`,
`tsconfig.json`, dependencies), `e2e/obsidian.ts`, `e2e/global-setup.ts`,
`playwright.config.ts`. Other e2e code runs the specs that use it. Anything else
needs the other gates, plus a run of whatever the change touches.

## Tests

- `e2e/ios/` drives Obsidian on a real iPhone: real touches, real glides, real
  turns ([ADR 0016](docs/adr/0016-drive-a-real-iphone.md)). Run it, with a phone
  plugged in, for any change to how the stream scrolls, loads or turns.
- **Look at a UI change before handing it over.** Screenshot it from the e2e
  harness, desktop and mobile, and inspect the image: measurements prove a rule
  was matched, not that the result looks right. Run it with `E2E_SHOW_WINDOW=1`:
  the harness hides Obsidian, and a hidden window takes no screenshot (the page
  reports itself closed).

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
