# Improvement Backlog

Implementation-ready items from a code review at commit `b551db4`. Line numbers refer to that commit and may drift.

**Goal:** after all P1/P2/M items (and ideally P3), the plugin is ready to submit to the Obsidian community plugin marketplace. M items are submission requirements, not optional polish.

**Ground rules for the implementing agent:**
- Work on a branch (never `main`). One commit per item (or per small group), conventional-commit messages.
- TDD: write the failing test first. Keep 100% coverage. Run `pnpm lint && pnpm test` after every item.
- Mocks live in `tests/mocks/`; extend them when you use a new Obsidian API.
- If an item changes behavior described in `CLAUDE.md`, `README.md`, or `docs/TESTING.md`, update those docs in the same commit.
- Recommended order: P1 items first, then I5 before I6 (I5 simplifies I6). M1–M6 can go anytime; M7 comes after everything else is merged and released. F1/F2 are post-submission (target 1.1.0) and depend on I1, I6, and I10.

---

## P1 — Bugs (user-visible)

### I1. Infinite scroll stalls; first note never appears in an empty stream — **DONE**
**Files:** `src/InfiniteScrollController.ts`, `src/DailyNotesStreamView.ts:117-132, 165-199`

Three related defects, one shared fix:

1. **Stall:** `IntersectionObserver` callbacks fire only on intersection *changes*. If a loaded batch is too short to push the sentinel out of the 200px root margin (short notes, tall window), the sentinel stays intersecting → no further callback → stream stops loading even though more notes exist.
2. **Empty-vault create:** In `onFileCreate`, the guard `if (globalIndex >= this.offset) return;` means with `offset === 0` (empty stream) a newly created daily note is added to the service cache but never rendered, and the observer never re-fires. The note is invisible until the view is reopened.
3. **Stale empty state:** The "No daily notes found" div is never removed once notes exist, and repeated triggers at `offset === 0` can append duplicate empty-state divs.

**Fix:**
- Add `recheck(): void` to `InfiniteScrollController`: if observer and sentinel exist, `unobserve(sentinel)` then `observe(sentinel)` — per spec, `observe()` always delivers an initial callback, forcing re-evaluation with the current intersection state.
- In `loadMoreNotes()`: when the batch is non-empty, first remove any existing `.daily-notes-empty-state` child, and after rendering call `this.scroll.recheck()`. Do **not** recheck on an empty batch (prevents an infinite loop).
- In `onFileCreate`, replace the bare `return` in the `globalIndex >= this.offset` branch with `this.scroll.recheck(); return;` — if the sentinel is visible (stream fully scrolled or empty), the observer fires and `loadMoreNotes` picks the note up; if not, nothing happens, which is correct.
- Guard against duplicate empty-state divs (only create if none present).

**Tests:** recheck delivers a callback via the mock observer; create-into-empty-stream renders the note and removes the empty state; short-batch scenario triggers a follow-up load; empty batch does not loop.

### I2. Any file whose basename matches the date format is treated as a daily note — **DONE**
**File:** `src/DailyNoteService.ts:77-83`

`onFileCreate` fires for *every* vault file and routes into `insertSorted`, which validates only `moment(file.basename, basenameFormat, true)`. So `Attachments/2026-07-07.png` or a non-daily note named `2026-07-07.md` anywhere in the vault gets inserted into the stream — and into the service cache, desyncing pagination against `buildSorted()` (which uses `getAllDailyNotes()`).

**Fix:** In `parseDate`, reject non-daily files:
1. `file.extension !== "md"` → null.
2. Parse basename strictly (as now) → null if invalid.
3. Reconstruct the expected path from the *full* format: `normalizePath((folder ? folder + "/" : "") + date.format(format) + ".md")` (import `normalizePath` from `obsidian`; add to the mock). Compare to `normalizePath(file.path)`; mismatch → null. This handles nested formats like `YYYY/MM/YYYY-MM-DD` and files outside the daily-notes folder.

**Tests:** `.png` with date basename rejected; date-named note outside the folder rejected; note in a nested-format subfolder accepted; folder setting empty/with trailing slash both work.

### I3. `modify` re-render reads a stale metadataCache — **DONE**
**File:** `src/DailyNotesStreamView.ts:87, 106-115`

`vault.on("modify")` fires when file content is written, but `metadataCache` updates asynchronously afterwards. `NoteRenderer.createNoteElement` uses the cache for `frontmatterPosition` (to strip frontmatter) and for the properties panel — so a re-render can slice the body at a stale offset (frontmatter leaking into the rendered content, or body text cut off) and show outdated properties.

