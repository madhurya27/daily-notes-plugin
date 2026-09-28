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
| `BacklinkIndex` | new `src/notes/backlink-index.ts` | Target path → source paths, inverted from `metadataCache.resolvedLinks`. Built on first use, marked stale on `resolved`, rebuilt on the next lookup. One per plugin, shared by every view, like `parsed-dates.ts`. Replaces a scan of every source per rendered note. |
| `linkedMentions(app, index, file)` | new `src/notes/linked-mentions.ts` | For each source from the index, keeps the `links`/`embeds` whose `getFirstLinkpathDest` is `file`, mapped to their enclosing `sections` entry and de-duplicated. Returns `{ source: TFile, sections: {start, end}[], properties: string[] }[]`. Synchronous: cache only. |
| `mentionsSignature(...)` | same | Sorted `source:count:mtime`, used to tell whether a rendered footer is stale. |
| `renderLinkedMentions(...)` | new `src/render/linked-mentions.ts` | Draws the header and count synchronously. Snippets need each source's text: `cachedRead` all of them in parallel (`Promise.all`), then `MarkdownRenderer.render(app, text, el, source.path, noteComponent)` each inside a wrapper with `data-link-source`. Returns a promise that resolves once drawn. It aborts if the note's component unloads mid-read. |
| Off the queue | `NoteRenderer.renderInto`, `NoteWindow` | `renderInto` creates the empty footer element and starts its fill without awaiting it, so the render queue (shared with vault events) never waits on source reads. It returns `{ component, footer: Promise<void> }`. `NoteWindow.watchSettling` keeps the `HeightHold` until `footer` resolves, then starts the settle debounce: a remembered height, footer included, never dips while the footer fills. |
| Collapsed footer | same | Collapsed, the footer reads nothing and renders no snippets: the count comes from the index. Expanding it fills it then. |
| Collapse | `src/render/collapsible.ts` | A new `LINKED_MENTIONS_SECTION_KEY`, wired through `attachCollapseToggle` + `attachCollapseHost` as `renderProperties` does. |
| Link resolution | `NoteRenderer.linkAt` | Resolves `sourcePath` from `closest("[data-link-source]")` before `.daily-note-block`, so a snippet's link resolves against the note it was written in. A group title is an `a.internal-link` to its source, so the existing delegation handles it. |
| Staleness | `src/ui/stream-view.ts` | On `metadataCache.on("resolved")`, compares each rendered block's signature and re-fills only the stale footers, not the whole note. The swap is queued (ADR 0004); the reads happen before it, outside the queue. |
| Settings | `src/settings.ts` | Two toggles. `saveSettings` already refreshes views. |

- Unloaded blocks have no footer, like the rest of their content (ADR 0006).
  A footer is only computed when its note renders.
- A never-rendered note still grows once its footer fills, as it does today
  when a Base or image loads; `ScrollAnchor` holds the place.
- On mobile, run `stackWideTables` / `fitWideEquations` on the snippets. Any
  clipping uses `overflow: clip` (ADR 0008).
- Stream search: `note-search.ts` matches only the note's own source. Check
  that `search-highlights.ts` never paints inside the footer.

## Order (TDD, one branch)

1. `backlink-index.ts`: it inverts `resolvedLinks`; it rebuilds after
   `resolved` and not before; one index serves two views.
2. `linked-mentions.ts`:
   - it finds the linking notes;
   - it maps each link to its section, with duplicates removed;
   - it covers embeds and frontmatter links;
   - it excludes self-links and unresolved links;
   - the signature changes when a count or mtime does.
3. The footer:
   - it's absent with no mentions or with the setting off;
   - it shows the right count and one group per source;
   - snippets render with the source's path;
   - it reads sources in parallel, and none while collapsed;
   - it draws nothing once its note's component unloads mid-read;
   - the collapsed state persists.
4. `NoteWindow`: the queue moves on before the footer fills; the hold is
   kept until the footer resolves, then settles as before.
5. `linkAt`: a snippet link resolves against its source note.
6. Stream view: `resolved` re-fills only the footers whose signature changed.
7. `tests/mocks/obsidian.ts`: add `resolvedLinks` and `sections` if missing.
8. e2e `e2e/linked-mentions.spec.ts` and seed notes that link to each other
   (`scripts/seed-test-vault.mjs`). Check that:
   - the footer shows its count;
   - a group title opens its source note;
   - a snippet link resolves;
   - editing a source note in another tab updates the footer;
   - scrolling back up to a note whose footer refills keeps the position
     (desktop, mobile, `webkit.spec.ts`);
   - on mobile, `scroll-boxes.spec.ts` stays green.
9. Docs:
   - `docs/decisions.md` entry: public API over Obsidian's internal backlinks
     component. Why: our own footer can hold its note's height until it
     fills, and needs no internals. Rejected: hosting the internal component,
     which would bring Better Search Views and unlinked mentions but fills on
     its own schedule. Unlinked mentions deferred;
   - `docs/decisions.md` entry: a render never waits on a footer; the hold
     does;
   - README, `docs/TESTING.md`, `docs/TODO.md`/`DONE.md`;
   - CLAUDE.md architecture lines.

## Done when

- `pnpm run format`, `lint`, `build` and `test:coverage` (100%) all pass.
- `pnpm run test:e2e` passes in full, plus `e2e/webkit.spec.ts`.
- Desktop and mobile screenshots have been inspected.
- `pnpm run test:memory` shows no regression.
