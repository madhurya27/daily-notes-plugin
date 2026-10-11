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

`pnpm run test:ios` runs once, after every item below has landed; until then,
each change passes the other gates.

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
   stays shown until a refresh (`empty-notes.ts:220`). `isHidden` reads the
   clock itself; hand the filter a clock instead, so the day's turn is a change
   the stream hears.

### Architecture

1. **`BacklinkIndex` re-inverts the whole vault on every `resolved`.**
   `LinkChanges` already diffs per source; one incremental index could serve
   both.
2. **`NoteStream` is a middle man** for `onResize`, `forgetHeights`,
   `scrollToTop`, `onBaseResized`, `onFingerDown`/`Up`.