**Fix:** Replace the `vault.on("modify")` registration with `this.registerEvent(this.app.metadataCache.on("changed", (file) => this.onFileModify(file)))`. The `changed` event fires *after* the cache reflects the new content. Keep `onFileModify` itself unchanged. Add `metadataCache.on` to the obsidian mock.

**Tests:** update existing modify tests to emit `changed`; add one asserting no re-render path uses `vault.on("modify")` anymore.

### I4. Expanding a header destroys nested collapsed sections — **DONE**
**File:** `src/CollapsibleManager.ts:77-88`

`applyHeaderCollapse(header, false)` unconditionally removes `is-hidden` from every sibling until the next same-or-higher heading. If an H3 inside a collapsed H2 was itself collapsed, expanding the H2 reveals the H3's content while the H3 still shows a collapsed chevron (and its stored state says collapsed).

**Fix:** In the expand path, walk siblings with a skip level: when you encounter a heading element that has class `is-collapsed`, un-hide the heading itself but *leave `is-hidden` on* subsequent elements until the next heading of the same or higher level; then resume un-hiding. Collapse path stays as-is.

**Tests:** H2 > content > H3(collapsed) > content > H3 layout — collapse H2, expand H2 → first H3's content stays hidden, second H3's content visible, both H3 headings visible.

---

## P2 — Correctness hardening & structural cleanup

### I5. Remove the redundant `offset` field — **DONE**
**File:** `src/DailyNotesStreamView.ts:19` and all uses

`offset` is always equal to `state.length` (both start at 0; every mutation updates both in lockstep). Two sources of truth for one value is the root of the invariant documented in `CLAUDE.md`. Delete the field; use `this.state.length` everywhere (`getBatch(this.state.length, BATCH_SIZE)`, the `globalIndex >= this.state.length` guard, etc.). Update the **Live updates** invariant paragraph in `CLAUDE.md` to say `state.notes === service._sorted.slice(0, state.length)`.

### I6. Serialize view mutations to close event/load races — **DONE**
**File:** `src/DailyNotesStreamView.ts`

`loadMoreNotes`, `onFileCreate`, and `onFileModify` all `await` mid-mutation, so vault events can interleave with an in-flight batch load. Concrete failure: a file deleted while its batch is rendering — `removeSorted` returns an index beyond the loaded range so state/DOM are left alone, but the batch loop then renders the deleted file's element and `state.reset([...notes, ...batch])` re-adds its stale `TFile`.

**Fix:** Add a mutation queue:
```ts
private queue: Promise<void> = Promise.resolve();
private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch(e => console.error("DailyNotesStream:", e));
}
```
Route the bodies of `loadMoreNotes`, `onFileCreate`, `onFileModify`, `removeNote`, and `refresh` through `enqueue`. Replace `isLoading` with a `loadPending` flag set synchronously when a load is enqueued and cleared when it finishes, so a visible sentinel doesn't enqueue duplicate loads. Inside the queued create/delete tasks, re-derive indices at execution time (they already query the service, so this mostly falls out).

**Tests:** delete-during-load leaves the deleted note out of DOM and state; two rapid creates render in date order; observer firing during a load doesn't double-load.

### I7. Clicking a link inside a heading also toggles collapse — **DONE**
**File:** `src/CollapsibleManager.ts:40-45`

Headers bind the toggle on the whole heading element, so clicking a wikilink in a heading both navigates and collapses the section — and any text-selection click toggles too. List items already bind only the chevron.

**Fix:** Move the header toggle handler onto the `indicator` span (with `e.stopPropagation()`), matching `processLists`. Update `docs/TESTING.md` (header collapse is triggered by the chevron).

### I8. Rename wipes collapse state instead of migrating it — **DONE**
**Files:** `src/CollapsibleStateStore.ts`, `src/DailyNotesStreamView.ts:155-159`

`onFileRename` → `removeNote` → `clearForFile(oldPath)`, then re-creates under the new path, so all collapsed sections reset whenever a note is renamed or moved.

**Fix:** Add `migrate(oldPath: string, newPath: string): void` to the store: read the old index, for each sectionKey copy the value to the new path's key, write the new index, then clear the old entries. In `onFileRename`, call `migrate` before `removeNote`, and make `removeNote` accept a flag (or split a helper) so the rename path skips `clearForFile`.

### I9. Escape CSS selector with `CSS.escape` — **DONE**
**File:** `src/DailyNotesStreamView.ts:244`

