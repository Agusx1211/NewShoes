# ShockWave replay performance

Measured on 2026-09-13 for issue #364. The supplied `contra-3.rep` identifies
ShockWave 1.201 on Death Valley [SHW], seed 169205, with eight players and
68,155 logic frames. Its SHA-256 is
`9f1ef1eac6f879f5c040413c06b556b041add66c91faf98e1096fb0ac384be31`.
The replay and retail/mod assets are private test inputs and are not distributed
with this report.

## What the measurements establish

The requested locked 60 FPS target is not established. Presentation intervals,
including their tails, must fit 16.7 ms; an engine's internal FPS counter or a
fast individual AI query cannot establish that result.

A fresh comparison against the released 0.8.0 binary reduced median midgame
presentation time from 44.91 to 34.56 ms with the query-filter, occupied-range,
resource-dependency, and HUD text changes at `9746184a`. That is a 23.1%
reduction in median interval, or 1.30 times its reciprocal frame rate. The p99
did not improve in this pair. These are individual runs on a shared machine,
not universal speed guarantees.

| Frames 30,000–31,000 | 0.8.0 | `9746184a` |
| --- | ---: | ---: |
| Presentation median | 44.910 ms | 34.555 ms |
| Presentation p95 | 84.810 ms | 75.805 ms |
| Presentation p99 | 96.805 ms | 98.995 ms |
| Presentation maximum | 112.225 ms | 124.775 ms |
| Engine median | 30.6 ms | 28.6 ms |
| Engine p95 | 52.2 ms | 46.6 ms |
| Presented samples | 678 | 831 |

The same candidate completed the replay naturally without CRC mismatch or
WebGL context loss. Its isolated late window, frames 65,000–66,000, measured
30.545 ms median presentation, 55.020 ms p95, and 66.595 ms p99. There is no
matched fresh 0.8.0 late window in this comparison, so this is an absolute
measurement rather than a late-game speedup claim.

The owner-mask checkpoint `2c4d635f` also completed the full replay without a
CRC mismatch or context loss. Its midgame median was 28.440 ms and p95 was
67.420 ms, but p99 rose to 109.595 ms and the maximum to 189.385 ms. The late
window measured 22.970 ms median, 32.485 ms p95, and 36.770 ms p99. Its median
improvements therefore do not establish consistently smooth presentation.

The follow-up at `6d85d377` retains cached ownership while creating objects that
have not entered the grid. Its latest replay measurements and acceptance status
are recorded in [PR #367](https://github.com/Agusx1211/NewShoes/pull/367), alongside
the final implementation and verification. The tables above identify their
specific measured checkpoints; they should not be relabeled as later builds.

## Changes and targeted evidence

AI enemy searches evaluate their first pure filter before calculating distance.
Range queries use the occupied-cell index for every ring while retaining the
original ring, cell, and object ordering. A frozen-world query probe compared
ordered object IDs and reduced median nearest-query time by 20.0% and range-query
time by 13.7% against the original filter position.

The subsequent owner-mask optimization skips cells whose occupants cannot pass
the enemy filter. Cell membership and object/team ownership changes invalidate
the derived cache. Unregistered objects do not invalidate cell ownership data
before entering the grid. Relationship masks are computed from current diplomacy;
team-specific exceptions and arbitrary optional filters retain ordinary
traversal. Neither masks nor cache generations enter saves or CRC data.

At frozen replay frame 30,515, 32 evenly sampled live AI units were queried at
radii 160, 400, and 1,200. Each trial contained 1,920 queries. Six trials alternated
the order of masked and unmasked traversal in the same process and world.

| Query type | Unmasked median | Masked median | Reduction |
| --- | ---: | ---: | ---: |
| Nearest enemy | 12.515 ms | 8.5075 ms | 32.0% |
| Ordered range | 23.575 ms | 11.750 ms | 50.2% |

All ordered results matched. Thirteen scenarios exercised player relationships,
team-to-player overrides, team-specific overrides, object capture/restoration,
and team ownership transfer/restoration. Across these scenarios, 263,565 checks
confirmed that masks retained eligible enemies. This diagnostic deliberately
changed the frozen world and then closed it; it is separate from replay CRC
acceptance. The diagnostic export is absent from the shipping binary.

Queued rendering now tracks the static buffers and textures each segment uses,
so unrelated resource changes retain pending draws. Unchanged HUD text retains
its sentence resources. In a separate counter sample, segment flushes fell from
13.42 to 5.01 per frame while draw count stayed approximately 563–567 per frame.
Counter runs are not used as clean timing measurements.

Removing text resource churn exposed unfinished draws at direct worker frame
RPC boundaries. Those calls now flush before replying, matching the paced
worker loop. The regression test stops that loop and confirms that three direct
calls render all 992 queued draws and produce nonblank screenshots.

## Method and limits

The machine is a Linux VM with a Ryzen 9 5950X host CPU and NVIDIA RTX 4080,
using Chromium 149 and the actual ANGLE OpenGL ES renderer. This is not weak
hardware. The threaded Release wasm build uses Emscripten 3.1.6 and the normal
release flags, without LTO, SIMD, or profiling-function names added for timing.
The engine renders at 800×600. Native adaptive LOD remains enabled and unchanged;
both midgame runs selected LOD 3 at the median. Particle visibility can vary
with presentation cadence. No effects or simulation work are removed to reach
a frame-rate target.

The real `harness/skirmish_start_smoke.mjs` imports the mod and replay. Rendering
stays active during warmup. The loop requests 240 client/120 logic FPS with up to
eight catch-up updates outside measurement windows, then 60 client/30 logic FPS
with two catch-up updates from frame 29,000. The full-run controller accelerates
again at 33,000 and restores normal pacing at 64,000. Measurements use only the
30,000–31,000 and 65,000–66,000 windows. CPU sampling, detailed performance counters,
and GPU timers are disabled before and during these timing windows. Other owned
game runs and builds are kept out of the measured windows.

CPU profiles are separate diagnostics. Function indices from separately linked
wasm artifacts are not interchangeable, including builds that emit profiling
names or symbol maps. An experimental full-LTO build with strict aliasing
disabled failed replay CRC at frame 2,246 and was rejected.

Verification also includes `npm run test:all` and its deterministic headless
baseline, 42,140 ordered partition-index checks, production cell-cache membership
tests, real GPU resource-dependency pixel checks, and save/load through the
original in-game and title-screen menus including overwrite and delete. Twelve
real-engine text scenarios matched forced rebuilds pixel for pixel, including
font changes, clipping, wrapping, shadows, movement, and hotkey transitions;
repeated cached draws created no textures.

Raw logs, profiles, screenshots, replay captures, and temporary query/text probe
sources are retained in local ignored replay evidence archives under
`WebAssembly/artifacts/`. They are not a replacement for the committed runtime tests.

Agent-Model: OpenAI gpt-6-astra
