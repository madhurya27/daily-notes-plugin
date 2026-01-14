# Testing Procedure: Daily Notes Stream Plugin

## 1. Automated Unit Tests
The project includes a suite of automated unit tests to verify core logic (like date parsing and sorting) in isolation.

- **Run tests**:
  ```bash
  npm test
  ```
- **Coverage**: Includes legacy root-folder notes and new nested `YYYY/MM/` folder structures.

## 2. Test Environment Setup
- Ensure you have an Obsidian vault available for testing (e.g., `PluginTest`).
- In the test vault:
    - Enable the **Daily Notes** core plugin.
    - Set a specific **New file location** (e.g., `Notes`).
    - Create at least 11 daily notes with filenames matching your date format (default: `YYYY-MM-DD`) to test infinite scroll (batch size is 10).
    - **Add Frontmatter**: Ensure some notes have frontmatter properties (tags, aliases, custom fields) to test the properties display.

## 3. Deployment
- **Option A (Manual Build)**:
  - Run the build command in the project root:
    ```bash
    npm run build
    ```
  - Copy the distribution files to your test vault:
    ```bash
    mkdir -p <vault_path>/.obsidian/plugins/daily-notes-stream
    cp main.js manifest.json styles.css <vault_path>/.obsidian/plugins/daily-notes-stream/
    ```
- **Option B (Dist Package)**:
  - Run `npm run build`.
  - Copy the `dist/daily-notes-stream` folder to `<vault_path>/.obsidian/plugins/`.

## 4. Verification Steps

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
   - **Link Verification**:
     - Find the note **2026-02-01**.
     - Verify the image `test-image.svg` is rendered.
     - Click the link `[[2026-01-15]]`.
     - Verify it opens the note **2026-01-15**.
     - In **2026-01-15**, click `[[2026-02-01]]` to return.
4. **Infinite Scroll**:
   - Scroll to the bottom of the view.
   - Verify that more notes are loaded automatically when the sentinel is reached.
   - **Fix Verification**: Ensure the first batch of notes does not duplicate upon initial load.

### Live Updates
1. **New Note Creation**:
   - While the stream is open, create a new daily note for today (or a future date) via the side panel or command palette.
   - **Expectation**: The new note should appear immediately at the top of the stream.
   - Create a note for a past date (between existing displayed notes).
   - **Expectation**: The note should be inserted correctly in chronological order.
2. **Note Modification**:
   - Open a daily note in a separate pane that is currently visible in the stream.
   - Edit the content (add text, bolding, etc.).
   - **Expectation**: The content in the stream view should update in real-time to reflect the changes.
3. **Renaming**:
   - Rename a daily note file (e.g., change the date).
   - **Expectation**: The stream should update the header title and re-sort the note if the date changed (or remove it if it no longer matches the daily note format).
4. **Deletion**:
   - Delete a daily note file.
   - **Expectation**: The note should immediately disappear from the stream view.

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
   - **Specific Data Check**:
     - Check **2026-02-01**: Should show `tags: test, image, link`, `aliases: Feb 1st Test`, `mood: productive`.
     - Check **2026-01-15**: Should show `tags: backlink, test`, `type: daily`, `location: Home Office`.
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

## 5. Debugging
- Open the Developer Console (`Ctrl+Shift+I` or `Cmd+Opt+I`).
- Look for logs prefixed with `DailyNotesStreamView:` or `DailyNoteService:`.
- Check for "No daily notes found" messages if the view is empty.