The hand-rolled `path.replace(/"/g, '\\"')` misses backslashes and other metacharacters. Use `` `.daily-note-content[data-source-path="${CSS.escape(path)}"]` `` — jsdom supports `CSS.escape`, so tests need no shim.

---

## P3 — Quality, performance, polish

### I10. `DailyNoteService` cleanup
**File:** `src/DailyNoteService.ts`
- `parseDate` calls `getDailyNoteSettings()` on every invocation — `insertSorted` calls it O(log n) times per insert. Fetch settings/format once per public operation and pass them down.
- `buildSorted` duplicates the format-derivation and parse logic — reuse the shared helper.
- `insertSorted` does a linear `some()` dedupe scan *and* a binary search. Drop the `some()`; after the binary search, check whether the neighbor at the insertion point has the same path.

### I11. `StreamState`: stop copying on every read; add `append`
**File:** `src/StreamState.ts:6-8`

The `notes` getter clones the array on every access (hot paths: `insertElementAt`, `loadMoreNotes`, `refresh`). Return the internal array typed `readonly TFile[]` without copying. Add `append(files: TFile[]): void` and replace `state.reset([...state.notes, ...batch])` in `loadMoreNotes` with `state.append(batch)`.

### I12. Extract "insert before sentinel" helper
**File:** `src/DailyNotesStreamView.ts:175-180, 187-192, 259-276`

The `getSentinel() ? insertBefore : appendChild` dance appears four times. Add a private `insertBeforeSentinel(el: HTMLElement): void` on the view and use it everywhere (including the fallbacks inside `insertElementAt`).

### I13. Use `vault.cachedRead` for rendering
**File:** `src/NoteRenderer.ts:44`

The view is read-only display; `vault.cachedRead(file)` avoids a disk read. Straight swap; update the mock.

### I14. Disambiguate duplicate header/list collapse keys
**File:** `src/CollapsibleManager.ts:26, 56`

Two headings with identical text share one storage key, so collapsing one collapses both on next render. Track slug occurrence counts per note during processing and suffix repeats (`slug`, `slug-2`, `slug-3`). Same for list-item keys. First occurrence keeps the bare slug so existing stored state stays valid.

### I15. Keyboard & ARIA support for collapsibles
**Files:** `src/CollapsibleManager.ts`, `src/NoteRenderer.ts`

Chevrons are click-only spans. On each indicator (headers, list items, properties heading): `role="button"`, `tabindex="0"`, `aria-expanded` kept in sync on toggle, and a `keydown` handler for Enter/Space. Give the note-title `<a>` an `href="#"` + `preventDefault`, or make it a `role="link"` element, so it's focusable.

### I16. Dependency & manifest hygiene
**Files:** `package.json`, `manifest.json`
- `"obsidian": "latest"` is a floating version and sits in `dependencies` although it's types-only (marked external at build). Move it to `devDependencies` pinned to a released version ≥7 days old (project convention).
- `minAppVersion: "0.15.0"` is inaccurate: `MarkdownRenderer.render(app, ...)` requires ~1.3.0+. Verify the minimum against the obsidian-api changelog and bump `manifest.json` + `versions.json`.

### I17. Trivia
- Remove the leftover `console.debug("DailyNotesStreamView: Opening view...")` (`src/DailyNotesStreamView.ts:95`).
- `NoteRenderer` captures the settings *object reference* and only works because settings are mutated in place (`src/settings.ts:33`). Pass the plugin (or a `getSettings` closure) instead so a future `loadSettings()` reassignment can't silently freeze the renderer's view of settings.
- Empty-state div in `loadMoreNotes` uses raw `document.createElement`; use `createDiv({ cls, text })` like the rest of the codebase (falls out of I1).
- Delete the empty `onunload()` override in `src/main.ts:66-67` — the base class default is identical.

### I18. Delete dead code: `StreamState.findIndex`
**File:** `src/StreamState.ts:24-26`

`findIndex` has no callers in `src/` — only its own unit tests exercise it. Delete the method and its tests.

### I19. Replace the `as MarkdownView` cast with `instanceof`
**File:** `src/NoteRenderer.ts:24-26`

`(leaf.view as MarkdownView).file` assumes every `"markdown"` leaf view is a loaded `MarkdownView` (deferred views since Obsidian 1.7.2 may not be). Use `leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path`. The obsidian mock needs a `MarkdownView` class for `instanceof` to work in tests. The review bot also flags view casts, so this supports the M section.

### I20. Deduplicate collapse-indicator wiring; slim down `renderProperties`
**Files:** `src/CollapsibleManager.ts:29-45, 60-73`, `src/NoteRenderer.ts:69-128`

