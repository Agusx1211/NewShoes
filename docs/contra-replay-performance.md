# Contra X Beta 2 replay performance

Issue [#379](https://github.com/Agusx1211/NewShoes/issues/379) investigates frame
time spikes reported in Brave on an M1 Pro with an approximately 5K display.
Measurements below use Chromium 149 on the available NVIDIA RTX 4080 through
ANGLE/OpenGL ES. They do not establish performance on Apple hardware.

## Inputs and method

The private Contra X Beta 2 package is loaded through the product mod manager
with its default options (13 enabled BIG archives). Retail data, the mod,
replays, profiles, and screenshots are not distributed with this report.

| Replay | Map | Seed | Logic frames | SHA-256 |
| --- | --- | ---: | ---: | --- |
| `contra-1.rep` | The Stronghold V2 | 53958 | 60,059 | `8ba10457bc3ec34d2b0a979d48f0fc35df7b50d1c7eb7c61e9e757fe38d9e44f` |
| `00000000.rep` | Iron Dragon | 2763481 | 18,732 | `ff71965414a45ad5f096197eea43b6ad99a42084a0f0f5ee5009fafdad6cafc4` |

Both replay command streams parse completely. The second fixture is imported
under the byte-identical alias `iron-dragon.rep` because the engine displays
`00000000.rep` as Last Replay. The browser harness imports and plays the replay
through the real engine menus. Timing builds use the normal threaded Release
configuration with Emscripten 3.1.6, without added profiling-function names.

Rendering remains enabled during accelerated warmup: particle systems advance
in the display path, so disabling rendering would create an artificial backlog.
Warmup requests 240 client/120 logic FPS with one catch-up update; measurement
requests 60 client/30 logic FPS with two catch-up updates. The first 150 logic
frames after that switch are excluded. CPU sampling, detailed counters, and GPU
timers are disabled for timing runs. Native adaptive LOD remains unchanged.

FPS is 1000 divided by the mean presentation interval. Internal engine FPS and
whole-frame GPU timer brackets are not substitutes: the latter also include CPU
submission gaps. Diagnostic profiles and frozen-world probes are separate from
unmodified replay CRC acceptance.

## Guard searches

In a separate Iron Dragon CPU profile, nearest-object searches consumed 23.5%
of sampled worker time. Guard target searches accounted for most of that work.
The first relationship filter now rejects non-enemies before distance checks,
and its conservative player mask also skips irrelevant local cells. It reuses
the existing diplomacy and owner-cache machinery. Target ordering, remaining
attack filters, distance rules, simulation steps, and save/CRC data are unchanged.

A frozen-world diagnostic sampled 32 of 290 live AI units at four radii. All
128 reference/candidate query results and 29,984 conservative-mask checks
matched. Six alternating trials exercised 30,720 queries. These diagnostic
timings overlapped other verification work and are not end-to-end FPS evidence;
the diagnostic exports are absent from the shipping binary.

Initial clean Iron Dragon runs use the starting camera at 1280×800 and cover
approximately frames 6,150–7,500. Both passed replay CRC through that window.

| Build | Mean FPS | Median interval | p95 | p99 | Intervals >100 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.8.3 control | 29.1 | 30.68 ms | 65.08 ms | 104.32 ms | 16 |
| Guard change only | 34.8 | 27.08 ms | 46.75 ms | 78.45 ms | 8 |

These are individual runs on a shared machine. The control had a build during
early warmup, before measurement, so this pair alone is not a hardware-wide
performance guarantee.

## Repeated particle vertex prefixes

The native D3D8 bridge retains original indices by exposing vertices from the
buffer's base through `MinVertexIndex + NumVertices`. Sorted particle runs
therefore reference overlapping prefixes of one shared buffer. The queued
renderer cached only exact byte ranges, so each different upper bound copied
the shared vertices again and gave them another GPU arena offset.

At frozen Stronghold frame 6,355, the original queued path uploaded about
29.9 MB per rendered frame and took 202–229 ms to submit. A diagnostic that
normalized those prefixes to the largest referenced range uploaded about
1.06 MB and submitted in 57–61 ms. These client-only diagnostic frames retain
the scene and effects; they are separate from replay acceptance and clean FPS
measurements. Individual GPU draw timers also showed 792 small effect draws
using only 3.7 ms of GPU execution time in a sampled frame. Their submission
and data preparation were the principal problem in this scene.

The shipping fix keys snapshots by source buffer, upload generation, and start
offset. It reuses the cached prefix when that prefix covers the requested range;
a larger request captures a larger prefix while retaining earlier queued data.
Existing overlap/discard flushes, bounds checks, draw order, and geometry remain
unchanged. The browser regression checks both growing and contained ranges,
upload byte counts, and red/green pixels from earlier and later draws. The
original implementation fails its 110-byte upload assertion with 222 bytes;
the changed implementation passes on the RTX 4080 and headless renderer.

The final clean Stronghold comparison uses 5120×2880 and camera position
(2770.8227, 1494.1335, 0), looking at the large beam and explosion effects.
The control covers frames 5,168–6,519; the final candidate covers 5,189–6,509.
Both retain matching replay CRCs throughout their measured windows. The final
candidate includes the guard change and prefix reuse, with the normal shipping
build flags and all diagnostic profilers/counters/timers disabled.

| Build | Mean FPS | Median interval | p95 | p99 | Maximum | Intervals >100 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.8.3 control | 21.9 | 30.15 ms | 156.40 ms | 250.19 ms | 317.78 ms | 91 |
| 0.8.4 candidate | 35.9 | 25.83 ms | 52.56 ms | 70.45 ms | 104.92 ms | 2 |

The ending screenshots retain the battle, beam, explosions, units, terrain,
and interface. Frame rate is still below 60 FPS, and these individual runs do
not establish an M1 Pro speedup. Full-replay acceptance is a separate release
gate tracked in [PR #380](https://github.com/Agusx1211/NewShoes/pull/380).

Earlier diagnostic runs that switched to eight catch-up updates and changed
resolution lost replay CRC agreement after frame 6,500 in both the original
and changed builds. They are excluded from acceptance. Final acceptance uses
constant resolution, rendering enabled, one catch-up update, and no extra
target queries or manual frame advances.

## Rejected buffer-storage experiment

A separate 5K Stronghold battle profile spent 8.1% of sampled worker time in
`bufferData`; most of those samples came from materializing queued geometry
arenas. Successive command segments reused the same vertex and index buffers
after drawing from them. The renderer already gives ordinary whole-buffer
updates fresh storage in this situation, but the arena path did not.

An experiment applied that existing replacement helper to arena uploads.
Although its pixel and storage-lifetime checks passed, it did not improve the
matched 5K battle window and was removed. The control averaged 21.9 FPS with
a 156.4 ms p95 presentation interval; the combined guard/storage experiment
averaged 20.9 FPS with a 199.8 ms p95 interval. Both matched replay CRC through
frame 6,500. These runs use camera position (2770.8227, 1494.1335, 0).

The full engine regression suite and deterministic headless baseline pass for
the guard change, including 42,140 ordered partition traversals, one million
distance comparisons, and partition membership/cache checks.

Agent-Model: OpenAI gpt-6-astra
