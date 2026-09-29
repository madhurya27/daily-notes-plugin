# 0008. Nothing inside the stream scrolls, on mobile

- **Status:** Accepted
- **Date:** 2026-09-24
- **Supersedes:** [0007](0007-nothing-in-the-stream-scrolls.md), which applied
  the rule everywhere

## Context

ADR 0007 banned scroll containers inside the stream: on iOS one ends a glide
early once notes unload. The stall is WebKit's, and desktop has none. There,
cards and fitted columns traded a table the reader can scroll for one that is
cropped or reshaped, with nothing gained.

## Decision

On mobile (`Platform.isMobile`: iOS and Android, phones and tablets), ADR 0007's
rule holds: no scroll containers, wide tables and Bases as cards, code wrapped,
the rest clipped. Android is held to it too, unverified, so the two platforms
behave alike.

On desktop the stream draws wide content as Obsidian's reading view does: a
table scrolls inside its own box, a Base draws its own table with its own scroll
bar, an embedded note keeps its height cap.

Everywhere, nothing widens the page itself: diagrams scale, URLs wrap.

## Consequences

- The e2e census is mobile-only; desktop e2e checks that a wide table and Base
  scroll inside themselves and the page does not.
- Stylesheet rules for the mobile case sit under `.is-mobile`.

## Rejected alternatives

- **One rule everywhere (0007)** — desktop loses scroll bars to fix a bug it
  lacks.
- **iOS only (`Platform.isIosApp`)** — iPhone and Android phone would differ.