The create-span → `addClass("collapse-indicator")` → `setIcon(chevron)` → read-state → toggle-handler sequence is written out three times (headers, list items, properties heading). Extract one helper, e.g. `attachCollapseToggle(hostEl, { initiallyCollapsed, onToggle }): HTMLElement` in `CollapsibleManager` (or a small shared module), and use it in all three places. While there:
- `renderProperties` is ~60 lines doing three jobs; split out `renderPropertyRow(container, key, value)` and replace the icon if/else chain with a lookup table (`const PROPERTY_ICONS: Record<string, string>` plus the date/time substring rule).
- Optional consistency fix: the properties panel's collapse state is a local variable, so it resets to the settings default whenever the note re-renders on modify — unlike headers/lists, which persist via `CollapsibleStateStore`. Persist it in the store under a reserved key (e.g. `properties`), falling back to `settings.propertiesCollapsed` when unset; `clearForFile` then cleans it up on delete for free.

### I21. Collapse `insertElementAt` to a single decision
**File:** `src/DailyNotesStreamView.ts:249-279`

Three branches with repeated fallbacks reduce (after I1 removes the stale empty-state and I12 adds `insertBeforeSentinel`) to: look up the element of `notes[index]` if `index < notes.length`; insert before it if found, otherwise `insertBeforeSentinel(el)`. The `index === 0` special case is subsumed — `notes[0]`'s element *is* the first note block.

---

## M — Marketplace readiness (required for submission)

Reference: Obsidian's [submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins) and [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines). The review bot enforces most of these automatically.

### M1. Use `registerDomEvent` for the container click listener
**File:** `src/DailyNotesStreamView.ts:72`

The internal-link handler uses raw `addEventListener`. Reviewers require DOM listeners via `this.registerDomEvent(this.streamContainerEl, "click", ...)` for guaranteed cleanup. Straight swap; add `registerDomEvent` to the `Component`/view mock if missing.

### M2. Isolate the internal `vault.config` access
**File:** `src/DailyNotesStreamView.ts:46-53`

`readableLineLength` has no public API, so some internal access is unavoidable — but reviewers flag it, so contain and justify it. Extract a helper (e.g. `getReadableLineLength(app): boolean` in a small util or on the view) holding the single type-cast, keep the `?? true` fallback, and keep the comment explaining there is no public API. Behavior unchanged; be prepared to justify it in the submission PR.

### M3. `manifest.json` fixes
- `authorUrl` is `https://github.com/madhurya`, but the git author is `madhurya27` — verify and point it at the real profile (reviewers check that it resolves to the author). Update `author` if it should be a display name other than "Madhurya".
- `minAppVersion` accuracy is item I16 — required before submission, since the bot cross-checks `versions.json`.
- Do not add `fundingUrl` unless it's a real funding page (an invalid one is rejected).

### M4. README corrections
- The command palette entry is shown as "Daily Notes Stream: Open stream", but the README says `Open Daily Notes Stream` — fix the Usage section.
- Rename the title from "Daily Notes Stream Plugin" to "Daily Notes Stream" (guidelines discourage "Plugin" in names; keeps it consistent with the manifest).

### M5. Release automation
Add `.github/workflows/release.yml` mirroring the [obsidian-sample-plugin release workflow](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/.github/workflows/release.yml): on a pushed tag, run `pnpm install --frozen-lockfile && pnpm run build`, then create a draft GitHub release with `main.js`, `manifest.json`, `styles.css` attached as **individual assets** (no zip required). The tag must exactly equal the `manifest.json` version — **no leading `v`** (`version-bump.mjs` already handles the manifest/versions.json bump via `pnpm version`). Pin action versions per the dependency-quarantine convention.

