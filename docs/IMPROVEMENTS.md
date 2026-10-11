# Improvement Specs

Implementation-ready specs for work that has not started. Shipped items are not
kept here — the commits and `docs/adr/` hold those. `docs/TODO.md` is the index
of what is open.

## M — Marketplace readiness

`tests/repo/compliance.test.ts` and the Obsidian ESLint rules guard every
automatable submission rule, so a regression fails there rather than in review.

**Blocking:** a green `pnpm run test:ios`, which runs `docs/TESTING.md`'s phone
checks. `isDesktopOnly: false` is a promise no static check can keep.

### Submission steps

Obsidian replaced the pull request against `obsidianmd/obsidian-releases` with a
developer dashboard; there is no `community-plugins.json` entry to append.

1. Make the repo public, with `README.md` and `LICENSE` at the root.
2. Publish the release for the final version; verify the three assets download
   individually.
3. Sign in to [community.obsidian.md](https://community.obsidian.md/), connect
   GitHub, pick the repo, follow the dashboard.
4. The automated review reports within minutes. Fix, release again, resubmit.
   Once it passes, the plugin is installable in-app within 24 hours.

## R — Code review, 2026-10

Unverified by tests: each fix starts with one that fails. Ordered by priority
within each list.

### Bugs

1. **Fold keys collide.** A second "Foo" gets `foo-2`, the key of a heading "Foo
   2" (`collapsible.ts:175`).
2. **A failed render duplicates the header.** The header and properties draw
   before the `try` (`note-renderer.ts:149-163`); if they throw, the next render
   appends to the same unemptied block.
3. **An edit's re-render is not a layout change.** `NoteWindowManager.refresh`
   never bumps `changes`, unlike `render` (`note-window.ts:272` vs `:362`), so
   `scrollIntoPlace` can take the stream as settled mid-re-render.
4. **Queued renders run after close.** `NoteStream.close()` leaves the queue
   running (`note-stream.ts:92`); each renders, then is discarded.
5. **"Today" is fixed at list build.** After midnight yesterday's empty note
   stays shown until a refresh (`empty-notes.ts:220`).

### Architecture

1. **One collapse store, like the others.** Now one localStorage key per section
   plus an index per file (`collapse-store.ts:61-67`): unprefixed, unlike
   `daily-notes-stream:*`, so open to collisions, and never cleaned since keys
   cannot be listed. One prefixed blob with `retainOnly` at layout ready fixes
   both.
2. **Two "block at the pane's top" lookups.** `captureAnchor` is linear
   (`scroll-position.ts:32`), `ScrollAnchor.blockAt` binary
   (`scroll-anchor.ts:392`). `AnchorSnapshot` and `StreamPlace` are one concept.
3. **`ScrollAnchor.stream()` infers the container** from the first watched
   block's parent (`scroll-anchor.ts:405`); pass it in.
4. **`NoteWindowManager` does four jobs** in 639 lines: windowing, pinning,
   placeholder reservation, settling. Extract reservation (`reserve`, `expect`,
   `reserveKey`, the estimate).
5. **`BacklinkIndex` re-inverts the whole vault on every `resolved`.**
   `LinkChanges` already diffs per source; one incremental index could serve
   both.
6. **`NoteStream` is a middle man** for `onResize`, `forgetHeights`,
   `scrollToTop`, `onBaseResized`, `onFingerDown`/`Up`.

### Performance

1. **Search reads every daily note per query**, and superseded queries still run
   (`stream-search.ts:179`). `applyChange` re-searches on events for any file,
   not only daily notes (`stream-view.ts:219`).
2. **The first empty-note check reads every candidate at once**
   (`empty-notes.ts:110`), and open waits on it: a spike on a phone.
3. **Linear lookups:** `DailyNoteService.indexOf` (`daily-note-service.ts:135`);
   `refresh` maps every date to read one (`note-stream.ts:417`); the jump modal
   re-reads the daily-notes settings per note.

### Smells

- `window` (a `NoteWindow`) shadows the global throughout `note-window.ts`.
- `(f) => this.blocks.get(f.path)` three times in `note-stream.ts` (343, 352,
  481).
- `NoteBases.draw` only forwards to `slot.draw` (`note-bases.ts:115`); a
  redundant `else if (width <= …)` at `:98`.
- Misplaced doc comments: two on `followLinkChanges`, none on `indexEmptyNotes`
  (`main.ts:142-143`); the class comment above `BASE_RESIZED`
  (`note-bases.ts:10-22`).
- `note-window.ts:347` says `reload`/`rerenderAll` empty the container
  mid-render; they share the queue, so only `close()` does.
- `_sorted`, `_notes` underscore names.
- Settings load from `data.json` unvalidated (`main.ts:188`).
- `onunload` throws if `onload` failed before the stores were made.
