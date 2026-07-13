---
name: release
description: Prepare and publish a Project New Shoes release by promoting the dev branch to main. Use when asked to release, cut a version, prepare a dev-to-main release PR, update the release changelog, or verify that a release PR completely accounts for its included pull requests.
---

# Release

Treat `dev` as the integration branch and `main` as the released product. A
release is the merge of a `dev` pull request into `main`; do not release by
merging feature branches directly into `main` or by pushing to `main`.

## Prepare the release

1. Read `AGENTS.md`, `AGENTS_PRIVATE.md` when present, and the matching GitHub
   issue. Follow their worktree, verification, authorship, and GitHub rules.
2. Fetch the project remote and confirm the local `main` and `dev` refs match
   the remote. Stop if either branch has diverged or if another release is in
   progress.
3. Enumerate every pull request included in `main...dev`. Use GitHub PR data,
   not commit subjects alone, and inspect the complete diff for changes that
   are not associated with a PR.
4. Choose the next semantic version. Update the repository-root `VERSION` file
   to that exact version with no `v` prefix. A release version must not retain a
   `-dev` suffix.
5. Update `CHANGELOG.md`:
   - keep each change to one short line;
   - include every PR in `main...dev`, including small fixes and cleanup;
   - end every line with a link to its source PR;
   - replace the current `Unreleased` section with
     `## [<version>] - YYYY-MM-DD`, then add a new empty `Unreleased` section;
   - do not combine unrelated PRs into a vague summary or omit a PR because it
     looks minor.
6. Run `npm run test:release-metadata` from `WebAssembly`, then run the product
   checks required by the changes included in the release. Verify the About UI
   shows the new version, the built commit, and the linked changelog.

## Open the release PR

Open one PR with source `dev` and base `main`. Its body must contain:

- the release version;
- a complete list of everything added, with one short line per change and
  links to all included PRs;
- the verification that was actually run and any check that remains pending.

The PR list and `CHANGELOG.md` must account for the same `main...dev` range.
Keep the PR in draft while the list, version, changelog, or required checks are
incomplete. Apply the exact `Agent-Model` identity required by `AGENTS.md` to
every agent-authored commit and GitHub write.

## Merge and verify

Merge only after the release PR is complete and its required checks pass.
Confirm `main` contains the release commit, the deployed About UI reports that
commit and version, and the new empty `Unreleased` section remains ready for
subsequent `dev` work. Do not close the release issue before this verification.
