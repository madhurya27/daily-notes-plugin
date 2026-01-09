# Testing Procedure: Daily Notes Stream Plugin

Follow these steps to verify the plugin is working correctly in a development or test environment.

## 1. Test Environment Setup
- Ensure you have an Obsidian vault available for testing (e.g., `PluginTest`).
- In the test vault:
    - Enable the **Daily Notes** core plugin.
    - Set a specific **New file location** (e.g., `Notes`).
    - Create at least 11 daily notes with filenames matching your date format (default: `YYYY-MM-DD`) to test infinite scroll (batch size is 10).
    - **Add Frontmatter**: Ensure some notes have frontmatter properties (tags, aliases, custom fields) to test the properties display.

## 2. Deployment
- Run the build command in the project root:
  ```bash
  npm run build
  ```
- Copy the distribution files to your test vault:
  ```bash
  mkdir -p <vault_path>/.obsidian/plugins/daily-notes-stream
  cp main.js manifest.json styles.css <vault_path>/.obsidian/plugins/daily-notes-stream/
  ```

## 3. Verification Steps

### Core Functionality
1. **Plugin Activation**:
   - Open Obsidian settings -> Community Plugins.
   - Enable **Daily Notes Stream**.
2. **View Opening**:
   - Click the "calendar-days" ribbon icon OR
   - Run the command `Open Daily Notes Stream` from the Command Palette.
3. **Data Integrity**:
   - Verify notes are displayed in descending chronological order (newest at the top).
   - Check that headers show the correct date/filename.
   - Click a header to ensure it opens the original file.
4. **Infinite Scroll**:
   - Scroll to the bottom of the view.
   - Verify that more notes are loaded automatically when the sentinel is reached.
   - **Fix Verification**: Ensure the first batch of notes does not duplicate upon initial load.

### Properties Display
1. **Enable Properties**:
   - Go to **Settings > Daily Notes Stream**.
   - Toggle **Show Note Properties** to **ON**.
   - Reload the view.
2. **Visual Check**:
   - Verify a "Properties" header appears above the content for notes with frontmatter.
   - Verify icons are displayed next to property names (e.g., calendar for dates, hash for tags).
   - Verify alignment matches Obsidian's native style.
3. **Interactivity**:
   - Click the "Properties" header. It should toggle (collapse/expand) the list of properties.
   - Verify the chevron icon rotates correctly.
4. **Default Collapse State**:
   - Go to **Settings**.
   - Toggle **Collapse Properties by Default** to **ON**.
   - Close and reopen the view.
   - Verify that properties are initially hidden and must be clicked to reveal.

### Rendering & Mobile
1. **Content**:
   - Ensure images, links, and formatting render correctly within the stream.
   - Ensure frontmatter is **not** duplicated in the body text (it should be stripped).
2. **Mobile**:
   - Use Obsidian's mobile app or emulator to verify the responsive layout and touch scrolling.

## 4. Debugging
- Open the Developer Console (`Ctrl+Shift+I` or `Cmd+Opt+I`).
- Look for logs prefixed with `DailyNotesStreamView:` or `DailyNoteService:`.
- Check for "No daily notes found" messages if the view is empty.