# Testing

## Setup

```bash
pnpm test                            # unit
pnpm run test:e2e                    # every spec twice, desktop and mobile
pnpm run test:e2e --project=mobile   # one project
pnpm run test:e2e webkit.spec.ts     # the phone layout in iOS's engine (ADR 0009)
pnpm run demo --test                 # the test vault, below; --help lists every option
```

`pnpm run demo` runs its own Obsidian against `.dev/obsidian-userdata`, beside your real one, on the main
display: it is meant to be watched, unlike the hidden e2e window. Each run builds if there is no build,
reseeds the vault, links its plugin files to the repo's build, and reloads the plugin on every save until
Ctrl-C, which closes the window. Anything typed into the vault lasts until the next run; `.obsidian` is kept, so your layout survives.
Phone mode has no draggable region, so `--position` moves the window.

### Test vault: `--test`, `.dev/vault/`

What the checklist below is written against. `pnpm run seed --test` alone takes `--days N` for the filler
count (`400` for deep history, `12` for barely past one batch) and a path to seed elsewhere.

- 123 daily notes in `Notes/`: 120 filler notes and the three the checklist names by date.
- Filler cycles eight shapes, among them long notes, a wide code block, a wide table, tasks and a blockquote,
  H1–H6 nesting, no frontmatter (so the properties panel is tested by its absence), and Bases (so they recur
  all the way down).
- **2026-08-30**, the newest: one of each embed the e2e tests cover. Bases wide, narrow, too wide only in
  their values, resized by hand, a named view and inline (the Bases live in `Bases/`), plus embedded notes,
  display math, Mermaid and a wide table.
- **2026-08-29**, the newest filler note: linked mentions of every kind, from a nested list item, a paragraph,
  a wide table and a property. `[[Agenda]]` in `Projects/Plan.md` must open `Projects/Agenda.md`, not
  `Notes/Agenda.md`.
- **2026-02-01**: nested lists, repeated headings, a heading holding a link and `test-image.svg`. It and
  **2026-01-15** carry the frontmatter listed under Properties.
- A dated `.png` and a dated note outside the daily-notes folder, which must *not* appear.

### Demo vault: the default, `.dev/demo-vault/`

90 days of a journal that reads like a real one: properties, links to people and projects, tasks, callouts,
run logs, a sketch, a reading-list Base every Sunday, and project logs linking the newest days. Each note is
seeded by its date, so a retake shows the same content; `pnpm run seed` alone takes `--days N` and
`--until YYYY-MM-DD`. Screenshots and recordings come from it.

## Verification

**[e2e]** items are covered by `pnpm run test:e2e`; the rest need a human.

### Core

- The ribbon icon and `Open stream` open the stream in the current tab, as the graph does; run from a stream,
  it keeps its place. **[e2e]**
- Mod-click on the ribbon icon opens it in a new tab. **[e2e]** desktop; mod-alt-click splits.
- Notes newest-first, date headers correct. **[e2e]**
- Clicking a header opens its file in the stream's tab; Back returns to the stream. Mod-click opens a new tab,
  keeping the stream; mod-alt-click splits; right-click shows the file menu, "Open in new window" once.
  **[e2e]** Middle-click opens a new tab.
- `test-image.svg` renders in **2026-02-01**; `[[2026-01-15]]` navigates there and back.
- A link opens in the stream's tab even when another tab shows its note; `[[note#heading]]` opens at the
  heading. **[e2e]**
- A link inside a note (**2026-02-01**, Evening) takes the header's gestures: mod-click, mod-alt-click,
  middle-click, right-click. **[e2e]**
- Mod-hovering a link previews it **[e2e]**; Settings → Page preview lists "Daily notes stream", and turning
  its Mod requirement off previews on plain hover.
- `[[Someday]]` is faded; opening it creates the note and unfades it, deleting the note fades it again.
  **[e2e]**
- Right-click on an unresolved link offers only the open items; opening one creates the note.
- Open a note, then click into the stream: the word count and backlinks leave the status bar. **[e2e]**
- Back from a note opened in the stream's tab returns to the note the stream was scrolled to, as it does
  from the quick switcher (Mod-O). **[e2e]**
- Scrolling to the bottom loads the next batch without duplicates. **[e2e]**
- With the stream scrolled far, run `Daily notes stream: Scroll to top`: it glides to the newest note. The
  command is not offered with another view open. **[e2e]** for the glide.
- On iOS, scroll through the stream, quit Obsidian, reopen it and jump to an old date; scroll back up by hand:
  the glide stops on the newest note, and nothing jumps once it stops. **[e2e]** with anchoring off.
- On iOS, flicks glide to a natural stop, however far the stream has scrolled. **[e2e]** for the wait; the
  glide by hand.
- Tall window, short notes: loading continues past the first batch.
- Toggling any setting refreshes the view but keeps the scroll position.
- A table or Base too wide for the note scrolls in its own box, as in reading view; the page never scrolls
  sideways. **[e2e]** Each case is in **2026-08-30**.

### Jump to date

