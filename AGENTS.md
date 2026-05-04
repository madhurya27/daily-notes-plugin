# Obsidian Plugin — Agent Reference

## Stack
- **Package manager**: pnpm. **Bundler**: esbuild (`esbuild.config.mjs`).
- **Release artifacts**: `main.js`, `manifest.json`, `styles.css` — must live at the plugin root.
- **Node**: LTS 18+.

## Commands
```bash
pnpm install && pnpm run dev    # install + watch
pnpm run build                  # type-check + production build
eslint ./src/                   # lint
pnpm test                       # unit tests
```

## manifest.json required fields
`id`, `name`, `version` (SemVer), `minAppVersion`, `description`, `isDesktopOnly`.
- Never change `id` after release.
- Keep `minAppVersion` accurate when using newer APIs.

## Versioning & releases
- Bump `version` in `manifest.json`; update `versions.json` (version → minAppVersion).
- GitHub release tag must exactly match `manifest.json` version (no leading `v`).
- Attach `manifest.json`, `main.js`, `styles.css` as individual release assets.

## Commands & settings patterns
- Add commands via `this.addCommand(...)` with stable IDs (never rename post-release).
- Persist settings with `this.loadData()` / `this.saveData()`.
- Provide sensible defaults.

## Security & privacy
- Default to local/offline. Network requests only when essential, with explicit user opt-in.
- No telemetry. Never execute remote code or auto-update outside normal releases.
- Read/write only within the vault. Do not access files outside it.
- Register all DOM, app, and interval listeners via `register*` helpers for safe unload.

## Performance
- Defer heavy work; avoid long-running tasks in `onload`.
- Batch disk access; debounce/throttle file-system event handlers.

## Mobile
- Avoid Node/Electron APIs unless `isDesktopOnly: true`.
- Avoid large in-memory structures; test on iOS/Android where feasible.

## Coding conventions
- TypeScript `strict: true`. Keep `main.ts` lifecycle-only; delegate logic to modules.
- Bundle everything into `main.js` — no unbundled runtime dependencies.
- Prefer `async/await`; handle errors gracefully.

## Do / Don't
**Do**: stable command IDs, settings defaults/validation, idempotent load/unload, `register*` for cleanup.  
**Don't**: undisclosed network calls, cloud services without opt-in, vault content transmission.
