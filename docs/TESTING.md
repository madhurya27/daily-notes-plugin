# Testing

## Setup

```bash
pnpm test                          # unit
pnpm run test:e2e                  # every spec twice, desktop and mobile
pnpm exec playwright test --project=mobile   # just one project
pnpm run build && pnpm run seed    # write PluginTest/ and install the build into it
pnpm run open --help               # every option, with its default
```

`seed` writes 122 daily notes in `Notes/` plus everything the checklist names: the two dated notes, nested
lists, repeated headings, a heading holding a link, `test-image.svg`, and a dated `.png` and out-of-folder
dated note that must *not* appear. Filler notes cycle seven shapes — long notes, a wide code block, a wide
table, tasks and a blockquote, H1–H6 nesting, and one with no frontmatter, so the properties panel is tested
by its absence too. `--days N` changes the count (`400` for deep history, `12` for barely past one batch), and
a path argument seeds elsewhere. Re-seeding rewrites the notes but leaves `.obsidian` alone, so your layout
survives.

`open` runs its own Obsidian against `.dev/obsidian-userdata`, beside your real one. It opens on the main
display — it is meant to be watched, unlike the hidden e2e window. Phone mode has no draggable region, so
`--position` is how that window moves.

Deploying a new build is the same `build && seed`, then **Reload app without saving** — or skip both:

```bash
pnpm run open        # the window to work against
pnpm run dev:vault   # links the build in, watches it, reloads the plugin on every save
pnpm run reload      # that reload, once, by hand
```

Re-seeding copies over the links; `dev:vault` puts them back.

## Verification

**[e2e]** items are covered by `pnpm run test:e2e`; the rest need a human.

### Core

- Notes newest-first, date headers correct. **[e2e]**
- Clicking a header opens the original file.
- `test-image.svg` renders in **2026-02-01**; `[[2026-01-15]]` navigates there and back.
- Scrolling to the bottom loads the next batch without duplicates. **[e2e]**
- Tall window, short notes → loading continues past the first batch.

### Jump to date

- The header action and `Daily Notes Stream: Jump to date` both reach the modal. **[e2e]**
- A date far back loads the batches between and puts that note at the top of the pane. **[e2e]**
- No note that day lands on the nearest older one; nothing that old raises a notice. **[e2e]**
- Enter in the field jumps, as the button does.

### Collapsible content

- A header chevron collapses its content; the chevron rotates. **[e2e]**
- Expanding a header leaves already-collapsed nested sections collapsed.
- A link click or text selection inside a header does not collapse it.
- A parent bullet's chevron collapses its sub-bullets.
- Two headings with the same text collapse independently.
- A task's checkbox sits on its label's line and ignores clicks: the file decides its state. **[e2e]**

### Keyboard and screen reader

- Tab reaches note titles and every chevron; Enter or Space toggles without scrolling the stream. **[e2e]**
- A screen reader announces each chevron as a button, with its expanded state.

### Scroll preservation

- Toggling any setting refreshes the view but keeps scroll position.

### Off-screen notes

- Scroll far down a large vault: notes well above lose their content but not
  their space — nothing below them shifts. **[e2e]**
- Scroll back up: they come back, collapse state included. **[e2e]**
- Renderer memory settles while scrolling to the end of a multi-year vault
  rather than climbing with every batch. **[e2e]** — `pnpm run test:memory`
  seeds three years and reports what is rendered, the heap and the live DOM.

### Live updates

- New daily note appears at the right position immediately. **[e2e]**
- The first note in an empty vault replaces the empty state without reopening.
- Editing a visible note updates the stream.
- Editing frontmatter updates properties, and none leaks into the body.
- Renaming updates header and sort order, and keeps collapsed sections collapsed.
- Deleting removes it.
- A dated `.png` or an out-of-folder dated note: neither appears. **[e2e]**
- Changing the daily-note folder or date format in Obsidian's settings reloads the stream, without
  reopening the view. **[e2e]**

### Properties

- **Show note properties ON** (the default): a "Properties" header appears for notes with frontmatter, icons
  beside names.
- Clicking the header toggles collapse; the chevron rotates, and no focus ring stays behind. **[e2e]**
- "Properties" starts where the note's own headings do, chevron and all. **[e2e]**
- Collapsed leaves the heading alone, with no empty box beneath it and no jump in its position. **[e2e]**
- The panel matches the one Obsidian draws for the same note: text size, row height, icons. **[e2e]**
- Each icon follows the key's type, as Obsidian's panel does: `aliases` an arrow, text lines, tags a tag. **[e2e]**
- List properties are pills: tags in the tag colours, one per tag, `tags: a, b` included. **[e2e]**
- Clicking a tag — inline in a note or as a pill — opens search on `tag:#name`. **[e2e]**
- Cmd/Ctrl-clicking a tag opens that search in a new tab instead of the sidebar. **[e2e]**
- **2026-02-01**: `tags: test, image, link`, `aliases: Feb 1st Test`, `mood: productive`.
- **2026-01-15**: `tags: backlink, test`, `type: daily`, `location: Home Office`.
- **Collapse properties by default ON**: panels start hidden, and a note's own choice then sticks across edits
  and reopens. **[e2e]**
- Frontmatter is not duplicated in the body.

### Mobile

Run before a release: `isDesktopOnly: false` is a promise no static check keeps.

Emulate first — `pnpm run open` gives `is-mobile` and `is-phone`, `--ipad` the tablet layout without
`is-phone`, `--landscape` either on its side. This loads the mobile CSS, so it catches layout and touch-target
problems in seconds, but it keeps Electron's Chromium and cannot reproduce a WKWebView bug.

Re-run it to switch — about three seconds, and each flag sizes the window to match, `--desktop` included.

Then a real device:

| Platform | Route |
| --- | --- |
| iOS | Vault in iCloud Drive: copy the three built files on the Mac into `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/<vault>/.obsidian/plugins/daily-notes-stream/`. The Files app hides dot-folders. |
| iOS, no cable | BRAT against a published pre-release — also exercises the real release artifacts. |
| Either | Obsidian Sync with "Installed plugins" enabled. |
| Android | Any file manager, into `<vault>/.obsidian/plugins/daily-notes-stream/`. |

Checks:

- Notes fill the width with no horizontal scroll; code blocks and tables scroll inside themselves.
- Chevrons on headers, list items and the properties row are tappable without zooming, and a tap on heading
  *text* still selects.
- A hard flick to the bottom loads the next batch without duplicates or a stall; repeated flicks keep loading.
- Backgrounding and returning keeps position and keeps scrolling.
- Editing a visible note elsewhere re-renders it in place.
- Rotation reflows without clipping or losing position.
- No console errors (iOS: Safari → Develop; Android: `chrome://inspect`).

iOS is the one that matters: Android's WebView is Chromium, so desktop plus emulation covers that engine.

## Debugging

Developer Console (`Cmd+Opt+I`), `DailyNotesStream:` prefixed logs. "No daily notes found" means the core daily
notes plugin is unconfigured or nothing matches.