- The header action and `Daily notes stream: Jump to date` both reach the suggester. **[e2e]**
- It opens on every date the vault has a note for, newest first. **[e2e]**
- On a phone it opens with the keyboard down; a tap on the query raises it. **[e2e]** for focus; check the
  keyboard itself by hand on iOS.
- Typing narrows it, in the vault's own format and in `YYYY-MM-DD`. **[e2e]**
- A date far back loads the batches between and puts that note at the top of the pane. **[e2e]**
- A date with no note is offered as one entry saying so; choosing it lands on the nearest older. **[e2e]**
- Nothing that old raises a notice and moves nothing. **[e2e]**
- The calendar button opens the platform's date wheel, and what is picked fills the query. **[e2e]**
  Drive the wheel itself by hand on iOS and Android: the e2e mobile project is desktop Chromium, which
  opens a picker iOS never would. e2e checks only that a tap on the icon lands on the date input.
- Set the daily-notes format to `DD-MM-YYYY`, then to `MMMM D, YYYY`: the list follows it.

### Search

- The vault's search hotkey opens the bar in the stream; other hotkeys still work there. **[e2e]**
- Rebind "Search current file" in Settings → Hotkeys: the new binding opens the bar at once, the old does not.
- The count is of matching notes, not matches. **[e2e]**
- Typing marks the first match on screen and scrolls nowhere. **[e2e]**
- Enter steps through a note's highlights, then to the next note, loading past the batch if needed. **[e2e]**
- Enter onto a match below a Base, cards on a phone: the match, not the Base, is on screen once it fills in. **[e2e]**
- Enter onto a match under a collapsed heading expands it; reload the view and it is collapsed again. **[e2e]**
- A match only in hidden syntax (`mood:`) reads `1 / N · hidden`. **[e2e]**
- Escape clears every highlight. **[e2e]**
- Edit a note while a search is open: the count follows.
- On a phone, the bar sits under the floating header with no gap above the notes.

### Collapsible content

- A header chevron collapses its content; the chevron rotates. **[e2e]**
- Expanding a header leaves already-collapsed nested sections collapsed.
- A link click or text selection inside a header does not collapse it.
- A parent bullet's chevron collapses its sub-bullets.
- Two headings with the same text collapse independently.
- Rename a collapsed heading: it returns expanded. A day later, on the note's next render, its old key is gone
  from localStorage (DevTools → Application).
- A task's checkbox sits on its label's line and ignores clicks: the file decides its state. **[e2e]**

### Keyboard and screen reader

- Tab reaches note titles and every chevron; Enter or Space toggles without scrolling the stream. **[e2e]**
- A screen reader announces each chevron as a button, with its expanded state.

### Off-screen notes

- Scroll far down a large vault: notes well above lose their content but not
  their space — nothing below them shifts. **[e2e]**
- Scroll back up: they come back, collapse state included. **[e2e]**
- Renderer memory settles while scrolling to the end of a multi-year vault
  rather than climbing with every batch. **[e2e]** — `pnpm run test:memory`
  seeds three years and reports what is rendered, the heap and the live DOM.

### Live updates

- New daily note appears at the right position immediately. **[e2e]**
- The first note in an empty vault replaces the empty state without reopening. **[e2e]**
- Deleting the last daily note brings the empty state back. **[e2e]**
- Editing a visible note updates the stream.
- Editing frontmatter updates properties, and none leaks into the body.
- Renaming updates header and sort order, and keeps collapsed sections collapsed.
- Deleting removes it.
- A dated `.png` or an out-of-folder dated note: neither appears. **[e2e]**
- A dated note in a subfolder the format does not name: absent at startup and on create.
- Split the stream pane: a note created or deleted updates both.
- Point the daily-note folder at a missing folder: the empty state; point it back and the notes return.
- Changing the daily-note folder or date format in Obsidian's settings reloads the stream, without
  reopening the view. **[e2e]**

### Empty notes

Set a daily-notes template, and make a past note from it without writing in it.

- The note is absent; today's note, just as empty, shows. **[e2e]**
- Writing a line in it, or adding a property, brings it in at its date; emptying it again hides it. **[e2e]**
- Turning off "Hide empty notes" shows it without reopening the stream. **[e2e]**
- Link to it from another note and reopen the stream: it shows, with the link under it. **[e2e]** With linked
  mentions turned off, it is hidden again.
- With every daily note empty, the empty state says they are hidden.
- Point the template setting at another file: the stream reloads by the new template.

### Properties

- **Show note properties ON** (the default): a "Properties" header appears for notes with frontmatter, icons
  beside names.
- Clicking the header toggles collapse; the chevron rotates, and no focus ring stays behind. **[e2e]**
- "Properties" starts where the note's own headings do, chevron and all. **[e2e]**
- Collapsed leaves the heading alone, with no empty box beneath it and no jump in its position. **[e2e]**
- The panel matches the one Obsidian draws for the same note: text size, row height, icons. **[e2e]**
- Each icon follows the key's type, as Obsidian's panel does: `aliases` an arrow, text lines, tags a tag. **[e2e]**
- List properties are pills: tags in the tag colors, one per tag. A tag Obsidian's panel calls invalid —
  `tags: a, b` included — is struck through the same way, and searches nothing. A legacy `tag:` key is plain
  text, as Obsidian draws it. **[e2e]**
