# Raspberry Pi 4 performance report

Measured on 2026-07-22 for issue #312. The goal was stable 30 FPS at a useful
resolution with the enhanced shader tier and without removing visual effects.

## Result

The optimized renderer makes the game genuinely runnable on this Raspberry Pi
4, but it does **not** achieve the 30 FPS target. At 1280x720 with the enhanced
PS 1.1 tier, a 600-frame skirmish run averaged 13.73 FPS. Every measured frame
exceeded the 33.33 ms budget.

The clean renderer A/B nevertheless shows a large improvement. With the same
release binary, browser profile, map, seed, camera, and 20-frame measurement
window, replacing only the `dev` D3D8 executor reduced average presentation
time from 487.96 ms to 68.31 ms: 7.14x more presented frames per second.

| 1280x720 enhanced renderer A/B | `dev` executor | optimized executor |
| --- | ---: | ---: |
| Mean presentation time | 487.96 ms | 68.31 ms |
| Median | 444.04 ms | 65.44 ms |
| p95 | 519.88 ms | 76.99 ms |
| p99 / maximum | 1296.03 ms | 104.18 ms |
| Equivalent mean FPS | 2.05 | 14.64 |

The engine-side timer does not explain the stock renderer's 400+ ms
presentation intervals. It reported 56.52 ms on average while WebGL work was
backing up. This is why the end-to-end presentation interval is the primary
metric rather than the time spent inside the engine call.

## Long-run frame stability

The final stability pass used Alpine Assault, deterministic seed 312, one human
USA player versus an easy USA AI, a 30 Hz client and logic target, and up to four
logic updates per display tick. Setup rendering was suppressed so map-load work
did not contaminate the sample. The pass completed all 600 requested
presentations without a crash or WebGL context loss.

| 600-frame result, 1280x720 enhanced PS 1.1 | Value |
| --- | ---: |
| Mean / equivalent FPS | 72.82 ms / 13.73 FPS |
| Median | 67.21 ms |
| p95 | 96.12 ms |
| p99 | 115.55 ms |
| Maximum | 809.61 ms |
| Standard deviation | 40.64 ms |
| 1% low FPS | 8.65 FPS |
| Frames over 33.33 ms | 600 / 600 |
| Frames over 100 ms | 19 / 600 |
| Visible / suppressed catch-up updates | 601 / 675 |

The one 809.61 ms stall raises the standard deviation substantially, but even
the 67.21 ms median is about twice the entire 30 FPS frame budget. Hidden
catch-up updates averaged much less than rendered updates; rendering and WebGL
submission remain the limiting path.

A separate 960x540 probe produced a 67.05 ms median versus 70.32 ms in the
comparable short 1280x720 run. Reducing pixel count by 43.75% improved the
median by only about 4.6%, further indicating that draw/shader/ANGLE overhead is
more important than fill rate in this scene. The lower-resolution run also had
one 727.73 ms outlier, so its average is not useful for comparing steady state.

## Visual quality

All reported graphics runs used the enhanced PS 1.1 tier. Terrain blending,
shroud, fixed-function lighting, shadows, alpha cutouts, particles, and the full
UI remained enabled. The stock and optimized 1280x720 A/B screenshots were
visually matched. A pixel comparison found 3,265 differing pixels out of
921,600 (0.35%) and 43.7 dB PSNR; the differences are from shader precision and
lighting arithmetic, not missing effects.

The retained renderer work specializes common, exactly eligible D3D8 states:

- an unlit TEX2 vertex path avoids generic normal, camera, point-sprite,
  material, and eight-light work for terrain streams that cannot use it;
- common fixed-function texture/diffuse combinations use compact fragment
  programs, including exact alpha-cutout variants;
- static fixed-function pairings of translated SM 1.x pixel shaders remove
  inactive clip, fog, alpha-test, sampler, and semantic branches;
- the common lit TEX1 object path uploads one CPU-computed inverse-transpose
  normal matrix per world transform instead of calculating it per vertex;
- missed logic ticks update simulation without drawing intermediate frames that
  can never be presented.

All paths retain the generic implementation as a fallback when an exact
eligibility check fails.

## Hardware and runtime

| Component | Measured machine |
| --- | --- |
| Board | Raspberry Pi 4 Model B Rev 1.1 |
| CPU | 4-core Arm Cortex-A72 r0p3, 600-1500 MHz, 1 MiB shared L2 |
| Memory | 3.7 GiB usable, no swap |
| Storage | 64 GB microSD; 58 GB root filesystem, 36 GB free |
| GPU | Broadcom V3D 4.2.14.0 through ANGLE, OpenGL ES 3.1 |
| Graphics driver | Mesa 25.2.8 |
| OS / kernel | Ubuntu 24.04 arm64, Linux 6.8.0-1047-raspi |
| Runtime | Node 22.16.0, npm 10.9.2, Chromium 149.0.7827.0 |

The working hardware path is Chromium ANGLE/EGL with the V3D renderer. Desktop
X11 GL selected llvmpipe, and the other tested ANGLE/GL backends could not
create a usable WebGL2 context on this installation.

At the hardware snapshot, the Arm clock reported 1.500 GHz, the V3D/core clock
500 MHz, and temperature 52.1 C. `get_throttled=0x50000` had no current low-bit
throttle condition but does record historical power/throttling events, so power
supply quality remains a benchmark caveat.

## CPU benchmark

`sysbench 1.0.20 cpu --threads=N --time=10 run` was run after Chromium exited;
the test reported its default prime-number limit of 10,000.

| Threads | Events/s | Mean latency | p95 latency | Maximum latency |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1,449.23 | 0.69 ms | 0.72 ms | 1.34 ms |
| 4 | 5,774.02 | 0.69 ms | 0.69 ms | 21.96 ms |

Four threads delivered 3.98x the single-thread throughput. The game still has a
serial render/submission path, so this near-linear synthetic scaling does not
translate into a 4x frame-rate gain.

## Reproduction notes

The release was built on the development workstation with
`npm run build:port:threaded:release` and transferred to the Pi; no project
build ran on the Pi. Graphics profiling used `runtime_frame_profile.mjs` with
`PERF_PROFILE_SCENE=skirmish`, `PERF_PROFILE_SHADER_TIER=ps11`,
`PERF_PROFILE_WIDTH=1280`, `PERF_PROFILE_HEIGHT=720`, and hardware Chromium
flags `--enable-gpu --ignore-gpu-blocklist --disable-software-rasterizer
--use-angle=gl-egl --no-sandbox`.

The 30 FPS quality-preserving goal is therefore not met on this Pi 4. Reaching
it would require a further major reduction in draw/submission cost, a different
graphics backend, faster hardware, or reduced effects. The last option was
outside this task's quality constraint.
