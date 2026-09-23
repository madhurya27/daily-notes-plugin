# Decisions

Smaller design decisions. Anything whose reversal means migrating data or
rewriting across layers belongs in [`adr/`](adr/) instead.

## 2026-09-22 — The stream does not create notes

**Decision:** no "create today's note" action in the view.

**Why:** core Daily Notes already creates it from its ribbon icon and command;
a read-only stream missing today is showing the vault as it is.

**Rejected:** a create button above the stream when today is missing — a
duplicate of core, plus state to keep in sync across create, delete and
midnight.

## 2026-09-22 — The obsidian mock hands tests the real moment

**Decision:** `tests/mocks/obsidian.ts` re-exports moment, a devDependency, in
place of the hand-written stand-in. `depend/ban-dependencies` allows it for
`package.json` only.

**Why:** the stand-in ignored the format argument and understood ISO alone, so
every test of a vault dated `DD-MM-YYYY` passed while the plugin failed. The
bundle is unaffected: `obsidian` is external, and the app supplies moment.

**Rejected:** teaching the stand-in each format — reimplementing moment to test
code that calls moment.

## 2026-09-22 — The jump prompt suggests the dates the vault has

**Decision:** a `SuggestModal` over every note's date, written and matched in
the vault's own daily-note format, with `YYYY-MM-DD` as a second haystack. A
query that parses as a date no note carries is offered as one entry that says
it will land on the nearest older note. A calendar button hands the query to
the platform's date wheel through `showPicker()`, and is left out where that is
unavailable.

**Why:** a date field accepts days the vault has nothing for, so the nearest-
older fallback happened silently and the reader could not tell a jump from a
miss. Suggesting the real dates makes the common case a pick, and leaves the
fallback something chosen. The format is read per vault because filenames are:
a `DD-MM-YYYY` reader should not be offered ISO.

**Rejected:** a date field with the fallback left silent — what this replaces.

**Rejected:** `prepareFuzzySearch` — fuzzy over digits matches far too loosely.

**Rejected:** keeping the date field on mobile behind `Platform.isMobile` — two
paths to hold in step before the mobile pass has said either is needed.

## 2026-09-22 — Property icons come from Obsidian's type manager

**Decision:** `getPropertyIcon` takes the icon off the widget
`metadataTypeManager.getTypeInfo(key, value)` resolves; the key-name map is the
fallback when the internal goes.

**Why:** Obsidian draws the icon for the property's *type*, assigned or
inferred, so a name guess disagreed with the note's own panel everywhere but
tags — `aliases` is an arrow, text is `lucide-text`, not `file-text`.

**Rejected:** a type→icon table of our own — Obsidian's registry ships new types.

## 2026-09-22 — A jump lands on the nearest older note

**Decision:** `jumpToDate` loads batches until the target is in the stream,
then scrolls to it. No note that day lands on the newest one before it; nothing
that old raises a notice and moves nothing.

**Why:** a continuous feed has to leave the reader somewhere real, and the
common case is a half-remembered date. Batches are cheap under
[ADR 0006](adr/0006-unload-off-screen-notes.md): what is passed over stays
placeholders. The suggester above makes the fallback visible before it happens;
this stays the behaviour behind it.

**Rejected:** an error rather than the older note.

**Rejected:** rendering only the target — breaks the `state.notes` / `_sorted`
pagination invariant.

## 2026-09-22 — The jump re-applies its scroll until the stream stops rendering

**Decision:** up to eight passes, ending when the target is at the top of the
pane *and* `NoteWindowManager.layoutChanges` held still across the pass — or
when a scroll moves nothing and nothing changed since the last pass. Search
centres a match the same way (`scrollIntoPlace`).

**Why:** a note above it outgrows its placeholder estimate and pushes it down.
One `scrollIntoView` left the target 1600–1850px short in e2e, desktop and
mobile. The jump-sized answer to the `scrollTop`-correction item in
[`TODO.md`](TODO.md), which stays open for scrolling in general.

**Rejected:** stopping once the target stops moving — it is at the top the
instant it is scrolled to, and the renders that displace it land after.
Waiting a frame on a stuck scroll — the hidden e2e phone window draws none
when nothing changed, and the search hung on it.

## 2026-09-15 — The stream reloads on the vault's "raw" config event

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

## 2026-09-15 — Editing is an action on the note, not an editor in the stream

**Decision:** the stream stays read-only. Editing is a per-note action — open
the file in a split, or append to today's note.

