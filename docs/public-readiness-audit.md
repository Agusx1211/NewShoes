# Public-readiness audit

Audit date: 2026-07-11
Audited base: `0eef196634931e172f5bf49f872448d229495a06` plus every ref reachable in the local clone

This report separates the cleaned working tree from historical Git objects.
No history was rewritten.

## Method

The audit covered 1,539 commits, 22,246 reachable objects, and 13,397 blobs
across all local branches and remote-tracking refs.

The checks were:

1. `git rev-list --objects --all` for the complete reachable object and path
   inventory.
2. `git cat-file --batch-check` for blob sizes, followed by a persistent
   `git cat-file --batch` content scan.
3. Filename and file-signature checks for ISO, Cabinet, BIG, compressed
   archives, wasm, native executables, media, browser profiles, certificates,
   dumps, and generated output.
4. Exact secret signatures for private-key headers, AWS access keys, GitHub and
   Slack tokens, OpenAI-style keys, JWTs, URL credentials, and common quoted
   credential assignments.
5. Privacy signatures for home directories, user profiles, private network
   addresses, SSH paths, local hostnames, temporary paths, and email addresses.
6. `git shortlog` plus author, committer, subject, and trailer inspection for
   automation attribution.
7. A fresh current-tree scan after the cleanup changes.

No dedicated third-party secret scanner was installed on the machine. The
custom scan searched all reachable blob contents, including deleted files, but
is not a substitute for a hosted platform's secret scanning.

## Current tree after cleanup

### Credentials and private configuration

No tracked current file matches the credential signatures above. No private
key, certificate, environment file, browser profile, cookie database, or issue
dump is tracked.

Four tracked symlinks under `WebAssembly/` pointed at a contributor's absolute
checkout paths. They are removed on this branch:

- `WebAssembly/artifacts`
- `WebAssembly/dist-release`
- `WebAssembly/dist-threaded`
- `WebAssembly/dist-threaded-release`

The remaining tracked symlinks are relative links for local agent skills.
Machine-specific team topology was removed from the tracked orchestration
roster. GPU verification and harness tools now require caller-supplied
configuration instead of private host, key, home-directory, and worktree
defaults. The static server builds certificate SANs from the current machine
rather than a committed private address.

`.gitignore` now matches generated directories even when they are symlinks and
also rejects common certificates, environment files, issue dumps, original
media, Cabinet files, BIG archives, and Bink payloads.

### Retail game data

No current tracked path has a retail container extension such as `.iso`,
`.img`, `.cue`, `.cab`, `.big`, or `.bik`. No reachable blob has ISO 9660,
Cabinet, BIGF/BIG4, ZIP/7z, or wasm file magic.

The game-looking binary files retained in the current tree are part of EA's
upstream source release:

- four small files in
  `Generals/Code/Libraries/Source/WWVegas/WW3D2/RequiredAssets/`; and
- seven legacy `.dll`/`.exe` paths, representing four unique native binary
  blobs under the original `Generals` and `GeneralsMD` tool/runtime trees.

These are source-release dependencies, not user-owned retail payloads.

The launcher contains 38 UI artwork files totaling 3.39 MiB. Git history and
`DONE.md` record them as project launcher-concept and project-owned artwork,
not extracted retail data. Their origin policy is now documented in
`WebAssembly/harness/assets/README.md`.

### Size review

No reachable blob is larger than 10 MiB. There are 109 blobs above 1 MiB; 108
are historical versions of `WebAssembly/harness/bridge.js`. The other is the
1.48 MiB Project New Shoes source mark. No generated wasm build or large retail
payload is present.

## Full-history findings

### No credential or retail-payload match

The full blob scan found zero credential-signature matches and zero ISO,
Cabinet, BIG, compressed-archive, or wasm signatures.

Four native executable signatures were found. They are the unique upstream
source-release tool/runtime binaries described above.

### Historical absolute symlinks

Commit `5ba1d8cc98690b18de82a66a38b6e9c9bd74466a` introduced four symlink
blobs whose contents expose a local home-directory layout:

| Path | Blob object |
|---|---|
| `WebAssembly/artifacts` | `1b805e85e177ff6c816c9dd85b263ac5b78186d1` |
| `WebAssembly/dist-release` | `67a28021763367c9b81f9a8b96fc1906225a6853` |
| `WebAssembly/dist-threaded` | `849fb206da6297253c8ba3d5c28588b730444d8c` |
| `WebAssembly/dist-threaded-release` | `cc5f7282db992bb38e9b1892cca6c386010809b8` |

Current-tree deletion stops future checkouts from exposing them, but the blob
contents remain retrievable from history.

### Deleted internal handoff

`HANDOFF_DELETE_AFTER_READING_THIS.md` was introduced and updated in commits
`87b707435f5a81b00cd3f7d4b3dcfcae7ba9bd95` and
`9aa2a67457cb4efe0902fbb6f3b293fc465bf765`, then deleted in
`44d66d907c648e5b5b6386ebf386c9dc67d533b2`. Its sensitive historical blobs
are:

- `5e7aa3b10f5b449120a92b44852c19c6cf02fa0c`
- `0bf7f0e24ccf573133904cece22daa18fa6043c6`

They contain internal host, private-address, and temporary-path notes. No
credential signature was present, but the file should be removed from a public
history.

### Historical machine details

Old versions of these path classes contain local home paths, private network
details, SSH configuration names, hostnames, or temporary capture paths:

- `AGENTS.md`, `TODO.md`, and `DONE.md`;
- `WebAssembly/notes/p1-engine-thread.md`;
- `WebAssembly/harness/mac_verify.mjs`;
- `WebAssembly/harness/p2_opfs_probe.mjs`;
- `WebAssembly/harness/shellmap_texture_label_capture.mjs`;
- `WebAssembly/harness/static-server.mjs`;
- `WebAssembly/tools/merge_build_deploy.sh`; and
- the two historical orchestration `TEAM.md` files.

The content scan found 370 home-path hits, 66 private-address hits, 14 SSH-path
hits, and 170 local-host hits when counting every historical blob/path
association. These counts include repeated versions. Generic temporary paths
and browser-runtime paths were reported separately and are not credentials.

The affected refs at audit time are:

- `refs/heads/brand/project-new-shoes`
- `refs/heads/chore/public-readiness`
- `refs/heads/codex/fps-overlay-ui`
- `refs/heads/feat/deluxe-iso-support`
- `refs/heads/fix/default-pixel-shaders`
- `refs/heads/fix/pixel-shader-fidelity`
- `refs/heads/fix/runtime-exit-ghost-canvas`
- `refs/heads/main`
- `refs/remotes/me/main`

The upstream `refs/remotes/origin/main` does not contain these additions.

### Commit metadata

The owner's personal email domain appears in historical Git metadata on 149
author records and 878 committer records. The address is not reproduced here.
This is ordinary Git attribution rather than a secret, but it is personal data.
If the owner does not want it public, a history rewrite is required; a
`.mailmap` changes display only and does not remove the raw address.

## Automation attribution

`git shortlog -s -n --all` produced the following evidence. Aliases were grouped
only when the metadata named the same model family.

| Group | Metadata aliases | Commits |
|---|---|---:|
| OpenAI GPT-5 Codex | `OpenAI GPT-5 Codex`, `OpenAI Codex GPT-5`, `OpenAI GPT-5 Codex (Codex CLI)`, `OpenAI Codex (GPT-5)`, `Codex GPT-5` | 996 |
| Z.ai GLM-5.2 | `opencode-go/glm-5.2`, `Z.ai GLM-5.2`, `Pi glm-5.2`, `GLM-5.2`, `glm-5.2`, `GLM 5.2` | 170 |
| Anthropic Claude Fable 5 | `Claude Fable 5`, `Claude Fable 5 (claude-fable-5)`, `Anthropic Claude Fable 5` | 121 |
| Anthropic Claude Opus 4.8 | `Anthropic Claude Opus 4.8`, `Claude (Opus 4.8)`, `Claude`, `Claude Opus 4.8`, `Claude Opus 4.8 (1M context)` | 51 |
| Qwen 3.6 | `llmbench-qwen3.6-27b`, `Falcon (llmbench qwen3.6-27b)`, `vscode11-qwen3.6-35b`, `llmbench-llamacpp/qwen3.6-27b@iq2_m`, `macstudio-qwen3.6-35b`, `macstudio-atlas-qwen3.6-27b`, `macstudio/qwen3.6-27b-mtp`, `qwen3.6-35b-a3b-mtp (pi-worker)` | 30 |
| Mistral Medium 3.5 | `mistral/mistral-medium-3.5`, `mistral-medium-3.5`, `Mercury (mistral-medium-3.5)` | 17 |
| DeepSeek V4 Pro | `opencode-go/deepseek-v4-pro` | 1 |
| Human project owner | `Agusx1211` | 149 |
| Upstream EA import | `LFeenanEA` | 4 |

The automation total is 1,386 commits. The README uses these exact grouped
counts and describes the human role separately.

## History-rewrite decision

A rewrite is not needed to remove retail assets or secrets because neither was
found. A rewrite is recommended before the first public push if private machine
layout, network details, the deleted handoff, or the owner's raw email address
must not be public.

Do not rewrite in a working clone. The safe plan is:

1. Freeze pushes and archive the current refs in a private bundle.
2. Use a fresh mirror clone and a reviewed `git filter-repo` installation.
3. Remove `HANDOFF_DELETE_AFTER_READING_THIS.md` and the four absolute-symlink
   paths from every revision with `--invert-paths`.
4. Build a replacement file outside the repository that maps the audited
   private literals to generic placeholders. Pass it with `--replace-text`.
   Do not commit that replacement file because it necessarily contains the
   values being removed.
5. If requested, build an external mailmap from the owner's old address to a
   chosen public or GitHub noreply address and pass it with `--mailmap`.
6. Re-run this object, signature, size, and metadata audit against the rewritten
   mirror.
7. Compare tree contents, build the threaded release, and run the startup plus
   threaded gates.
8. Force-push only after the owner reviews the new object graph. Replace every
   affected public branch and tag together, then tell collaborators to
   re-clone. Old hosting caches and forks must be treated as still containing
   the previous objects.

An invocation skeleton, with sensitive helper files kept outside the clone, is:

```sh
git filter-repo --force \
  --path HANDOFF_DELETE_AFTER_READING_THIS.md \
  --path WebAssembly/artifacts \
  --path WebAssembly/dist-release \
  --path WebAssembly/dist-threaded \
  --path WebAssembly/dist-threaded-release \
  --invert-paths \
  --replace-text /secure/path/private-replacements.txt \
  --mailmap /secure/path/public-mailmap.txt
```

Omit `--mailmap` if the existing commit attribution is intentionally public.
This audit did not execute the plan.
