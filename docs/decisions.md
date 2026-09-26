# Decisions

Smaller design decisions. Anything whose reversal means migrating data or
rewriting across layers belongs in [`adr/`](adr/) instead.

## 2026-09-26 — The stream anchors at the element the pane's top crosses

**Decision:** `ScrollAnchor` keeps the deepest element the pane's top crosses,
picked on each scroll and hand-over, and offsets however far a resize moved it.
It hears resizes of every block and of what a rendered note holds. A re-render
replacing that element falls back to its block. Every re-read first owes what
moved since the last: a note rendering between frames reaches the scroll event
before its resize report. It never descends into anything held: Back's place
is measured against the note's full layout, and text in a note still filling
is not where it will be.

**Why:** a Base filling in the part of a note scrolled past pushed the text down:
the note reached into the pane, so the block rule skipped it. Nothing above the
pane's top is the reader's doing; a chevron tapped on screen changes only what
lies below.

**Rejected:**
- Holding a Base's growth for 300ms — the same move, later, with rows clipped.
- Scanning every block for the anchor — a stream holds thousands; blocks are
  found by halving.

## 2026-09-26 — A note and a Base are held until they settle

**Decision:** a note rendering or re-rendering keeps `min-height` at a height it
measured before — remembered, unloaded at, or shown — until nothing in it has
resized for 300ms, then its height is remembered. A Base redrawn, or shrinking
by itself as Bases refreshes it, is held at the height it showed, by the same
rule. Either lets go after 2s regardless; a note, too, on a touch. A Base's
height is never stored; which Bases were too wide still is.

**Why:** the note's settle wait, added a day after holding whole notes was
rejected, is the signal that rejection lacked. A note held at its own height
covers every late fill — Bases, images, embeds — so per-Base heights, keyed by
note, layout and a digest, were a second cache for one case.

**Rejected:**
- Holding a note at a guessed height — a short note shows a gap until it settles.
- Freezing a Base both ways — new rows would be clipped until it settles.
- Only a note-level hold — a live refresh dips a Base inside a note on screen.

## 2026-09-25 — A note's height is remembered once it settles

**Decision:** a rendered note's height goes into `LayoutMemory` once nothing
in it has resized for 300ms, as a Base's does. An unload reserves what the
note measures then, remembering it only if it had settled.

**Why:** a Base filling or an image loading measures short until done; saved,
that height is next session's placeholder, and the growth an owed scroll.

**Rejected:** saving on scroll stop, Back and refresh — each measured
whatever was on screen, mid-fill included.

## 2026-09-25 — The pane keeps a scroll bar's room while it cannot scroll

**Decision:** the stream's pane sets `scrollbar-gutter: stable`.

**Why:** heights are remembered by the column's width
([ADR 0010](adr/0010-layout-memory.md)). With classic scroll bars (macOS with
a mouse, Windows), a stream opening empty read a width 15px wider than the one
its notes were measured at, and reserved no remembered height.

**Rejected:** leaving the scroll bar out of the layout key — it narrows the
text, so heights measured with and without it differ.

## 2026-09-25 — A build for a phone names itself on load

**Decision:** `pnpm run build:device` bakes the branch, commit and build time
into the bundle as `BUILD_LABEL`; the plugin shows it in a notice on load.
Plain `build`, which releases use, bakes an empty label and shows nothing.

**Why:** iCloud syncs the plugin to the phone late and silently, so a test
could run on the previous build.

**Rejected:** a setting or command showing the version — the manifest version
is the same across every test build.

## 2026-09-25 — Back returns to its place in one scroll

**Decision:** the place kept in Obsidian's history is the note reaching into
the pane and its offset. The rebuilt view's placeholders reserve what
`LayoutMemory` remembers ([ADR 0010](adr/0010-layout-memory.md)). Back scrolls once, before the first frame. The iOS
scroll anchor is then told the place is set, so growth the scroll already
holds, reported a frame late, is not added again. It loads past the place
until the pane can scroll there: a place near the end of what was loaded
otherwise stops short.

**Why:** Back rebuilds the view from scratch. At estimated heights, each
render pushed the place and each correction was drawn: the newest note
flashed on desktop, older ones on a phone.