**Why:** live updates, collapsing and the e2e suite all follow from rendering
the Markdown ourselves.

**Rejected:** inline editors per note, as
[Daily Notes Editor](https://github.com/Quorafind/Obsidian-Daily-Notes-Editor)
does — four prototype patches, and why its view cannot react to vault events.

**Rejected:** no edit affordance at all — a spotted typo has nowhere to go.

## 2026-09-20 — A placeholder's height is a CSS custom property

**Decision:** `NoteWindowManager` sets `--daily-note-placeholder-height` on an
unloaded block; `styles.css` decides what to do with it. The compliance rule
against styling from JavaScript now allows `style.setProperty("--…")` and
nothing else.

**Why:** the height is whatever the note measured before it was unloaded, so no
class can carry it, and the rule is worth keeping for everything else.

**Rejected:** assigning `style.height` directly — the same inline style, minus
the one place a reader can see which declaration uses it.

**Rejected:** a fixed placeholder height for every note — the scrollbar jumps
by the difference the moment a note renders.

## 2026-09-21 — Task checkboxes are inert

**Decision:** `pointer-events: none` on a rendered task's checkbox. It shows
the file's state and refuses the click.

**Why:** `MarkdownRenderer.render` emits a real `<input>`, which the browser
toggles; only Obsidian's own reading view writes that back. Here the tick lives
in the DOM alone, and unloading or a re-render silently reverts it.

**Rejected:** writing the toggle back to the file — the stream is read-only,
and mapping a rendered element to its source line is a feature of its own.

## 2026-09-21 — The stream repeats the checkbox nudge reading view applies

**Decision:** `top: 0.2em` on a task checkbox in `styles.css`, the value
`.markdown-preview-view` sets.

**Why:** the stream renders under `markdown-rendered` alone, so the preview
pane's own layer never lands and the box sits 3px above its label.

**Rejected:** adding `markdown-preview-view` to the content element — it brings
the whole pane stylesheet, padding and line width included.

## 2026-09-21 — A list chevron spans the line box, offset by the list padding

**Decision:** the indicator takes `height: calc(var(--line-height-normal) * 1em)`
at `top: var(--list-spacing)`, as reading view does, rather than a 16px box
centred by hand.

**Why:** a line box and its text share a centre, so centring on the line box
centres on the words; `top` clears the list item's padding, which absolute
positioning measures from the inside of.

**Rejected:** halving the difference between line height and icon size — it
ignores the padding and lands 1.5px high.

## 2026-09-21 — The properties panel is Obsidian's, headed like a note heading

**Decision:** the panel is Obsidian's own stylesheet, not a copy of it: the
stream renders its classes and adds only what Obsidian cannot give a read-only
panel — the key and value typography its `input` selectors miss, collapsing,
the heading's place among the note's headings, and the read-only affordances.
The heading is a sibling above `.metadata-content`, laid out as a content
heading — the same negative margin, padding and chevron offset — and
collapsing hides the box outright. Obsidian's own rules do the rest: the chevron
hidden until the row is hovered, and the row toggling on click.

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

## 2026-09-21 — The dev loop reloads the plugin over the debugging port

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

## 2026-09-21 — Emulating a device waits for the document the reload brings back

**Decision:** `emulateDevice` stamps the window before calling `emulateMobile`
and waits for a document that no longer carries the stamp.

**Why:** the reload is asynchronous and the old document answers `layoutReady`
until it lands, so waiting on that alone returned while the window was still
mid-switch — it flipped seconds after the script reported the layout it was
leaving.

**Rejected:** waiting on the reload as a navigation — same guarantee, but it
reads as page plumbing rather than as the thing being waited for.

**Rejected:** a second command that switched the open window in place instead
of relaunching — 1.6s against 3s, for one more script to learn and maintain.

## 2026-09-21 — The e2e window is hidden from inside Obsidian

**Decision:** the harness installs `show` and `focus` listeners on the window
through Electron's remote bridge, hiding the app from its own renderer.

**Why:** Obsidian activates itself at first paint, when the vault opens, and on
the `emulateMobile` reload. Hidden and frontmost are separate states, so a run
stole the keyboard for about a second at a time on a one-screen machine.

**Rejected:** the AppleScript watcher this replaces — resolving the process by
unix id blocked 1.3s, long past the first grab; watching the frontmost process
instead answered in 800ms against the guard's 100ms.

**Rejected:** patching a copy of the app bundle with `LSUIElement`, the only way
to catch the first activation — Obsidian opens its debugging port 30ms *after*
it fronts itself, so nothing outside the app can be armed in time. Not worth
copying and re-signing 1GB to save one 150ms blip per launch.

## 2026-09-21 — List properties render as Obsidian's pills

**Decision:** `tags` and other list properties render the `multi-select-pill`
markup, with `data-property-type="tags"` on a tag value so its pills take the
tag colours. A tag pill whose text is no tag name — a scalar `tags: a, b`
included — is `is-invalid`, struck through, and searches nothing, as in
Obsidian's own panel. Only `tags` is typed as tags: Obsidian 1.9.10 dropped
the singular `tag`, and draws it as text.

**Why:** the panel restates no styling of its own ([ADR 0002](adr/0002-real-obsidian-e2e.md)
measures it against Obsidian's); matching the markup was enough to get pills.

One rule is the stream's own: Obsidian pads the near side of a pill's word and
leaves the far side to the remove button's margin, so without that button the
last letter sat on the border.

**Rejected:** styling the rest of a pill in `styles.css` — every other rule is
already in Obsidian's stylesheet, and restating one is a chance to drift from it.
Splitting `tags: a, b` into two pills — Obsidian never splits a scalar, so the
stream would show tags the vault's own panel calls invalid.

## 2026-09-21 — More air around the note separator

**Decision:** 4rem above and below the rule between notes (`--size-4-16`), up
from 3rem.

**Why:** at 3rem the stream read as a stack rather than a sequence of days.
4rem is the widest spacing that still fits two notes on a phone screen.

**Rejected:** whitespace alone — the rule is what carries a note ending
mid-thought.

**Rejected:** 4rem/6rem, better on the desktop — on a phone the 6rem pushes the
next note under the floating navbar.

**Rejected:** a sticky date header — sticky offsets resolve against the padded
scrollport, so it pins low on the desktop and mid-air on mobile, needing an
offset read off Obsidian's own chrome.

## 2026-09-21 — A tag click opens the search pane

**Decision:** clicking a tag in the stream — inline in the note or as a pill in
the properties panel — opens Obsidian's search on `tag:#name`, through the
core global-search plugin reached by id in `src/obsidian-internals.ts`.

**Why:** a tag is a link everywhere else in Obsidian; in the stream it was
inert. No public API exposes the search pane, so the core plugin is reached by
id and a user who disabled it gets nothing rather than an error.

**Rejected:** opening the tag pane, or a filtered stream of our own — neither
is what a tag click does in the rest of the app.

A mod-click opens it in a pane of its own instead, through `Keymap.isModEvent`
— tab, split or window, as everywhere else. The core plugin only drives the
sidebar pane, so a new leaf is given the `search` view and its query set
directly.

## 2026-09-21 — Properties are shown by default

**Decision:** `showProperties` defaults to on; the setting stays.

**Why:** the panel matches Obsidian's own reading view, and a stream of notes
whose frontmatter is invisible reads as though the notes have none.

**Rejected:** dropping the setting — a vault whose dailies carry bookkeeping
frontmatter wants it off.

## 2026-09-22 — e2e runs fully parallel on four workers

**Decision:** `fullyParallel` with `workers: 4`; an auto fixture resets plugin
settings, collapse state and the pointer before every test.

**Why:** 3.7 min → 1.2 min. Each worker already owns its instance and vault;
only state left by earlier tests in the same instance broke under reordering.

**Rejected:** whole-file parallelism — `stream.spec.ts` holds most tests, so
it only reached 2.3 min. More workers — the instances starve for CPU and
timing tests slip.

## 2026-09-23 — Search the stream, counted per note

**Decision:** the vault's "Search current file" hotkey, read from
`hotkeyManager` on open and on each config write (a rebind saves
`hotkeys.json`), opens Obsidian's own find bar above the pane;
a header action does too, for phones. It matches each note's title and source,
frontmatter included, counts notes ("3 / 12"), and steps through the visible
highlights (CSS highlight API) note to note. Typing marks the topmost match on
screen and never scrolls.

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

## 2026-09-23 — Search opens folds, unsaved; labels what it cannot show

**Decision:** stepping onto a match inside a collapsed heading, list item or
properties panel expands it without saving; a re-render folds it again. Typing
never unfolds. A note that matches with nothing drawn (hidden frontmatter, raw
syntax) counts as `3 / 12 · hidden`.

**Why:** Obsidian's reading view does the same; landing on a note and marking
nothing reads as a bug.

**Rejected:**
- Skipping folded matches — the note is counted but shows nothing.
- Saving the expansion — a search would rewrite the reader's layout.

## 2026-09-23 — Kebab-case files, grouped into folders

**Decision:** every `.ts` file in `src/`, `tests/` and `e2e/` is kebab-case;
`src/` groups them into `ui/`, `stream/`, `render/` and `notes/`. Class names
are unchanged. `tests/compliance.test.ts` enforces the case.

**Why:** Obsidian's plugin guidelines ask for folders once there is more than
one `.ts` file, and the official sample plugin and Minimal Settings name files
in kebab-case. A single case needs no judgement to follow, so a test can hold it.

**Rejected:** PascalCase for files exporting a class — nothing can check it,
and it had already drifted. A lint plugin for the rule — the compliance test
already reads every file.

## 2026-09-23 — Tests typecheck against the mocks, typed by the real API

**Decision:** `tests/tsconfig.json` maps `obsidian` to the mock, as vitest's alias
does; the mock borrows its signatures from the real declarations
(`obsidian/obsidian`), so `src/` typechecks against it too. Tests reach privates
by `view["stream"]`, and stand-ins go through `fake<T>` or `asApp`, never `any`.
ESLint runs on `tests/` without the rules that guard the shipped plugin.

**Why:** typed against the mock, a test that calls something the mock lacks
fails before it runs; the real types keep the mock from drifting off the API.

**Rejected:**
- Tests against the real types — the mock-only API (`new TFile(path)`, `Setting.created`)
  would need a cast at every use.
- Turning off `no-explicit-any` for tests — it hid ~600 unchecked accesses.

## 2026-09-23 — The note cache is built from the vault, not `getAllDailyNotes()`

**Decision:** the cache keeps the vault's markdown files whose path round-trips
through the format, as a live create does.

**Why:** `getAllDailyNotes()` keys by date whatever the extension, so
`2024-01-01.png` could evict that day's note, and it admits subfolders a create
rejects. It was also all `initialize()` could throw from.

**Rejected:** filtering its result — an evicted note is already gone.

## 2026-09-23 — Stale collapse state is pruned a day after the note's last write

**Decision:** a successful render forgets saved sections the note no longer
has, once its `mtime` is 24 hours old. The properties key is kept.

**Why:** daily notes are rarely renamed or deleted, so that cleanup never ran.
A day spans retyping a heading; `mtime` needs no timer.

**Rejected:**
- Every render — `## Mee` on the way to `## Meeting` drops its state.
- Expiry by last view — old notes keep valid state for years.
- A size cap — bounds size, not staleness.
- Frontmatter — every toggle rewrites the file.

## 2026-09-23 — Titles and links take Obsidian's link gestures

**Decision:** amends 2026-09-15. Titles and links open as Obsidian's links do:
modifier clicks, file menu, Page preview on hover. One departure: a plain
click focuses a tab already showing the note.

**Why:** Obsidian's reading view replaces its own tab; the stream can't, so
the API alone opens a new tab per click.

**Rejected:**
- A new tab per click — tabs of one note pile up.
- A pencil button per note — the title does it.
- Append to today's note — needs the inline editor 2026-09-15 rejects.
- Rename and delete in the menu — not public API.

## 2026-09-23 — The stream is a navigable view

**Decision:** `navigation = true`. The stream's own clicks still open beside
it; Obsidian's openers (quick switcher, file explorer, the daily-note
command), run from the stream, replace it in its tab, as they do the graph.

**Why:** Obsidian takes a non-navigable view for a sidebar and keeps the last
note active behind it, so the status bar showed that note's word count and
backlinks. Navigable, the stream has no active file, and every per-note item
clears, other plugins' included.

**Rejected:**
- Overriding the leaf's `canNavigate` to keep the stream unreplaceable —
  patches an unsupported method.
- Hiding the core items with CSS while the stream has focus — core class
  names, and other plugins' items stay stale.

## 2026-09-23 — A plain click opens in the stream's tab

**Decision:** amends the two entries above. A plain click on a title or link
replaces the stream in its tab, as a link in the reading view or the graph
does; Back returns to the note the stream was scrolled to. Mod-click keeps the
stream and opens a new tab.

**Why:** the stream is a navigable view, and Obsidian's other navigable views
navigate on click. Keeping it open took a flag flipped around an Obsidian call
that happened to pick its tab synchronously, and a tab-reuse rule the rest of
the app lacks.

**Rejected:**
- Opening beside the stream — the departure above, and its reliance on
  Obsidian's internals.
- Reusing a tab already showing the note — not what Obsidian's links do.
