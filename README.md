# Daily notes stream

Read all your daily notes on one page, newest first. Scroll down for older days. The stream is read-only: to edit
a note, open it.

<p><img src="docs/images/demo-desktop.png" alt="Recording on desktop: the newest note, open in a split, is edited and the stream beside it updates as the words are typed; the stream then scrolls through older days, a search steps through notes mentioning Priya, and it glides back to the top" width="800"></p>

## Features

- **One stream.** Every daily note, newest first, including notes in nested folders like `2025/03/2025-03-04.md`.
- **Always current.** New, edited, renamed and deleted notes show up straight away.
- **Fold sections.** Collapse any heading or nested list.

  <img src="docs/images/collapse-desktop.png" alt="A note with every section folded to its heading" width="440">

- **Linked mentions.** Each note ends with the notes that link to it, quoting the line around each link.
- **Search.** Find text across every note with your usual find hotkey.

  <img src="docs/images/search-desktop.png" alt="The search bar stepping through notes that mention Priya" width="440">

- **Jump to a date.** Pick any day that has a note.

  <img src="docs/images/jump-desktop.png" alt="The jump-to-date prompt listing the vault's dates" width="440">

- **Full notes.** Properties, images, embeds, links, tasks and Bases, drawn as Obsidian draws them.

  <img src="docs/images/bases-desktop.png" alt="A weekly review embedding a reading-list Base" width="440">

- **Your theme.** Light or dark, the stream matches it.

  <img src="docs/images/stream-dark-desktop.png" alt="The stream in Obsidian's dark theme" width="440">

- **Phone and tablet.** Tables and Bases too wide for the screen become cards; wide equations shrink to fit.

<details>
<summary>Phone layout</summary>

<p><img src="docs/images/stream-phone.png" alt="The stream in Obsidian's phone layout" width="150"> <img src="docs/images/search-phone.png" alt="Search in the phone layout" width="150"> <img src="docs/images/jump-phone.png" alt="Jump to date in the phone layout" width="150"> <img src="docs/images/collapse-phone.png" alt="Collapsed sections in the phone layout" width="150"> <img src="docs/images/bases-phone.png" alt="A Base drawn as cards in the phone layout" width="150"> <img src="docs/images/stream-dark-phone.png" alt="The stream in the dark theme, phone layout" width="150"></p>

</details>

## Install

1. Download the latest release and extract it to `<Vault>/.obsidian/plugins/daily-notes-stream/`.
2. Reload Obsidian.
3. Enable **Daily notes stream** in **Settings → Community plugins**.

To build from source instead: `pnpm run build`, then copy `main.js`, `manifest.json` and `styles.css` to the same
folder.

## Use

### Open the stream

Click the ribbon icon (a stack of cards) or run `Daily notes stream: Open stream`. It opens in the current tab;
mod-click the icon for a new tab.

### Move around

| To | Do |
| --- | --- |
| Load older notes | Scroll down |
| Go back to the newest | Run `Daily notes stream: Scroll to top`, or on mobile tap the view's title |
| Go to a date | Click the calendar icon in the header, or run `Daily notes stream: Jump to date` |

The list offers the days that have a note. Type a date in your daily-note format or as `YYYY-MM-DD`; a date with
no note takes you to the nearest older one. The calendar button opens your device's date picker.

### Search

Press Obsidian's "Search current file" hotkey (Mod+F unless you changed it) or click the search icon in the header.

| Key | Action |
| --- | --- |
| Enter | Next matching note |
| Shift+Enter | Previous matching note |
| Escape | Close search |

Search opens collapsed sections to show a match. `· hidden` marks a match you can't see, such as one in the
properties.

### Open notes and links

Date headers, links inside notes, and the notes and links in linked mentions open like any link in Obsidian:

| Gesture | Opens |
| --- | --- |
| Click | In the stream's tab; Back returns to the stream |
| Mod-click or middle-click | In a new tab |
| Mod-Alt-click | In a split |
| Right-click (long-press on mobile) | The file menu |

Click a tag to search for it; mod-click to search in a new pane. Mod-hover a link to preview it. To preview on a
plain hover, open **Settings → Page preview** and turn off "Daily notes stream".

### Settings

- **Show note properties**: show or hide each note's properties.
- **Collapse properties by default**: start with the properties folded.
- **Show linked mentions**: show or hide the notes linking to each note.
- **Collapse linked mentions by default**: start with them folded; folded, they read nothing.

## Development

```bash
pnpm install && pnpm test && pnpm run lint && pnpm run build
```

## License

MIT
