# Plan: skip empty notes

Design and rationale: [ADR 0011](../adr/0011-hide-template-only-notes.md). Test first at every step.

**Blocked on** the search source cache (`docs/TODO.md`, Async): step 2 reads text through it.

## Steps

1. **Matcher** — `src/notes/template-match.ts`: template text → `RegExp`; `isTemplateOnly(text, template)`.
   Cases: blank text, core placeholders (`{{date}}`, `{{date:FMT}}`, `{{date+1d:FMT}}`, `{{yesterday}}`),
   Templater blocks, trailing whitespace, a changed or added property, a filled-in prompt, no template set.
2. **Index** — `src/notes/empty-notes.ts`, one per plugin: path → `{ mtime, empty }`. `refresh(files)` reads,
   through the source cache, only notes within the template's size + 1 KB; a cached `mtime` skips the check. Resolves the template like
   `obsidian-daily-notes-interface` (`getFirstLinkpathDest(template, "")`); a `modify` of the template file
   or a new template path drops every verdict.
3. **Service** — `DailyNoteService` takes `isHidden(file, date)`: setting on, not today, empty.
   `buildSorted` and `insertSorted` filter through it. The template path joins `signature`, so a new one rebuilds.
4. **View open** — `await` the index before `service.initialize()` and the first batch.
5. **Stream** — on `changed`: update the verdict, then in the queue `removeSorted` a note that became empty,
   `insertSorted` one that stopped being empty, else refresh as now. `state.notes` invariant holds.
6. **Setting** — "Hide empty notes", default on; a toggle rebuilds like `onDailyNoteSettingsChange`.
7. **Empty state** — its own wording when every note is hidden.
8. **e2e** — template-only note hidden; typing into it shows it; a property added shows it; today shows;
   the toggle restores all. Screenshot desktop and mobile.

## Docs, same branch

- README: the feature and its setting.
- `docs/TESTING.md`: the checks from step 8, by hand.
- `CLAUDE.md`: `empty-notes.ts` and `template-match.ts` under Architecture.
- `docs/TODO.md` → `docs/DONE.md`; ADR 0011 → Accepted.
