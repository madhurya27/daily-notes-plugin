---
paths:
    - "manifest.json"
    - "versions.json"
    - "package.json"
    - "scripts/version-bump.mjs"
    - ".github/**"
    - "tests/repo/release-workflow.test.ts"
---

# Release

- Tag equals the manifest version exactly, no leading `v`. From `1.0.0`, tags
  are annotated (docs/DECISIONS.md, D-039).
- `pnpm version` writes every file through `scripts/version-bump.mjs`.
- The workflow gates on format, lint and coverage before drafting the release;
  `tests/repo/release-workflow.test.ts` guards its shape.
