# PROJECT.md — C&C Generals: Zero Hour → WebAssembly

## 1. Goal

Run the **real** Command & Conquer: Generals / Zero Hour in a web browser by
compiling the **original C++ source** (already in this repo) to WebAssembly with
Emscripten, and re-targeting its platform/device layer onto browser APIs.

This is a **port**, not a rewrite. We do not reimplement gameplay, AI, rendering,
or data formats. The simulation, AI, INI/asset loading, object/weapon/locomotor
behavior, networking protocol, and UI logic are all reused as-is from the
original source. We only replace the parts that physically cannot run in a
browser — the device/platform implementations and the vendored native libraries.

See `AGENTS.md` and `CLAUDE.md` for the hard rules. The rule of thumb: **if the
code exists, compile it; only write new code to bridge a platform/device
dependency to a browser API.**

## 2. Source layout (what we're porting)

```
GeneralsMD/Code/                  ← Zero Hour (primary target)
  GameEngine/                     ← platform-independent; compiles ~as-is
    Source/Common/                  core systems, INI parsing, BIG/file system,
                                    audio interfaces, RTS subsystems
    Source/GameClient/              UI, drawables, input, display, terrain, GUI
    Source/GameLogic/               simulation: AI, Object, ScriptEngine, Map
    Source/GameNetwork/             net protocol, LAN/GameSpy, frame sync
  GameEngineDevice/               ← platform-specific; THIS is what we re-target
    Source/W3DDevice/               rendering on DirectX 8 / WW3D  → WebGL2/WebGPU
    Source/Win32Device/             window, files, input, timing  → Emscripten/DOM
    Source/MilesAudioDevice/        audio via Miles                → Web Audio
    Source/VideoDevice/Bink/        video via Bink                 → WebCodecs/<video>
  Libraries/Source/               ← vendored deps
    WWVegas/WW3D2                    the W3D 3D engine               → WebGL/WebGPU
    WWVegas/WWMath, WWLib, ...       math/util/debug/saveload        compile ~as-is
    WWVegas/Miles6, WPAudio          audio backends                  → Web Audio
    Compression                     refpack/zlib etc.               compile ~as-is
    GameSpy                         online matchmaking              → WebSocket relay
    DX90SDK                         DirectX headers/types           → shim/stub
    STLport-4.5.3                   old STL                         → system libc++
  Main/WinMain.cpp                ← Win32 entry point               → emscripten main
GeneralsMD/Code/Tools/            ← editors/build tools (WorldBuilder, etc.) — out of scope for runtime

Generals/Code/                    ← base-game source (secondary; same structure)

WebAssembly/                      ← the port work area (build, JS bridge, harness)
  tools/                          ← asset extraction (disc → BIG archives)
  artifacts/real-assets/          ← extracted INIZH.big, W3DEnglishZH.big, etc.
  artifacts/screenshots/          ← harness output

assets/                          ← original disc images (.bin/.cue) for asset extraction
```

Scale (Zero Hour): ~1,420 `.cpp` and ~1,470 `.h` files; WW3D alone is ~318 `.cpp`.

## 3. Architecture of the port

The engine is already split along a device-interface seam. The plan exploits it:

```
        ┌─────────────────────────────────────────────┐
        │  GameEngine  (reused, compiled as-is)        │
        │  simulation · AI · INI · UI logic · netcode  │
        └───────────────┬─────────────────────────────┘
                        │  abstract device interfaces
        ┌───────────────┴─────────────────────────────┐
        │  GameEngineDevice  (RE-TARGETED)             │
        │  Display / Audio / Video / FileSystem /      │
        │  Input / Window / Timing / Net transport     │
        └───────────────┬─────────────────────────────┘
                        │  browser APIs (via Emscripten + JS bridge)
        ┌───────────────┴─────────────────────────────┐
        │  WebGL2/WebGPU · Web Audio · WebCodecs ·     │
        │  Pointer/Keyboard · OPFS/IDBFS · fetch ·     │
        │  WebSocket/WebRTC                            │
        └──────────────────────────────────────────────┘
```

Mapping table (from `AGENTS.md`):

| Original dependency           | Browser target                                   |
|-------------------------------|--------------------------------------------------|
| DirectX 8 / W3D rendering     | WebGL2 (baseline) → WebGPU (later)               |
| Miles Sound System            | Web Audio API                                    |
| Bink video                    | WebCodecs / `<video>`                            |
| Win32 (window/files/input/time)| Emscripten + DOM / Canvas / Pointer + Keyboard  |
| GameSpy networking            | WebSockets / WebRTC                              |
| File / BIG archive I/O        | streamed fetch → OPFS + engine-thread sync reads (saves: IDBFS) |

