# 0011. Hide daily notes that hold only their template

- **Status:** Accepted; how a Templater block reads superseded by D-117
- **Date:** 2026-09-28

## Context

A daily note created from a template and never written in is noise in the
stream. The metadata cache sees frontmatter-only notes, but a template with
headings or prompts (`## Log`, `- `) looks like content to it: telling template
text from written text takes the note's text.

## Decision

A note is empty when its whole text, frontmatter included, is blank or matches
the daily-notes template (`getDailyNoteSettings().template`) read as a pattern:
literal text, `{{…}}` placeholders as any text on one line, Templater's
`<% … %>` as any text across lines, trailing whitespace ignored. An added or
changed property is writing, so the note shows.

Each view's service lists through the filter, before the first batch. Today's
note always shows, and so does a note another note links to while linked
mentions are shown: those are content under it. A setting, on by default, turns
hiding off. How verdicts are kept across sessions is D-072; how link changes
reach the views, D-073.

## Consequences

- Notes made from an older version of the template don't match, so they show.
- A Templater block that writes a whole section makes the pattern loose.
- Emptiness changes on edit, so a note enters or leaves `_sorted` on `changed`,
  through `insertSorted` / `removeSorted`.
- Yesterday's empty note hides, and one made ahead for the new day shows, a
  minute past midnight once the reader is still, or on the stream's next change
  (D-123).
- An unreadable template hides nothing.

## Rejected alternatives

- **Frontmatter-only, from the cache** — misses every template with a heading.
- **Section shapes (headings and blank list items only)** — guesses; a template
  of prompts reads as prose.
- **Body only, ignoring frontmatter** — hides a note whose only entry is a
  property.
- **Hiding after render** — notes flash in, then vanish, shifting the scroll.
- **A list of past templates** — configuration for a rare case.
