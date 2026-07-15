# AGENTS.md

## Project state

Project New Shoes runs the original Command & Conquer: Generals / Zero Hour C++
engine in the browser through WebAssembly. The foundational port is substantially
complete: the real engine boots, renders the shell, and runs playable skirmishes.
Current work is product development—features, fidelity, bug fixes, compatibility,
performance, hardening, and cleanup.

Zero Hour in `GeneralsMD/Code/` is the primary target. The main source areas are:

- `GameEngine/` — simulation, AI, data loading, UI logic, objects, weapons, and
  networking protocol;
- `GameEngineDevice/` — rendering, audio, video, input, and OS-facing device
  implementations;
- `Libraries/Source/` — WW3D and the original third-party integration surface;
- `WebAssembly/` — the Emscripten build, browser platform layer, launcher, asset
  import, runtime bridge, and verification harness.

Read `PROJECT.md` for the current architecture before making broad or
cross-cutting changes.

## Private agent instructions

At the start of every task, read the repository-root `AGENTS_PRIVATE.md` after
this file when it exists. It is the place for user- or machine-specific agent
instructions that should remain local. Follow it as supplemental project
guidance, subject to higher-priority instructions and the user's current
request.

`AGENTS_PRIVATE.md` is gitignored. Never stage, commit, quote, or publish its
contents. Its absence is normal and does not block work.

## Engineering stance

The original engine is the product, but it is no longer an untouchable artifact.
Core engine files may be changed when that is the cleanest correct way to add a
feature or fix a problem.

Treat core changes with care:

- understand the real call path, ownership, and invariants before editing it;
- keep changes scoped and reviewable; avoid broad rewrites when a focused change
  will do;
- preserve simulation behavior, data compatibility, save/network determinism,
  and native behavior unless the task intentionally changes them;
- prefer existing engine abstractions and data-driven behavior over parallel
  browser-only implementations;
- use target-specific conditionals only for genuine platform differences, not
  to avoid integrating the real code;
- add or update verification at the level where the behavior is owned.

Platform adapters are still normal and necessary. They must implement the
semantics the engine relies on, with explicit unsupported/error behavior where a
browser cannot provide them.

## No new stubs or fake compatibility

Do not introduce, preserve as the solution, or extend stubs, no-op
implementations, canned-success paths, dummy data, weak fallback ownership, or
“just enough to link” shims unless the user explicitly approves that tradeoff
for the specific task.

In particular:

- do not silently claim success for behavior that did not happen;
- do not shadow a real engine implementation with a simplified copy;
- do not make a harness-only implementation stand in for product behavior;
- do not hide unsupported behavior behind empty methods or invented defaults;
- when existing legacy stubs are encountered, avoid expanding their role and
  prefer retiring them through the real implementation.

An existing legacy stub may remain when it is outside the requested scope, but
it cannot be the implementation or completion evidence for new work.

Test doubles that are scoped to tests and clearly identified as such are fine.
Temporary diagnostic hooks are fine when they observe or drive the real runtime
without replacing product behavior.

## Implementation workflow

- Start from the requested feature, bug, or measured product problem. Reproduce
  it when practical and trace the real runtime path before changing code.
- Build fixes and features into the actual `cnc-port` runtime. Focused tests are
  useful, but they do not replace integration through the shipping path.
- Prefer `npm run build:port` for the normal iteration loop. Use broader builds
  and regression suites in proportion to the change.
- Preserve unrelated user changes and keep commits narrowly scoped.
- When a task exposes separate follow-up work, report it clearly instead of
  quietly widening the current change.

## Public project information

`WebAssembly/pages/project-content.json` is the canonical source for public and
agent-facing claims on newshoes.gg. Update it whenever a change affects a public
capability, status, requirement, setup step, privacy behavior, limitation,
troubleshooting answer, or stable resource. Every capability needs a current
review date and repository evidence paths.

Do not hand-edit `llms.txt`, `project.md`, `project-info.json`, `robots.txt`, the
sitemap, or the discovery metadata in built HTML. The Pages build generates all
of them from the canonical record and rejects facts outside its review window.
Run `npm run test:public-project-content` from `WebAssembly/` after updating it.

