# Testing: Daily Notes Stream Plugin

## 1. Automated tests
```bash
pnpm test
```
Covers date parsing and sorting for root-folder and nested `YYYY/MM/` structures.

## 2. Test vault setup
```bash
pnpm run build && pnpm run seed
```
Writes `PluginTest/` (gitignored) with everything the checklist below names: 14
daily notes in `Notes/`, the two dated notes referenced by frontmatter, nested
lists, repeated headings, a heading holding a link, `test-image.svg`, and a dated
`.png` plus a dated note outside the folder that must *not* appear. Core daily
notes is pre-enabled at `Notes` / `YYYY-MM-DD`.

Open it once via **Open folder as vault**. Re-running the seed rewrites the notes
but leaves `.obsidian` alone, so the layout and settings you set up survive.

Pass a path to seed somewhere else: `pnpm run seed ~/Vaults/Mine`.

## 3. Deploy a new build
```bash
pnpm run build && pnpm run seed
```
Same command — it copies `main.js`, `manifest.json` and `styles.css` into the
vault's plugin folder. Then **Reload app without saving** in Obsidian.

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
- **Settings → Show note properties ON**: "Properties" header appears for notes with frontmatter; icons shown next to property names.
- Clicking "Properties" header toggles collapse; chevron rotates.
- **2026-02-01**: `tags: test, image, link`, `aliases: Feb 1st Test`, `mood: productive`.
- **2026-01-15**: `tags: backlink, test`, `type: daily`, `location: Home Office`.
- **Collapse properties by default ON**: properties start hidden until you toggle a note's panel; that choice then sticks for that note across edits and reopens. **[e2e]**
- Frontmatter is **not** duplicated in the note body.

### Mobile
`isDesktopOnly: false` promises this works on a phone; no static check can keep
that promise, so this section is run by hand before a release.

**Emulate first** — desktop console (`Cmd+Opt+I`), `this.app.emulateMobile(true)`,
and `false` to leave. This flips `Platform.isMobile` and loads the mobile CSS, so
it catches layout and touch-target problems in seconds. It is not a substitute
for a device: it keeps Electron's Chromium, so it cannot reproduce an iOS
WKWebView bug.

**Then a real device.** Getting the plugin onto one:
| Platform | Route |
| --- | --- |
| iOS | Vault in iCloud Drive: copy the three built files on the Mac into `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/<vault>/.obsidian/plugins/daily-notes-stream/`. The Files app hides dot-folders, so copying on the phone does not work. |
| iOS, no cable | BRAT, pointed at the repo, installing a published pre-release — also exercises the real release artifacts. |
| Either | Obsidian Sync with "Installed plugins" enabled. |
| Android | Any file manager, straight into `<vault>/.obsidian/plugins/daily-notes-stream/`. Dot-folders are visible. |

Checks:
- Layout: notes fill the width with no horizontal scroll; the properties panel
  stays readable at the narrowest width; long code blocks and tables scroll
  inside themselves rather than the page.
- Touch targets: the collapse chevrons on headers, list items and the properties
  row are tappable without zooming, and a tap on heading *text* still selects
  rather than toggling.
- Infinite scroll under momentum: a hard flick to the bottom loads the next batch
  without duplicates or a stall, and repeated flicks keep loading.
- Backgrounding: scroll down, switch apps, return — the view is still there at
  the same position and keeps scrolling.
- Live updates: edit a visible note in another pane/tab and confirm it re-renders
  in place.
- Rotation: portrait ↔ landscape reflows without clipping or a lost scroll
  position.
- Console: no errors in the mobile console (iOS: Safari → Develop → your device;
  Android: `chrome://inspect`).

**No Android device?** Lower risk than it sounds — Android's WebView is Chromium,
the same engine family as desktop Obsidian, so desktop plus emulation covers that
engine. iOS is the genuinely different one (WKWebView) and the one to test on
hardware. If you do want real Android, an Android Studio emulator with a Google
Play system image installs Obsidian from the Play Store, and `adb push` puts the
plugin in the vault.

## 5. Debugging
Open the Developer Console (`Cmd+Opt+I`). Look for `DailyNotesStream:` prefixed logs. "No daily notes found" means the daily notes plugin isn't configured or no files match.
