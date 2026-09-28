# Daily notes stream

Read all your daily notes on one page, newest first. Scroll down for older days. The stream is read-only: to edit
a note, open it.

<p><img src="docs/images/demo-desktop.png" alt="Recording on desktop: the newest note, open in a split, is edited and the stream beside it updates as the words are typed; the stream then scrolls through older days, a search steps through notes mentioning Mara, and it glides back to the top" width="800"></p>

## Features

- **One stream.** Every daily note, newest first, including notes in nested folders like `2025/03/2025-03-04.md`.
- **Always current.** New, edited, renamed and deleted notes show up straight away.
- **[Search](#search).** Find text across every note with Ctrl/Cmd+F.
- **[Jump to a date](#move-around).** Pick any day that has a note.
- **[Fold sections](#fold-sections).** Collapse any heading or nested list.
- **[Linked mentions](#linked-mentions).** Each note ends with the notes that link to it.
- **[Full notes](#open-the-stream).** Properties, images, embeds, links, tasks and Bases, shown just as Obsidian
  shows them.
- **[Your theme](#settings).** Light or dark, the stream matches it.
- **[Phone and tablet](#phone-and-tablet).** Tables and Bases too wide for the screen become cards.

## Install

1. Download the [latest release](https://github.com/madhurya27/daily-notes-plugin/releases/latest) and extract it
   to `<Vault>/.obsidian/plugins/daily-notes-stream/`.
2. Reload Obsidian.
3. Enable **Daily notes stream** in **Settings → Community plugins**.

To build from source instead: `pnpm run build`, then copy `main.js`, `manifest.json` and `styles.css` to the same
folder.

## Use

### Open the stream

Click the ribbon icon (a stack of cards), or run `Daily notes stream: Open stream` from the command palette
(Ctrl/Cmd+P). It opens in the current tab; Ctrl/Cmd-click the icon to open it in a new tab.

Each note looks just as it does in Obsidian: properties, images, embeds, links, tasks and Bases.

<img src="docs/images/bases-desktop.png" alt="A weekly review embedding a reading-list Base" width="440">

### Move around

| To | Do |
| --- | --- |
| Load older notes | Scroll down |
| Go back to the newest | Run `Daily notes stream: Scroll to top`, or on mobile tap the title at the top |
| Go to a date | Click the calendar icon at the top, or run `Daily notes stream: Jump to date` |

The list shows the days that have a note. Type a date in your daily-note format or as `YYYY-MM-DD`. If that day
has no note, you go to the closest earlier one. The calendar button in the list opens your device's date picker.

<img src="docs/images/jump-desktop.png" alt="The jump-to-date prompt listing the vault's dates" width="440">

### Search

Press Ctrl/Cmd+F, or click the search icon at the top. If you changed Obsidian's "Search current file" shortcut,
use yours.

| Key | Action |
| --- | --- |
| Enter | Next matching note |
| Shift+Enter | Previous matching note |
| Escape | Close search |

Search opens collapsed sections to show a match. If the counter reads `2 / 5 · hidden`, the note matched in a part
that isn't shown, such as hidden properties or an embed.

<img src="docs/images/search-desktop.png" alt="The search bar stepping through notes that mention Mara" width="440">

### Fold sections

Click the arrow beside a heading or nested list to fold it. The stream remembers what you folded.

<img src="docs/images/collapse-desktop.png" alt="A note with every section folded to its heading" width="440">

### Linked mentions

Each note ends with a list of the notes that link to it, quoting the lines around each link.

<img src="docs/images/mentions-desktop.png" alt="A note's linked mentions: a project note and a project log, each quoting the line that links to it" width="440">

### Open notes and links

The date at the top of each note, links inside notes, and the notes and links in linked mentions open like any
link in Obsidian:

| Gesture | Opens |
| --- | --- |
| Click | In the stream's tab; Back returns to the stream |
| Ctrl/Cmd-click or middle-click | In a new tab |
| Ctrl/Cmd+Alt-click | Side by side, in a split |
| Right-click (long-press on mobile) | The file menu |

Click a tag to search for it; Ctrl/Cmd-click to search in a new tab. Hold Ctrl/Cmd while hovering over a link
to preview it. To preview without holding the key, open **Settings → Page preview** and turn off the switch for
"Daily notes stream".

### Phone and tablet

Tables and Bases too wide for the screen become cards; wide equations shrink to fit.

<details>
<summary>Phone layout</summary>

<p><img src="docs/images/stream-phone.png" alt="The stream in Obsidian's phone layout" width="150"> <img src="docs/images/search-phone.png" alt="Search in the phone layout" width="150"> <img src="docs/images/jump-phone.png" alt="Jump to date in the phone layout" width="150"> <img src="docs/images/collapse-phone.png" alt="Collapsed sections in the phone layout" width="150"> <img src="docs/images/mentions-phone.png" alt="Linked mentions in the phone layout" width="150"> <img src="docs/images/bases-phone.png" alt="A Base drawn as cards in the phone layout" width="150"> <img src="docs/images/stream-dark-phone.png" alt="The stream in the dark theme, phone layout" width="150"></p>

</details>

## Settings

- **Show note properties** (on): show or hide each note's properties.
- **Collapse properties by default** (off): start with the properties folded.
- **Show linked mentions** (on): show or hide the notes linking to each note.
- **Collapse linked mentions by default** (off): start with them folded.

The stream follows Obsidian's theme, light or dark.

<img src="docs/images/stream-dark-desktop.png" alt="The stream in Obsidian's dark theme" width="440">

## Development

```bash
pnpm install && pnpm test && pnpm run lint && pnpm run build
```

## License

MIT