## Work tracking: GitHub Issues

GitHub Issues in `Agusx1211/NewShoes` are the durable backlog and coordination
record. The `origin` remote points at the EA source repository, where Issues are
disabled, so every `gh issue` command must name the project repository explicitly:

```sh
gh issue list --repo Agusx1211/NewShoes --state open
gh issue view <number> --repo Agusx1211/NewShoes
```

Before starting non-trivial feature, bug, compatibility, performance, or cleanup
work:

1. Search open and closed issues for the same work.
2. Use the existing issue when one matches; otherwise create one with
   `gh issue create --repo Agusx1211/NewShoes`.
3. Read the full issue and its comments before choosing scope.
4. Mark ownership with an assignee and/or a concise comment naming the branch so
   another agent does not start the same work.

Record newly discovered follow-ups as separate issues instead of expanding the
current task or adding them to the archived checklists. Add concise progress or
verification comments when they help a handoff. Close an issue only after the
change is integrated and its required verification is complete.

## GitHub authentication for agents

Agent-authored GitHub writes MUST use the dedicated `new-shoes-agents[bot]`
GitHub App identity when its credentials are available. This includes issues,
pull requests, comments, reviews, releases, branch pushes, and writes made
through `gh`, an API client, or a connector.

On machines that provide the project wrappers:

- use `new-shoes-gh` in place of `gh` for GitHub API and CLI operations;
- use `new-shoes-agent-push` to push the current feature branch instead of
  pushing through a maintainer's SSH key or personal access token;
- confirm access before the first write with
  `new-shoes-gh api /installation/repositories`;
- let the wrappers mint short-lived installation tokens; never read, print,
  copy, or embed the App private key or generated tokens.

If the App wrapper, credentials, repository installation, or required
permission is unavailable, do not silently fall back to a maintainer's GitHub
identity. Stop before the GitHub write and ask the user how to proceed. Read-only
operations may still use public endpoints or existing read credentials.

## Pull request handoff

Completed implementation work MUST be handed off through an open pull request
in `Agusx1211/NewShoes`. A local commit or pushed feature branch by itself is
not a completed handoff.

After implementation and verification:

1. Commit the intended scope with the required `Agent-Model` trailer.
2. Push the feature branch with `new-shoes-agent-push`.
3. Open a pull request targeting `dev` and link the tracking issue. Use a draft
   only when the work is intentionally incomplete; completed, verified work
   should be ready for review.
4. Summarize the change and verification in the PR body, ending with the exact
   `Agent-Model` signature.
5. Read the PR back and confirm that it is open, targets `dev`, uses the intended
   head branch, contains the expected commits, and preserves the signature.

Do not report the task complete until the PR URL is recorded. If credentials,
permissions, or repository state prevent opening the PR, report that explicit
blocker and the recoverable branch state instead of presenting a local commit or
push as a finished result.

Do not push directly to `dev` or `main` unless the user explicitly requests that
specific direct update. Normal feature, bug-fix, cleanup, and documentation work
always goes through a feature branch and PR.

## Agent identity and authorship

Every repository artifact authored by an AI agent MUST identify the exact model
that authored it. This applies to commits and all GitHub writes, including issue
and pull request bodies, comments, reviews, discussions, and release notes.

Before writing or committing, determine the most specific model identity exposed
by the runtime or its configuration: provider, model family, version, and
variant or subversion. Do not use a generic identity such as `Codex`, `Claude`,
or `GPT-5`. If the exact identity cannot be determined, stop before publishing
and ask the user rather than guessing.

Put the identity on its own final line in GitHub prose and in every commit
message as a trailer, using this format with the actual identity substituted:

```text
Agent-Model: OpenAI gpt-5.6-sol
```

The signature is required even for short comments, small commits, automated
edits, and follow-up changes. Human-authored artifacts do not require it.

## Branch and worktree lifecycle

All implementation work uses a dedicated branch created from an up-to-date
`dev`, checked out in a dedicated worktree under:

