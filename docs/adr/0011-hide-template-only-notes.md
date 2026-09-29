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
batch and updated on `metadataCache` `changed`. It saves, in the vault's
localStorage on this device, the template it checked against, when its last
check of every note began, and each empty note's `mtime`. The next session
trusts a note unchanged since: empty if saved with that `mtime`, else written.
Each view's service filters
through it synchronously. Today's note always shows, and so does a note another
note links to while linked mentions are shown: those are content under it.
`LinkChanges`, one per plugin, compares each note's links into the daily-notes
folder on every `resolve` and, once `resolved`, has each view re-check the
notes that gained or lost one. A setting, on by default, turns hiding off.

## Consequences

- Notes made from an older version of the template don't match, so they show.
- A Templater block that writes a whole section makes the pattern loose.
- Emptiness changes on edit, so a note enters or leaves `_sorted` on
  `changed`, through `insertSorted` / `removeSorted`.
- A stream left open past midnight keeps yesterday's empty note until a rebuild.
- A written note costs nothing to save; an empty one about 40 bytes.
- A note emptied on another device, synced with an `mtime` older than the last
  check, shows until it next changes.
- A stream open at launch hides a linked empty note until the links resolve,
  then shows it.
- A note that fails to read shows, and is read on the next check; a check
  with one unread saves nothing. An unreadable template hides nothing.

## Rejected alternatives

- **Frontmatter-only, from the cache** — misses every template with a heading.
- **Section shapes (headings and blank list items only)** — guesses; a template of prompts reads as prose.
- **Body only, ignoring frontmatter** — hides a note whose only entry is a property.
- **Reading every note** — thousands of reads at open for a few hundred candidates.
- **Saving every note's verdict** — the check's start time vouches for the written ones.
- **Trusting a saved empty note by the check's start time** — a synced edit can carry an older `mtime`, and a written note would stay hidden.
- **Hiding after render** — notes flash in, then vanish, shifting the scroll.
- **A list of past templates** — configuration for a rare case.
- **Re-checking every hidden note on `resolved`** — the service must track what it hid, for the same answer.
- **Checking backlinks only at open** — a new link waits for the next open.
