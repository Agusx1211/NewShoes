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

The query, HUD, and resource changes alone did not establish an end-to-end
speedup. At `6d85d377`, midgame averaged 33.2 FPS, then 31.7 FPS on repeat,
with worse tail latency than the repeat 0.8.0 control. A subsequent scheduler
correction at `5465e833` averaged 40.3 and 39.6 FPS in two runs of the same window,
with no presentation intervals above 100 ms. That improvement still falls short
of 60 FPS.

All rows below cover logic frames 30,000–31,000. FPS is 1000 divided by the
mean presentation interval, not the reciprocal of the median. The first 0.8.0
control was substantially slower than its repeat; comparing only against that
first run would overstate the evidence. These are individual runs on a shared
machine, not broad hardware guarantees or a statistical performance estimate.

| Build and run | Mean FPS | Median | p95 | p99 | Maximum | Intervals >100 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.8.0 first control | 20.1 | 44.910 ms | 84.810 ms | 96.805 ms | 112.225 ms | 5 |
| 0.8.0 repeat control | 34.7 | 29.225 ms | 39.250 ms | 52.805 ms | 79.450 ms | 0 |
| `6d85d377` first | 33.2 | 26.560 ms | 66.455 ms | 103.935 ms | 140.295 ms | 14 |
| `6d85d377` repeat | 31.7 | 28.255 ms | 64.810 ms | 104.945 ms | 147.215 ms | 13 |
| `5465e833` first | 40.3 | 26.025 ms | 34.095 ms | 40.750 ms | 54.080 ms | 0 |
| `5465e833` repeat | 39.6 | 26.525 ms | 34.865 ms | 46.460 ms | 67.355 ms | 0 |

The C++ checkpoint `6d85d377` completed the replay naturally without CRC mismatch
or WebGL context loss. Its isolated late window, frames 65,000–66,000, averaged
43.8 FPS. Earlier checkpoints `9746184a` and `2c4d635f` also completed the replay
without CRC mismatch or context loss. Full-replay acceptance and late-window
measurements for the scheduler follow-up are recorded in
[PR #367](https://github.com/Agusx1211/NewShoes/pull/367). There is no matched
fresh 0.8.0 late window, so late measurements are absolute results rather than
late-game speedup claims.

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

The worker estimates refresh timing from callback intervals. Slow engine frames
inflate those intervals, so they must not grant an arbitrarily large tolerance
for starting client or logic work early. The scheduler now caps that tolerance
at half the smaller requested client/logic period and resets its estimate when
the loop restarts. Fixed simulation steps and catch-up limits are unchanged.

## Method and limits

The machine is a Linux VM with a Ryzen 9 5950X host CPU and NVIDIA RTX 4080,
using Chromium 149 and the actual ANGLE OpenGL ES renderer. This is not weak
hardware. The threaded Release wasm build uses Emscripten 3.1.6 and the normal
release flags, without LTO, SIMD, or profiling-function names added for timing.
The engine renders at 800×600. Native adaptive LOD remains enabled and unchanged;
the control and original candidate runs selected LOD 3 at the median. Particle visibility can vary
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
