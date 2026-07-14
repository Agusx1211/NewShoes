# Project New Shoes architecture and product direction

## Goal

Project New Shoes runs the Command & Conquer: Generals Zero Hour C++ engine in a
browser. The foundational WebAssembly port is in place; current development
focuses on product features, fidelity, compatibility, performance, hardening,
and cleanup.

Zero Hour in `GeneralsMD/Code` is the primary target. The base Generals source
in `Generals/Code` is retained and supplies data required by the expansion, but
a separate vanilla Generals runtime is not currently exposed by the launcher.

## Source boundary

The original code already has the separation the browser port needs:

| Source area | Responsibility | Development policy |
|---|---|---|
| `GameEngine` | simulation, AI, INI, scripts, UI logic, objects, weapons, networking protocol | primary owner for engine and gameplay behavior; edit deliberately and test at this level |
| `GameEngineDevice/W3DDevice` and `WWVegas/WW3D2` | DirectX 8 rendering | extend the original rendering path and map its device operations to WebGL2 |
| `MilesAudioDevice` and Miles interfaces | audio device and mixing | preserve engine-facing semantics while implementing playback through Web Audio |
| `VideoDevice/Bink` | movie playback | preserve player ownership while bridging browser-decodable media and video surfaces |
| `Win32Device` | windows, files, input, clocks, CD checks | implement the required OS semantics through Emscripten, DOM, and OPFS |
| `GameSpy` and UDP transport | lobby and packet transport | retain the game protocol while using WebRTC and WebSockets for browser transport |

This boundary describes ownership, not a prohibition on engine changes. Core
engine files may be changed when they are the correct place for a feature or
fix. Make those edits carefully: understand the real call path and invariants,
keep the change focused, and protect simulation, save, data, and network
compatibility unless the task intentionally changes them. Do not build a
parallel browser-only implementation or a dummy shim merely to avoid a proper
engine change.

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

A graphical wasm product cannot be validated by compilation alone. The harness
uses Playwright to boot the real runtime, drive original input and command
paths, query structured engine state, and capture canvas screenshots.

The normal iteration build is:

```sh
cd WebAssembly
npm run build:port
```

Follow it with the focused test or harness flow that exercises the changed
feature. Use `npm run test:startup-vertical` when startup behavior is relevant;
it is a regression gate, not the universal definition of product progress.

Changes that affect the threaded shipping path should also run:

```sh
npm run verify:threaded-play
```

`npm run build:wasm` builds the broad legacy smoke surface and is reserved for
regression passes. Product verification should exercise `cnc-port` through the
real feature path; focused tests supplement that evidence rather than replacing
it.

## Current product state

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

Ongoing product areas include:

- complete campaign, challenge, save/load, and win/loss flows;
- remaining shader, animation, terrain, effect, and UI fidelity;
- complete natural gameplay audio and movie playback;
- long multiplayer determinism, reconnect, and authenticated invitations;
- memory, performance, context-loss, and crash recovery work;
- Chrome hardening plus Firefox and Safari support; and
- removal of the remaining legacy probe and compatibility surface.

This list is architectural context, not a backlog. GitHub Issues in
[`Agusx1211/NewShoes`](https://github.com/Agusx1211/NewShoes/issues) are the
canonical tracker for current features, bugs, follow-ups, and completion state.
The original port checklist and completion log are retired, frozen snapshots
under [`archive/`](archive/).

## Repository rules

- Change original engine code carefully when it is the right ownership point;
  prefer focused edits over parallel reimplementations or broad rewrites.
- Keep retail assets, extracted archives, builds, profiles, and screenshots
  untracked.
- Do not add stubs, no-op shims, canned-success paths, or fake compatibility
  behavior without explicit approval.
- Verify rendering with browser state or pixels.
- Track durable work and coordination in `Agusx1211/NewShoes` GitHub Issues.
- Develop on a branch from `dev` in an isolated
  `~/worktrees/<project>/<feature>` worktree, avoid collisions with other agents,
  and remove the worktree when the task is finished.
- Deliver completed agent work through a signed pull request targeting `dev`;
  a local commit or pushed branch alone is not a completed handoff.
- Keep the archived port checklists frozen; they are historical evidence, not
  the current workflow.
- Check [LICENSE.md](LICENSE.md) before redistributing modified builds.
