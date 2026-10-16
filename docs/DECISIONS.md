# Decisions

Smaller design decisions. Anything whose reversal means migrating data or
rewriting across layers belongs in [`adr/`](adr/) instead.

Entries are numbered in order and never renumbered; cite one by its bare ID
(`D-023`). A replaced decision is marked superseded by its replacement, not
rewritten.

## D-001 — Editing is an action on the note, not an editor in the stream (2026-09-15)

**Decision:** the stream stays read-only. Editing is a per-note action — open
the file in a split, or append to today's note.

**Why:** live updates, collapsing and the e2e suite all follow from rendering
the Markdown ourselves.

**Rejected:** inline editors per note, as
[Daily Notes Editor](https://github.com/Quorafind/Obsidian-Daily-Notes-Editor)
does — four prototype patches, and why its view cannot react to vault events.

**Rejected:** no edit affordance at all — a spotted typo has nowhere to go.

## D-002 — The stream reloads on the vault's "raw" config event (2026-09-15)

**Decision:** watch the undeclared `vault.on("raw")` event, filtered to
`vault.configDir`, and rebuild the cache when Obsidian's daily-note format or
folder actually changed. Isolated in `src/obsidian-internals.ts`.

**Why:** the format decides what counts as a daily note; nothing re-read it
after `onOpen()`. No public event announces a core-plugin settings change, and
the config file is the only signal that arrives before the next vault event.

**Rejected:** polling `getDailyNoteSettings()` on a timer — a wake-up every few
seconds forever, to catch a change made once a year.

**Rejected:** re-checking on `active-leaf-change` or on the next vault event —
free, but the stream stays wrong until the user happens to do something.

## D-003 — A placeholder's height is a CSS custom property (2026-09-20)

**Decision:** `NoteWindowManager` sets `--daily-note-placeholder-height` on an
unloaded block; `styles.css` decides what to do with it. The compliance rule
against styling from JavaScript now allows `style.setProperty("--…")` and
nothing else.

**Why:** the height is whatever the note measured before it was unloaded, so no
class can carry it, and the rule is worth keeping for everything else.

**Rejected:** assigning `style.height` directly — the same inline style, minus
the one place a reader can see which declaration uses it.

**Rejected:** a fixed placeholder height for every note — the scrollbar jumps by
the difference the moment a note renders.

## D-004 — Task checkboxes are inert (2026-09-21)

**Decision:** `pointer-events: none` on a rendered task's checkbox. It shows the
file's state and refuses the click.

**Why:** `MarkdownRenderer.render` emits a real `<input>`, which the browser
toggles; only Obsidian's own reading view writes that back. Here the tick lives
in the DOM alone, and unloading or a re-render silently reverts it.

**Rejected:** writing the toggle back to the file — the stream is read-only, and
mapping a rendered element to its source line is a feature of its own.

## D-005 — The stream repeats the checkbox nudge reading view applies (2026-09-21)

**Decision:** `top: 0.2em` on a task checkbox in `styles.css`, the value
`.markdown-preview-view` sets.

**Why:** the stream renders under `markdown-rendered` alone, so the preview
pane's own layer never lands and the box sits 3px above its label.

**Rejected:** adding `markdown-preview-view` to the content element — it brings
the whole pane stylesheet, padding and line width included.

## D-006 — A list chevron spans the line box, offset by the list padding (2026-09-21)

**Decision:** the indicator takes
`height: calc(var(--line-height-normal) * 1em)` at `top: var(--list-spacing)`,
as reading view does, rather than a 16px box centered by hand.

**Why:** a line box and its text share a center, so centering on the line box
centers on the words; `top` clears the list item's padding, which absolute
positioning measures from the inside of.

**Rejected:** halving the difference between line height and icon size — it
ignores the padding and lands 1.5px high.

## D-007 — The properties panel is Obsidian's, headed like a note heading (2026-09-21)

**Decision:** the panel is Obsidian's own stylesheet, not a copy of it: the
stream renders its classes and adds only what Obsidian cannot give a read-only
panel — the key and value typography its `input` selectors miss, collapsing, the
heading's place among the note's headings, and the read-only affordances. The
heading is a sibling above `.metadata-content`, laid out as a content heading —
the same negative margin, padding and chevron offset — and collapsing hides the
box outright. Obsidian's own rules do the rest: the chevron hidden until the row
is hovered, and the row toggling on click.

**Why:** one column of headings down the note, one of chevrons beside it.
Obsidian's offsets assume the margin its editor pane keeps clear and its own
icon size, so kept they set the panel a step in from the note and its chevron a
hair from the word.

**Rejected:** restating Obsidian's sizing (`font-size`, row padding, key width,
icon size) — the panel drifted to 13px text in rows built for a 28px field.

**Rejected:** a gutter of its own (`margin-left: var(--size-4-6)`) — it lands
Obsidian's geometry inside the note, indented past every heading around it.

**Rejected:** the heading inside the box — it reads as one more property row,
and Obsidian puts it above.

**Rejected:** chevron-only, as headings and list items are — it needs the
chevron forced visible, a control Obsidian deliberately hides.

**Rejected:** `tabindex="0"` on the heading, for keyboard reach — Obsidian rings
it on `:focus`, so a click left that ring around the row. The chevron takes
focus instead, and reveals itself on `:focus-visible`.

## D-008 — The dev loop reloads the plugin over the debugging port (2026-09-21)

**Decision:** `pnpm run dev:vault` links the build into the test vault, watches
those files, and reloads the plugin by disabling and re-enabling it over the
`--remote-debugging-port` `pnpm run open` already exposes.

**Why:** `seed` installs copies, so a rebuild never reached the vault, and
Obsidian reads a plugin's files once, at load. Links and a reload close the two
halves of that.

**Rejected:** the Hot Reload community plugin — the same thing from inside, at
the price of a second plugin in the vault.

**Rejected:** Cmd+R — a phone-emulated window has no such hotkey, and reloading
the window throws away the scroll position the change is usually about.

## D-009 — Emulating a device waits for the document the reload brings back (2026-09-21)

**Decision:** `emulateDevice` stamps the window before calling `emulateMobile`
and waits for a document that no longer carries the stamp.

**Why:** the reload is asynchronous and the old document answers `layoutReady`
until it lands, so waiting on that alone returned while the window was still
mid-switch — it flipped seconds after the script reported the layout it was
leaving.

**Rejected:** waiting on the reload as a navigation — same guarantee, but it
reads as page plumbing rather than as the thing being waited for.

**Rejected:** a second command that switched the open window in place instead of
relaunching — 1.6s against 3s, for one more script to learn and maintain.

## D-010 — The e2e window is hidden from inside Obsidian (2026-09-21)

**Decision:** the harness installs `show` and `focus` listeners on the window
through Electron's remote bridge, hiding the app from its own renderer. Hidden
no longer stays hidden: D-124 shows the window again, transparent.

**Why:** Obsidian activates itself at first paint, when the vault opens, and on
the `emulateMobile` reload. Hidden and frontmost are separate states, so a run
stole the keyboard for about a second at a time on a one-screen machine.

**Rejected:** the AppleScript watcher this replaces — resolving the process by
unix id blocked 1.3s, long past the first grab; watching the frontmost process
instead answered in 800ms against the guard's 100ms.

**Rejected:** patching a copy of the app bundle with `LSUIElement`, the only way
to catch the first activation — Obsidian opens its debugging port 30ms _after_
it fronts itself, so nothing outside the app can be armed in time. Not worth
copying and re-signing 1GB to save one 150ms blip per launch.

## D-011 — List properties render as Obsidian's pills (2026-09-21)

**Decision:** `tags` and other list properties render the `multi-select-pill`
markup, with `data-property-type="tags"` on a tag value so its pills take the
tag colors. A tag pill whose text is no tag name — a scalar `tags: a, b`
included — is `is-invalid`, struck through, and searches nothing, as in
Obsidian's own panel. Only `tags` is typed as tags: Obsidian 1.9.10 dropped the
singular `tag`, and draws it as text.

