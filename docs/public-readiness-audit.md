# Public-readiness audit

Audit date: 2026-07-11

Audited tree: `1b30338540fea598f888fc183d72769a90f34f7a`

Ref-manifest SHA-256: `1e12125911dbdf0e813f2bc095e3a2cd8f57644e48b3d0e0a5cbb331e4744b8f`

This is a point-in-time audit of every object reachable from every local ref.
No shared ref was rewritten. The scanner records categories, object IDs, sizes,
and paths; it never writes matched values to its report.

## Reproduce it

The exact content and path regular expressions are versioned in
[`scripts/public_audit.py`](../scripts/public_audit.py). A run writes the exact
patterns to `patterns.tsv`, the underlying Git inventory commands to
`commands.txt`, the ref-to-OID manifest to `refs.tsv`, all value-free findings
to `findings.tsv`, metadata-domain counts to `metadata-domains.tsv`, and the
counters below to `summary.json`.

```sh
python3 scripts/public_audit.py \
  --repo . \
  --tree HEAD \
  --output /tmp/public-audit-final \
  --fail-current-credentials
```

The scanner uses these Git inventories:

```sh
git for-each-ref --format='%(refname)<TAB>%(objectname)' --sort=refname
git rev-list --objects --all
git cat-file --batch-check
git cat-file --batch
git ls-tree -rz -r --long HEAD
git ls-tree -rz -r --long <every-ref>
git log --all --format='<author-and-committer-fields>'
```

It checks private-key headers; AWS, GitHub, GitLab, Slack, OpenAI, and Google
token shapes; JWTs; URL userinfo; quoted credential assignments; Unix and
Windows home paths; private IPv4 ranges; SSH paths; temporary paths; email
shapes; case-insensitive retail/container extensions; certificates, private
configuration, browser profiles, issue dumps, absolute symlinks, and ISO/CAB/
BIG/archive/wasm/native-binary magic. Consult the versioned script or emitted
`patterns.tsv` for the literal expressions rather than relying on this prose.

## Audited refs

```text
refs/heads/brand/project-new-shoes                 721f8ab9fcbeb7e68a46a10cca6c50312b6cf3a7
refs/heads/chore/github-pages-ci                   6e8949457d233c24dfe6a39fb16a03b27b0bfb94
refs/heads/chore/public-readiness                  1b30338540fea598f888fc183d72769a90f34f7a
refs/heads/codex/fps-overlay-ui                    3220f181068e245f8813aa6b78e09a9555b5a07c
refs/heads/feat/deluxe-iso-support                 6596c81582232609bdfe084280e4a19b6f633c24
refs/heads/fix/default-pixel-shaders               8f46f8d16e454fab6e53b4cb0316b7b70db536ab
refs/heads/fix/pixel-shader-fidelity               7913ea98ad97721c1276e8ddcd74b889c0d3996f
refs/heads/fix/ps11-bright-map-tiles               38b8991489748256b270ac08561d283ab1eca174
refs/heads/fix/runtime-exit-ghost-canvas           c67ed50d59452c3a9e50c17a1a8b3dfd071fb120
refs/heads/main                                    38b8991489748256b270ac08561d283ab1eca174
refs/heads/polish/launcher-desktop-ux              713d02bff5787d258d4bdd928857f134183226b0
refs/remotes/me/main                               63c6b06c0d124c3542dcefe580556fbc8f13a542
refs/remotes/origin/HEAD                           0a05454d8574207440a5fb15241b98ad0b435590
refs/remotes/origin/main                           0a05454d8574207440a5fb15241b98ad0b435590
refs/stash                                         d41a11cc6acd7b3fc83d4ee6a37919a3427aefbe
```

## Counters and conclusions

The snapshot contains 1,552 commits, 7,370 trees, and 13,480 blobs: 22,402
unique reachable objects. The largest blob is 1,553,492 bytes. There are 109
blobs over 1 MiB and none over 10 MiB.

The cleaned current tree has:

- zero credential-pattern findings;
- zero retail-container paths and zero ISO, CAB, BIG, compressed-archive, or
  wasm magic findings;
- zero absolute symlinks;
- seven native executable paths, all legacy binaries from EA's upstream source
  release; and
- no contributor-specific home directory, host alias, private address, key
  path, browser profile, certificate, issue dump, or deployment path.

Generic examples and runtime paths remain intentionally, including
`192.168.0.1`, `192.168.x.x`, `/home/web_user`, and `/tmp/...`. Binary files can
also produce email-shaped byte false positives. These are not private machine
details.

No retail game archive or reusable extracted retail asset was found. The
upstream source contains seven unique `RequiredAssets` names duplicated between
the Generals and Zero Hour trees: three TGA files, one W3D file, one INI, and
two TBL files. The launcher retains 15 documented project UI binaries. Twenty
unused concept logos and one image with insufficient provenance were removed.

The README screenshots were converted to opaque, stripped sRGB WebP files at
1600×881 and 1600×876. They show locally supplied retail data for context and
are explicitly excluded from the repository's reusable asset inventory.

## Historical findings

History is not clean enough to publish unchanged if old private machine details
are considered sensitive:

- two old `CHATAPI.CPP` blobs contain URL-userinfo literals; the current files
  replace them with `ftp://host/path/file.rtp`;
- one Pages verification blob contains the literal private-key *header* as a
  denylist test marker, not a key body;
- four unique historical absolute-symlink blobs expose an old checkout layout;
  they occur 44 times across the audited ref trees;
- deleted internal handoff and operational notes retain home, temporary, SSH,
  and private-network patterns; and
- the owner's email remains in ordinary author/committer metadata.

No historical path or blob matched a retail container extension or ISO, CAB,
BIG, compressed-archive, or wasm magic. No blob exceeds 10 MiB.

## Automation attribution

`git shortlog -s -n --all` at the snapshot gives these consolidated families:

| Family | Commits |
|---|---:|
| OpenAI GPT-5 Codex aliases | 1,009 |
| Z.ai GLM-5.2 aliases | 170 |
| Anthropic Claude Fable 5 aliases | 121 |
| Anthropic Claude Opus 4.8 aliases | 48 |
| Anthropic `Claude` with model unspecified | 3 |
| Qwen 3.6 aliases | 30 |
| Mistral Medium 3.5 aliases | 17 |
| DeepSeek V4 Pro | 1 |
| Agustin / `Agusx1211` | 149 |
| Upstream EA import / `LFeenanEA` | 4 |

Thus 1,399 of the 1,552 reachable commits have an automated model identity as
author. These are metadata counts, not a measure of contribution quality.

## Publication decision

Publishing the current tree as a squash is safe with respect to the findings
above. Publishing the full existing history would retain private operational
details and the two old URL-userinfo literals.

[`scripts/prepare_publication_mirror.sh`](../scripts/prepare_publication_mirror.sh)
creates a new mirror, applies an external reviewed replacement file, removes the
known historical private paths and discarded art, applies an optional mailmap,
and reruns this audit. It refuses an existing destination and never rewrites the
source clone. `git-filter-repo` was not installed during this audit, so the
mirror rewrite was not executed. Any rewritten mirror must still be reviewed,
built, tested, and pushed only after active work has been frozen.
