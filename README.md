# Daily Notes Stream Plugin

A read-only, infinite-scroll view of all your Daily Notes in Obsidian, displayed chronologically (newest first). This plugin allows you to effortlessly review your past days without manually opening each file.

## Features

- **Stream View**: See your daily notes in a continuous, infinite-scrolling feed.
- **Chronological Order**: Notes are sorted by date, with the most recent at the top.
- **Rich Rendering**: Full support for Markdown, images, embeds, and tasks.
- **Note Properties**: Option to display frontmatter metadata (tags, dates, etc.) for each note.
  - **Collapsible**: Properties section can be toggled open or closed.
  - **Native Styling**: Designed to match Obsidian's native Reading View aesthetics.
- **Mobile Friendly**: optimized for touch and smaller screens.

## Installation

1. Download the latest release from GitHub.
2. Extract the files (`main.js`, `manifest.json`, `styles.css`) into your vault's plugin folder: `<VaultFolder>/.obsidian/plugins/daily-notes-stream/`.
3. Reload Obsidian.
4. Enable "Daily Notes Stream" in Community Plugins settings.

## Usage

1. **Open the Stream**:
   - Click the "calendar-days" icon in the ribbon.
   - Or run the command `Daily Notes Stream: Open Daily Notes Stream` from the Command Palette.
2. **Navigation**:
   - Scroll down to load older notes automatically.
   - Click the date header of any note to open the original file.
3. **Settings**:
   - **Show Note Properties**: Toggle the display of frontmatter metadata.
   - **Collapse Properties by Default**: Choose whether properties start hidden or visible.

## Development

1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run build` to compile.
4. Copy the output files to your test vault.

## License

MIT