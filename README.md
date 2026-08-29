# Daily Notes Stream

A read-only, infinite-scroll feed of all your Obsidian Daily Notes, newest first.

## Features

- Continuous stream sorted newest-first with infinite scroll (batch 10)
- Live updates — new/modified/renamed/deleted notes reflect instantly
- Collapsible headers (H1–H6) and nested lists
- Frontmatter properties panel (toggleable, collapsible, native-styled)
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
- Click a date header to open the original file.
- **Settings**: toggle note properties display and default collapse state.

## Development

```bash
pnpm install && pnpm test && pnpm run lint && pnpm run build
```

## License

MIT
