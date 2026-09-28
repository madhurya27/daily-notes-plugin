# Plan: linked mentions under each note

Each note in the stream ends with the notes that link to it, as Obsidian's
"Linked mentions" does, built on the public API only. Unlinked mentions are
out of scope; add them later if missed.

## Behavior

- A footer after the note's content: a "Linked mentions" heading, its count,
  and a chevron. Shown only when at least one note links here.
- One group for each linking note, sorted by path. The group's title is that
  note's name.
- Each link is shown in the paragraph, list item or heading around it, rendered
  as markdown. A section holding several links is shown once.
- Frontmatter links (`frontmatterLinks`) have no section. For those, show the
  property as `key: value`.
- Titles and links inside snippets open, hover-preview and get a context menu
  the same way the stream's own links do.
- The collapsed state persists per note, like properties. Settings: "Show
  linked mentions" (on) and "Collapse linked mentions by default" (off).

## Design

| Piece | Where | Does |
|---|---|---|
| `linkedMentions(app, file)` | new `src/notes/linked-mentions.ts` | Finds the sources where `metadataCache.resolvedLinks[source][file.path]` is set. For each source, keeps the `links`/`embeds` whose `getFirstLinkpathDest` is `file`, mapped to their enclosing `sections` entry and de-duplicated. Returns `{ source: TFile, sections: {start, end}[], properties: string[] }[]`. |
| `mentionsSignature(app, file)` | same | Sorted `source:count:mtime`, used to tell whether a rendered footer is stale. |
| `renderLinkedMentions(...)` | new `src/render/linked-mentions.ts` | Draws the footer into the block after `.daily-note-content`. Snippets go through `MarkdownRenderer.render(app, text, el, source.path, noteComponent)`, each inside a wrapper with `data-link-source`. |
| Collapse | `src/render/collapsible.ts` | A new `LINKED_MENTIONS_SECTION_KEY`, wired through `attachCollapseToggle` + `attachCollapseHost` as `renderProperties` does. |
| Link resolution | `NoteRenderer.linkAt` | Resolves `sourcePath` from `closest("[data-link-source]")` before `.daily-note-block`, so a snippet's link resolves against the note it was written in. A group title is an `a.internal-link` to its source, so the existing delegation handles it. |
| Staleness | `src/ui/stream-view.ts` | On `metadataCache.on("resolved")`, finds each rendered block whose signature changed and passes it to `NoteStream.onFileModify`. That reuses the queued, debounced `NoteWindow.refresh` path (ADR 0004). |
| Settings | `src/settings.ts` | Two toggles. `saveSettings` already refreshes views. |

- Unloaded blocks have no footer, like the rest of their content (ADR 0006).
  A footer is only computed when its note renders.
- On mobile, run `stackWideTables` / `fitWideEquations` on the snippets. Any
  clipping uses `overflow: clip` (ADR 0008).
- Stream search: `note-search.ts` matches only the note's own source. Check
  that `search-highlights.ts` never paints inside the footer.

## Order (TDD, one branch)

1. `linked-mentions.ts`:
   - it finds the linking notes;
   - it maps each link to its section, with duplicates removed;
   - it covers embeds and frontmatter links;
   - it excludes self-links and unresolved links;
   - the signature changes when a count or mtime does.
2. The footer:
   - it's absent with no mentions or with the setting off;
   - it shows the right count and one group per source;
   - snippets render with the source's path;
   - the collapsed state persists.
3. `linkAt`: a snippet link resolves against its source note.
4. Stream view: `resolved` refreshes only the blocks whose signature changed.
5. `tests/mocks/obsidian.ts`: add `resolvedLinks` and `sections` if missing.
6. e2e `e2e/linked-mentions.spec.ts` and seed notes that link to each other
   (`scripts/seed-test-vault.mjs`). Check that:
   - the footer shows its count;
   - a group title opens its source note;
   - a snippet link resolves;
   - editing a source note in another tab updates the footer;
   - on mobile, `scroll-boxes.spec.ts` stays green.
7. Docs:
   - `docs/decisions.md` entry: public API over Obsidian's internal backlinks
     component; unlinked mentions deferred;
   - README, `docs/TESTING.md`, `docs/TODO.md`/`DONE.md`;
   - CLAUDE.md architecture lines.

## Done when

- `pnpm run format`, `lint`, `build` and `test:coverage` (100%) all pass.
- `pnpm run test:e2e` passes in full, plus `e2e/webkit.spec.ts`.
- Desktop and mobile screenshots have been inspected.
- `pnpm run test:memory` shows no regression.
