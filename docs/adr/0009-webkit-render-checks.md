# 0009. Check the phone layout in WebKit, from a snapshot of real Obsidian

- **Status:** Accepted
- **Date:** 2026-09-25
- **Amends:** [0002](0002-real-obsidian-e2e.md), whose mobile project runs Chromium

## Context

Obsidian on iOS runs in WKWebView; the e2e suite drives desktop Obsidian,
which is Electron, so its `mobile` project is the phone layout in Chromium.
Search highlights painted there and nowhere on an iPhone: WebKit reads only
`-webkit-user-select`, and paints no highlight on text beside a block. Neither
could fail a test. Playwright's WebKit cannot run Obsidian itself.

## Decision

`e2e/webkit.ts` gives a mobile-project test `inWebKit()`: it snapshots the live
page — markup, stylesheets as raw text, scroll offsets, CSS highlight ranges —
and renders it in Playwright's WebKit as an iPhone 17 (density, touch, user
agent) at the phone layout's viewport. `e2e/webkit.spec.ts` asserts there what
the engines disagree on: what paints, what the cascade computes.

## Consequences

- Covers CSS parsing, the cascade and painting in iOS's engine; not
  behavior. The page is a still: no scripts, events, scrolling or glides —
  those stay on a real phone (`docs/TESTING.md`).
- macOS WebKit, not iOS: iOS-only paths (momentum scrolling, touch handling,
  tiling) are out of reach.
- Stylesheets are captured as source text: the CSSOM rewrites `-webkit-`
  properties to Chromium's names, which hid the first bug.
- Obsidian's fonts and images do not load, so metrics differ slightly; assert
  on what paints, not where.
- Needs `pnpm exec playwright install webkit` once.

## Rejected alternatives

- **Obsidian in WebKit** — `app.js` needs Electron and Node.
- **The iOS Simulator with Obsidian installed** — no Playwright driver; needs Xcode and a signed-in App Store.
- **Static HTML fixtures** — our reading of Obsidian's DOM and CSS, which is what went wrong.