- Clicking a tag — inline in a note or as a pill — opens search on `tag:#name`. **[e2e]**
- Cmd/Ctrl-clicking a tag opens that search in a new tab instead of the sidebar. **[e2e]**
- **2026-02-01**: `tags: [test, image, link]`, `aliases: Feb 1st Test`, `mood: productive`.
- **2026-01-15**: `tags: [backlink, test]`, `type: daily`, `location: Home Office`.
- **Collapse properties by default ON**: panels start hidden, and a note's own choice then sticks across edits
  and reopens. **[e2e]**
- Frontmatter is not duplicated in the body.

### Linked mentions

- A note something links to ends with "Linked mentions" and a count; a note nothing links to ends with
  nothing. **[e2e]**
- One group per linking note, sorted by path. A link in a list shows its own item, not the whole list; a
  link in a property shows as `key: value`. **[e2e]**
- A group's title opens its note; a link in an excerpt resolves from the note it was written in. **[e2e]**
- A note that starts linking here, from another tab, joins the footer without a reload. **[e2e]**
- Collapsed, it stays collapsed across reopens. **[e2e]**
- Scrolled back to, a note never draws shorter while its mentions load. **[e2e]**
- On a phone, a quoted table stacks or clips; nothing in the footer scrolls. **[e2e]**
- Better Search Views leaves the footer unchanged: it is the stream's own, not Obsidian's backlinks pane
  (docs/decisions.md, 2026-09-28).

### Mobile

Run before a release: `isDesktopOnly: false` is a promise no static check keeps.

Emulate first. `pnpm run demo` gives `is-mobile` and `is-phone`, `--ipad` the tablet layout without
`is-phone`, `--landscape` either on its side, and `--desktop` neither. Re-run it to switch: each flag sizes
the window to match.
The mobile CSS catches layout and touch-target problems in seconds, but Electron's Chromium cannot reproduce a
WKWebView bug.

Then a real device:

| Platform | Route |
| --- | --- |
| iOS | Vault in iCloud Drive: copy the three built files on the Mac into `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/<vault>/.obsidian/plugins/daily-notes-stream/`. The Files app hides dot-folders. |
| iOS, no cable | BRAT against a published pre-release — also exercises the real release artifacts. |
| Either | Obsidian Sync with "Installed plugins" enabled. |
| Android | Any file manager, into `<vault>/.obsidian/plugins/daily-notes-stream/`. |

Checks:

- Nothing scrolls sideways: code and URLs wrap, wide tables stack, wide Bases draw as cards, wide equations
  shrink to fit. **[e2e]** Each case is in **2026-08-30**.
- Rotation reflows without clipping. With a Base on screen, a wide one turns to cards or back to a table; a
  wide equation grows or shrinks with the note.
- Turn the phone both ways with a title just below the screen's top, then with the top on a Base's last card
  and a heading below: what was at the top stays there, and no note is skipped. **[e2e]** with anchoring off,
  but Chromium redraws a Base in another order: only the device proves it.
- Scroll through a Base table with summaries: its header and summary row move with it, never floating over
  the page. **[e2e]**
- Scroll far, pause, flick both ways past Bases and tables: each flick glides out.
- A Base on screen gains a row from another pane: the text below never jumps and returns.
- Jump to an old date, then flick up: the text under your finger does not jump as the notes above render, and
  the glide is not cut short.
- A Base filling just above the screen's top leaves the text below still. **[e2e]** with anchoring off.
- Jump to an old date, then tap "Daily notes stream" in the header: it glides to the newest note and stays
  at the very top. Tapping the search or jump action does not scroll. **[e2e]**
- Tap a note's title, then Back: the stream comes back at the same place and does not move after. Try it with
  a Base at the top of the screen, and near the end of the 10th or 20th note (a batch's last). **[e2e]** for
  Chromium's timing; iOS hands the place over a frame later, so only the phone shows its failures.
- Search a word: every match on screen is highlighted, the current one in the selection color. A long-press
  selects text in a note.
- Chevrons on headers, list items and the properties row are tappable without zooming, and a tap on heading
  *text* still selects.
- A hard flick to the bottom loads the next batch without duplicates or a stall; repeated flicks keep loading.
- Backgrounding and returning keeps position and keeps scrolling.
- Editing a visible note elsewhere re-renders it in place.
- Long-press on a date header opens the file menu; "Open to the right" does something sensible on a phone.
- No console errors (iOS: Safari → Develop; Android: `chrome://inspect`).

iOS is the one that matters: Android's WebView is Chromium, so desktop plus emulation covers that engine.

## Debugging

Developer Console (`Cmd+Opt+I`), `DailyNotesStream:` prefixed logs. "No daily notes found" means the core daily
notes plugin is unconfigured or nothing matches.

An e2e failure is in `test-results/runs/<start time>.json`, one per run and kept. Traces for the latest run are
in `test-results/artifacts/`; the next run wipes them.
