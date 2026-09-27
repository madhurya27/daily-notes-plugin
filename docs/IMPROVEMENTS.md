# Improvement Specs

Implementation-ready specs for work that has not started. Shipped items are not kept here — the commits and
`docs/adr/` hold those. `docs/TODO.md` is the index of what is open.

## M — Marketplace readiness

`tests/repo/compliance.test.ts` and the Obsidian ESLint rules guard every automatable submission rule, so a
regression fails there rather than in review. Three things it cannot check, to confirm by hand before submitting:

- Settings has no headings, and no setting name repeats the plugin name.
- `normalizePath` guards the constructed path in `DailyNoteService`.
- A clean clone installs from the frozen lockfile and builds.

**Blocking:** run the `docs/TESTING.md` checklist on iOS or Android. `isDesktopOnly: false` is a promise no
static check can keep.

### Submission steps

Obsidian replaced the pull request against `obsidianmd/obsidian-releases` with a developer dashboard; there is
no `community-plugins.json` entry to append.

1. Make the repo public, with `README.md` and `LICENSE` at the root.
2. Publish the release for the final version; verify the three assets download individually.
3. Sign in to [community.obsidian.md](https://community.obsidian.md/), connect GitHub, pick the repo, follow
   the dashboard.
4. The automated review reports within minutes. Fix, release again, resubmit. Once it passes, the plugin is
   installable in-app within 24 hours.
