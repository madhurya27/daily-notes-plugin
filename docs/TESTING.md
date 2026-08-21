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

### Core
- Notes display newest-first; date headers are correct.
- Clicking a header opens the original file.
- Image `test-image.svg` renders in **2026-02-01**; `[[2026-01-15]]` link navigates correctly and back.
- Scrolling to the bottom loads the next batch without duplicates.
- Tall window, short notes → loading continues past the first batch.

### Collapsible content
- Clicking a header chevron collapses its content; chevron rotates.
- Expanding a header keeps nested sections that were collapsed themselves collapsed.
- Clicking a parent bullet chevron collapses sub-bullets.

### Scroll preservation
- Toggle any setting in **Settings → Daily Notes Stream** → view refreshes but scroll position is retained.

### Live updates
- Create a new daily note → appears at correct position immediately.
- Create the first note in an empty vault → replaces the empty-state message without reopening.
- Edit a visible daily note → stream updates in real-time.
- Edit its frontmatter → properties update, no frontmatter leaks into the body.
- Rename a daily note → header and sort order update.
- Delete a daily note → disappears from stream.
- A dated `.png`, or a dated note outside the folder → neither appears.

### Properties
- **Settings → Show Note Properties ON**: "Properties" header appears for notes with frontmatter; icons shown next to property names.
- Clicking "Properties" header toggles collapse; chevron rotates.
- **2026-02-01**: `tags: test, image, link`, `aliases: Feb 1st Test`, `mood: productive`.
- **2026-01-15**: `tags: backlink, test`, `type: daily`, `location: Home Office`.
- **Collapse by Default ON**: properties start hidden.
- Frontmatter is **not** duplicated in the note body.

### Mobile
- Responsive layout and touch scrolling work on iOS/Android.

## 5. Debugging
Open the Developer Console (`Cmd+Opt+I`). Look for `DailyNotesStreamView:` and `DailyNoteService:` prefixed logs. "No daily notes found" means the daily notes plugin isn't configured or no files match.