**Rejected:**
- Hiding the stream until it settles — up to a second blank on a phone.
- Opening titles in a new tab so the stream survives — Back stops returning
  to it.
- Heights carried in the place — superseded by ADR 0010, which keeps them for
  every view and session.
- Note heights alone, without what Bases measured — a Base inside a note
  still draws empty and refills, whatever height its note reserved.
  Superseded 2026-09-26: the note is held until it settles.

## 2026-09-25 — Scroll to top is offered only in the stream

**Decision:** the command is in the palette only while the most recent leaf
holds a stream, and scrolls that stream.

**Why:** a freshly opened stream is already at its top, so opening one first,
as Jump to date does, would do nothing useful.

**Rejected:**
- `getActiveViewOfType` — the tests' mock `ItemView` cannot pass as a `View`,
  whose protected `onOpen` makes the type nominal.

## 2026-09-25 — Tests mirror the folders they test

**Decision:** `tests/` repeats `src/`'s folders; tests of `scripts/` sit in
`tests/scripts/`, checks on root files (README, manifest, styles, release
workflow) in `tests/repo/`. Mocks, setup and the shared fixture stay at the top.

**Why:** 41 files in one folder, beside a `src/` grouped by job.

**Rejected:** tests beside their source — `src/` typechecks against the real
API and `tests/` against the mocks, through separate tsconfigs.

## 2026-09-25 — The stream's icon is a stack of cards

**Decision:** the ribbon icon and the view's tab draw `gallery-vertical-end`.

**Why:** `calendar-days` sat in the ribbon beside core Daily notes' `calendar`
and read as the same action. A stack of cards reads as a feed, and nothing in
the core ribbon resembles it.

**Rejected:**
- `rows-3` — close to Bases' `layout-list`.
- `scroll-text`, `notebook-text`, `book-open-text` — read as one document.

## 2026-09-25 — The stream opens in the current tab

**Decision:** the ribbon icon and `Open stream` open the stream in the current
tab, even when another tab holds one; a mod-click on the icon opens the pane it
asks for. Run from a stream, the command keeps that stream as it was.

**Why:** the graph and canvas do exactly this, measured in the app, so the
stream opens like Obsidian's other views.

**Rejected:**
- Revealing an open stream instead — the graph opens a second one, and each
  view owns its service (CLAUDE.md, Invariants), so a second is safe.
- A new tab every time — tabs pile up; the previous behaviour.

## 2026-09-25 — Release tags are annotated from 1.0.0

**Decision:** from `1.0.0` on, each release is tagged `git tag -a <version> -m
"<version>"`. `0.1.0` and `0.2.0` stay lightweight.

**Why:** annotated tags are the common convention for releases: they record who
tagged and when, and `git describe` and `git push --follow-tags` act on them
alone.

**Rejected:**
- Recreating `0.1.0` and `0.2.0` as annotated — force-pushes tags already
  released.
- Signed tags (`-s`) — no signing key is set up.

## 2026-09-25 — Text beside a block is wrapped in a span

**Decision:** after a note renders, each bare text node sharing its parent with
a block — a list item's words above its sub-list — is wrapped in
`span.daily-note-text-run`, before sections are made collapsible.

**Why:** WebKit paints no CSS highlight on such text, and no layout of the
parent changes that; iOS search marked nothing on list items with children. The
wrap happens once per render, so collapsing, keys (`textContent`) and search
see one DOM from the start — unlike the per-search `<mark>` wrappers rejected
above.

**Rejected:**
- A CSS layout for the item — flow-root, flex, grid, block: WebKit paints none.
- Wrapping on WebKit only — two DOM shapes, and desktop e2e would test the other.
- Wrapping inline elements too — WebKit paints inside them already.

## 2026-09-24 — A tap on the header title glides to the top, on mobile

**Decision:** on mobile, a tap on the view header's title smooth-scrolls the
stream to its top. `ScrollAnchor` is told first, and a glide that arrives at
the top drops what it owes instead of handing it to the scroll.

**Why:** iOS apps scroll to the top on a tap of the title bar. Notes above the
reader render on the way up; handed over, their growth stopped the glide
23,386px short in e2e.

