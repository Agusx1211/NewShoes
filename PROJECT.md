# Project New Shoes architecture and roadmap

## Goal

Project New Shoes runs the original Command & Conquer: Generals Zero Hour C++
engine in a browser. The port compiles the real engine to WebAssembly and
replaces platform-specific dependencies with browser implementations. It does
not reimplement simulation, AI, scripts, units, weapons, maps, or game rules.

Zero Hour in `GeneralsMD/Code` is the primary target. The base Generals source
in `Generals/Code` is retained and supplies data required by the expansion, but
a separate vanilla Generals runtime is not currently exposed by the launcher.

## Source boundary

The original code already has the separation the browser port needs:

| Source area | Responsibility | Port policy |
|---|---|---|
| `GameEngine` | simulation, AI, INI, scripts, UI logic, objects, weapons, networking protocol | compile and preserve |
| `GameEngineDevice/W3DDevice` and `WWVegas/WW3D2` | DirectX 8 rendering | re-target device calls to WebGL2 |
| `MilesAudioDevice` and Miles interfaces | audio device and mixing | re-target to Web Audio |
| `VideoDevice/Bink` | movie playback | bridge to browser-decodable sidecars and video surfaces |
| `Win32Device` | windows, files, input, clocks, CD checks | map to Emscripten, DOM, and OPFS |
| `GameSpy` and UDP transport | lobby and packet transport | retain lockstep protocol; bridge transport to WebRTC and WebSockets |

Changes to original engine code are allowed only when a browser constraint
cannot be solved at the device boundary. Such changes preserve behavior and
change scheduling, I/O, or platform ownership only.

## Runtime architecture

The playable runtime uses an Emscripten pthread as the engine realm. This keeps
the browser main thread available while the original engine runs blocking C++
work. The worker owns:

- `GameEngine::init()` and the continuous update loop;
- an `OffscreenCanvas` and the D3D8 to WebGL2 executor;
- synchronous OPFS handles used by the original filesystem seam; and
- the original simulation, UI, renderer, audio manager, and network objects.

The main realm owns the browser desktop, launcher, input forwarding, Web Audio
nodes, media installation, settings, issue capture, and Trystero/WebRTC peer
discovery and transport.

### Rendering

The browser exposes a D3D8-shaped device to WW3D. It maps buffers, textures,
render states, fixed-function combiners, shader constants, render targets, and
draw calls to WebGL2. Enhanced rendering is the default and translates shipped
shader model 1.1 programs to GLSL ES. The classic generated fixed-function tier
remains selectable for comparison and fallback.

### Files and assets

The launcher accepts an installed game folder or the complete Generals and Zero
Hour media set. A worker parses the media and validates the required BIG
archives. User-owned data is streamed to Origin Private File System storage.

The engine worker opens synchronous access handles and exposes ordinary
`open/read/lseek/close` behavior to the original C++ filesystem code. This keeps
archive parsing, INI loading, map loading, texture lookup, and audio lookup in
the original engine while avoiding a second multi-gigabyte JavaScript copy.

### Audio, video, and networking

Miles-compatible calls schedule Web Audio buffers, streams, mixer buses, and
3D panners. Coverage exists for engine-driven music, speech, and 2D/3D samples;
natural gameplay coverage and mixing polish remain active work.

Bink metadata and presentation paths are ported, with browser-decodable sidecar
fixtures used by focused tests. Full game movie playback and audio sync are not
complete.

The original UDP and lockstep packet paths are retained behind a browser
transport adapter. Dedicated WebRTC data channels carry game packets, while
Trystero uses redundant public Nostr relays only for decentralized discovery
and encrypted SDP exchange. A short four-player threaded match is verified;
disconnect behavior and long determinism runs remain open.

## Launcher and lifecycle

`WebAssembly/harness/play.html` is the local launcher template. The public Pages
deployment serves that launcher at its canonical scope root, including custom
domains and project subpaths, without exposing the harness path. The Project
New Shoes desktop handles asset acquisition, install progress, display and
shader settings, diagnostics, and launch/close lifecycle.

Closing the game persists saves, shuts down original engine ownership, closes
audio and network state, releases OPFS handles and Web Locks, terminates the
worker, and removes the runtime canvas. Relaunch creates a fresh runtime
document because an `OffscreenCanvas` transfer is one-shot.

## Verification model

A graphical wasm port cannot be validated by compilation alone. The harness
uses Playwright to boot the real runtime, drive original input and command
paths, query structured engine state, and capture canvas screenshots.

The inner build loop is:

```sh
cd WebAssembly
npm run build:port
npm run test:startup-vertical
```

The threaded shipping path is gated with:

```sh
npm run verify:threaded-play
```

`npm run build:wasm` builds the broad legacy smoke surface and is reserved for
regression passes. New product verification should target `cnc-port` and the
real lifecycle, not add isolated probe executables.

## Current maturity

Verified today:

- full original Zero Hour initialization in the threaded browser runtime;
- shell, main menu, and all official multiplayer maps reaching rendered
  skirmish state;
- original input and common skirmish command paths;
- WebGL2 fixed-function and shader model 1.1 rendering tiers;
- engine-driven Web Audio samples and streams;
- browser-local asset installation and save persistence;
- short WebRTC multiplayer paths up to four players; and
- launcher shutdown and clean relaunch.

Still open:

- complete campaign, challenge, save/load, and win/loss flows;
- remaining shader, animation, terrain, effect, and UI fidelity;
- complete natural gameplay audio and movie playback;
- long multiplayer determinism, reconnect, and authenticated invitations;
- memory, performance, context-loss, and crash recovery work;
- Chrome hardening plus Firefox and Safari support; and
- removal of the remaining legacy probe and compatibility surface.

The active backlog is [TODO.md](TODO.md). Completed evidence is in
[DONE.md](DONE.md).

## Repository rules

- Reuse original code whenever it exists.
- Keep retail assets, extracted archives, builds, profiles, and screenshots
  untracked.
- Keep the real engine lifecycle as the progress metric.
- Verify rendering with browser state or pixels.
- Record new work in `TODO.md` and move verified completion to `DONE.md`.
- Check [LICENSE.md](LICENSE.md) before redistributing modified builds.
