# Testing: Daily Notes Stream Plugin

## 1. Automated tests
```bash
pnpm test
```
Covers date parsing and sorting for root-folder and nested `YYYY/MM/` structures.

## 2. Test vault setup
- Enable the **Daily Notes** core plugin; set a **New file location** (e.g. `Notes`).
- Create 11+ daily notes matching your date format (default `YYYY-MM-DD`) to test infinite scroll.
- Add frontmatter to some notes (tags, aliases, custom fields) to test properties display.

## 3. Deploy
```bash
pnpm run build
cp main.js manifest.json styles.css <vault>/.obsidian/plugins/daily-notes-stream/
```

## 4. Verification

Items marked **[e2e]** are covered automatically by `pnpm run test:e2e` against a
real Obsidian instance; the rest still need a human.

### Core
- Notes display newest-first; date headers are correct. **[e2e]**
- Clicking a header opens the original file.
- Image `test-image.svg` renders in **2026-02-01**; `[[2026-01-15]]` link navigates correctly and back.
- Scrolling to the bottom loads the next batch without duplicates. **[e2e]**
- Tall window, short notes → loading continues past the first batch.

### Collapsible content
- Clicking a header chevron collapses its content; chevron rotates. **[e2e]**
- Expanding a header keeps nested sections that were collapsed themselves collapsed.
- Clicking a link (or selecting text) inside a header does not collapse the section.
- Clicking a parent bullet chevron collapses sub-bullets.
- Two headings with the same text collapse independently of each other.

### Keyboard & screen reader
- Tab reaches note titles and every chevron; Enter or Space toggles a chevron without scrolling the stream. **[e2e]**
- A screen reader announces each chevron as a button and reads its expanded/collapsed state.

### Scroll preservation
- Toggle any setting in **Settings → Daily Notes Stream** → view refreshes but scroll position is retained.

### Live updates
- Create a new daily note → appears at correct position immediately. **[e2e]**
- Create the first note in an empty vault → replaces the empty-state message without reopening.
- Edit a visible daily note → stream updates in real-time.
- Edit its frontmatter → properties update, no frontmatter leaks into the body.
- Rename a daily note → header and sort order update; collapsed sections stay collapsed.
- Delete a daily note → disappears from stream.
- A dated `.png`, or a dated note outside the folder → neither appears. **[e2e]**

### Properties
- **Settings → Show Note Properties ON**: "Properties" header appears for notes with frontmatter; icons shown next to property names.
- Clicking "Properties" header toggles collapse; chevron rotates.
- **2026-02-01**: `tags: test, image, link`, `aliases: Feb 1st Test`, `mood: productive`.
- **2026-01-15**: `tags: backlink, test`, `type: daily`, `location: Home Office`.
- **Collapse by Default ON**: properties start hidden until you toggle a note's panel; that choice then sticks for that note across edits and reopens. **[e2e]**
- Frontmatter is **not** duplicated in the note body.

### Mobile
- Responsive layout and touch scrolling work on iOS/Android.

## 5. Debugging
Open the Developer Console (`Cmd+Opt+I`). Look for `DailyNotesStreamView:` and `DailyNoteService:` prefixed logs. "No daily notes found" means the daily notes plugin isn't configured or no files match.