**Rejected:**
- Instant jump — iOS animates it.
- Desktop too — the title there is a label, and nothing hints it is tappable.

## 2026-09-24 — The stream anchors its own scroll where the platform does not

Which change is offset superseded 2026-09-26: whatever moves the element the
pane's top crosses.

**Decision:** in the iOS app, and wherever `CSS.supports("overflow-anchor",
"auto")` is false, `ScrollAnchor` turns native anchoring off, watches every
block's height and offsets the change of any block wholly above the pane: first
as a `transform` on the stream, then, once the scroll is still, as `scrollTop`
in the same frame.

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

## 2026-09-24 — A redrawn Base holds its last height until Bases refills it

Heights superseded 2026-09-26: nothing is kept; a note and a Base are held until they settle.

**Decision:** `NoteBases` keeps the height each Base last laid out at, per note,
layout and a digest of its source, and a redraw holds it as `min-height` until the drawn view
reaches it, or for 2s. A height is kept once nothing in its note has resized for
300ms while unheld, never at unload or before a redraw: a closing view is not
laid out, and a Base left mid-fill keeps the height it had. The
heights, and which Bases were too wide, are kept across sessions in
`LayoutMemory` ([ADR 0010](adr/0010-layout-memory.md)): Back rebuilds the view,
which forgot them. They follow the notes' rule: the 4 layouts used most
recently, a rename carrying them along, a delete taking them. A cap of 500
Bases kept an eighth of a vault whose template embeds one in every note, and
whole `.base` files in the keys ran to kilobytes each.

**Why:** Bases fills a view after it is drawn. A note coming back into view, or
a table redrawn as cards, dropped by the Bases' height for a few frames and
grew back; iOS has no scroll anchoring, so the text jumped and returned.

**Rejected:**
- Holding the whole block until it settles — no signal says when a note is
  done, and only Bases was measured dipping.
- Each Base waiting only on its own resizes — tried: on a phone, notes
  flickered as they scrolled back in.

## 2026-09-24 — The stream takes a note's margins from the theme

**Decision:** the pane is padded with `--file-margins`, and the stream is a
column capped at the line width inside it, as reading view lays out a note.

**Why:** the stream added 20px a side of its own on top of the theme's width,
so under Minimal (88% line width) a phone lost ~43pt a side against ~24pt in
reading view.

**Rejected:** full width on phones — wider than every other note.

## 2026-09-24 — A Base too wide for its note draws as cards, on mobile

