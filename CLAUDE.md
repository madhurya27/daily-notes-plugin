# CLAUDE.md

Obsidian plugin: infinite-scroll, read-only stream of all daily notes. Design
and file map: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Path-scoped rules in
`.claude/rules/` load with the files they cover.

## Commands

```bash
pnpm install
pnpm run dev            # watch mode → main.js
pnpm run build          # type-check + production build (esbuild → CJS main.js, `obsidian` external)
pnpm run build:device   # the same, plus a notice on load naming the build in two words from the code, to tell builds apart on a phone
pnpm run install:vault <vault>   # build:device, then copy it into <vault>'s plugin folder; notes and settings untouched
pnpm run lint           # ESLint
pnpm run format         # Prettier --write; format:check verifies. Markdown wraps at 80 columns, except README.md (never wrapped, D-155) and AGENTS.md.
pnpm test               # typecheck tests/ (tests/tsconfig.json), then vitest run
pnpm run test:coverage  # the same, 100% coverage required
pnpm run test:mutation  # Stryker over src/, incremental; results in reports/ (D-141); no surviving mutant (D-149)
                        # Run it once per change, after its tests settle. After a test change: --force --mutate <the src file it tests>; a bare --force almost never.
                        # To compare survivors, copy reports/ first. Never re-run on main.
pnpm run test:e2e       # build + typecheck e2e + playwright against real Obsidian; fetches Dataview into .dev/ once
pnpm exec playwright install webkit   # once, for e2e-tests/webkit.spec.ts
pnpm run test:ios       # build + e2e-tests/ios/ on a plugged-in, unlocked iPhone (ADR 0016); setup in docs/TESTING.md
pnpm run test:ipados    # the same on a plugged-in iPad, its keyboard detached (D-169)
IOS_SEED_DAYS=1825 pnpm run test:ios   # the same on five years of journal (D-158); ~7 min, the same as on 21 days
xcrun devicectl list devices   # is the iPhone connected? Not system_profiler, which misses it
pnpm run test:memory    # memory, render-cost and edit-cost specs on a seeded five-year vault (E2E_SEED_DAYS)
SCROLL_COST=1 E2E_SEED_DAYS=365 pnpm exec playwright test scroll-cost --project=desktop
                        # a real wheel over a slowed CPU; RATES, SPEEDS, DOWN_UP=1, SCREEN=4k175 vary it
# Every test run stops at its first failure; for a full report: --max-failures=0 (Playwright), --bail=0 (vitest)

pnpm run demo                     # open .dev/demo-vault/ (gitignored), reload the plugin on every save; Ctrl-C closes it
                                  # reseeds each run, builds if missing; --desktop, --ipad; --help lists the flags
pnpm run build && pnpm run seed   # reseed .dev/demo-vault/, a realistic journal, and install the build into it
# --test on demo and seed: use .dev/vault/ instead, the edge-case vault docs/TESTING.md is written against
```

## Releases

Bump with `pnpm version`, merge, push the tag: the workflow drafts the release
with its assets. pnpm tags `v1.0.0`, ignoring `.npmrc`; the workflow wants
`1.0.0`, so retag before pushing. From `1.0.0` on, write each release's notes
from `git log --first-parent <last tag>..` — what a reader notices, in plain
words — then publish (D-115).

To clear scorecard warnings, the user first runs the listing's **Review branch →
Run preview scan** on the branch or tag. Once published, **... → Check for new
releases** picks the release up at once.

## Quality gates

`pnpm run test:e2e` runs in full only when what ships or what every spec shares
changes: `src/`, `styles.css`, `manifest.json`, the build (`esbuild.config.mjs`,
`tsconfig.json`, dependencies), `e2e-tests/obsidian.ts`,
`e2e-tests/global-setup.ts`, `playwright.config.ts`. A change to other e2e code
runs the specs that use it. Any other change needs the other gates, plus a run
of whatever it touches.

CI (`.github/workflows/ci.yml`) runs every gate but e2e, on Linux; e2e is run
locally (D-148).

## Tests

- `e2e-tests/ios/` drives Obsidian on a real iPhone: real touches, real glides,
  real turns ([ADR 0016](docs/adr/0016-drive-a-real-iphone.md)). Run it, with a
  phone plugged in, for any change to how the stream scrolls, loads or turns;
  run `test:ipados` too for a change to the harness's touches.
- **Look at a UI change before handing it over.** Screenshot it from the e2e
  harness, desktop and mobile, and inspect the image: measurements prove a rule
  was matched, not that the result looks right.

## Documentation

Update docs in the same branch as the change that makes them stale:

- `docs/adr/` — one numbered record per non-obvious decision. Rationale and
  rejected options live _only_ here; everything else links to it.
- `docs/DECISIONS.md` — smaller decisions: decision, why, rejected. Cite by ID:
  `D-023`.
- `README.md` — user-facing features, install, usage.
- `docs/TESTING.md` — manual verification checklist.
- `docs/LISTING.md` — the directory listing's descriptions; paste a change into
  the listing by hand.
- `docs/TODO.md` — open work; delete an item when it ships. The merges on `main`
  record what shipped.
- `AGENTS.md` — the sample plugin's copy, verbatim; fix the code to match its
  wording, never the reverse. Its npm commands are the exception: this repo uses
  pnpm.
- `docs/ARCHITECTURE.md` — layers, ownership, flow, file map.
- `docs/plans/` — plans and design notes, gitignored: never committed. What
  lasts moves to an ADR or a `D-` entry before the plan is deleted.
- This file and `.claude/rules/` — commands, invariants, instructions.
