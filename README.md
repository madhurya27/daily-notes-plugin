# Daily Notes Stream

A read-only, infinite-scroll feed of all your Obsidian Daily Notes, newest first.

## Screenshots

| Desktop | Phone |
| --- | --- |
| <img src="docs/images/stream-desktop.png" alt="The stream on desktop: three dated notes flowing one after another" width="520"> | <img src="docs/images/stream-phone.png" alt="The same stream in Obsidian's phone layout" width="200"> |

## Features

- Continuous stream sorted newest-first with infinite scroll (batch 10)
- Live updates — new/modified/renamed/deleted notes reflect instantly
- Collapsible headers (H1–H6) and nested lists
- Search the whole stream, note by note, with the vault's own find hotkey
- Frontmatter properties panel, shown by default (toggleable, collapsible, native-styled)
- Nested folder support (e.g. `Notes/2025/03/2025-03-04.md`)
- Full Markdown rendering: images, embeds, wikilinks, tasks
- Matches your Obsidian theme via native CSS variables
- Mobile friendly

## Installation

**From release**: extract to `<Vault>/.obsidian/plugins/daily-notes-stream/`.  
**From source**: `pnpm run build`, then copy `main.js`, `manifest.json`, `styles.css` to the same path.

Reload Obsidian and enable **Daily Notes Stream** in **Settings → Community Plugins**.

## Usage

Open via the ribbon icon (calendar-days) or command palette (`Daily Notes Stream: Open stream`).

- Scroll down to load older notes.
- Jump to a date from the calendar action in the view header, or `Daily Notes Stream: Jump to date`. The
  prompt lists the days your vault has a note for, spelled the way your daily-note format spells them, and
  narrows as you type — in that format or in `YYYY-MM-DD`. The calendar button opens your platform's own date
  wheel. A date with no note is still offered, as one entry saying it will land on the nearest older one.
- Search with Obsidian's "Search current file" hotkey or the header's search action. It counts matching notes
  across the whole vault; Enter and Shift+Enter step through them, opening collapsed sections on the way,
  Escape closes. `· hidden` marks a note whose match isn't drawn, such as in frontmatter.
- Click a date header to open the original file; mod-click or middle-click opens it in a new tab, mod-alt-click
  in a split. Right-click it (long-press on mobile) for Obsidian's file menu.
- Click a tag, inline or in the properties panel, to search for it; mod-click opens the search in a new pane.
- **Settings**: toggle note properties display and default collapse state.

## Development

```bash
pnpm install && pnpm test && pnpm run lint && pnpm run build
```

## License

MIT