### M6. Pre-submission compliance sweep
Run through these and fix anything found (most are already clean — verify, don't assume):
- No `console.log`/`console.debug` in production paths (I17 removes the known one; `console.error` for real errors is fine).
- No `innerHTML`/`outerHTML`, no `var`, no styles assigned from JS — use CSS classes (currently compliant).
- Sentence case in all UI strings (command names, settings, ribbon tooltip — currently compliant).
- No heading like "General" in settings; settings names don't repeat the plugin name (compliant).
- `onunload` must not detach leaves of the view type (compliant — leave it empty).
- `normalizePath` on constructed vault paths (arrives with I2).
- Mobile: `isDesktopOnly: false` demands no Node/Electron APIs (compliant) — run the `docs/TESTING.md` checklist on iOS or Android before submitting.
- `pnpm run build` must succeed from a clean clone with the pinned deps.

### M7. Submission steps (manual, after everything above is merged and released)
1. Confirm the GitHub repo is public with `README.md` and `LICENSE` at the root (both exist).
2. Publish the release (M5) for the final version; verify the three assets download correctly.
3. Fork `obsidianmd/obsidian-releases`, append an entry to `community-plugins.json`: `{ "id": "daily-notes-stream", "name": "Daily Notes Stream", "author": <manifest author>, "description": <manifest description>, "repo": "<owner>/<repo>" }` (end of file, no reordering).
4. Open the PR using their plugin template, tick every checklist item, and respond to bot findings until all checks are green.

---

## F — Post-1.0 features (fast-follow 1.1)

Implement after the 1.0 submission (M7), on their own branch. Release as `1.1.0`: bump `manifest.json` + `versions.json` via `pnpm version`, tag, release (M5 workflow). Update `README.md` (Features + Usage), `docs/TESTING.md`, and move "Date navigation" from `docs/TODO.md` to `docs/DONE.md` in the same branch.

### F1. Jump to date
The only way to reach old notes is scroll-triggered batch-10 loads — deep history is effectively unreachable. Add date navigation.

**Service** (`src/DailyNoteService.ts`): add `indexForDate(target: Moment): number` — the index of the first note (newest-first order) whose day is **on or before** `target`; `-1` if the list is empty or all notes are newer. Binary search `_sorted` comparing `date.valueOf()` at day granularity (reuse the parse helper from I10).

**View** (`src/DailyNotesStreamView.ts`): add `async jumpToDate(target: Moment)`:
1. `const index = this.plugin.service.indexForDate(target)`; if `-1`, show `new Notice("No daily note on or before that date.")` and return.
2. While `this.state.length <= index`, load the next batch (route through the I6 queue — extract the queue-safe batch-load body so this doesn't fight the observer's `loadPending` flag).
3. Find the element of `state.notes[index]` via `findNoteElement` and `el.scrollIntoView({ block: "start" })`. jsdom doesn't implement `scrollIntoView` — stub it in `tests/setup.ts`.

**UI:**
- `JumpToDateModal extends Modal`: an `<input type="date">` (created with `createEl`) plus a "Jump" button; on submit, convert the `YYYY-MM-DD` value with `moment(value, "YYYY-MM-DD", true)` and invoke a callback. Add `Modal` to the obsidian mock.
- View header action in `onOpen`: `this.addAction("calendar-search", "Jump to date", ...)` opening the modal.
- Command `id: "jump-to-date"`, name "Jump to date" in `main.ts` — it should open the stream view if needed (`activateView()`), then open the modal.
- No "scroll to today" button needed: the stream is newest-first, so today is `scrollTop = 0`.

**Tests:** `indexForDate` cases — exact hit returns that index; target between two notes returns the next older note's index; target newer than all notes returns 0; target older than all notes returns -1; empty list returns -1. Plus: jump loads exactly enough batches; jump to an already-loaded note loads nothing; invalid/empty modal input does nothing.

### F2. "Create today's note" call to action
If today's note doesn't exist, the stream silently starts at yesterday. Make the view a daily entry point.

**Service:** add `hasNoteForDate(target: Moment): boolean` — exact same-day match (binary search via `indexForDate`, then verify the hit is the same day).

**View:**
- After the first batch loads in `onOpen` flow, if `!service.hasNoteForDate(moment())`, insert a CTA div as the **first child** of `streamContainerEl`: cls `daily-notes-today-cta`, text "No note for today yet.", and a `button` ("Create today's note"). Style both in `styles.css` with native variables (`--interactive-accent` etc.).
- Button click: `createDailyNote(moment())` from `obsidian-daily-notes-interface` (add to the mock), `catch` → `console.error` + `Notice`. Do **not** insert the note manually — the vault `create` event routes it through `onFileCreate` (works even in an empty stream once I1 is in).
- Remove the CTA inside `onFileCreate` when the inserted file's date is today (`hasNoteForDate` after insert); re-show it in `removeNote` if today's note is deleted. Insertion order stays correct: new-note elements insert before the first *note block*, which sits after the CTA.
- Known limitation (document in TESTING.md): the CTA does not re-evaluate at midnight while the view stays open; it refreshes on reopen/refresh.

**Tests:** CTA shown when today missing, absent when today exists; click creates via the interface and the create event removes the CTA; deleting today's note re-shows it; CTA coexists with (and survives) the empty-vault state until I1's empty-state removal clears both.
