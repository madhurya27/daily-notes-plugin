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

**Decision:** the heading is a sibling above `.metadata-content` and is laid out
as a content heading — the same negative margin, padding and chevron offset, so
"Properties" starts where `## Morning` does. Obsidian's own rules do the rest:
the chevron hidden until the row is hovered, and the row toggling on click.

**Why:** the reader sees one column of headings down the note, and the chevrons
one column beside it. Obsidian's own offsets assume the margin its editor pane
keeps clear and its own icon size; kept, they set the panel a step in from the
note and its chevron a hair from the word.

**Rejected:** a gutter of its own (`margin-left: var(--size-4-6)`) — it lands
Obsidian's geometry inside the note, but indents the panel past every heading
around it.

**Rejected:** chevron-only here, for consistency with headings and list items —
it needs the chevron forced visible, a control Obsidian deliberately hides.

**Rejected:** Obsidian's own chevron offsets (`-22px`, 6px of padding) — they
assume its icon size, and the stream's wider icon then all but touched the word
beside it.

**Rejected:** matching the rows' left edge with the heading's box rather than
its word — the box bleeds left into the chevron's margin, as a content
heading's does.

**Rejected:** `tabindex="0"` on the heading, for keyboard reach — Obsidian rings
the heading on `:focus`, so a click left that ring drawn around the row. The
chevron carries focus instead, and reveals itself on `:focus-visible`.

**Rejected:** the heading inside the box — it then reads as one more property
row, and Obsidian puts it above.

**Rejected:** collapsing the property rows alone — the box around them, its
padding and the heading's own line box stayed behind as an empty slab. Collapsed
now hides `.metadata-content` outright.

**Rejected:** padding on `.metadata-container` — Obsidian bleeds the box inside
it evenly past its edges, so padding shifts the box instead of its rows, hanging
it off the right of the note.

**Rejected:** indenting every note block to share one gutter — 24px of width
lost on a phone, for a panel that is off by default.
