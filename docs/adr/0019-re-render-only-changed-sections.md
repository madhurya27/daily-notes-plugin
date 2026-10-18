# 0019. A saved note re-renders only the sections a save changed

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

A save re-rendered the whole note. With an editor beside the stream, a
10,000-line note froze desktop ~0.4 s every 2 s autosave even after D-129, and a
phone (CPU slowed 4x) ~1.8 s per synced save (`e2e-tests/edit-cost.spec.ts`).

## Decision

Today's note, the one written in, renders section by section from the start; any
other note from its first save while rendered, whatever its length (D-130): one
`MarkdownRenderer` call and one child `Component` per section of the metadata
cache, its nodes left flat in the note's content, as a whole render leaves them.
A later save renders only the sections between the first and last that changed
and swaps their nodes in place; the block stays pinned until
`NoteWindowManager.repin` (ADR 0013). A kept heading or list item whose collapse
key moved takes the new key and its saved state.

The note renders whole instead when its sections cannot stand alone (footnotes,
inline footnotes, reference links), or when a save changed, on mobile, a section
holding a Base. A frontmatter change draws the properties again (D-133).

## Consequences

- A save of today's note renders nothing again: none over 50 ms on desktop,
  under 160 ms at phone speed for 10,000 lines.
- Opening today's note costs one render by section, about twice a whole render's
  JavaScript for a long note: a 200-line one 95 ms at phone speed, against 68.
- Another note opens as it did; its first save pays that render once.
- `e2e-tests/saved-note.spec.ts` checks a note saved in place against a fresh
  render.

## Rejected alternatives

- **Every note by section from the first render** — an old note opened costs up
  to twice as much, for saves that rarely come.
- **Rendering whole, then mapping elements to sections by position** — a section
  that renders no element, or two, shifts the map silently.
- **A wrapper element per section** — collapsible headings, Obsidian's
  stylesheet and the specs read headings as siblings.
- **A whole render when a kept collapse key moves** — a journal repeats its
  items, so deleting one day re-rendered the note.
- **Waiting for edits to stop before re-rendering** — a long note still froze,
  only later.
