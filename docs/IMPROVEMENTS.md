# Improvement Specs

Implementation-ready specs for work that has not started. Shipped items are not kept here — the commits and
`docs/adr/` hold those. `docs/TODO.md` is the index of what is open.

## M — Marketplace readiness

`tests/compliance.test.ts` guards every automatable submission rule, so a regression fails there rather than in
review. Three things it cannot check, to confirm by hand before submitting:

- Settings has no headings, and no setting name repeats the plugin name.
- `normalizePath` guards the constructed path in `DailyNoteService`.
- A clean clone installs from the frozen lockfile and builds.

Open nit, not blocking: the "organize your code base using folders" guideline — `src/` is eleven flat files.

**Blocking:** run the `docs/TESTING.md` checklist on iOS or Android. `isDesktopOnly: false` is a promise no
static check can keep.

### Submission steps

Obsidian replaced the pull request against `obsidianmd/obsidian-releases` with a developer dashboard; there is
no `community-plugins.json` entry to append.

1. Make the repo public, with `README.md` and `LICENSE` at the root.
2. Publish the release for the final version; verify the three assets download individually.
3. Sign in to [community.obsidian.md](https://community.obsidian.md/), connect GitHub, pick the repo, follow
   the dashboard.
4. The automated review reports within minutes. Fix, release again, resubmit. Once it passes, the plugin is
   installable in-app within 24 hours.

## F — Post-1.0 features (1.1)

Own branch, released as `1.1.0`. Update `README.md`, `docs/TESTING.md`, and move the item from `TODO.md` to
`DONE.md` in the same branch.

### F1. Jump to date

Deep history is unreachable through batch-10 scrolling alone.

**Service** — `indexForDate(target: Moment): number`: index of the first note (newest-first) whose day is on or
before `target`; `-1` when the list is empty or all notes are newer. Binary search `_sorted` at day granularity.

**View** — `async jumpToDate(target: Moment)`:

1. `-1` → `new Notice("No daily note on or before that date.")`, return.
2. Load batches while `state.length <= index`, through `enqueue()` so it does not fight `loadPending`.
3. `findNoteElement` then `scrollIntoView({ block: "start" })`. jsdom has no `scrollIntoView` — stub it in
   `tests/setup.ts`.

**UI** — `JumpToDateModal extends Modal`: an `<input type="date">` and a Jump button; parse with
`moment(value, "YYYY-MM-DD", true)`. Add `Modal` to the obsidian mock. Reach it from a view action
(`addAction("calendar-search", …)`) and a `jump-to-date` command that opens the view first. No "scroll to
today": the stream is newest-first, so today is `scrollTop = 0`.

**Tests** — `indexForDate`: exact hit, target between two notes, newer than all, older than all, empty list.
Jump loads exactly enough batches; an already-loaded note loads none; invalid input does nothing.

### F2. Create today's note

Without today's note the stream silently starts at yesterday.

**Service** — `hasNoteForDate(target: Moment): boolean`, via `indexForDate` plus a same-day check.

**View** — after the first batch, if today is missing, insert `.daily-notes-today-cta` as the first child of
`streamContainerEl`: "No note for today yet." and a button. Style with native variables.

- The button calls `createDailyNote(moment())` (add to the mock); `catch` → `console.error` + `Notice`. Do not
  insert the note by hand — the vault `create` event routes it through `onFileCreate`.
- Remove the CTA in `onFileCreate` when the inserted date is today; re-show it in `removeNote` when today's
  note is deleted. New notes insert before the first note block, which sits after the CTA.
- Known limitation, document in TESTING.md: the CTA does not re-evaluate at midnight, only on reopen or
  refresh.

**Tests** — shown when today is missing, absent when it exists; click creates and the create event clears it;
deleting today's note re-shows it.
