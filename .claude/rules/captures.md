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
```

- The desktop stills are the top of the note column, framed; the desktop
  recording shows the window (D-126). The transparent e2e window lays out at 1x,
  not the display's scale.
- The recordings are animated WebPs: they need `img2webp` (`brew install webp`);
  the phone's capture needs `swift` (Xcode). D-116 has why.
- The phone's screen is captured over USB from before Appium connects: starting
  a capture drops WebDriverAgent's connection. Only the frames between the
  scene's first and last step are kept; iOS shows a Focus banner as the capture
  starts and stops.
- The scene rehearses its search and jump first, uncaptured: iOS's keyboard
  layout and the mid-scene buttons are looked up the first time, seconds of
  stillness on screen otherwise.
- Touch discs are drawn onto the frames from the touches the harness sent
  (`draw-touches.swift`): the page misses those that catch a glide. Keys get
  none; iOS shows their bubbles.
- `Phone.type` keys in pairs at most: WebDriverAgent lands one gesture's keys
  some 30 ms apart, and each gesture costs about 560 ms.
