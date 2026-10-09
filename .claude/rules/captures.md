---
paths:
    - "docs/images/**"
    - "README.md"
    - "e2e/screenshots.spec.ts"
    - "e2e/recording.spec.ts"
    - "e2e/screencast.ts"
    - "e2e/ios/recording.spec.ts"
    - "e2e/ios/screen-capture.ts"
    - "scripts/recording.mjs"
    - "scripts/capture-iphone.swift"
---

# README captures

```bash
pnpm run capture:screenshots   # rewrite the README's stills in docs/images/, from the demo vault
pnpm run capture:recording     # rewrite only docs/images/demo-desktop.webp, the README's desktop recording
pnpm run capture:recording:ios # rewrite only docs/images/demo-phone.webp, on the plugged-in iPhone
```

- The desktop captures show the window: hidden, it produces no frames.
- The recordings are animated WebPs: they need `img2webp` (`brew install webp`);
  the phone's capture needs `swift` (Xcode). D-116 has why.
- The phone's screen is captured over USB from before Appium connects: starting
  a capture drops WebDriverAgent's connection. Only the frames between the
  scene's first and last step are kept; iOS shows a Focus banner as the capture
  starts and stops.