**Why:** the panel restates no styling of its own
([ADR 0002](adr/0002-real-obsidian-e2e.md) measures it against Obsidian's);
matching the markup was enough to get pills.

One rule is the stream's own: Obsidian pads the near side of a pill's word and
leaves the far side to the remove button's margin, so without that button the
last letter sat on the border.

**Rejected:** styling the rest of a pill in `styles.css` — every other rule is
already in Obsidian's stylesheet, and restating one is a chance to drift from
it. Splitting `tags: a, b` into two pills — Obsidian never splits a scalar, so
the stream would show tags the vault's own panel calls invalid.

## D-012 — More air around the note separator (2026-09-21)

**Decision:** 4rem above and below the rule between notes (`--size-4-16`), up
from 3rem.

**Why:** at 3rem the stream read as a stack rather than a sequence of days. 4rem
is the widest spacing that still fits two notes on a phone screen.

**Rejected:** whitespace alone — the rule is what carries a note ending
mid-thought.

**Rejected:** 4rem/6rem, better on the desktop — on a phone the 6rem pushes the
next note under the floating navbar.

**Rejected:** a sticky date header — sticky offsets resolve against the padded
scrollport, so it pins low on the desktop and mid-air on mobile, needing an
offset read off Obsidian's own chrome.

## D-013 — A tag click opens the search pane (2026-09-21)

**Decision:** clicking a tag in the stream — inline in the note or as a pill in
the properties panel — opens Obsidian's search on `tag:#name`, through the core
global-search plugin reached by id in `src/obsidian-internals.ts`.

**Why:** a tag is a link everywhere else in Obsidian; in the stream it was
inert. No public API exposes the search pane, so the core plugin is reached by
id and a user who disabled it gets nothing rather than an error.

**Rejected:** opening the tag pane, or a filtered stream of our own — neither is
what a tag click does in the rest of the app.

A mod-click opens it in a pane of its own instead, through `Keymap.isModEvent` —
tab, split or window, as everywhere else. The core plugin only drives the
sidebar pane, so a new leaf is given the `search` view and its query set
directly.

## D-014 — Properties are shown by default (2026-09-21)

**Decision:** `showProperties` defaults to on; the setting stays.

**Why:** the panel matches Obsidian's own reading view, and a stream of notes
whose frontmatter is invisible reads as though the notes have none.

**Rejected:** dropping the setting — a vault whose dailies carry bookkeeping
frontmatter wants it off.

## D-015 — A jump lands on the nearest older note (2026-09-22)

**Decision:** `jumpToDate` loads batches until the target is in the stream, then
scrolls to it. No note that day lands on the newest one before it; nothing that
old raises a notice and moves nothing.

**Why:** a continuous feed has to leave the reader somewhere real, and the
common case is a half-remembered date. Batches are cheap under
[ADR 0006](adr/0006-unload-off-screen-notes.md): what is passed over stays
placeholders. The suggester above makes the fallback visible before it happens;
this stays the behavior behind it.

**Rejected:** an error rather than the older note.

**Rejected:** rendering only the target — breaks the `state.notes` / `_sorted`
pagination invariant.

## D-016 — The jump re-applies its scroll until the stream stops rendering (2026-09-22)

**Decision:** up to eight passes, ending when the target is at the top of the
pane _and_ `NoteWindowManager.layoutChanges` held still across the pass — or
when a scroll moves nothing and nothing changed since the last pass. Search
centers a match the same way (`scrollIntoPlace`).

**Why:** a note above it outgrows its placeholder estimate and pushes it down.
One `scrollIntoView` left the target 1600–1850px short in e2e, desktop and
mobile. The jump-sized answer to the `scrollTop`-correction item in
[`TODO.md`](TODO.md), which stays open for scrolling in general.

**Rejected:** stopping once the target stops moving — it is at the top the
instant it is scrolled to, and the renders that displace it land after. Waiting
a frame on a stuck scroll — the hidden e2e phone window draws none when nothing
changed, and the search hung on it.

## D-017 — Property icons come from Obsidian's type manager (2026-09-22)

**Decision:** `getPropertyIcon` takes the icon off the widget
`metadataTypeManager.getTypeInfo(key, value)` resolves; the key-name map is the
fallback when the internal goes.

**Why:** Obsidian draws the icon for the property's _type_, assigned or
inferred, so a name guess disagreed with the note's own panel everywhere but
tags — `aliases` is an arrow, text is `lucide-text`, not `file-text`.

**Rejected:** a type→icon table of our own — Obsidian's registry ships new
types.

## D-018 — The obsidian mock hands tests the real moment (2026-09-22)

**Decision:** `tests/mocks/obsidian.ts` re-exports moment, a devDependency, in
place of the hand-written stand-in. `depend/ban-dependencies` allows it for
`package.json` only.

**Why:** the stand-in ignored the format argument and understood ISO alone, so
every test of a vault dated `DD-MM-YYYY` passed while the plugin failed. The
bundle is unaffected: `obsidian` is external, and the app supplies moment.

**Rejected:** teaching the stand-in each format — reimplementing moment to test
code that calls moment.

## D-019 — The jump prompt suggests the dates the vault has (2026-09-22)

**Decision:** a `SuggestModal` over every note's date, written and matched in
the vault's own daily-note format, with `YYYY-MM-DD` as a second haystack. A
query that parses as a date no note carries is offered as one entry that says it
will land on the nearest older note. A calendar icon opens the platform's date
wheel: the date input itself lies unseen over it, since iOS opens its wheel only
for a tap on the input and does nothing on `showPicker()`; a click also calls
`showPicker()`, which desktop needs.

**Why:** a date field accepts days the vault has nothing for, so the nearest-
older fallback happened silently and the reader could not tell a jump from a
miss. Suggesting the real dates makes the common case a pick, and leaves the
fallback something chosen. The format is read per vault because filenames are: a
`DD-MM-YYYY` reader should not be offered ISO.

**Rejected:** a date field with the fallback left silent — what this replaces.

**Rejected:** `prepareFuzzySearch` — fuzzy over digits matches far too loosely.

**Rejected:** keeping the date field on mobile behind `Platform.isMobile` — two
paths to hold in step before the mobile pass has said either is needed.

## D-020 — The stream does not create notes (2026-09-22)

**Decision:** no "create today's note" action in the view.

**Why:** core Daily Notes already creates it from its ribbon icon and command; a
read-only stream missing today is showing the vault as it is.

**Rejected:** a create button above the stream when today is missing — a
duplicate of core, plus state to keep in sync across create, delete and
midnight.

## D-021 — e2e runs fully parallel on four workers (2026-09-22)

**Decision:** `fullyParallel` with `workers: 4`; an auto fixture resets plugin
settings, collapse state and the pointer before every test.

**Why:** 3.7 min → 1.2 min. Each worker already owns its instance and vault;
only state left by earlier tests in the same instance broke under reordering.

**Rejected:** whole-file parallelism — `stream.spec.ts` holds most tests, so it
only reached 2.3 min. More workers — the instances starve for CPU and timing
tests slip.

## D-022 — Search the stream, counted per note (2026-09-23)

**Decision:** the vault's "Search current file" hotkey, read from
`hotkeyManager` on open and on each config write (a rebind saves
`hotkeys.json`), opens Obsidian's own find bar above the pane; a header action
does too, for phones. It matches each note's title and source, frontmatter
included, counts notes ("3 / 12"), and steps through the visible highlights (CSS
highlight API) note to note. Typing marks the topmost match on screen and never
scrolls.

**Why:** off-screen notes hold no DOM (ADR 0006), so find-in-page sees a few
days. Source and rendered text differ, so only a per-note count holds. Obsidian
searches hidden frontmatter too (checked 2026-09-23).

**Rejected:**

- Per-match count — drifts from what is highlighted.
- `<mark>` wrappers — change the DOM collapsing walks.
- Hardcoded Mod+F, or a command of our own — ignores a rebind; a second hotkey.
- Jumping to the first match as you type — a half-typed word lands years away.
- A longer typing pause — 1095 notes search in 1–3 ms.
- Skipping frontmatter when properties are off — disagrees with Obsidian.
- A tag/header filter — core search does it.
- Matching the "Properties" label, as reading view does — it is in no note's
  source, and "prop" would hit every note with frontmatter.
- Highlighting what a Base, an embed or linked mentions show — another file's
  text, or Obsidian's, counted in no note: "No results" over a highlight.

## D-023 — Kebab-case files, grouped into folders (2026-09-23)

**Decision:** every `.ts` file in `src/`, `tests/` and `e2e/` is kebab-case;
`src/` groups them into `ui/`, `stream/`, `render/` and `notes/`. Class names
are unchanged. `tests/repo/compliance.test.ts` enforces the case.

**Why:** Obsidian's plugin guidelines ask for folders once there is more than
one `.ts` file, and the official sample plugin and Minimal Settings name files
in kebab-case. A single case needs no judgment to follow, so a test can hold it.

**Rejected:** PascalCase for files exporting a class — nothing can check it, and
it had already drifted. A lint plugin for the rule — the compliance test already
reads every file.

## D-024 — Search opens folds, unsaved; labels what it cannot show (2026-09-23)

**Decision:** stepping onto a match inside a collapsed heading, list item or
properties panel expands it without saving; a re-render folds it again. Typing
never unfolds. A note that matches with nothing drawn (hidden frontmatter, raw
syntax) counts as `3 / 12 · hidden`.

**Why:** Obsidian's reading view does the same; landing on a note and marking
nothing reads as a bug.

**Rejected:**

- Skipping folded matches — the note is counted but shows nothing.
- Saving the expansion — a search would rewrite the reader's layout.

## D-025 — Tests typecheck against the mocks, typed by the real API (2026-09-23)

**Decision:** `tests/tsconfig.json` maps `obsidian` to the mock, as vitest's
alias does; the mock borrows its signatures from the real declarations
(`obsidian/obsidian`), so `src/` typechecks against it too. Tests reach privates
by `view["stream"]`, and stand-ins go through `fake<T>` or `asApp`, never `any`.
ESLint runs on `tests/` without the rules that guard the shipped plugin.

**Why:** typed against the mock, a test that calls something the mock lacks
fails before it runs; the real types keep the mock from drifting off the API.

**Rejected:**

- Tests against the real types — the mock-only API (`new TFile(path)`,
  `Setting.created`) would need a cast at every use.
- Turning off `no-explicit-any` for tests — it hid ~600 unchecked accesses.

## D-026 — The note cache is built from the vault, not `getAllDailyNotes()` (2026-09-23)

**Decision:** the cache keeps the vault's markdown files whose path round-trips
through the format, as a live create does.

**Why:** `getAllDailyNotes()` keys by date whatever the extension, so
`2024-01-01.png` could evict that day's note, and it admits subfolders a create
rejects. It was also all `initialize()` could throw from.

**Rejected:** filtering its result — an evicted note is already gone.

## D-027 — Stale collapse state is pruned a day after the note's last write (2026-09-23)

**Decision:** a successful render forgets saved sections the note no longer has,
once its `mtime` is 24 hours old. The properties key is kept.

**Why:** daily notes are rarely renamed or deleted, so that cleanup never ran. A
day spans retyping a heading; `mtime` needs no timer.

**Rejected:**

- Every render — `## Mee` on the way to `## Meeting` drops its state.
- Expiry by last view — old notes keep valid state for years.
- A size cap — bounds size, not staleness.
- Frontmatter — every toggle rewrites the file.

## D-028 — Titles and links take Obsidian's link gestures (2026-09-23)

**Decision:** amends D-001. Titles and links open as Obsidian's links do:
modifier clicks, file menu, Page preview on hover. One departure: a plain click
focuses a tab already showing the note.

**Why:** Obsidian's reading view replaces its own tab; the stream can't, so the
API alone opens a new tab per click.

**Rejected:**

- A new tab per click — tabs of one note pile up.
- A pencil button per note — the title does it.
- Append to today's note — needs the inline editor D-001 rejects.
- Rename and delete in the menu — not public API.

## D-029 — The stream is a navigable view (2026-09-23)

**Decision:** `navigation = true`. The stream's own clicks still open beside it;
Obsidian's openers (quick switcher, file explorer, the daily-note command), run
from the stream, replace it in its tab, as they do the graph.

**Why:** Obsidian takes a non-navigable view for a sidebar and keeps the last
note active behind it, so the status bar showed that note's word count and
backlinks. Navigable, the stream has no active file, and every per-note item
clears, other plugins' included.

**Rejected:**

- Overriding the leaf's `canNavigate` to keep the stream unreplaceable — patches
  an unsupported method.
- Hiding the core items with CSS while the stream has focus — core class names,
  and other plugins' items stay stale.

## D-030 — A plain click opens in the stream's tab (2026-09-23)

**Decision:** amends the two entries above. A plain click on a title or link
replaces the stream in its tab, as a link in the reading view or the graph does;
Back returns to the note the stream was scrolled to. Mod-click keeps the stream
and opens a new tab.

**Why:** the stream is a navigable view, and Obsidian's other navigable views
navigate on click. Keeping it open took a flag flipped around an Obsidian call
that happened to pick its tab synchronously, and a tab-reuse rule the rest of
the app lacks.

**Rejected:**

- Opening beside the stream — the departure above, and its reliance on
  Obsidian's internals.
- Reusing a tab already showing the note — not what Obsidian's links do.

## D-031 — Views share parsed dates, not the note list (2026-09-23)

**Decision:** the plugin holds one `ParsedDates`, path → date, tagged with the
daily-notes format. Each view's service builds its own list from it, parsing
only paths it has not seen.

**Why:** a date depends only on the path and the format, so an entry cannot go
stale and nothing needs to watch the vault. A later open at 6× CPU builds in 4
ms instead of 52 (10-year vault, 5,000 other notes).

**Rejected:**

- One plugin-wide list — each view's queue must own its list's changes, or
  pagination breaks (.claude/rules/invariants.md).
- A plugin-wide list kept current by vault listeners, copied per view — work
  while no stream is open, and state nothing displays.

## D-032 — Unloading waits for the scroll to stop (2026-09-23)

Superseded in part by [ADR 0023](adr/0023-hide-far-content-as-it-leaves.md):
hiding no longer waits; emptying still does.

**Decision:** a rendered block that leaves the unload margin waits until the
scroll has been still for `SCROLL_IDLE_MS` (300 ms); one that comes back first
stays rendered.

**Why:** on an iPhone, a third of traced flicks stalled mid-glide while unloads
ran; none did with unloading off. A glide scrolls every frame, so a pause means
it ended.

**Rejected:**

- A wider unload margin — a long scroll crosses any margin; it only delays the
  stall.
- Exact-height placeholders — unproven as the cause.
- Scrolling an element inside `.view-content` — not needed once unloads wait
  (phone-tested).

## D-033 — A Base too wide for its note draws as cards, on mobile (2026-09-24)

**Decision:** on mobile a Base follows the Markdown table rule: cards when its
table is wider than the note, re-checked when the width changes. Desktop draws
Bases as Obsidian does (ADR 0008). Each `base` block, and each `![[X.base]]`
alone on its line, renders into its own placeholder, so one Base redraws alone.
Cards come straight away when the headers alone overrun the note (Bases' header
font and padding, measured once); otherwise the table draws and is measured on
its first layout. A measured answer is kept per note and layout.

Cards are a view-only copy: Bases saves a block only through an editor, and a
save would write `type: cards` into the file. A copy of an embedded Base redraws
when its file changes. A table-drawn embed stays the real embed, and its toolbar
edits save to the `.base` file, as in reading view.

**Why:** consistency with Markdown tables. Measured cost of a redraw, 7 columns
over a 3–10 year vault: table 100 ms (205–235 at 4× CPU), cards 62–64 ms
(84–104); vault size adds under 30 ms. The estimate skips the table draw in the
common case: many columns on a narrow note.

**Rejected:**

- Cards on any phone (`Platform.isPhone`) — cards even where the table fits.
- Cards on desktop too — desktop has no stall, and a scroll bar keeps the table.
- Taller `rowHeight` rows — the table stays cramped.
- Restyling the table as cards in CSS — Bases positions rows absolutely.
- Re-rendering the whole note on a flip — redraws everything else in it too.
- Drawing every embed as a copy, so no edit saves — inline embeds and Bases in
  callouts would still save, and every copy would need redrawing on change.

## D-034 — The stream takes a note's margins from the theme (2026-09-24)

**Decision:** the pane is padded with `--file-margins`, and the stream is a
column capped at the line width inside it, as reading view lays out a note.

**Why:** the stream added 20px a side of its own on top of the theme's width, so
under Minimal (88% line width) a phone lost ~43pt a side against ~24pt in
reading view.

**Rejected:** full width on phones — wider than every other note.

## D-035 — A redrawn Base holds its last height until Bases refills it (2026-09-24)

Superseded in part by D-054: heights are no longer kept.

**Decision:** `NoteBases` keeps the height each Base last laid out at, per note,
layout and a digest of its source, and a redraw holds it as `min-height` until
the drawn view reaches it, or for 2s. A height is kept once nothing in its note
has resized for 300ms while unheld, never at unload or before a redraw: a
closing view is not laid out, and a Base left mid-fill keeps the height it had.
The heights, and which Bases were too wide, are kept across sessions in
`LayoutMemory` ([ADR 0010](adr/0010-layout-memory.md)): Back rebuilds the view,
which forgot them. They follow the notes' rule: the 4 layouts used most
recently, a rename carrying them along, a delete taking them. A cap of 500 Bases
kept an eighth of a vault whose template embeds one in every note, and whole
`.base` files in the keys ran to kilobytes each.

**Why:** Bases fills a view after it is drawn. A note coming back into view, or
a table redrawn as cards, dropped by the Bases' height for a few frames and grew
back; iOS has no scroll anchoring, so the text jumped and returned.

**Rejected:**

- Holding the whole block until it settles — no signal says when a note is done,
  and only Bases was measured dipping.
- Each Base waiting only on its own resizes — tried: on a phone, notes flickered
  as they scrolled back in.

## D-036 — The stream anchors its own scroll where the platform does not (2026-09-24)

Superseded in part by D-053: what is offset; and by D-090: a bounce at the top
hands over as it ends.

**Decision:** in the iOS app, and wherever
`CSS.supports("overflow-anchor", "auto")` is false, `ScrollAnchor` turns native
anchoring off, watches every block's height and offsets the change of any block
wholly above the pane: first as a `transform` on the stream, then, once the
scroll is still, as `scrollTop` in the same frame.

**Why:** a note above the reader rendering past its placeholder estimate pushed
the text down; e2e mobile, anchoring off, measured 2673px. Chromium absorbs it.
iOS WebKit answers `CSS.supports` yes and anchors nothing: a phone's Web
Inspector trace showed the anchor never switched on. Tried on a phone, the shift
held the place and plain `scrollTop` writes mid-glide still jumped.

**Rejected:** writing `scrollTop` mid-glide — jumped on a phone. Correcting only
once the scroll stops — the jump shows first. Blocks reaching into the pane — a
chevron tapped there grows the note below the reader's place, and moving the
scroll would carry it off. Anchoring everywhere — doubles Chromium's own
correction.

## D-037 — A tap on the header title glides to the top, on mobile (2026-09-24)

**Decision:** on mobile, a tap on the view header's title smooth-scrolls the
stream to its top. `ScrollAnchor` is told first, and a glide that arrives at the
top drops what it owes instead of handing it to the scroll.

**Why:** iOS apps scroll to the top on a tap of the title bar. Notes above the
reader render on the way up; handed over, their growth stopped the glide
23,386px short in e2e.

**Rejected:**

- Instant jump — iOS animates it.
- Desktop too — the title there is a label, and nothing hints it is tappable.

## D-038 — Text beside a block is wrapped in a span (2026-09-25)

**Decision:** after a note renders, each bare text node sharing its parent with
a block — a list item's words above its sub-list — is wrapped in
`span.daily-note-text-run`, before sections are made collapsible.

**Why:** WebKit paints no CSS highlight on such text, and no layout of the
parent changes that; iOS search marked nothing on list items with children. The
wrap happens once per render, so collapsing, keys (`textContent`) and search see
one DOM from the start — unlike the per-search `<mark>` wrappers rejected above.

**Rejected:**

- A CSS layout for the item — flow-root, flex, grid, block: WebKit paints none.
- Wrapping on WebKit only — two DOM shapes, and desktop e2e would test the
  other.
- Wrapping inline elements too — WebKit paints inside them already.

## D-039 — Release tags are annotated from 1.0.0 (2026-09-25)

**Decision:** from `1.0.0` on, each release is tagged
`git tag -a <version> -m "<version>"`.

**Why:** annotated tags are the common convention for releases: they record who
tagged and when, and `git describe` and `git push --follow-tags` act on them
alone.

**Rejected:**

- Signed tags (`-s`) — no signing key is set up.

## D-040 — The stream opens in the current tab (2026-09-25)

**Decision:** the ribbon icon and `Open stream` open the stream in the current
tab, even when another tab holds one; a mod-click on the icon opens the pane it
asks for. Run from a stream, the command keeps that stream as it was.

**Why:** the graph and canvas do exactly this, measured in the app, so the
stream opens like Obsidian's other views.

**Rejected:**

- Revealing an open stream instead — the graph opens a second one, and each view
  owns its service (.claude/rules/invariants.md), so a second is safe.
- A new tab every time — tabs pile up; the previous behavior.

## D-041 — The stream's icon is a stack of cards (2026-09-25)

**Decision:** the ribbon icon and the view's tab draw `gallery-vertical-end`.

**Why:** `calendar-days` sat in the ribbon beside core Daily notes' `calendar`
and read as the same action. A stack of cards reads as a feed, and nothing in
the core ribbon resembles it.

**Rejected:**

- `rows-3` — close to Bases' `layout-list`.
- `scroll-text`, `notebook-text`, `book-open-text` — read as one document.

## D-042 — Tests mirror the folders they test (2026-09-25)

**Decision:** `tests/` repeats `src/`'s folders; tests of `scripts/` sit in
`tests/scripts/`, checks on root files (README, manifest, styles, release
workflow) in `tests/repo/`. Mocks, setup and the shared fixture stay at the top.

**Why:** 41 files in one folder, beside a `src/` grouped by job.

**Rejected:** tests beside their source — `src/` typechecks against the real API
and `tests/` against the mocks, through separate tsconfigs.

## D-043 — Scroll to top is offered only in the stream (2026-09-25)

**Decision:** the command is in the palette only while the most recent leaf
holds a stream, and scrolls that stream.

**Why:** a freshly opened stream is already at its top, so opening one first, as
Jump to date does, would do nothing useful.

**Rejected:**

- `getActiveViewOfType` — the tests' mock `ItemView` cannot pass as a `View`,
  whose protected `onOpen` makes the type nominal.

## D-044 — A separate demo vault for screenshots (2026-09-25)

**Decision:** `seed:demo` writes `.dev/demo-vault/`, a realistic journal whose
notes are seeded by their date; `seed` stays the test vault.

**Why:** `seed`'s notes are shaped around edge cases the checklist names, and
photograph as scaffolding. Seeding by date lets a recording be retaken.

**Rejected:**

- Realistic content in `seed` — docs/TESTING.md depends on its shapes.
- Random content per run — every retake would differ.

## D-045 — The README recording is an animated PNG, built with ImageIO (2026-09-25)

Superseded by D-116: the recordings are animated WebPs.

**Decision:** the e2e harness screencasts the scene;
`scripts/frames-to-apng.swift` encodes the frames with macOS's ImageIO and
writes the APNG chunks itself, each frame only the rectangle that changed.

**Why:** an animated PNG keeps every color, so text stays crisp, and plays in
GitHub's image tags. ImageIO ships with macOS: nothing to install. Its own APNG
writer stores whole frames — typing a sentence cost 8 MB, changed rectangles
2.5.

**Rejected:**

- GIF — 256 colors rough up anti-aliased text.
- MP4 — GitHub plays only videos uploaded by hand, not ones in the repo.
- ffmpeg or gifski — an install for what the OS already does.

## D-046 — A note redraws on every save, typing or not (2026-09-25)

**Decision:** the stream redraws a note on each metadataCache `changed`, even
while someone is typing in it; it catches up save by save, about two seconds
behind the editor.

**Why:** the README promises live updates, and Obsidian's own panes update as
you type. The cost of the extra redraws is unmeasured.

**Rejected:**

- Holding the redraw until typing goes quiet (`editor-change` plus a 2.5 s
  timer) — a minute of steady typing would leave the stream stale for the
  minute. Revisit if redraws are seen to jolt the stream beside an editor.

## D-047 — A build for a phone names itself on load (2026-09-25)

**Decision:** `pnpm run build:device` bakes a two-word name into the bundle as
`BUILD_LABEL`, hashed from the commit and any uncommitted change
(`scripts/build-name.mjs`); the plugin shows it in a notice on load. Plain
`build`, which releases use, bakes an empty label and shows nothing.

**Why:** iCloud syncs the plugin to the phone late and silently, so a test could
run on the previous build.

**Rejected:**

- A setting or command showing the version — the manifest version is the same
  across every test build.
- The branch, commit and time — read on a phone, compared character by
  character.

## D-048 — Back returns to its place in one scroll (2026-09-25)

**Decision:** the place kept in Obsidian's history is the note reaching into the
pane and its offset. The rebuilt view's placeholders reserve what `LayoutMemory`
remembers ([ADR 0010](adr/0010-layout-memory.md)). Back scrolls once, before the
first frame. The iOS scroll anchor is then told the place is set, so growth the
scroll already holds, reported a frame late, is not added again. It loads past
the place until the pane can scroll there: a place near the end of what was
loaded otherwise stops short.

**Why:** Back rebuilds the view from scratch. At estimated heights, each render
pushed the place and each correction was drawn: the newest note flashed on
desktop, older ones on a phone.

**Rejected:**

- Hiding the stream until it settles — up to a second blank on a phone.
- Opening titles in a new tab so the stream survives — Back stops returning to
  it.
- Heights carried in the place — superseded by ADR 0010, which keeps them for
  every view and session.
- Note heights alone, without what Bases measured — a Base inside a note still
  draws empty and refills, whatever height its note reserved. (Superseded by
  D-054.)

## D-049 — A note's height is remembered once it settles (2026-09-25)

**Decision:** a rendered note's height goes into `LayoutMemory` once nothing in
it has resized for 300ms, as a Base's does. An unload reserves what the note
measures then, remembering it only if it had settled.

**Why:** a Base filling or an image loading measures short until done; saved,
that height is next session's placeholder, and the growth an owed scroll.

**Rejected:** saving on scroll stop, Back and refresh — each measured whatever
was on screen, mid-fill included.

## D-050 — The pane keeps a scroll bar's room while it cannot scroll (2026-09-25)

**Decision:** the stream's pane sets `scrollbar-gutter: stable`.

**Why:** heights are remembered by the column's width
([ADR 0010](adr/0010-layout-memory.md)). With classic scroll bars (macOS with a
mouse, Windows), a stream opening empty read a width 15px wider than the one its
notes were measured at, and reserved no remembered height.

**Rejected:** leaving the scroll bar out of the layout key — it narrows the
text, so heights measured with and without it differ.

## D-051 — The mobile e2e project is an iPhone Pro's screen (2026-09-26)

**Decision:** the phone viewport is 402 × 874, an iPhone Pro's screen in points.

**Why:** the README's phone screenshots should show a phone's layout. At 402 px,
Bases measures as it does on an iPhone 16 Pro: two cards per row, 187 px wide in
Obsidian's reading view (2026-10-05).

**Rejected:**

- The old 420 × 800 — no phone's screen.
- A Pro Max's 440 — rejected for fitting two cards, on the reading corrected
  below.

Corrected 2026-10-05: this said a phone shows one card per row. It shows two, in
Obsidian's reading view and in the stream.

## D-052 — A wide equation shrinks to fit on mobile (2026-09-26)

**Decision:** on mobile, a display equation wider than its note is zoomed down
to the note's width (`src/render/wide-equations.ts`).

**Why:** the page may not scroll sideways, and nothing in a note may scroll (ADR
0008). MathJax draws HTML, which CSS cannot scale to fit, so it is measured.

**Rejected:**

- `overflow: clip`, as code blocks do — cuts off the end of the equation.
- Inline math — it sits in a line of text; shrinking it there would change the
  line's text size mid-sentence.

Updated 2026-10-07: MathJax 4 (Obsidian 1.14) pads the container 2px each side,
so the equation fits inside the padding.

## D-053 — The scroll anchor is the element at the pane's top (2026-09-26)

**Decision:** where `ScrollAnchor` runs, it offsets however far the element at
the pane's top moved. It re-picks that element on each scroll and hand-over:
`elementsFromPoint`, walked up to its block; halving the blocks when nothing of
the stream is there.

- It stops at anything held — a held note's text is not yet where Back measured
  the place.
- It owes what moved before every re-pick — a note rendering between frames
  reaches the scroll event before its resize report.
- A replaced element falls back to its block.

**Why:** a Base filling above the pane, in a note reaching into it, pushed the
text down: only notes wholly above were offset. Nothing above the pane's top is
the reader's doing; a chevron tapped on screen changes only what is below.

**Rejected:**

- Holding a Base's growth — the same move, later, rows clipped.
- Walking down the note — every paragraph read each scroll frame.
- `IntersectionObserver` — a frame late.

## D-054 — Notes and Bases are held until they settle (2026-09-26)

**Decision:** each is held at `min-height` until nothing in it resizes for
300ms, and 2s at most:

- a rendered note at a height it measured before — remembered, or shown before a
  re-render; never a guess. A touch lets it go, so a collapse shows at once.
- a Base at what it showed, when redrawn or when it shrinks by itself (a live
  Bases refresh). It grows unheld.

Base heights are no longer stored: a Base coming back is held by its note.

**Why:** the settle wait is the signal holding whole notes lacked (D-035), and
it covers every late fill, so per-Base heights were a second cache.

**Rejected:**

- Holding at a guessed height — a short note shows a gap.
- A note-level hold alone — a live Bases refresh dips inside a note on screen.

## D-055 — A new width changes no placeholder (2026-09-26)

Superseded in part by ADR 0014: placeholders are re-reserved once the scroll is
still. The anchor still survives the margins' rebuild.

**Decision:** on a width change, an unloaded note keeps its placeholder until it
renders; only the height it is held at on rendering comes from the new width.
The scroll anchor survives the margins' rebuild.

**Why:** shrinking placeholders shortens the stream under the scroll. The
browser clamps the scroll at once, `ScrollAnchor` counts the clamp as the
reader's, and a phone turned mid-stream landed notes away. An anchor rebuilt
with the margins has no place to hold while the notes on screen reflow: the
place moved 120 px.

**Rejected:**

- Re-reserving every unloaded note — the clamp above.
- Only those above the pane — clamps once they shrink by more than lies below.

## D-056 — A Base redrawn under the pane's top keeps the reader's fraction (2026-09-27)

**Decision:** when the pane's top crosses a Base, `ScrollAnchor` holds it as far
through the Base as it was, not at the Base's top — through what the Base draws,
not the box held open for it. A scroll pulled back to the stream's end is a
clamp, not the reader's.

**Why:** a turned phone redraws cards as a table: the entry read is gone, and
held at its top the reader landed anywhere. Cards and rows keep one order. Below
a note jumped to, the stream shrank by more than lay below the pane, and the
clamp was undone as a scroll.

**Rejected:**

- The same entry, card to row — Bases fills the table after drawing it.
- The Base's top at the pane's — the reader loses their place in it.
- Through the held box — the table fills its top, and the reader sat in the
  blank below until the hold let go.

## D-057 — A reflow holds the block starting in the pane (2026-09-27)

**Decision:** once the pane's width changes, `ScrollAnchor` holds the first
block starting inside the pane below the text crossing its top — climbing past
inline text, anything beside it, anything taking no space — until the shift is
handed to the scroll. Otherwise it holds the text crossing the top, as before. A
Base crossing the top is held by its fraction either way, never by what it
draws. The place is the one read before the width changed, measured again but
not re-read until handed over.

**Why:** a turned phone reflows the text crossing the top, and holding its top
moved a title just below it out of view. Native anchoring prefers what is fully
visible for the same reason.

**Rejected:**

- Always the block starting in the pane — a chevron tapped there scrolls away.
- The next element in document order — a span in the reflowing text, and dozens
  of reads in a highlighted code block.
- Only the first report after the width changes — the text reflows over frames.
- A card, or a heading below a Base — on a phone the cards re-flow before the
  Base is redrawn, and a card's place says nothing of the reader's.
- Re-reading the place each frame — mid-turn it was a Base emptied for its
  redraw, then its note, whose top never moved as the Base shrank.

## D-058 — A search holds its match while the Bases around it fill in (2026-09-27)

**Decision:** once centered, a match is re-centered whenever the stream, or
anything above the match in its note, resizes, until it is still for `SETTLE_MS`
or the reader touches or wheels the pane (`keepInPlace`,
`src/stream/scroll-position.ts`). A note remembered at its height is held there,
so a Base filling in inside it resizes nothing outside it.

**Why:** Bases fill in after the note renders, uncounted by `scrollIntoPlace`;
one above the match pushed it off screen, leaving the reader on the Base.

**Rejected:**

- Counting Base fills as layout changes — `scrollIntoPlace` would wait on them,
  and every step with it.
- Scroll anchoring — it holds the note's top, not the match.
- Checking the match's place each frame — a change made after the frame's
  `requestAnimationFrame` paints a frame off screen; a resize reports before
  paint.

## D-059 — A Base's header and summaries scroll with it, on mobile (2026-09-27)

**Decision:** on mobile, a Base table's header and summary row are
`position: static` (`styles.css`).

**Why:** Bases pins both to its own scroll box. ADR 0008 clips that box away, so
they pinned to the stream's instead and floated over the notes.

**Rejected:**

- Leaving them pinned to the stream — they cover other notes' text.
- Giving the Base its scroll box back — ADR 0008.

## D-060 — Submission rules live in ESLint where a rule can say them (2026-09-27)

**Decision:** `eslint.config.mts` enforces the submission rules a lint rule can
express, `manifest.json` included; `tests/repo/compliance.test.ts` keeps only
the rest (file names, the license, an error's prefix, sentence case).

**Why:** a rule reads the syntax, where a test's regex matched comments too, and
the editor shows it as it is typed.

**Rejected:**

- Both — two places to update, one failing after the other.
- Tests only — they grep text and fail only when the suite runs.

## D-061 — Linked mentions are the stream's own, on the public API (2026-09-28)

**Decision:** each note ends with a footer built from `resolvedLinks`, inverted
once per `resolved` by a plugin-wide `BacklinkIndex`
(`src/render/linked-mentions.ts`). Unlinked mentions are deferred.

**Why:** our footer knows when it has drawn, so the note's height can be held
until then; it needs no internals.

**Rejected:**

- Hosting Obsidian's internal backlinks component — brings Better Search Views
  and unlinked mentions, but fills on its own schedule and is reached only
  through internals.
- Scanning every source's links per rendered note — the index answers from one
  pass.

## D-062 — A render never waits on its footer; the height hold does (2026-09-28)

**Decision:** `renderInto` returns with the footer still reading its sources.
`NoteWindow` keeps the note's `HeightHold` until the footer resolves, then
settles as before. The footer redraws itself on `resolved`, per note, until the
note unloads.

**Why:** the render queue also applies vault events, and a footer reads other
notes; settling before it draws let a returning note dip, which jumps on iOS.

**Rejected:**

- Awaiting the footer in the queue — every render and vault event waits on other
  notes' reads.
- Queuing footer redraws through the view (ADR 0004) — a footer touches no
  stream state, and unloading its note already stops it.

## D-063 — The demo vault is the default; the test vault takes `--test` (2026-09-28)

**Decision:** `seed`, `open` and `demo` act on `.dev/demo-vault/`, and on
`.dev/vault/` with `--test` (`scripts/vaults.mjs`).

**Why:** the demo vault is the one used day to day; the test vault is for the
checklist's edge cases.

**Rejected:**

- Separate `seed:demo` and `seed:test` scripts — `open` and `demo` would need a
  pair each; one flag reads the same on all three.

## D-064 — One command opens a vault and keeps it current (2026-09-28)

**Decision:** `pnpm run demo` builds if there is no build, reseeds the vault,
links the build in, opens the window and reloads the plugin on every save
(`scripts/dev-vault.mjs`). It replaces `dev:vault`, `open` and `reload`, which
had to be run in the right order. The seed scripts still install a copy of the
build: the phone's iCloud vault needs files, not links.

**Why:** the edit-reload loop took three commands in the right order. The vaults
are disposable, so a reseed each run costs nothing and keeps their notes current
with the seed script and the date.

**Rejected:**

- Seeding only when the seed script or the date changed — a fingerprint to
  protect notes nobody keeps.
- Keeping `dev:vault`, `open` and `reload` beside it — four commands for one
  loop.

## D-065 — The demo vault deals its lines from decks (2026-09-28)

**Decision:** each list of lines is a deck, shuffled per pass and dealt by day
or week, so no line returns until its deck is spent, nor within three days
across a reshuffle. Each week has one piece of news, told once and recalled on
Sunday. The default run is 90 days.

**Why:** independent picks put one line in 16 of 60 notes, some on consecutive
days, and repeated one-off events.

**Rejected:**

- Longer lists alone — picks still cluster.
- Tracking what earlier days used — a date's note would depend on the run.

## D-066 — The search action draws `text-search` (2026-09-28)

**Decision:** the header's Search action is lines of text with a magnifier.

**Why:** on a phone Obsidian's own search, a plain magnifier, sits in the navbar
right under the header; one icon for two searches reads as a duplicate.

**Rejected:**

- Search in the ⋯ menu, where Obsidian keeps Find — a second tap on the phone.
- `text-search` on mobile only — a platform branch for an icon.
- `scan-search`, a magnifier in a viewfinder — reads as search faster, but says
  less about what it searches.

## D-067 — Search reads through `cachedRead`, with no cache of its own (2026-09-28)

**Decision:** stream search keeps reading every note per query and refresh.

**Why:** across 1,095 notes (`pnpm run test:memory`), with the CPU slowed 4x to
a phone's: the first query after open reads every note, 585–707 ms; later
queries and a refresh after an edit, 5 ms. So `cachedRead` answers from memory
once warm and sees the edit. A cache of our own would be as cold on open. Its
docs promise only "better performance", so the timing test is the guard.

**Rejected:**

- A source cache per path, invalidated on `modify` — duplicates Obsidian's.
- Dropping a search a newer one replaced — at 5 ms there is nothing to save.

## D-068 — Bases and wide content stay in the render (2026-09-28)

**Decision:** on mobile a render still awaits each Base, then measures its
tables and equations in place.

**Why:** scrolling 40 notes, each embedding a Base over 1,825 notes plus
equations and a wide table (`e2e/render-cost.spec.ts`, CPU slowed 4x to a
phone's, on an M5, in the on-screen window of D-124): a Base held the queue 19
ms median, 29–74 ms at most; the plugin forced 797–857 layouts, 266–290 ms in
all, about 7 ms a note. The spec's budgets are about twice these.

**Rejected:**

- Bases off the queue, held by a `HeightHold` — 16 ms a Base, for a hold per
  Base.
- Batching width reads in one `requestAnimationFrame` — at most 1 ms of layout a
  note (2026-10): with them stubbed out, the plugin forced 80 ms less over 40
  notes but all layout fell by only 40 ms, the rest moving to the next frame.

## D-069 — A first open parses every date in one task (2026-09-28)

**Decision:** `buildSorted` keeps parsing every markdown file's name at once.

**Why:** over 4,096 files, 1,095 of them daily notes, with the CPU slowed 4x to
a phone's (`pnpm run test:memory`): the cold parse takes 17–20 ms, 30–36 ms with
no daily-notes folder set; open to the first note, 50–88 ms. Under the 50 ms of
a long task.

**Rejected:**

- Parsing in chunks, yielding between — splits a task that is not long.

## D-070 — Prettier wraps Markdown at 80 (2026-09-29)

**Decision:** Prettier formats every `*.md` with `proseWrap: "always"` at 80,
the width Prettier and markdownlint default to. `AGENTS.md` stays ignored: it is
the sample plugin's copy, verbatim.

**Why:** hand-wrapped docs drifted to two widths, about 80 in `DECISIONS.md` and
the ADRs, about 120 elsewhere, and nothing checked either.

**Rejected:**

- 120, the code's width — prose past 80 reads poorly in a terminal or
  side-by-side diff.
- Hand-wrapping at a written width — a rule nothing enforces drifts again.
- `proseWrap: "never"`, a line per paragraph — diffs a whole paragraph for one
  word.

## D-071 — A failure degrades one thing, and is logged (2026-09-28)

**Decision:** every async entry point and every localStorage save catches, logs
to the console, and carries on: a note that will not render says so, a read that
fails shows its note, a refused save is logged once (`saveLoggingOnce`), stored
state that does not parse counts as none, a list that fails to build lists
nothing until the next refresh. Only a failed jump raises a Notice.

**Why:** a stream is many notes; one bad one, or a full localStorage, must not
blank the rest. Failing open shows too much, never hides writing.

**Rejected:**

- A Notice per failure — a full localStorage refuses every save after.
- Failing closed (hiding what could not be checked) — writing vanishes silently.

## D-072 — Empty-note verdicts are cached per device, trusted by mtime (2026-09-28)

**Decision:** `EmptyNotes`, one per plugin, keeps each path's verdict keyed by
`mtime`, filled before the first batch and updated on `metadataCache` `changed`.
Only notes no bigger than the template plus 1 KB are read. It saves, in the
vault's localStorage on this device, the template it checked against, when its
last check of every note began, and each empty note's `mtime`. The next session
trusts a note unchanged since: empty if saved with that `mtime`, else written. A
note that fails to read shows and is read on the next check; a check with one
unread saves nothing.

**Why:** a first open reads only candidates, a later one only what changed. A
written note costs nothing to save, an empty one about 40 bytes. A note emptied
on another device, synced with an `mtime` older than the last check, shows until
it next changes.

**Rejected:**

- Reading every note — thousands of reads at open for a few hundred candidates.
- Saving every note's verdict — the check's start time vouches for the written
  ones.
- Trusting a saved empty note by the check's start time — a synced edit can
  carry an older `mtime`, and a written note would stay hidden.
- Capping concurrent reads — on an iPhone 16 Pro, 1,095 cold reads at once take
  344–398 ms with no frame over 15 ms; 8 or 32 at a time is no faster.

## D-073 — Views re-check only the notes whose incoming links changed (2026-09-28)

**Decision:** `LinkChanges`, one per plugin, compares each note's links into the
daily-notes folder on every `resolve` and, once `resolved`, has each view
re-check the notes that gained or lost one (ADR 0011: a linked empty note
shows).

**Why:** a link made or removed shows or hides its target without an open. A
stream open at launch hides a linked empty note until the links resolve, then
shows it.

**Rejected:**

- Re-checking every hidden note on `resolved` — the service must track what it
  hid, for the same answer.
- Checking backlinks only at open — a new link waits for the next open.

## D-074 — A setting that changes what is listed keeps the reader's place (2026-09-29)

**Decision:** toggling Hide empty notes or Show linked mentions reloads the
stream, then returns to the note being read. When that note is now hidden, the
reader lands at the top of the next older note; with none older, at the end of
the stream. Only a stream with no notes left starts at the top.

**Why:** the next older note is what the reader was scrolling towards, and the
end is nearest when nothing older is left.

**Rejected:**

- Back to the top — what a reload did; it throws the reader years away.
- The next newer note — it is behind the reader, above where they were.

## D-078 — Settings are grouped under headings; a hidden section drops its collapse toggle (2026-09-30)

Superseded in part by D-114: groups, not heading rows; no redraw.

**Decision:** the settings tab puts Properties and Linked mentions under
`Setting.setHeading()` rows, Hide empty notes above them. A section's "Collapse
by default" is drawn only while its "Show" toggle is on; that toggle redraws the
tab.

**Why:** each collapse toggle means nothing without its show toggle, and a flat
list did not say so.

**Rejected:**

- `SettingGroup` cards — needs `minAppVersion` 1.11.0, up from 1.8.7.
- Disabling the collapse toggle — a greyed row still reads as a choice.

## D-079 — A placeholder never measured here is estimated from its text (2026-09-30)

Superseded by D-092.

**Decision:** a note with no height stored at the layout reserves, first that
applies: its height at the nearest width of the same text size, plus its wrapped
lines' difference × line height; else the template's measured height here, plus
its lines past the template's × a per-line rate learned from text-only notes,
plus its embeds × a per-embed height learned at this layout (the pane's height
until one is); else the layout's median. Lines come from the metadata cache, so
adding a block stays synchronous. Benchmark: `e2e/estimates.spec.ts`, scored by
`scripts/score-estimates.mjs`.

**Why:** a turn changes a text note only by re-wrapping it, and every note is
its template plus writing (ADR 0011). Mean error for text notes falls from 85px
(the other width's height) to 18px, and from ~330px (400px) to ~50px.

**Rejected:**

- The template's height alone — a floor, 443–624px short on average.
- A fixed buffer per embed — no one value fits Bases drawn as cards in portrait
  and tables in landscape.
- Heights stored per Base — a vault's Bases differ, and one Base's height varies
  with what it draws.

## D-080 — A turned note's Bases change by what the same Base changed elsewhere (2026-10-01)

Superseded by D-092.

**Decision:** a note estimated from its height at another width (D-079) adds,
per Base it embeds, the median change per Base, beyond re-wrapped text, of other
notes embedding that Base and measured at both widths. None measured at both: no
change.

**Why:** only a Base switching between table and cards changes much on a turn
(up to ~1400px), and the same Base switches the same way in every note. Embed
error after a turn: 378px → 35px.

**Rejected:**

- One change per embed, or per Base — images barely change, and Bases differ:
  the median is near zero, or half of a switching Base's change.
- Adjusting only Bases flagged too wide (`BaseMeasurements`) — known per note
  only once drawn at the new width; learning per Base gets there without it.

## D-081 — Turned wider, an unlearned Base's note is estimated from its template (2026-10-01)

Superseded by D-092.

**Decision:** a note measured only at a narrower width, embedding a Base whose
change D-080 has not learned, is estimated from the template and its lines
(D-079's fallback) once the template is measured here; before, as D-080.

**Why:** cards at the narrower width may be a table here, up to ~1,400px
shorter, and until a note with that Base settles at both widths nothing says so.
Demo journal, Base notes turned to landscape: mean error 782px → 224px, worst
overestimate 1,408px → 353px.

**Rejected:**

- Also turned narrower — a table there may become cards here, but the template's
  estimate overshoots notes whose Base does not, by up to 1,131px.
- Only Bases flagged too wide at the old width (`BaseMeasurements`) — a Base
  predicted too wide from its headers draws as cards without a flag.

## D-082 — A jump or search step draws its note whole before scrolling (2026-10-01)

**Decision:** the target note renders off screen and waits for its Bases'
queries (`is-loading` cleared, a frame on, at most `BASES_LOAD_LIMIT_MS`), then
the scroll goes once: a jump to its top, a step to the match (`basesLoaded`,
`NoteStream.ready`).

**Why:** scrolled to first, a Base showed "0 results", then filled in, on
screen; a step also painted the note's top for two frames before centering.

**Rejected:**

- Hiding a Base until it fills — blank space, then cards popping in.
- Remembering each Base's height — the space is right, the "0 results" bar still
  shows.
- Readying the notes around it too — the match's own note is where its Bases
  sit; the neighbours render as they do on any scroll.

## D-083 — On mobile a PDF embed is its first page, opened by a tap (2026-10-01)

**Decision:** under `.is-mobile` a PDF embed is clipped like a Base, its toolbar
hidden, and a tap anywhere on it opens the PDF at the embed's page, through the
link handlers (`NoteRenderer.linkAt`). An iframe is capped at the note's width,
everywhere.

**Why:** clipped, Obsidian's viewer shows page 1 and its toolbar can reach no
other page; a pasted video embed's fixed width scrolled the page sideways on a
phone.

**Rejected:**

- Every page at full height — a long PDF becomes the whole stream.
- Obsidian's file card (icon and name) — loses the page a reader recognizes.
- Leaving the viewer live — a scroll box, which ends an iOS glide (ADR 0008).

## D-084 — Dataview's queries are clipped and stacked like the note's own (2026-10-01)

**Decision:**

- On mobile the stylesheet clips Dataview's blocks, which Dataview's own
  stylesheet makes scroll.
- `stackWideTables` stacks a table whenever one is added or filled in, not only
  at render.
- e2e runs a pinned Dataview release, fetched once into `.dev/`
  (`e2e/dataview.ts`).

**Why:** Dataview draws after the note renders, over several passes; its wide
tables were clipped, not stacked, and each block was a scroll box until the
guard caught it at rest.

**Rejected:**

- The scroll box guard alone — it clips once the scroll is still, so a block
  drawn mid-glide scrolls for that glide.
- A stand-in plugin drawing late tables in e2e — proves nothing about Dataview's
  own stylesheet or render passes.
- Dataview committed to the repo — 2.3 MB of someone else's build.

## D-085 — No equation gets a layer of its own (2026-10-02)

**Decision:** the stylesheet sets `will-change: auto` on every `mjx-container`
in the stream, undoing MathJax 3's WebKit-only `will-change: opacity`.

**Why:** with the layers, an iPhone stopped 34 of 58 flicks dead within 0.4 s,
math in a table or a line alike; without them, 0 of 30, as with no math at all.
MathJax added the rule for a 2020 pinch-zoom flicker
([MathJax#2435](https://github.com/mathjax/MathJax/issues/2435)) and dropped it
in v4 as unneeded; Obsidian ships v3.

**Rejected:**

- Keeping MathJax's fonts in use — the fonts were never dropped; 28 of 54 still
  stopped.
- Override at MathJax's own specificity — its stylesheet comes later and wins.

Superseded 2026-10-07: Obsidian 1.14 ships MathJax 4, which sets no
`will-change`, and the plugin needs 1.14 (D-100). The rule is gone; the WebKit
check stays, against MathJax bringing the layers back.

## D-086 — The iPhone harness leaves Auto-Lock to the tester (2026-10-02)

**Decision:** `test:ios` changes no setting on the phone. `docs/TESTING.md` says
when to set Auto-Lock to Never and back.

**Why:** a run takes under a minute, and a locked phone fails setup at once.
Only many runs in a row need the phone kept awake, and setting that on someone's
phone for them left it never locking if they forgot `pnpm run ios:release`.

**Rejected:**

- Setting Never through the Settings app, held until `pnpm run ios:release` —
  navigated pages holding Delete buttons, failed under Low Power Mode and on an
  iPad, and cost ~18 s a session.

## D-087 — On mobile a frame loads its page once the scroll is still (2026-10-03)

**Decision:** `FrameDeferral` takes the `src` off each iframe a note renders,
from a mutation observer, and puts it back once the scroll has been still for
`SCROLL_IDLE_MS`. Meanwhile the frame is shaded as a placeholder.

**Why:** a YouTube frame rendering mid-glide stopped 10–13 of 20 iPhone flicks
dead. With its `src` held back, 0 of 20; a page already loading when a flick
starts stops none. The same frame on `about:blank`, or a box its size, stops
none: starting the page is what ends the glide.

**Rejected:**

- `scrolling="no"` on the frame — 8 of 20 still stopped.
- A tap to load every frame, like the PDF (D-083) — hides a page that can work
  in place. YouTube's player fails in the app, so it is a thumbnail (D-088).
- Rewriting `src` in the Markdown before rendering — a code block showing an
  iframe would show the rewrite.

## D-088 — On mobile a YouTube embed is its thumbnail, a link to the video (2026-10-03)

**Decision:** on mobile `FrameDeferral` swaps a YouTube embed's frame for
`youtubeThumbnail`: the video's thumbnail under the play button of YouTube's
player, in the player's box, linking to the video at the embed's start. The
thumbnail is the 1,280 px one, else the 480 px one every video has. Desktop
keeps the player.

**Why:** in the iOS app the player shows only "Error 153", and a frame held back
(D-087) is a grey box that names nothing. A tap opens YouTube, or its app. The
thumbnail is an image: 0 of 20 flicks stopped over it.

**Rejected:**

- The grey placeholder, then the player once still — the player fails anyway.
- A wrapper labelled over the held frame — more DOM, still a player that fails.
- A still with YouTube's button drawn in — YouTube serves none; its stills and
  oEmbed are plain.
- The 480 px thumbnail alone — 2.2x upscaled across a phone at 3x, blurred.

## D-089 — On mobile a Base's cards and header line up with the note's text (2026-10-03)

**Decision:** under `.is-mobile`, a cards view keeps 1px of
`--bases-view-padding` each side, for the cards' ring, and the header gives back
its own padding and its first button's: card borders and the first icon sit on
the text's edges.

**Why:** Bases insets cards 12px and the icon 6px inside a note's text column,
which reads as a stray margin under a heading.

**Rejected:**

- Edge to edge, as Obsidian's reading view draws a Base — past the text column
  on both sides, unlike everything else in the stream's notes.

## D-090 — A glide's bounce at the top hands over as it ends (2026-10-03)

**Decision:** `ScrollAnchor.onScroll` hands what it owes to the scroll in the
first scroll back at or below the top after one past it, not once the scroll has
been still for `SCROLL_IDLE_MS`.

**Why:** a glide up past notes rendering taller than reserved runs out of scroll
first and bounces at the top owing them (ADR 0010). On a phone the hand-over
came 328 ms after the bounce; a flick meanwhile hit the same top, and put the
hand-over off again. A bounce ends the glide, so the write ends none.

**Rejected:**

- Handing over as the glide reaches the top — iOS undid the write the next
  frame, mid-bounce: the stream jumped 3,000 px.

## D-091 — A glide reaching the stream's top drawn lower stops there (2026-10-03)

**Decision:** while `ScrollAnchor` owes a shrink, a scroll that will bring the
stream's top into the pane within two more of its last step writes the scroll to
the top and drops the shift, the pane frozen for that frame (`is-scroll-frozen`,
`overflow: hidden`): the glide stops with the newest note at the top. A clamp to
the stream's end is no step.

**Why:** notes above rendering shorter than reserved leave more scroll than lies
above. The glide reached the newest note with that to spare and went on into
blank: 1.7–4.6k px in the iPhone harness. iOS carries a glide on from a write,
undoing it the next frame; with nothing to scroll, the glide ends. Merged first
without the freeze, the newest note jumped 1.5–1.7k px back after the write; its
test checked only for blank. Stopped on arrival, a recording showed it drawn ~65
px past for a frame, then back: iOS draws a frame before the page hears it. One
step ahead still went 43 px past when a dropped frame doubled the step.

**Rejected:**

- The write alone — undone the next frame, whatever it wrote: 0, mid-range, or
  with the shift added or dropped.
- Handing over once still — the blank is on screen until then.

## D-092 — A note never measured reserves the 0.9 quantile of those measured (2026-10-04)

**Decision:** a note with no height stored at the layout reserves the 0.9
quantile of the heights stored there. Where nothing is, it keeps what it
reserves: just turned, its old width's height; never measured, two panes. A
height kept schedules the re-reserve at the next rest (ADR 0014), so after a
turn or on opening, the notes on screen set the rest within moments. It replaces
D-079–D-081's estimates from each note's text, template and Bases.

**Why:** an estimate shows only off the common path, after a jump, search, Back
or turn, gliding up through notes not yet drawn; scrolling down from the top
measures every note before it is passed. There, too tall is safe, as D-091 stops
the glide on the newest note; too short costs one more flick (D-090). Its only
input is the vault's own notes, so nothing is fitted to a journal we made up.

**Rejected:**

- D-079–D-081's per-note estimates, made to err tall — each rule, per Base and
  per embed kind, held on our generated journals and nowhere tested beyond them.
- The upper quartile — on those journals, a third to half of a week's runs of
  notes came out short in portrait.
- A buffer above the newest note — room above can change only at rest: a scroll
  write mid-glide is undone or ends the glide (D-090, D-091).
- The nearest width's quantile, scaled by the widths — the notes on screen are
  measured at the new width within moments of a turn.
- A fixed 400px before anything is measured — the notes ADR 0006 measured ran
  ~709px.

## D-093 — No file menu from a long-press on a note's title on iOS (2026-10-05)

**Decision:** the note menu opens on right-click only. On iOS a long-press on a
title selects its text; a tap opens the note, whose own menu holds the same file
actions.

**Why:** iOS fires no `contextmenu` on a long-press; Obsidian synthesizes one
only for elements its drag manager handles. The menu adds a shortcut, not an
action, and a touch listener on the stream sits in the path of glides, what
breaks most on iOS.

**Rejected:**

- Our own long-press: a timer that must tell a press from a flick's start, and
  the title's selection suppressed.
- Registering titles with Obsidian's drag manager — private API.

## D-094 — One width observer per view; the anchor keeps its own (2026-10-05)

**Decision:** tables, equations and Bases hear a note's width change through one
`ResizeObserver` per view (`note-widths.ts`), not one each per rendered note.
`NoteWindowManager` and `ScrollAnchor` keep an observer each.

**Why:** the three width observers were one piece of code written three times,
waking on every height change to find the width the same. A screen of notes on a
phone ran ~24 observers; it now runs ~6. The pin and the anchor watch different
sets — every block for the anchor, rendered ones for the pin — so one observer
would need counts of who watches what.

**Rejected:**

- One observer for the pin and the anchor — saves one observer per view, at a
  rewrite of the anchor's tests and shared bookkeeping in ADR 0013's code.

## D-095 — No ResizeObserver callback resizes what was reported (2026-10-05)

**Decision:**

- Nothing watches a pinned block's size: it changes only in `repin`, which tells
  the anchor (ADR 0013). The anchor watches a block while it is unpinned.
- A Base is held at the tallest it laid out at from its first layout, not on
  hearing it shrank; its callback only raises the hold. It lets go once still,
  or at `HOLD_LIMIT_MS`, in a timer.
- A Base redrawn for a width change or Bases' layout is redrawn a task later.

**Why:** WebKit logs "ResizeObserver loop completed with undelivered
notifications" as an error when a callback resizes an element no deeper than the
shallowest one reported that round. Each of these did, on a flick or a turn. The
late report itself was harmless; the error was the cost.

**Rejected:**

- Ignoring the notice in the iPhone check: it is ours, and on every scroll.
- Re-pinning a frame later: breaks ADR 0013.
- `requestAnimationFrame` for the redraws: it never runs in the hidden e2e
  window.

## D-096 — No Android pass before a release (2026-10-05)

**Decision:** releases are checked on desktop e2e and a real iPhone only.
Android stays supported, held to the iOS rules (ADR 0008).

**Why:** Android's WebView is Chromium, the engine both e2e projects run. What
e2e cannot see is a native widget, such as the date wheel, and that is
Android's.

**Rejected:**

- An emulator driven by Appium — a second device harness for an engine e2e
  already runs.
- A manual pass — no device, and a check nobody runs is no check.

## D-097 — On mobile a Base's toolbar has no New button (2026-10-05)

**Decision:** under `.is-mobile`, a Base's New button is hidden. The view name
and result count shrink to an ellipsis as in Obsidian, which the stream's
`overflow: clip` had stopped (ADR 0008).

**Why:** a Base in the stream is the text's width, 354px on a phone against
Obsidian's 402px edge to edge (D-089), so the toolbar overran by up to 41px: New
was cut off, and shrinking alone left "Resized" as "R…". Without New it reads
"Resiz…", and a short name, such as "Books", is whole with its count. It creates
`Untitled.md` on one tap, with no prompt: easy to hit mid-scroll. The note or
`.base` file keeps it.

**Rejected:**

- Keeping New, names shortened — the view name tells views apart.
- Hiding it on desktop too — desktop has the room; Sort, Filter and Properties
  edit the `.base` file anyway.
- Wrapping the toolbar to two lines — a row of height on every Base.

## D-098 — On mobile a web page in a frame is a preview, a link to the page (2026-10-05)

**Decision:** on mobile a frame in the stream takes no touch
(`pointer-events: none`), and `FrameDeferral` wraps one showing an `http(s)`
page in a link to it (`webPageLink`). The page loads once still, as before
(D-087). Desktop keeps frames live.

**Why:** on an iPhone a flick over a page taller than its frame scrolled the
page inside it, ~5,400 px, and never the stream; flicking back worked only while
the page was at its top. The scroll box guard cannot reach a frame's page (ADR
0008). A PDF (D-083) and a video (D-088) are previews a tap opens already.

**Rejected:**

- A preview a tap does nothing on — it looks like a link.
- A link in the frame's place — loses the preview, the point of a map or a
  calendar.
- Leaving the page live — any frame taller than the screen can trap a flick;
  D-087's "a page that can work in place" gave way to that.

## D-099 — An iOS glitch of a frame is fixed only once a recording shows it (2026-10-05)

**Decision:** three such glitches, traced by a probe or only predicted, stay
unfixed:

- A Base's table draws rows blank for a frame as a note above it renders
  mid-glide: Bases re-picks rows only after the paint. Traced by `src/probe.ts`
  in commit `d9cdb4f`.
- An image loading inside the note the pane's top crosses may jump a frame (ADR
  0013's consequences). Never seen: notes render a screen ahead, so their images
  have usually loaded.
- D-091's stop may write the scroll mid-touch on a slow drag past the newest
  note. The harness only flicks.

**Why:** each lasts one frame, mid-motion. A fix leans on undocumented Bases or
iOS behavior, and only a phone recording can confirm it: the harness samples
before the re-pin.

**Rejected:**

- Dispatching `scroll` on each Base near the screen in `repin`'s task — relies
  on undocumented Bases behavior, and every other listener hears it.
- Measuring never-measured notes in a hidden probe while still — ~16 ms a Base,
  1,095 notes in a three-year vault, no `requestIdleCallback` on iOS; Bases and
  images size again where they are drawn (ADR 0010).

## D-100 — Before 1.0 the plugin needs the latest Obsidian (2026-10-07)

**Decision:** until 1.0, `minAppVersion` is the latest public Obsidian, raised
at the next version bump; the stream drops what only older versions need.
`1.0.0` is the first public release, and `versions.json` keeps no `0.x` entry
past it (2026-10-09). The `0.x` drafts and tags are deleted (D-125).

**Why:** nothing is released publicly before 1.0, so no reader runs an older
Obsidian, and a workaround for one is dead code. Obsidian offers an older
version from `versions.json` to an app below `minAppVersion`; a `0.x` entry
would point at a draft nobody can download.

**Rejected:**

- Keeping 1.8.7 — carries rules like D-085's for readers who do not exist.
- Publishing the `0.x` drafts — releases nobody outside ran.

## D-101 — A turn's scroll change is never the reader's (2026-10-07)

**Decision:** once the pane's width changes, `ScrollAnchor` re-reads the scroll
the place was read at: whatever moved the place since is owed.

**Why:** a turn upright makes the pane taller, and near the stream's end the
browser clamps the scroll. On a phone, the stream had grown 62px by the time the
clamp's scroll was read, `clamped()` read false, and the 873px clamp passed for
the reader's scroll: about one turn in three lost the place.

**Rejected:**

- Drawing the shift first, as ADR 0015 does — the browser clamps before any
  plugin code runs.
- A spacer at the stream's end — a second thing to remove at the right moment
  (ADR 0014).

## D-102 — A refresh reads the place once the anchor has handed over (2026-10-07)

**Decision:** `NoteStream.refresh()` has `ScrollAnchor` hand what it owes to the
scroll before reading the reader's place.

**Why:** while owed, the stream is drawn shifted, not where the scroll puts it.
At the stream's end, a clamp held as a shift drew every note above the pane:
`place()` found none, and hiding empty notes there reloaded at the top.

**Rejected:**

- Reading the place through the shift — at the end, the shift draws nothing in
  the pane to read.

## D-103 — At the stream's end, the anchor owes only what the scroll can take (2026-10-07)

**Decision:** once every note is loaded, `ScrollAnchor` caps what it owes at how
far the scroll can still go down. A clamp at the end moves the place at once.

**Why:** a shift past the scroll's end draws blank below the stream until the
scroll is still, and the hand-over clamps it all the same. Short of the end, the
next batch fills the blank, and the hold keeps the place (ADR 0015).

**Rejected:**

- Capping everywhere — a jump to a note with little below would lose its place.

## D-104 — A task's checkbox centers on its words (2026-10-07)

**Decision:** the box takes the text's font size, `vertical-align: middle`, and
`top: -0.12em`. Tests hold it within 0.5px of center at 12–28px in Chromium, and
within 1px at 16px and 28px on an iPhone.

**Why:** Obsidian nudges the box by a fixed 0.2em of its own 13.33px font, and
the box grows with the text. On an iPhone that left it 1.8px high at 16px and
5.3px high at 28px; centered, it is within 0.8px. Edit view drifts too, the
other way.

**Rejected:**

- Matching reading view — copies a drift that grows with the text.
- `font-size: inherit` alone — scales the nudge, not the centering: desktop then
  drifts by 1.2–1.9px.

## D-105 — Note heights are kept to the 1/64 pixel (2026-10-07)

**Decision:** `NoteHeights` keeps a height rounded to 1/64px, the unit browsers
lay out in, not to whole pixels.

**Why:** a placeholder reserved a whole-pixel height and its note rendered up to
half a pixel off. The anchor owed the difference, and a scroll up by hand
settled 1px short of the top. Exact, a note unchanged since it was measured owes
nothing; an edited one is estimated (ADR 0017), and a changed embed is owed
whatever it changed, either way. Keeping sizes as measured is the norm: browsers
add up sub-pixel anchoring adjustments (web-platform-tests'
`device-pixel-adjustment.html`), and TanStack Virtual keeps
`getBoundingClientRect()` sizes unrounded.

**Rejected:**

- Whole pixels (`a5c9f52`) — saves ~26KB on a three-year journal's layout
  memory, of ~160KB, against a 5MB store; no reader sees the difference either
  way.
- Loosening the tests to a pixel — keeps the rounding they caught.

## D-106 — A wrapped task's lines start under its first (2026-10-07)

**Decision:** the checkbox hangs out of the line by its width and the gap after
it, so a task's words start at the item's edge on every line.

**Why:** Obsidian hangs it 1.5 widths out, which lines up only at a 12px box.
The box grows with the text, so the first line starts left of the rest: 3px at
16px, 10px at 28px on an iPhone, in reading view too.

**Rejected:**

- Matching reading view — copies a gap that grows with the text, as D-104.

## D-107 — On mobile a kanban Base too wide for its note draws as cards (2026-10-07)

**Decision:** a kanban view follows D-033: measured from the width Bases sets on
its board, it redraws as cards, its `groupBy` kept, so each column is a group.

**Why:** clipped (ADR 0008), a phone showed the first of a board's 280px columns
and none of the rest.

**Rejected:**

- A tap opens the `.base` file, as a PDF (D-083) — hides a board cards can show.
- Stacking the columns in CSS — Bases positions them absolutely, as D-033 found
  for tables.
- Cards for every kanban, unmeasured — a one-column board fits.

## D-108 — A Base's own height changes re-pin its note in the same task (2026-10-08)

**Decision:** a Base slot tells its note, by a synchronous `BASE_RESIZED` event,
when its hold lets go or a measured draw fits; the note re-pins and the anchor
shifts in that task (ADR 0013). A Base redrawn as written over cards, to be
measured, is clipped at the cards' height until measured.

**Why:** both changes reached the note by a `ResizeObserver` report, which iOS
paints a frame after, so text below a Base in the same note jumped and returned:
1219px for a table redrawn as cards, 510px each way for a kanban (D-107).

**Rejected:**

- Pinning every slot as notes are pinned — also clips Bases' own live growth for
  a frame; a larger change to the hold (D-035, D-054) than these two needed.
- A callback from `NoteBases` into `NoteWindowManager` — wires the renderer to
  the stream it is made before; the event needs no reference.

## D-112 — A phone run turns the keyboard's autocorrection and prediction back on (2026-10-09)

**Decision:** the iOS harness ends a run by setting both through WebDriverAgent:
on by default, `IOS_KEYBOARD_AUTOCORRECT=off` or `IOS_KEYBOARD_PREDICTION=off`
to leave one off, set on the command line or in a gitignored `e2e/ios/.env`,
which the command line overrides. Tests still type with both off.

**Why:** WebDriverAgent turns both off each time it starts, real phones
included, and never back on: the tester's keyboard stayed changed.

**Rejected:**

- Restoring what the phone had — WebDriverAgent overwrites it before any session
  can read it.
- Patching WebDriverAgent's start-up — a fork of a dependency the driver install
  replaces.

## D-113 — Nothing in the stream carries `.clickable-icon` (2026-10-09)

**Decision:** a button in the stream copies `.clickable-icon`'s look in the
stream's own class rather than taking Obsidian's.

**Why:** on an iPhone, a flick begun on a `.clickable-icon` never scrolled:
Obsidian's mobile tap handling for the class swallows the pan, with no
`preventDefault` or `touch-action` to see. The pencil on every title in the
editing spike (ADR 0018) failed four `e2e/ios/` glides.

**Rejected:**

- Undoing the class's handling — Obsidian's script, out of reach.

## D-114 — The settings tab is declared, each section a group (2026-10-09)

**Decision:** `getSettingDefinitions()` returns Hide empty notes, then a group
per section. Obsidian draws each group as a card, hides a collapse toggle while
its section is off (`visible`), and lists every toggle in its settings search.
`setControlValue` saves through `saveSettings()`, which redraws the streams.

**Why:** the settings search finds them, and Obsidian redraws the tab itself:
the tab holds no rendering, saving or redraw code.

**Rejected:**

- `SettingGroup` cards, drawn by the tab — the same cards, out of the search,
  with D-078's redraw kept.

## D-115 — Release notes are written by hand at release (2026-10-09)

**Decision:** each release's notes are a summary written into the draft's body
before publishing, from `git log --first-parent` since the last release tag:
what a reader notices, in plain words; internal work left out. From the first
public release: 1.0.0.

**Why:** the first-parent log holds every change, merged or fast-forwarded; a
reader wants what changed for them, which takes judgment no script has.

**Rejected:**

- A `CHANGELOG.md` — repeats the release bodies; one contributor needs no
  per-branch entries.
- Notes generated from commits (a script, GitHub's) — they list commits, tests
  and docs included.

## D-116 — The README recordings are animated WebPs; the phone's is captured over USB (2026-10-09)

**Decision:** both recordings are animated WebPs encoded by `img2webp`: desktop
lossless, the phone lossy at quality 80 and 30 frames a second. The phone's
screen is captured over USB as QuickTime does (`scripts/capture-iphone.swift`),
600 px wide, trimmed to the scene.

**Why:** WebP stores the desktop recording's exact pixels in 1.3 MB, an APNG's
3.0. On the phone a glide changes the whole screen every frame: lossless took 8
MB for the glides alone, an APNG 20 MB in all, lossy 5.3 MB; at ten frames a
second, glides stutter and key bubbles drop out. USB capture draws a clean
status bar, the same in every take.

**Rejected:**

- APNG (D-045) — over twice the size on desktop, four times on the phone.
- WebDriverAgent's screen stream — JPEG frames, and the real clock and battery
  in each take; the same size once encoded.
- `sharp` — a Node dependency for what one command does.

## D-117 — A Templater block fills in one line, as its docs predict (2026-10-09)

**Decision:** in the template pattern (ADR 0011) a Templater block stands for
any text on its line, like `{{…}}`. `tp.file.cursor()` stands for the marker
Templater writes back or nothing; `-`/`_` trim beside a block as Templater's
whitespace control does. A block whose output spans lines (`tp.file.include`,
`tp.web.daily_quote`, `if`/`else`) makes an untouched note show.

**Why:** a block read as any text across lines swallowed what was written there:
a bullet typed at `tp.file.cursor()` hid the note. A note wrongly shown is
clutter; one wrongly hidden is lost writing.

**Rejected:**

- Fingerprints of what Templater wrote, from its `templater:overwrite-file`
  event, kept in plugin data — catches multi-line output, but not notes made
  before install, where hiding matters most; an undocumented event and a synced
  record per note. Revisit if users ask (`docs/TODO.md`).

## D-118 — The service counts the stream's notes (2026-10-11)

**Decision:** `DailyNoteService` keeps `streamLength`, how many notes, newest
first, the stream has loaded. `insertSorted`/`removeSorted` move it, a rebuild
empties it; `NoteStream` keeps no list of its own.

**Why:** `StreamState` copied the list's first notes, and every list change had
to repeat itself there or pagination skipped and repeated notes (ADR 0004). Kept
beside the list, the count moves with it.

**Rejected:**

- The count in `NoteStream` — each insert and remove must still repeat itself
  there.

## D-119 — Lookups over the notes stay linear (2026-10-11)

**Decision:** `DailyNoteService.indexOf` scans, and `refresh` maps every date to
read one.

**Why:** each runs once per event, refresh or Back, never per note: over 1,095
notes, microseconds.

**Rejected:**

- A path→index map — a second copy of the list's order that every insert and
  remove must keep in step, the kind of copy D-118 removed.

## D-120 — The service dates notes by the format it listed them with (2026-10-11)

**Decision:** `DailyNoteService` keeps the daily-notes format of its last build
and parses, formats and inserts by it; only `refreshIfSettingsChanged` reads the
settings, on each config write (D-002). The jump modal spells each choice's
label and ISO date once per open.

**Why:** a note made between a format change and the refresh was parsed by the
new format into a list sorted by the old. Reading the settings per call also
cost 1,095 reads per modal open.

**Rejected:**

- Reading the format once per modal open — still a read per insert, and still
  out of step with the list until the refresh.

## D-121 — Collapse state is one blob, its old keys dropped unread (2026-10-11)

**Decision:** `CollapsibleStateStore` saves every note's sections under
`daily-notes-stream:collapse`, read once at load and pruned to the vault's notes
at layout ready, as the layout memory is. The old `collapse:*` and
`collapse-idx:*` keys are never read; a device build's "Forget collapse state"
command deletes them with the rest.

**Why:** a key per section could not be listed, so a note deleted unheard left
its keys forever, unprefixed beside other plugins'. Each heading of each render
read and parsed one.

**Rejected:**

- Migrating the old keys — they cannot be listed, only read per path, so the
  reader stays for good. Unpublished: only test devices hold any.

## D-122 — The backlink index re-inverts the cache on each `resolved` (2026-10-11)

**Decision:** `BacklinkIndex` stays lazy, inverting all of `resolvedLinks` on
its first lookup after a `resolved`; `LinkChanges` keeps its own per-source
diff.

**Why:** 5 ms per inversion at 10,000 notes and 100,000 links on a 2026 Mac,
once per save that a drawn footer hears. A full re-read is right whatever events
Obsidian sent.

**Rejected:**

- One incremental index for both — correct only if Obsidian fires `resolve` for
  every source whose links change, renames and deletes of targets included.
  `e2e/linked-mentions.spec.ts` guards the delete and rename cases for a retry.

## D-123 — The day's turn waits for the stream's next change, or midnight (2026-10-11)

**Decision:** before each vault event, refresh or config write it applies, the
stream asks the service whether the day turned since it last looked; if so, it
rechecks the last day's note and one made ahead for the new day. One timer per
view also catches up a minute past midnight, once the reader has stopped
scrolling, touching and wheeling. The reader's own loads, renders and jumps
never do.

**Why:** yesterday's note showing until something happens costs the reader
nothing, but a note made ahead for today would stay hidden in an idle stream.
Waiting for stillness keeps the pane from moving under the reader.

**Rejected:**

- A check each minute — a timer firing all day for one moment a day.
- Exempting the newest note instead of today's — skip days and an untouched note
  stays shown until the next is made.

## D-124 — The e2e window stays on screen, transparent (2026-10-12)

**Decision:** the harness shows every Obsidian window at opacity 0, ignoring the
mouse, instead of hiding the app, and without the phone layout's vsync flags.
Before each test it lays the page out at the project's size again, from one
session that never detaches.

**Why:** hidden, a window whose viewport was set again drew a frame or two a
second once a tab opened, until its worker restarted, timing out whichever
frame-bound test came next. On screen it draws normally, takes screenshots, and
the phone layout glides. A detached session takes its viewport with it, and the
page falls back to its 300x200 window at its next layout, as when settings open
in their own window.

**Rejected:**

- Drawing without vsync on desktop, as the phone layout does — 4 of 5 full runs
  then failed a menu or settings test.
- Skipping the one desktop test that resizes — it checks real behavior, and the
  stall outlives it.
- A visible window behind others — still the user's to see, and macOS throttles
  a covered one.

## D-125 — History rewritten once, before the repo goes public (2026-10-12)

**Decision:** history keeps only the images at the tip of `main` and
`archive/sideways-scroll`, and the `0.x` tags and drafts are deleted. Old
commits show no images.

**Why:** old image versions were 20 MB of a 29 MB clone. Rewritten commits need
new tags, and no reader ran a `0.x` draft.

**Rejected:**

- One fresh commit — loses the messages that hold each change's why (ADR 0001).
- Recreating the `0.x` tags — they would mark releases nobody outside ran.

## D-126 — The README's desktop stills crop to the note column (2026-10-12)

**Decision:** each desktop still is the top 520 px of the note column, from
under the view's header, with a 32 px margin and a 1 px border, shown 800 px
wide, as the recording above them is.

**Why:** the whole 1024 px window at 440 px showed its text at 43%, too small to
read; cropped, it shows at 105%, and the stills line up with the recording. The
recording above them already shows the window. Without the border, a light still
runs into GitHub's white page.

**Rejected:**

- The whole window, shown wider — 78% text needs 800 px, and six stills that
  tall double the README's length.
- A smaller window — Obsidian's narrow layout, not the one readers see.

## D-127 — The daily-notes settings are read without a library (2026-10-12)

**Decision:** `getDailyNoteSettings(app)` in `src/obsidian-internals.ts` reads
Periodic Notes' daily settings while it has them on, else the core plugin's, and
the callers take it as a function.

**Why:** `obsidian-daily-notes-interface` was bundled for this one function. It
reached Obsidian through the bare `window.app` global, sat unmaintained since
2021, and shipped its MIT notice nowhere in `main.js`.

**Rejected:** keeping it and adding its notice to `main.js` — it would still be
a dependency for 20 lines, and the one unsupported access outside the internals
file.

## D-128 — The jump list opens on two months, a query lists a year (2026-10-13)

**Decision:** the jump prompt lists the newest 62 notes on open, and up to 366
matches once a query is typed.

**Why:** over 1,825 notes at phone speed, opening on every date took 313 ms to
its first frame, against 41 ms for 50; on an M5, 38 ms against 8. A typed year
is up to 366 notes, and the old single limit of 50 cut it off in November.

**Rejected:**

- Every date, on open and on a query — a third of a second on a phone, more with
  each year.
- Two calendar months back from today — a sparse journal opens on few notes.

## D-129 — A pinned or reserved height and the scroll shift do not inherit (2026-10-13)

**Decision:** `styles.css` registers `--daily-note-pinned-height`,
`--daily-note-placeholder-height` and `--daily-notes-scroll-shift` with
`@property`, `inherits: false`.

**Why:** a custom property inherits by default, so each change restyled every
element under the one it was set on: the whole note at each re-pin, the whole
stream at each shift. Re-pinning a 10,000-line note took 140 ms on an M5, 570 ms
with the CPU slowed 4x; 2–3 ms not inherited. A save of that note at phone speed
froze 4.9 s, now 1.8 s; a 200-line note's, 55 ms, now under a long task. A note
drawn inside its reserved height (ADR 0020) dropped it once done: inherited, one
more restyle of the whole note, ~520 ms at phone speed.

**Rejected:**

- Resetting them on the children, as `--daily-note-held-height` is — as fast (2
  ms), but a rule per property at every level that must stop it.

## D-130 — Every saved note renders by section, whatever its length (2026-10-13)

**Decision:** no length limit: any note saved while rendered re-renders only the
sections a save changed from then on (ADR 0019).

**Why:** at phone speed (CPU slowed 4x, `e2e/edit-cost.spec.ts`), a 200-line
note's first save by section holds one 61–96 ms task, against none rendered
whole; each save after costs nothing, against 35 ms. A limit set the path's use
by an M5's speed, and left it to the few with long notes, where its faults would
surface late.

**Rejected:**

- From 8,000 characters, where a whole re-render first held a 50 ms task — the
  number holds for one machine, and the path ran for few readers.

## D-131 — Specs time a laptop slowed below every supported iPhone (2026-10-13)

**Decision:** `emulatePhoneCpu` times a fixed workload (`e2e/phone-speed.ts`) on
the machine, then slows its CPU until the workload takes 20 ms: about 2.3 times
an iPhone 16 Pro's 7.6–9.0 ms. `e2e/ios/phone-speed.spec.ts` keeps that ratio to
the real phone.

**Why:** the fixed 4x slowed an M5 to 22–29 ms, and a slower laptop ran slower
still. 20 ms is below an iPhone 11 (~18 ms, half a 16 Pro's single core on
Geekbench 6), the oldest iOS 26 runs on, and near the quicker mid-range Androids
(~29 ms estimated for a Galaxy A35).

**Rejected:**

- The fixed 4x, Lighthouse's preset — set for an average desktop, not an M5.
- An A15 iPhone's ~13 ms, or 16 with margin — misses the older iPhones and every
  mid-range Android.
- A mid-range Android's ~29 ms — no device here to keep the number honest.

## D-132 — The estimate is never the tallest note alone (2026-10-13)

Superseded in part by D-135: a note measured alone no longer sets the estimate.

**Decision:** D-092's 0.9 quantile is taken below the tallest note measured at
the layout, unless it is the only one.

**Why:** under 20 notes measured, `floor(0.9 n)` is the tallest or next to it. A
10,000-line note among the first measured had every unmeasured note reserve its
235,612px: a jump past it landed 1.6 million px down until the next rest. With
more notes measured, nothing changes.

**Rejected:**

- A cap at a multiple of the median — a constant fitted to no vault, and with
  two notes measured the median is half the outlier.
- A cap in panes — a vault of long notes would come out short everywhere, what
  D-092 rejected the upper quartile for.

## D-133 — A frontmatter change draws only the properties again (2026-10-14)

**Decision:** a save that changes a note's frontmatter redraws its properties
box and updates its body in place (ADR 0019); on mobile, a note holding a Base
still renders whole.

**Why:** rendered whole, a long note lost the elements the anchor holds the
reader by: on the iPhone, a reader at a 5,000-line note's end saw 10 blank
frames and the text moved 125 px for good. No section's render reads the
frontmatter; a Base's formulas may, through `this`.

**Rejected:**

- Anchoring a whole render by the reader's distance from the note's end — wrong
  for an edit below the reader, and the blank frames stay.

## D-134 — A drawn note's runs keep their sections (2026-10-14)

**Decision:** once a note is drawn, each run (ADR 0021) keeps the sections it
started with; a save swaps sections inside their run, and shows only the runs
holding what it removes and those either side of what it inserts.

**Why:** grouped by length afresh, a save that lengthened one section regrouped
every run above it, so a save showed every run first: on the iPhone, one 140–590
ms task per save to a 5,000–10,000-line note, wherever the edit.

**Rejected:**

- Regrouping, then showing each hidden run the new grouping splits — a save that
  moves one run's edge still shows every run above it.

## D-135 — A note's estimate is capped at its size, at the densest rate measured (2026-10-14)

**Decision:** a note never measured at the layout reserves the lesser of D-092's
quantile and its file's bytes × the most pixels per byte any note measured
there, the latter never below what a note reserves before anything is measured
(two panes).

**Why:** D-132 still let the first note measured set every estimate. Heights
forgotten, a jump to a 10,000-line note had each note below reserve its
234,000px; a glide down outran the drawing through that empty space, and sprang
back as the notes drew short. Too tall is not safe below the reader. The densest
rate errs tall, as a Base, tall from few bytes, loosens the cap; the floor keeps
a note of a few bytes, all title and frame, from coming out short.

**Rejected:**

- No estimate until ten notes are measured — two long notes among them, and the
  quantile is long again.
- The median rate — a note denser than it, as any Base is, comes out short.
- The shortest note measured as the floor — measured alone, the long note is the
  shortest.

## D-136 — A section's collapse key names the heading above it (2026-10-14)

**Decision:** a heading or nested list item is keyed as `{heading}/{own key}`,
`{heading}` the slug of the nearest heading above that outranks it (`h1` over
`h2`), or of any level for a list item; one above every heading keeps the bare
key. Repeats are numbered among the same full key.

**Why:** repeats were numbered across the note, so deleting the first `Errands`
handed its saved state to the next, under another heading. Only repeats beside
each other now shift. The cost: renaming a heading reopens the sections folded
directly under it; renamed back within a day, they fold again (D-027).

**Rejected:**

- The full heading path — renaming a top heading would reopen every section
  beneath it.
- Migrating saved keys — unpublished before `1.0.0`; a section saved under a
  heading reopens once.

## D-137 — A note window's flags stay apart, and `FarRuns` stays the collapser's (2026-10-14)

**Decision:** `NoteWindow` keeps `component`, `rendering`, `unloadWanted`,
`is-far` and the `leaving` set as separate fields; `CollapsibleManager` makes
`FarRuns`, and the renderer and the window reach it through the renderer.

**Why:** the flags are three axes that combine — what is drawn, whether it is
out of the layout, whether an unload waits — so a note updating in place can be
hidden and leaving at once. Threading `FarRuns` from `StreamView` would add a
parameter to two constructors to drop one getter.

**Rejected:**

- One state enum per window — it would list every combination of the three.
- `StreamView` making `FarRuns` — longer constructors for one getter less.

## D-138 — Every rendered note on mobile watches for tables drawn later (2026-10-15)

**Decision:** `stackWideTables` gives each rendered note on mobile its own
MutationObserver, table or not.

**Why:** tables arrive after the render in three ways: Dataview's, embeds
loading, and sections a save draws in place (ADR 0019), which nothing else
stacks. A note with no table yet gets one as it is typed.

**Rejected:**

- Watching only notes with a table or a Dataview block — a table typed into
  today's note would scroll sideways.
- One observer for the stream — the same work per mutation, a few objects fewer.

## D-139 — A far run stays watched at both edges (2026-10-15)

**Decision:** `FarRunWatch` watches the first and last element of every run
shown.

**Why:** measured on an iPhone 16 Pro, flicking past a 10,000-line note both
ways: at most 10 edges are watched at once. One edge a run saves four targets,
with no frame time to gain.

**Rejected:**

- The next run's first element standing for a run's end — a run shown while the
  next stays hidden (a search step, a save) has no end watched.

## D-140 — A glide stops at the stream's drawn end once every note is loaded (2026-10-15)

**Decision:** `ScrollAnchor` stops a glide two steps before the stream's end,
drawn higher than its scroll, comes into the pane, as it stops one at the top,
only once every note is loaded.

**Why:** a shift owed for notes above that grew draws the end early: an iPhone
glide to the oldest note showed a blank pane for 1.8 s, until the scroll was
still.

**Rejected:**

- Stopping while notes still load — a batch appended below would let the glide
  go on.
- Capping the shift at the room below every frame — the reader's text moves
  mid-glide.

## D-141 — Mutation testing runs on demand, incrementally (2026-10-15)

**Decision:** `pnpm run test:mutation` runs Stryker over `src/` with workers for
30% of the cores, which take about 40% of the machine, rerunning only mutants
whose code changed. Its results and report stay in `reports/`, gitignored. Not a
quality gate. Stryker cannot see which file a vitest test is in, so it misses a
test change: after one, rerun only the source file it covers,
`--force --mutate <file>`. A full run, a bare `--force`, only after a change to
Stryker, vitest or the Stryker config, which can change every result. Bail is
off: with it, mutants that fail tests at once were reported as survived, a
different few each run. A survivor the JSON report marks `static` may be false:
one in `note-window.ts` failed its test when applied by hand.

**Why:** 100% line coverage says what ran, not what was checked: the first run
left 657 of 5,477 mutants alive (87.9%). A full run takes ~13 minutes on 8
workers and keeps the fans at full speed.

**Rejected:**

- A gate on every task — too slow, and many survivors are equivalent mutants.
- All cores but one, the default — the laptop runs hot for little gain.
- Half the cores — a worker takes more than a core: 5 took 6 of 10, fans at full
  speed.
- Efficiency cores only (`taskpolicy -b`) — cool, but the aim is cores left
  free, not which ones.
- Committing the results — ~10 MB rewritten each run, for one machine and no CI.
  Stryker's own repo fetches them from its dashboard instead.

## D-142 — The phone specs open the stream afresh (2026-10-15)

**Decision:** `phone.openStream()` closes the stream and opens it again, at its
top, as a reader reopens it.

**Why:** it wrote the scroll to the top of the stream left open, as nothing in
the app does. The anchor still held a place from below: over a long newest note,
the stream drew it from its end and landed some 250,000 px down.

**Rejected:**

- The app's scroll to the top, a title tap's glide — notes drawn on the way
  changed what three specs started from.
- A jump to the newest note — it lands its title at the pane's top, 8 px below
  the stream's: specs comparing with a title tap's top differ.

## D-143 — A glide up owing growth stops before its scroll runs out (2026-10-15)

**Decision:** `ScrollAnchor` stops a glide up two steps before its scroll runs
out while the stream is drawn higher than its scroll, writing what it owes, as
D-140 does at the end. Not a scroll headed for the top, as a title tap's: it
lands there, owing nothing.

**Why:** notes above that grew mid-glide left the stream's top above the pane at
scroll 0: the glide bounced short of the newest note's top, and a pull on the
bounce opened Obsidian's pull-down action, the command palette, over the stream.

**Rejected:**

- The hand-over once the bounce ends — the bounce, and the pull on it, come
  first.
- Writing what is owed mid-glide, for the glide to reach the top — iOS undoes it
  ([ADR 0013](adr/0013-pin-rendered-note-heights.md)).

## D-144 — The phone harness patches Appium to one console listener (2026-10-15)

**Decision:** setup rewrites the XCUITest driver's `context.js` to stop its
console listeners before it starts one (`e2e/ios/console-listener.ts`).

**Why:** the driver adds a listener on every switch into the web view and never
removes one. After N switches each message is logged N times into a buffer of
5,000: a full run lost a test's error before the test read it. Probed: 300
switches and 30 lines after an error lost it; patched, it was caught.

**Rejected:**

- Collecting errors in the page (`error`, `unhandledrejection`, `console.error`)
  — misses what WebKit logs itself, and errors before a reload installs it.
- Reading the log after every switch — still lossy within one long call.
- A fresh session per spec file — caps the copies per file, not per test: a long
  file can still lose one.
