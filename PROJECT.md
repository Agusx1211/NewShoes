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

### Remote agent control

Remote play is an explicitly enabled data-layer path. The engine worker owns
semantic observations and mutations; the browser main realm only forwards a
versioned raw WebSocket protocol, and the optional Go process in
`AgentBridge/` maps authenticated REST calls to connected game sessions. When
the launcher has no agent configuration, it does not import the adapter or
create a socket, reconnect timer, or per-frame work.

The pre-launch Remote Agent app remembers the enabled state, bridge URL,
session ID, and fixed play mode in origin-local storage. Its browser credential
remains memory-only unless the operator explicitly chooses device-local token
storage. A bounded authenticated probe verifies reachability, credential, and
mode agreement without registering a playable session or starting the runtime
adapter.

The `cnc-agent/1` surface exposes the original `GameWindowManager` tree, real
gadget action paths, fog/stealth-filtered battlefield state, camera-bounded
visibility, compact tactical object records, and compact terrain grids. The
engine owns the filtering and uses opaque observation IDs so transport layers
cannot infer hidden object counts. Reusable template and command-set definitions
are separated from per-object availability, weapon, cooldown, containment, and
queue state so a control loop need not repeatedly ingest discovery metadata. It
also routes selection, tactical orders, production, construction, upgrades,
special powers, and camera movement through the original deterministic engine
messages. The independent REST-only full-match acceptance reached an
authoritative Easy-AI victory at frame 27,791 and is tracked under GitHub issue
75. The Go side can additionally turn compact snapshots into a resumable,
bounded SSE stream with coalescing, severity and wake policy, replay/overflow
semantics, and tactical filters. That agent-facing sugar is demand-driven and
does not add an engine loop or any work when the bridge/stream is unused. See
[`AgentBridge/README.md`](AgentBridge/README.md) for the wire boundary and local
usage.

### LLM commanders

The browser desktop also owns a local LLM commander path that does not require
the remote AgentBridge service. The LLM AI Manager stores named
OpenAI-compatible profiles and match sessions in IndexedDB, tests provider and
tool-protocol compatibility, discovers available model names and reported
context limits, redacts credentials from exports, and publishes saved profile
names into the original Skirmish and LAN player-template lists.
Provider requests travel directly from the browser to the endpoint selected by
the user; the project does not proxy model credentials or gameplay context.

During a playable match, the authoritative browser creates one autonomous
session per LLM slot. The engine resolves the slot to its real computer
`Player`, produces a fog- and stealth-filtered player-scoped observation, and
accepts validated semantic orders through the original game-message paths. An
LLM skirmish slot holds an exclusive strategy lease: automatic classic building,
team, upgrade, skill, target, and mission selection is inactive, while the
original build lists, work orders, production queues, team completion, scripts,
pathfinding, weapons, and local unit state machines continue executing accepted
work. Optional classic fallback is an explicit, recorded lease transfer; the two
strategic controllers never run concurrently. Controller-neutral production and
force requests are currently restricted to skirmish until they have a synchronized
multiplayer command.

Routine model input is a hard-bounded strategic summary with deltas, stable squad
and contact handles, persistent jobs and missions, and a revision for static
catalogs. Focused entity, build-option, job, and map queries provide deterministic
filtering and snapshot-bound pagination. Each observation and tool result is
bounded after serialization. Normal native-tool turns append to a stable prompt;
before overflow, the runtime creates a structured strategic checkpoint while
preserving complete tool-call/result groups and a configurable recent suffix.
The separately selectable structured adapter never activates as a silent retry.
Sessions retain the full redacted evidence stream and distinguish provider
requests, model decisions, engine execution, autonomous reactions, ownership
transitions, and authoritative outcomes.

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

The browser mod library accepts BIG archives, loose engine-data folders, and
downloaded ZIP, 7z, RAR, NSIS, and Clickteam Install Creator packages. Installers
are decoded as data and are never executed. Native DLL and executable components
are reported but cannot run in the WebAssembly engine. Imported BIG archives are
kept in OPFS and exposed to the original `-mod` loading path. Users can enable
multiple mods, choose their archive options, and order them; later archives and
mods retain the engine's normal override precedence.

Every launch configuration has a SHA-256 identity derived from the ordered mod
and archive content hashes. That exact identity owns a separate engine `HOME`
under the persistent user-data mount, so saves and replays do not leak between
vanilla or differently ordered mod sets. The launcher can browse those isolated
folders and make an explicit, risk-acknowledged compatibility copy without
changing the source file. Multiplayer discovery incorporates the same identity,
preventing peers with different content or load order from sharing a room. The
encrypted device-transfer flow can copy the installed mod library together with
its active load order. Saves and replays transferred in the same session are
written into that exact configuration's isolated user-data folder.

### Audio, video, and networking

Miles-compatible calls schedule Web Audio buffers, streams, mixer buses, and
3D panners. Coverage exists for engine-driven music, speech, and 2D/3D samples;
natural gameplay coverage and mixing polish remain active work.

Bink metadata and presentation stay in the original engine path. Local builds
can use prebuilt browser sidecars; hosted builds lazily convert selected
user-owned Bink files on-device to VP8 video plus PCM audio, cache the results
in OPFS, and feed decoded frames back through the original W3D video surface.
Broader campaign coverage, format handling, and audio-sync polish remain active
work.

The original UDP and lockstep packet paths are retained behind a browser
transport adapter. Dedicated WebRTC data channels carry game packets, while
Trystero uses the project Nostr relay plus deterministic public fallbacks only
for decentralized discovery and encrypted SDP exchange. A short four-player
threaded match is verified; disconnect behavior and long determinism runs
remain open.

## Launcher and lifecycle

`WebAssembly/harness/play.html` is the local launcher template. The public Pages
deployment serves that launcher at its canonical scope root, including custom
domains and project subpaths, without exposing the harness path. The Project
New Shoes desktop handles asset acquisition, install progress, display and
shader settings, diagnostics, mod installation and selection, isolated save and
replay management, and launch/close lifecycle.

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
- browser-local ordered mod installation, exact composition identities, and
  isolated save/replay management;
- encrypted device transfer of installed games, mods, saves, and replays;
- short WebRTC multiplayer paths up to four players; and
- launcher shutdown and clean relaunch.

Ongoing product areas include:

- complete campaign, challenge, save/load, and win/loss flows;
- remaining shader, animation, terrain, effect, and UI fidelity;
- broader natural gameplay audio, campaign-movie, and movie-sync coverage;
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
