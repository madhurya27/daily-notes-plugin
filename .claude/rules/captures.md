---
paths:
    - "docs/images/**"
    - "README.md"
    - "e2e-tests/screenshots.spec.ts"
    - "e2e-tests/recording.spec.ts"
    - "e2e-tests/screencast.ts"
    - "e2e-tests/ios/recording.spec.ts"
    - "e2e-tests/ios/screen-capture.ts"
    - "scripts/recording.mjs"
    - "scripts/capture-iphone.swift"
    - "scripts/draw-touches.swift"
---

# README captures

```bash
pnpm run capture:screenshots   # rewrite the README's stills in docs/images/, from the demo vault
pnpm run capture:recording     # rewrite only docs/images/demo-desktop.webp, the README's desktop recording
pnpm run capture:recording:ios # rewrite only docs/images/demo-phone.webp, on the plugged-in iPhone
pnpm run capture:listing       # the directory listing's desktop and mobile cards, into .dev/listing/cards/ (D-161)
```

- The listing's cards are uploaded by hand under **Edit listing** on the
  directory's dashboard. `scripts/listing-cards.mjs` holds their headlines and
  lays the raw captures in `.dev/listing/raw/` out as 2400x1600 desktop cards
  and 900x1600 mobile ones.

- The desktop stills are the top of the note column, framed; the desktop
  recording shows the window (D-126). The transparent e2e window lays out at 1x,
  not the display's scale.
- The recordings are animated WebPs: they need `img2webp` (`brew install webp`);
  the phone's capture needs `swift` (Xcode). D-116 has why.
- The phone's screen is captured over USB from before Appium connects: starting
  a capture drops WebDriverAgent's connection. Only the frames between the
  scene's first and last step are kept; iOS shows a Focus banner as the capture
  starts and stops.
- The scene rehearses its search and jump once before the capture starts. The
  harness looks up iOS's keyboard layout and the scene's buttons the first time
  it uses them, which would otherwise show as seconds of stillness.
- Touch discs are drawn onto the frames from the touches the harness sent
  (`draw-touches.swift`), not from the page's touch events: a touch that stops a
  glide never reaches the page. Key taps get no disc, since iOS already shows a
  bubble over each key.
- `Phone.type` keys in pairs at most: WebDriverAgent lands one gesture's keys
  some 30 ms apart, and each gesture costs about 560 ms.