**Decision:** on mobile a Base follows the Markdown table rule: cards when its
table is wider than the note, re-checked when the width changes. Desktop draws
Bases as Obsidian does (ADR 0008). Each
`base` block, and each `![[X.base]]` alone on its line, renders into its own
placeholder, so one Base redraws alone. Cards come straight away when the
headers alone overrun the note (Bases' header font and padding, measured once);
otherwise the table draws and is measured on its first layout. A measured
answer is kept per note and layout.

Cards are a view-only copy: Bases saves a block only through an editor, and a
save would write `type: cards` into the file. A copy of an embedded Base
redraws when its file changes. A table-drawn embed stays the real embed, and
its toolbar edits save to the `.base` file, as in reading view.

**Why:** consistency with Markdown tables. Measured cost of a redraw, 7 columns
over a 3–10 year vault: table 100 ms (205–235 at 4× CPU), cards 62–64 ms
(84–104); vault size adds under 30 ms. The estimate skips the table draw in
the common case: many columns on a narrow note.

**Rejected:**
- Cards on any phone (`Platform.isPhone`) — cards even where the table fits.
- Cards on desktop too — desktop has no stall, and a scroll bar keeps the table.
- Taller `rowHeight` rows — the table stays cramped.
- Restyling the table as cards in CSS — Bases positions rows absolutely.
- Re-rendering the whole note on a flip — redraws everything else in it too.
- Drawing every embed as a copy, so no edit saves — inline embeds and Bases in
  callouts would still save, and every copy would need redrawing on change.

## 2026-09-23 — Unloading waits for the scroll to stop

**Decision:** a rendered block that leaves the unload margin waits until the
scroll has been still for `SCROLL_IDLE_MS` (300 ms); one that comes back first
stays rendered.

**Why:** on an iPhone, a third of traced flicks stalled mid-glide while
unloads ran; none did with unloading off. A glide scrolls every frame, so a
pause means it ended.

**Rejected:**
- A wider unload margin — a long scroll crosses any margin; it only delays the stall.
- Exact-height placeholders — unproven as the cause.
- Scrolling an element inside `.view-content` — not needed once unloads wait (phone-tested).

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
it will land on the nearest older note. A calendar icon opens the platform's
date wheel: the date input itself lies unseen over it, since iOS opens its wheel
only for a tap on the input and does nothing on `showPicker()`; a click also
calls `showPicker()`, which desktop needs.

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
are unchanged. `tests/repo/compliance.test.ts` enforces the case.

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

## 2026-09-23 — Views share parsed dates, not the note list

**Decision:** the plugin holds one `ParsedDates`, path → date, tagged with the
daily-notes format. Each view's service builds its own list from it, parsing
only paths it has not seen.

**Why:** a date depends only on the path and the format, so an entry cannot go
stale and nothing needs to watch the vault. A later open at 6× CPU builds in
4 ms instead of 52 (10-year vault, 5,000 other notes).

**Rejected:**
- One plugin-wide list — each view's queue must own its list's changes, or
  pagination breaks (CLAUDE.md, Invariants).
- A plugin-wide list kept current by vault listeners, copied per view — work
  while no stream is open, and state nothing displays.

## 2026-09-25 — A separate demo vault for screenshots

**Decision:** `seed:demo` writes `.dev/demo-vault/`, a realistic journal whose
notes are seeded by their date; `seed` stays the test vault.

**Why:** `seed`'s notes are shaped around edge cases the checklist names, and
photograph as scaffolding. Seeding by date lets a recording be retaken.

**Rejected:**
- Realistic content in `seed` — docs/TESTING.md depends on its shapes.
- Random content per run — every retake would differ.

## 2026-09-25 — The README recording is an animated PNG, built with ImageIO

**Decision:** the e2e harness screencasts the scene; `scripts/frames-to-apng.swift`
encodes the frames with macOS's ImageIO and writes the APNG chunks itself, each
frame only the rectangle that changed.

**Why:** an animated PNG keeps every colour, so text stays crisp, and plays in
GitHub's image tags. ImageIO ships with macOS: nothing to install. Its own APNG
writer stores whole frames — typing a sentence cost 8 MB, changed rectangles 2.5.

**Rejected:**
- GIF — 256 colours rough up anti-aliased text.
- MP4 — GitHub plays only videos uploaded by hand, not ones in the repo.
- ffmpeg or gifski — an install for what the OS already does.

## 2026-09-25 — A note redraws on every save, typing or not

**Decision:** the stream redraws a note on each metadataCache `changed`, even
while someone is typing in it; it catches up save by save, about two seconds
behind the editor.

**Why:** the README promises live updates, and Obsidian's own panes update as
you type. The cost of the extra redraws is unmeasured.

**Rejected:**
- Holding the redraw until typing goes quiet (`editor-change` plus a 2.5 s
  timer) — a minute of steady typing would leave the stream stale for the
  minute. Revisit if redraws are seen to jolt the stream beside an editor.

## 2026-09-26 — The mobile e2e project is an iPhone Pro's screen

**Decision:** the phone viewport is 402 × 874, an iPhone Pro's screen in
points.

**Why:** at the old 420 × 800, Bases fit two cards per row where a phone shows
one, so the README's phone screenshots showed a layout no phone had.

**Rejected:**
- A Pro Max's 440 — fits two cards again, like the old viewport.

## 2026-09-26 — A wide equation shrinks to fit on mobile

**Decision:** on mobile, a display equation wider than its note is zoomed down
to the note's width (`src/render/wide-equations.ts`).

**Why:** the page may not scroll sideways, and nothing in a note may scroll
(ADR 0008). MathJax draws HTML, which CSS cannot scale to fit, so it is measured.

**Rejected:**
- `overflow: clip`, as code blocks do — cuts off the end of the equation.
- Inline math — it sits in a line of text; shrinking it there would change the
  line's text size mid-sentence.
