# Daily notes stream

Read your daily notes like a journal: every day on one page, newest at the top,
older days as you scroll. The stream is for reading; click a note's date to open
it for editing.

It works with the daily notes you already have: no new folder, format or
template to set up, and it never changes a note.

<p><img src="docs/images/demo-desktop.webp" alt="Recording on desktop: the newest note, open in a split, is edited and the stream beside it updates as the words are typed; the stream then scrolls through older days, a search steps through notes mentioning Mara, a jump goes to an older date, and the command palette scrolls it back to the top" width="800"></p>

## Features

- **One stream.** Every daily note, newest first, including notes in nested
  folders like `2025/03/2025-03-04.md`.
- **Always current.** New, edited, renamed and deleted notes show up straight
  away.
- **[Search](#search).** Find text across every note with Ctrl/Cmd+F.
- **[Jump to a date](#move-around).** Pick any day that has a note.
- **[Fold sections](#fold-sections).** Collapse any heading or nested list.
- **Properties.** Each note's properties show at its top; hide or collapse them
  in [settings](#settings).
- **[Linked mentions](#linked-mentions).** Each note ends with the notes that
  link to it; hide or collapse them in [settings](#settings).
- **[Full notes](#open-the-stream).** Images, embeds, links, tasks and Bases,
  shown just as Obsidian shows them.
- **[Phone and tablet](#phone-and-tablet).** Tables and Bases too wide for the
  screen become cards.

## Before you install

| Question                  | Answer                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which notes does it show? | The notes named by the date format in **Settings → Daily notes**, in that folder and its subfolders. With Periodic Notes' daily notes on, its settings instead. |
| Can I edit in the stream? | No. Click a note's date to open it; the stream updates as you write.                                                                                            |
| Does it change my notes?  | Never. It only reads them.                                                                                                                                      |
| What does it store?       | Its settings, in the plugin folder. Folded sections and note heights, on each device.                                                                           |
| Does it go online?        | No. Only an embed you put in a note, such as a video, loads from the web.                                                                                       |
| Years of notes?           | Fine: only the notes near the screen are drawn.                                                                                                                 |
| Which devices?            | Desktop and mobile, Obsidian 1.14.4 or later.                                                                                                                   |
| Other plugins?            | Notes show as Obsidian shows them, Dataview tables and Bases included. Templates and Templater templates work with [Empty notes](#empty-notes).                 |

Want to edit notes inside the feed? This plugin won't do that;
[Daily Notes Editor](https://github.com/Quorafind/Obsidian-Daily-Notes-Editor)
does.

## Install

1. From the
   [latest release](https://github.com/madhurya27/daily-notes-plugin/releases/latest),
   download `main.js`, `manifest.json` and `styles.css`.
2. Put them in `<Vault>/.obsidian/plugins/daily-notes-stream/`. Create the
   folder if it doesn't exist; `.obsidian` is hidden in most file browsers.
3. Reload Obsidian.
4. Enable **Daily notes stream** in **Settings → Community plugins**.

On a phone or tablet, install it on a computer and let your sync carry the
plugin folder to the device, then enable it there.

To build from source instead: `pnpm run build`, then copy the same three files
to the same folder.

## Use

### Open the stream

Click the ribbon icon (a stack of cards), or run
`Daily notes stream: Open stream` from the command palette (Ctrl/Cmd+P). It
opens in the current tab; Ctrl/Cmd-click the icon to open it in a new tab.

Each note looks just as it does in Obsidian: properties, images, embeds, links,
tasks and Bases.

<img src="docs/images/bases-desktop.png" alt="A weekly review embedding a reading-list Base" width="440">

### Empty notes

A daily note that holds only your daily-notes template, or nothing, is left out
of the stream. Once you write in it, or change one of its properties, it
appears. Today's note always shows, and so does one another note links to, for
its linked mentions. A note made from an older version of the template counts as
written.

Templates made with the core Templates plugin or with Templater both work. A
Templater command that writes several lines, such as `tp.file.include`, or picks
between sections, can't be predicted, so a note made from that template shows
even before you write in it.

### Move around

| To                    | Do                                                                             |
| --------------------- | ------------------------------------------------------------------------------ |
| Load older notes      | Scroll down                                                                    |
| Go back to the newest | Run `Daily notes stream: Scroll to top`, or on mobile tap the title at the top |
| Go to a date          | Click the calendar icon at the top, or run `Daily notes stream: Jump to date`  |

The list shows the days that have a note. Type a date in your daily-note format
or as `YYYY-MM-DD`. If that day has no note, you go to the closest earlier one.
The calendar button in the list opens your device's date picker.

<img src="docs/images/jump-desktop.png" alt="The jump-to-date prompt listing the vault's dates" width="440">

### Search

Press Ctrl/Cmd+F, or click the search icon at the top. If you changed Obsidian's
"Search current file" shortcut, use yours.

| Key         | Action                 |
| ----------- | ---------------------- |
| Enter       | Next matching note     |
| Shift+Enter | Previous matching note |
| Escape      | Close search           |

Search finds each note's own text: what a Base, an embedded note or linked
mentions show belongs to other notes, and is left out. It opens collapsed
sections to show a match. If the counter reads `2 / 5 · hidden`, the note
matched in a part that isn't shown, such as hidden properties or an embed.

<img src="docs/images/search-desktop.png" alt="The search bar stepping through notes that mention Mara" width="440">

### Fold sections

Click the arrow beside a heading or nested list to fold it. The stream remembers
what you folded.

<img src="docs/images/collapse-desktop.png" alt="A note with every section folded to its heading" width="440">

### Linked mentions

Each note ends with a list of the notes that link to it, quoting the lines
around each link.

<img src="docs/images/mentions-desktop.png" alt="A note's linked mentions: a project note and a project log, each quoting the line that links to it" width="440">

### Open notes and links

The date at the top of each note, links inside notes, and the notes and links in
linked mentions open like any link in Obsidian:

| Gesture                        | Opens                                           |
| ------------------------------ | ----------------------------------------------- |
| Click                          | In the stream's tab; Back returns to the stream |
| Ctrl/Cmd-click or middle-click | In a new tab                                    |
| Ctrl/Cmd+Alt-click             | Side by side, in a split                        |
| Right-click                    | The file menu                                   |

Click a tag to search for it; Ctrl/Cmd-click to search in a new tab. Hold
Ctrl/Cmd while hovering over a link to preview it. To preview without holding
the key, open **Settings → Page preview** and turn off the switch for "Daily
notes stream".

### Phone and tablet

On a phone or tablet, nothing inside a note scrolls on its own, so one swipe
moves the whole stream. Content that would need its own scrolling is reshaped
instead:

| Content                      | Becomes                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Table                        | A card per row, each value under its column's name                                  |
| Base                         | Narrower columns; if that isn't enough, a card per note, using Bases' own card view |
| Kanban Base                  | Cards, each column a group                                                          |
| Equation                     | Smaller, to fit the width                                                           |
| Code block                   | Long lines wrap                                                                     |
| Diagram                      | Smaller, to fit the width (on desktop too)                                          |
| Embedded note                | Shown in full, not in a box of its own that scrolls                                 |
| Any other embed that scrolls | Cut off at its edge                                                                 |

On desktop, wide tables and code blocks scroll sideways in their own box, as
they do in Obsidian.

<p><img src="docs/images/demo-phone.webp" alt="Recording on an iPhone: flicks glide down through older days; a search for Mara is typed and stepped through; a jump goes to an older date; and a tap on the title glides back to the newest note" width="300"></p>

<details>
<summary>Phone layout</summary>

<p><img src="docs/images/stream-phone.png" alt="The stream in Obsidian's phone layout" width="150"> <img src="docs/images/search-phone.png" alt="Search in the phone layout" width="150"> <img src="docs/images/jump-phone.png" alt="Jump to date in the phone layout" width="150"> <img src="docs/images/collapse-phone.png" alt="Collapsed sections in the phone layout" width="150"> <img src="docs/images/mentions-phone.png" alt="Linked mentions in the phone layout" width="150"> <img src="docs/images/bases-phone.png" alt="A Base drawn as cards in the phone layout" width="150"> <img src="docs/images/stream-dark-phone.png" alt="The stream in the dark theme, phone layout" width="150"></p>

</details>

## Settings

- **Hide empty notes** (on): leave out daily notes you never wrote in. See
  [Empty notes](#empty-notes).
- **Properties**
    - **Show note properties** (on): show or hide each note's properties.
    - **Collapse properties by default** (off): start with the properties
      folded.
- **Linked mentions**
    - **Show linked mentions** (on): show or hide the notes linking to each
      note.
    - **Collapse linked mentions by default** (off): start with them folded.

A section's collapse toggle is listed only while the section is shown.

The stream follows Obsidian's theme, light or dark.

<img src="docs/images/stream-dark-desktop.png" alt="The stream in Obsidian's dark theme" width="440">

## Troubleshooting

| You see                                      | Do                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| "No daily notes found"                       | Check the folder and date format in **Settings → Daily notes** match your notes' names and location. |
| "Every daily note is hidden"                 | Each note holds only its template. Write in one, or turn off **Hide empty notes**.                   |
| A note you expected is missing               | It holds only the template ([Empty notes](#empty-notes)), or its name doesn't match the date format. |
| The plugin isn't listed in Community plugins | Check the three files sit directly in `daily-notes-stream/`, not in a subfolder, then reload.        |

## Development

```bash
pnpm install && pnpm test && pnpm run lint && pnpm run build
```

## License

MIT
