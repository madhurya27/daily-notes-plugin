---
paths:
    - "docs/images/**"
    - "README.md"
    - "e2e/screenshots.spec.ts"
    - "e2e/recording.spec.ts"
    - "e2e/screencast.ts"
    - "scripts/frames-to-apng.swift"
---

# README captures

```bash
pnpm run capture:screenshots   # rewrite the README's stills in docs/images/, from the demo vault
pnpm run capture:recording     # rewrite only docs/images/demo-desktop.png, the README's recording
```

- Both show the window: hidden, it produces no frames.
- The recording is an animated PNG assembled by `scripts/frames-to-apng.swift`,
  so it needs `swift` (Xcode Command Line Tools).
