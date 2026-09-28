# 0011. Hide daily notes that hold only their template

- **Status:** Accepted
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

Only notes no bigger than the template plus 1 KB are read. `EmptyNotes`, one per
plugin, keeps each path's verdict keyed by `mtime`, filled before the first
batch and updated on `metadataCache` `changed`. Each view's service filters
through it synchronously. Today's note always shows, and so does a note another
note links to while linked mentions are shown: those are content under it. A
setting, on by default, turns hiding off.

## Consequences

- Notes made from an older version of the template don't match, so they show.
- A Templater block that writes a whole section makes the pattern loose.
- Emptiness changes on edit, so a note enters or leaves `_sorted` on
  `changed`, through `insertSorted` / `removeSorted`.
- A stream left open past midnight keeps yesterday's empty note until a rebuild.
- Backlinks are checked when the list is built and when the note itself
  changes: a new link to a hidden note shows it on the next open or rebuild.

## Rejected alternatives

- **Frontmatter-only, from the cache** — misses every template with a heading.
- **Section shapes (headings and blank list items only)** — guesses; a template of prompts reads as prose.
- **Body only, ignoring frontmatter** — hides a note whose only entry is a property.
- **Reading every note** — thousands of reads at open for a few hundred candidates.
- **Hiding after render** — notes flash in, then vanish, shifting the scroll.
- **A list of past templates** — configuration for a rare case.
- **Re-checking hidden notes on `resolved`** — live, but the service must track what it hid; deferred.