## 4. Toolchain

- **Emscripten** (`emcc`/`em++`), targeting browser wasm.
- Build system: a CMake/Make setup under `WebAssembly/` that compiles the
  original tree with browser-targeted device sources swapped in.
- **STLport** is replaced by the toolchain's libc++; the original heavily
  uses STLport-specific behavior, so a compatibility pass is required.
- DirectX/Win32 headers are shimmed so engine code that includes them compiles.

## 5. The harness (don't work blind)

A wasm build is graphical; an agent cannot see it. A **scriptable harness** is a
first-class, permanent deliverable that grows with the port:

- Headless browser (Playwright/Puppeteer) that boots the build, drives it, and
  **captures canvas screenshots** (the only way to verify rendering).
- A **command/RPC control surface** (JS bridge + engine hooks) to: boot, load or
  skip to a menu/map, click named UI elements, select/move units, issue orders,
  start/step a match, and read back game state + logs.
- Prefer driving the engine's **own input/command path** over pixel-clicking,
  then verify with a screenshot and/or state query.
- **Every change is unverified until the harness boots it and a screenshot or
  state check proves it.**

## 6. Milestones (rough order)

1. **M0 — Build skeleton & asset pipeline.** Emscripten toolchain set up; can
   extract real BIG archives from the disc images; CMake builds a trivial wasm.
2. **M1 — Compile the platform-independent core.** Get `GameEngine` + needed
   `Libraries` (WWMath/WWLib/Compression) compiling to wasm with DX/Win32 shims;
   STLport→libc++ pass. No rendering yet.
3. **M2 — Boot to a black window.** Emscripten main loop, file system (BIG via
   fetch/MEMFS), timing, logging. Engine initializes and loads INI without
   crashing. Harness can boot and screenshot.
4. **M3 — File/data subsystem real.** Real INIZH.big parsed by the original INI
   code; GameText/strings; map cache. State queryable via harness.
5. **M4 — First pixels (W3D → WebGL2).** Bring up WW3D2 renderer on WebGL2:
   clear, 2D blits, then 3D meshes/terrain/shaders. Reach the main menu / shell
   map rendering.
6. **M5 — Input & UI.** Pointer/keyboard → engine input; the GUI (`GameClient/GUI`)
   is clickable; navigate menus via harness.
7. **M6 — Playable skirmish (no audio/video).** Load a map, spawn units, select,
   move, attack; simulation + AI + ScriptEngine run a match deterministically.
8. **M7 — Audio (Miles → Web Audio).** SFX, music, EVA voice.
9. **M8 — Video (Bink → WebCodecs).** Intro/briefing/cutscene playback.
10. **M9 — Networking (GameSpy/LAN → WS/WebRTC).** Deterministic lockstep
    multiplayer over a browser transport.
11. **M10 — Hardening.** Performance, memory, save/load, persistence (IDBFS),
    full Zero Hour content (generals, campaigns), cross-browser, mobile.

## 7. Known hard problems / risks

- **WW3D / DirectX 8 fixed+shader pipeline → WebGL2.** Largest single effort;
  fixed-function emulation, shader translation, render-state mapping, texture
  formats (DDS/DXT), vertex/index buffer model.
- **STLport vs libc++** subtle behavioral differences across ~3k files.
- **Endianness/word-size & pointer assumptions** — original is 32-bit x86;
  wasm32 is 32-bit (good) but struct packing, alignment, and `int`/`long`
  assumptions still need auditing. Save-game and net serialization are sensitive.
- **Determinism for multiplayer** — float behavior, RNG, frame timing must match
  across clients (and ideally the original) for lockstep sync.
- **Single-threaded vs threads** — original threading (audio, net, file) maps to
  the emscripten main loop, Web Workers, or pthreads (SharedArrayBuffer + COOP/COEP).
- **Blocking calls** (`Sleep`, blocking sockets/file IO) must become async or
  Asyncify-wrapped without deadlocking the main loop.
- **Asset size & licensing** — real game data is large and copyrighted; assets
  are user-supplied (extracted from their own discs), never bundled.
- **Bink & Miles are proprietary** — only the *interface* is in the source; the
  implementations must be re-targeted, not "ported" line-for-line.

## 8. Definition of done

The real Zero Hour boots in a stock browser from user-supplied assets, renders
the menu and an in-game match, accepts input, plays a skirmish vs. AI with
audio, and (stretch) supports multiplayer — all driven and verifiable through
the headless harness.
