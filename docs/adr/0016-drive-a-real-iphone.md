# 0016. Drive Obsidian on a real iPhone over USB

- **Status:** Accepted
- **Date:** 2026-10-02
- **Amends:** [0009](0009-webkit-render-checks.md), which leaves behavior to a
  person with a phone

## Context

What breaks on iOS is behavior: glides cut short, the screen jumping as notes
render, a turn losing the reader's place. ADR 0009's WebKit snapshot is a still,
and desktop Chromium has none of iOS's scrolling. So the Mobile checklist in
`docs/TESTING.md` was done by hand, before every release.

## Decision

`pnpm run test:ios` runs `e2e/ios/` against Obsidian on an iPhone plugged into
the Mac. Appium's XCUITest driver sends real touches through WebDriverAgent, so
a flick glides as a thumb's does. Obsidian's web view, which is inspectable,
answers what the stream did. The harness:

- signs WebDriverAgent with the Mac's own Apple Development certificate;
- seeds a vault of its own, `Stream E2E`, stored on the phone rather than in
  iCloud: the demo journal up to a fixed day, so every phone and every day sees
  the same notes;
- turns Auto-Lock off in Settings for a working session and back on at
  `pnpm run ios:release`.

## Consequences

- Local only: it needs a phone on the cable, unlocked when a run starts, and one
  setup by hand (`docs/TESTING.md`). Not in CI.
- A free Apple ID's profile lasts a week; each run's setup rebuilds and re-signs
  WebDriverAgent when it lapses.
- iPhone only: an iPad's Settings is a split view the Auto-Lock step cannot
  walk.
- A lock screen on Obsidian (Face ID, Touch ID) stops a run: no touch gets past
  it.
- Judges what the reader sees: a turn reflows a note, so a check follows the
  block that was in view, not the note's offset.

## Rejected alternatives

- **The iOS Simulator** — App Store apps, Obsidian among them, do not install in
  it.
- **Web Inspector alone** (`pymobiledevice3`) — runs scripts but sends no
  touches; glides are what break.
- **The Demo vault** — iCloud syncs each test's writes, and its notes change
  with the day it was seeded.
