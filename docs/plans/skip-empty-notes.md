# Plan: skip empty notes

Design and rationale: [ADR 0011](../adr/0011-hide-template-only-notes.md). Test
first at every step.

## Steps

1. **Matcher** — `src/notes/template-match.ts`: template text → `RegExp`;
   `isTemplateOnly(text, template)`. Cases: blank text, core placeholders
   (`{{date}}`, `{{date:FMT}}`, `{{date+1d:FMT}}`, `{{yesterday}}`), Templater
   blocks, trailing whitespace, a changed or added property, a filled-in prompt,
   no template set.
2. **Index** — `src/notes/empty-notes.ts`, one per plugin: path →
   `{ mtime, empty }`. `refresh(files)` reads, through `cachedRead`, only notes
   within the template's size + 1 KB; a cached `mtime` skips the check. Resolves
   the template like `obsidian-daily-notes-interface`
   (`getFirstLinkpathDest(template, "")`); a `modify` of the template file or a
   new template path drops every verdict.
3. **Service** — `DailyNoteService` takes `isHidden(file, date)`: setting on,
   not today, empty. `buildSorted` and `insertSorted` filter through it. The
   template path joins `signature`, so a new one rebuilds.
4. **View open** — `await` the index before `service.initialize()` and the first
   batch.
5. **Stream** — on `changed`: update the verdict, then in the queue
   `removeSorted` a note that became empty, `insertSorted` one that stopped
   being empty, else refresh as now. `state.notes` invariant holds.
6. **Setting** — "Hide empty notes", default on; a toggle rebuilds like
   `onDailyNoteSettingsChange`.
7. **Empty state** — its own wording when every note is hidden.
8. **Timing** — add the index's reads to `e2e/memory.spec.ts`' first-open test,
   at phone speed.
9. **e2e** — template-only note hidden; typing into it shows it; a property
   added shows it; today shows; the toggle restores all. Screenshot desktop and
   mobile.

## Docs, same branch

- README: the feature and its setting.
- `docs/TESTING.md`: the checks from step 9, by hand.
- `CLAUDE.md`: `empty-notes.ts` and `template-match.ts` under Architecture.
- `docs/TODO.md` → `docs/DONE.md`; ADR 0011 → Accepted.

## Left: phone test, then merge

Steps 1–9 are done, with the failure handling (`D-071`). Build "witty panda" is
on the iPhone's Demo vault, seeded 2026-09-29: template `Templates/Daily`;
2026-08-03, 08-26 and 09-03 unwritten; 09-03 linked from
`Projects/Kitchen renovation`. Force-quit Obsidian once iCloud syncs; the notice
names the build.

| #   | Do                                              | Expect                                                                  |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Scroll the stream                               | 08-26 and 08-03 absent; 09-03 shows, the plumber link under it          |
| 2   | Scroll back and forth past them                 | No jumps or gaps                                                        |
| 3   | Write a line in 08-26 (file list or search)     | Appears at its date without reopening; deleting the line hides it again |
| 4   | Set only `mood` in 08-03                        | Appears                                                                 |
| 5   | Remove the plumber line from Kitchen renovation | 09-03 hides; undo shows it                                              |
| 6   | Settings: Linked mentions off                   | 09-03 hides                                                             |
| 7   | Settings: Hide empty notes off, then on         | All three show without reopening, then hide                             |
| 8   | Replace today's note with the template text     | Today still shows                                                       |
| 9   | Jump to date                                    | 08-26 and 08-03 not offered                                             |
| 10  | Force-quit and reopen                           | Same notes hidden; opens at least as fast                               |
| 11  | Collapse a section, reopen                      | Stays collapsed                                                         |

Unreadable notes and a full localStorage are covered by unit tests only.

Then: merge `feat/skip-empty-notes` into `main` (`--no-ff`, with approval) and
delete this plan.
