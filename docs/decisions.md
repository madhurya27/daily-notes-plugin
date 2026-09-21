# Decisions

Smaller design decisions. Anything whose reversal means migrating data or
rewriting across layers belongs in [`adr/`](adr/) instead.

## 2026-09-15 — The stream reloads on the vault's "raw" config event

**Decision:** watch the undeclared `vault.on("raw")` event, filtered to
`vault.configDir`, and rebuild the cache when Obsidian's daily-note format or
folder actually changed. Isolated in `src/obsidianInternals.ts`.

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
tag colours. A scalar `tags: a, b` splits on commas, as Obsidian's own panel
shows it.

**Why:** the panel restates no styling of its own ([ADR 0002](adr/0002-real-obsidian-e2e.md)
measures it against Obsidian's); matching the markup was enough to get pills,
and a comma-joined string was the one place it looked unlike the rest of the app.

One rule is the stream's own: Obsidian pads the near side of a pill's word and
leaves the far side to the remove button's margin, so without that button the
last letter sat on the border.

**Rejected:** styling the rest of a pill in `styles.css` — every other rule is
already in Obsidian's stylesheet, and restating one is a chance to drift from it.


## 2026-09-21 — More air around the note separator

**Decision:** the rule between notes gets 4rem above and below it
(`--size-4-16`), up from 3rem.

**Why:** at 3rem the rule sat closer to the note it closes than a reader needs,
and the stream read as a stack rather than a sequence of days. 4rem is the
widest spacing that still fits two notes on a phone screen.

**Rejected:** dropping the rule and separating on whitespace alone — the accent
date heading is a strong enough boundary on short notes, but the rule is what
carries a note that ends mid-thought.

**Rejected:** an asymmetric 4rem/6rem, which reads better on the desktop by
tying the rule to the note above it — on a phone the 6rem gap pushes the next
note under the floating navbar, and fixing that means a second number to keep
in sync for a desktop-only gain.

**Rejected:** a sticky date header, which answers "which day am I in?" on a note
longer than a screen. Sticky offsets resolve against the scrollport, and both
layouts pad it — the header pins a rem low on the desktop and mid-air on mobile,
so it needs a per-layout offset read off Obsidian's own chrome.
