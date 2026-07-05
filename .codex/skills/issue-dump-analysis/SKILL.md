---
name: issue-dump-analysis
description: Decode, summarize, extract, and replay C&C Zero Hour browser issue dumps. Use when Codex receives or needs to inspect `.cncdump.json` / `.cncdump.json.zip` files from `harness/play.html`, diagnose a reported visual/input/gameplay bug from an issue dump, extract embedded screenshots/annotations/video/logs/deep snapshots, compare dump build metadata, or run the dump through `replay_issue_dump.mjs`.
---

# Issue Dump Analysis

## Core Workflow

1. Parse and extract the dump before reasoning from it:

```bash
SKILL_DIR=.claude/skills/issue-dump-analysis  # or .codex/skills/issue-dump-analysis
python3 "$SKILL_DIR/scripts/decode_issue_dump.py" \
  /path/to/report.cncdump.json.zip \
  --out /tmp/cnc-issue-dump
```

2. Read `/tmp/cnc-issue-dump/summary.json` first. It contains the dump id,
   schema, date/time/timezone, build metadata, browser/WebGL renderer, counts,
   issue list, frame ranges, event counts, and extracted file paths.
3. Inspect the issue evidence next, especially:
   - `issues/<issue-id>/annotated.png`
   - `issues/<issue-id>/screenshot.png`
   - `issues/<issue-id>/issue.redacted.json`
   - `issues/<issue-id>/timeline-window.json`
   - `issues/<issue-id>/logs-tail.txt`
   - `issues/<issue-id>/deep-snapshot.redacted.json`
4. Compare `manifest.build.server.git` when present. If absent, use
   `manifest.build.latestLastModified` and per-asset `Last-Modified`/size
   metadata to identify the served build.
5. Use the dump to form a specific reproduction hypothesis, then patch the
   harness/engine and add a focused regression test. Do not commit extracted
   dump media or raw dumps.

## Decoder Script

`scripts/decode_issue_dump.py` accepts either a raw `.cncdump.json` or a zip
containing one. It writes a compact JSON summary to stdout. With `--out`, it
also extracts embedded evidence and writes a copy of the normalized raw dump:

```bash
SKILL_DIR=.claude/skills/issue-dump-analysis  # or .codex/skills/issue-dump-analysis
python3 "$SKILL_DIR/scripts/decode_issue_dump.py" \
  /tmp/cnc-2026-07-05T18-16-00-194Z-manual.cncdump.json.zip \
  --issue issue-001 \
  --out /tmp/cnc-issue-001
```

Useful flags:

- `--issue issue-001`: extract only one issue.
- `--out DIR`: write `summary.json`, `dump.cncdump.json`, screenshots, logs,
  redacted JSON, and media files under `DIR`.
- `--timeline-radius N`: build a fallback event window around `markerFrame`
  when the issue does not already carry `timelineWindow`.

## Dump Anatomy

Top-level fields:

- `manifest`: wall clock, local timezone, build assets/server git info,
  browser/device/WebGL metadata, session/archive config, and counts.
- `issues`: user-created reports. Each issue should have `title`, `comment`,
  `markerFrame`, `screenshot`, `annotation`, `timelineWindow`, `logsTail`, and
  usually `deepSnapshot`.
- `timeline`: bounded flight-recorder events: input, RPC, frame samples,
  UI actions, storage, uploads, errors.
- `frameSamples`: compact frame/RPC summaries from the live loop.
- `logs`: tail of engine/harness logs.
- `media.video`: optional WebM canvas recording as a data URL.
- `replay`: metadata for `harness/replay_issue_dump.mjs`.

Important evidence priority:

1. User title/comment and `annotated.png`.
2. `markerFrame`, `timelineWindow`, and input events before that frame.
3. `deepSnapshot.summaryAfterFullDiag`, `state`, `queryDrawables`,
   `querySelection`, `d3d8TextureInventory`, and `d3d8Perf`.
4. Browser/WebGL renderer and build metadata.
5. Video, if present, for temporal context.

If `markerFrame` is `0` on an old dump but later `frameSamples` show progress,
do not trust replay as exact scene reproduction. Use embedded screenshots,
annotations, logs, and deep snapshots instead.

## Replay

After decoding, run replay from `WebAssembly/` when the marker frame is useful:

```bash
node harness/replay_issue_dump.mjs /tmp/cnc-issue-dump/dump.cncdump.json \
  --issue=issue-001 \
  --out=artifacts/issue-replays
```

Replay currently reboots the browser harness and replays captured browser input
events by frame. It is a reproduction aid, not a deterministic save/load
checkpoint. Exact late-game reproduction remains blocked until original-engine
`Recorder.cpp`/save-load ownership is browser-safe.

## Reporting Back

When summarizing a dump for the user or another agent, include:

- Dump id, generated time, timezone, build commit/dirty state or asset age.
- Browser/WebGL renderer.
- Issues found with title/comment, marker frame, annotation/screenshot paths.
- Whether deep snapshot and video are present.
- Replay result and artifact paths, or why replay is not exact.
- The smallest next code/test target suggested by the evidence.
