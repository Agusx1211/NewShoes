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

## Branch and worktree lifecycle

All implementation work uses a dedicated branch created from an up-to-date
`main`, checked out in a dedicated worktree under:

```text
~/worktrees/<project>/<feature>
```

For this repository, a normal path is
`~/worktrees/CnC_Generals_Zero_Hour/<issue-number>-<short-name>`.

Before creating it:

- inspect `git worktree list`, local branches, and the matching GitHub issue;
- confirm no other agent owns the issue, branch, or destination path;
- confirm the primary `main` worktree has no user changes that would be disturbed;
- fetch and fast-forward `main` without force, reset, or history rewriting;
- if `main` cannot be updated safely, stop and report the conflict instead of
  inventing a new base.

Then create both the feature branch and worktree from `main`, for example:

```sh
mkdir -p ~/worktrees/CnC_Generals_Zero_Hour
git worktree add \
  -b issue-123-short-name \
  ~/worktrees/CnC_Generals_Zero_Hour/issue-123-short-name \
  main
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

Worktree cleanup is part of the definition of done. After committing and
verifying the work:

1. Confirm the feature worktree is clean with `git status --short`.
2. Run `git worktree remove <path>` from another worktree.
3. Run `git worktree prune` and confirm the directory is gone.
4. Preserve the branch while it is awaiting review or integration; delete it
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
- Commit completed work with a short descriptive message and provider/model-specific
  authorship, including the model subversion when it is available.