```text
~/worktrees/<project>/<feature>
```

For this repository, a normal path is
`~/worktrees/CnC_Generals_Zero_Hour/<issue-number>-<short-name>`.

Before creating it:

- inspect `git worktree list`, local branches, and the matching GitHub issue;
- confirm no other agent owns the issue, branch, or destination path;
- confirm the primary `dev` worktree has no user changes that would be disturbed;
- fetch and fast-forward `dev` without force, reset, or history rewriting;
- if `dev` cannot be updated safely, stop and report the conflict instead of
  inventing a new base.

Then create both the feature branch and worktree from `dev`, for example:

```sh
mkdir -p ~/worktrees/CnC_Generals_Zero_Hour
git worktree add \
  -b issue-123-short-name \
  ~/worktrees/CnC_Generals_Zero_Hour/issue-123-short-name \
  dev
```

Collision rules:

- one agent owns a worktree at a time; never share or edit another agent's
  worktree;
- one branch should represent one issue or tightly related change;
- do not reuse a path or branch that is active in `git worktree list`;
- do not modify the primary checkout for feature work;
- coordinate through the GitHub issue when related branches could touch the same
  files or subsystem;
- preserve unrelated changes and never clean, reset, or delete another agent's
  files.

Worktree cleanup is part of the definition of done. After committing, verifying,
pushing, and opening the pull request:

1. Confirm the feature worktree is clean with `git status --short`.
2. Confirm the PR is open with the intended feature head and `dev` base.
3. Run `git worktree remove <path>` from another worktree.
4. Run `git worktree prune` and confirm the directory is gone.
5. Preserve the branch while it is awaiting review or integration; delete it
   only after it is merged or explicitly abandoned.

Never use forced worktree removal to discard uncommitted work. For a handoff,
commit a recoverable state, remove your worktree, and let the next agent create
its own worktree for the branch. Do not leave finished worktrees behind.

## Verification: do not work blind

A browser/wasm game is graphical and interactive. Compilation alone cannot prove
that user-visible behavior works.

- Graphical changes must be booted in the browser harness and verified with a
  meaningful screenshot or pixel assertion plus relevant runtime state.
- Input and UI work should be driven through the engine's real input/command path
  where possible, with state and visual confirmation.
- Gameplay changes should be exercised in the real match flow and checked through
  observable state, screenshots, or deterministic assertions.
- Rendering and performance changes should use the deterministic headless baseline
  and, when relevant and available, Chrome on real GPU hardware through
  `WebAssembly/harness/mac_verify.mjs`.
- Non-graphical work should run the narrowest meaningful unit/integration tests
  plus the relevant runtime gate.

Treat graphical work as unverified until the harness has produced evidence of the
intended result. Do not weaken an existing gate merely to make it pass.

## Reference documentation

Local reference material lives under `assets/docs/`. Before reverse-engineering
an original-engine behavior, D3D8 semantic, file format, or browser API guarantee,
search it with:

```sh
python3 assets/docs/docsearch.py search "<terms>"
```

`assets/docs/INDEX.md` describes the available sources. The directory is
gitignored reference material: check licenses before copying code or substantial
content into tracked files.

## Historical planning files

The port-era `TODO.md` and `DONE.md` checklists are retired. Their final snapshots
live in `archive/TODO.md` and `archive/DONE.md` and are frozen historical records:

- do not edit them;
- do not move entries between them;
- do not use them as the current backlog or completion gate.

Use the current user request, GitHub Issues in `Agusx1211/NewShoes`, tests, and
relevant design docs to determine scope. `IDEAS.md` remains background material,
not an active task queue.

## Repository hygiene

- Keep retail assets, extracted archives, builds, profiles, screenshots, and
  machine-local certificates untracked.
- The repository must stay on a case-sensitive filesystem; the compatibility
  headers include names that differ only by case.
- Check `LICENSE.md` before redistributing modified builds.
- Commit completed work with a short descriptive message and the mandatory
  `Agent-Model` trailer defined above.
