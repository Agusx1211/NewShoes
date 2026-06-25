# TODO.md — Port checklist

Exhaustive, living checklist for porting C&C Generals: Zero Hour to WebAssembly.
Grouped by milestone (see `PROJECT.md`). `[ ]` = not started. Keep it honest:
nothing rendering-related is "done" until the **harness boots the build and a
screenshot or state check proves it** (see `AGENTS.md` "Don't work blind").

Primary target is `GeneralsMD/Code` (Zero Hour). `Generals/Code` (base game)
shares structure and follows behind.

---

## M0 — Build skeleton & asset pipeline

### Toolchain
- [x] Pin an Emscripten SDK version; document install/activate in `WebAssembly/`.
- [x] Add a CMake (or Make) build under `WebAssembly/` that drives `em++`.
- [x] Decide wasm target flags (memory growth, `MAXIMUM_MEMORY`, `TOTAL_STACK`,
      `STANDALONE_WASM` vs browser, exceptions, `-O` levels, `-g`/source maps).
- [x] Reproducible build script (`npm run build:wasm`) + clean target.
- [x] CI job that builds the wasm and runs the harness smoke test.

### Asset pipeline
- [x] Verify `tools/mode1_2352_to_iso.mjs` converts both disc `.bin` images.
- [x] Verify `tools/extract_zh_big_sample.sh` extracts INIZH.big (needs `7z`).
- [x] Extract the inventoried Zero Hour runtime BIG set (INIZH, W3DZH, AudioZH,
      TexturesZH, MapsZH, SpeechZH, language archives, etc.) and document it.
- [ ] Prove the exact minimum archive set required to boot through the original
      engine startup path.
- [x] Define how assets reach the browser (fetch from a path / drag-drop /
      file picker) — assets are **user-supplied**, never committed.
- [x] Document the legal stance: code is open; game data is the user's own.

### Harness (bootstrap)
- [x] Stand up Playwright/Puppeteer headless harness that loads the page.
- [x] Screenshot capture utility writing to `artifacts/screenshots/`.
- [x] A JS↔engine RPC/command channel stub (`boot`, `log`, `state`,
      `screenshot`).
- [x] Harness smoke test runnable locally (`npm run test:harness`).
- [x] Wire the harness smoke test into CI.

---

## M1 — Compile the platform-independent core

### Compatibility shims
- [ ] DirectX 8 / DX90SDK header shim so engine code that includes it compiles.
- [ ] Win32 type/macro shim (`HWND`, `DWORD`, `__cdecl`, `LARGE_INTEGER`, etc.).
- [x] Targeted Win32/exception shim for `WWVegas/WWDebug/wwdebug.cpp` core
      message/assert plumbing under wasm.
- [ ] STLport → libc++ migration pass (apply/replace `stlport.diff` as needed).
- [ ] Replace/neutralize MSVC-specific pragmas, `__forceinline`, SEH, inline asm.
- [x] Replace the `WWDebug` x86 breakpoint path with an Emscripten/clang trap
      fallback while preserving the original MSVC path.
- [ ] Audit 32-bit assumptions: struct packing, `int`/`long` sizes, alignment.
- [ ] Endianness audit for serialization paths (save game, net, CRC).

### Libraries (compile as-is where possible)
- [x] `Compression/EAC` BTree, Huff, and RefPack codecs compile from original
      source and round-trip smoke runs under wasm.
- [ ] Full `Compression` manager (RefPack/zlib/LZH/etc.) compiles and is
      unit-checked against real BIG data.
- [ ] `WWVegas/WWMath` compiles; spot-check vector/matrix results.
- [ ] `WWVegas/WWLib` (containers, string, ini, file abstractions) compiles.
- [x] `WWVegas/WWDebug` core `wwdebug.cpp` compiles and smoke-tests message,
      assert, trigger, and profile handlers under wasm.
- [ ] Full `WWVegas/WWDebug` (`wwmemlog.cpp`, `wwprofile.cpp`) compiles and
      routes asserts/logs to the browser console/harness.
- [ ] `WWVegas/WWSaveLoad` compiles.
- [ ] `WWVegas/Wwutil` compiles.
- [x] Identify which `Libraries/Source` deps are runtime-required vs tools-only.

### GameEngine — Common
- [ ] `Common/System` (file system iface, BIG archive, streams, memory) compiles.
- [ ] `Common/INI` parser compiles (reuse original — do NOT rewrite).
- [ ] `Common/RTS`, `Thing`, `Audio` (interfaces) compile.
- [ ] `GameEngine.cpp`, `GameMain.cpp`, `GlobalData.cpp`, `NameKeyGenerator`,
      `RandomValue`, `crc`, `MessageStream` compile.

### GameEngine — GameClient / GameLogic / GameNetwork (headers + logic)
- [ ] `GameLogic` (AI, Object, ScriptEngine, Map, System) compiles.
- [ ] `GameClient` (Display, Drawable, GUI, Input, InGameUI, Terrain) compiles.
- [ ] `GameNetwork` core (Connection, FrameData, NetPacket, protocol) compiles.
- [ ] Resolve link order; produce a wasm archive of the core (no devices yet).

---

## M2 — Boot to a black window

- [ ] Replace the skeleton wasm boot module with original engine Emscripten
      initialization.
- [ ] Emscripten entry point replacing `Main/WinMain.cpp` (`main()` + main loop).
- [ ] `emscripten_set_main_loop` driving the engine tick at fixed timestep.
- [ ] Timing layer: `QueryPerformanceCounter`/`timeGetTime` → `performance.now`.
- [ ] Canvas + GL context creation (no draw yet); resize handling.
- [ ] Logging/`DEBUG_LOG`/assert routed to browser console + harness.
- [ ] Engine `init()` runs to completion without crashing.
- [ ] Graceful handling of missing assets (clear error, not a hang).
- [ ] Harness: boot → confirm engine reached init → screenshot (black is fine).

---

## M3 — File / data subsystem (real data)

### File system device (Win32Device/Common → browser)
- [ ] Re-target `Win32LocalFileSystem`/`Win32LocalFile` onto MEMFS/IDBFS.
- [ ] Re-target `Win32BIGFileSystem`/`Win32BIGFile` to read fetched BIG archives.
- [ ] Async asset loading (fetch BIGs) without blocking the main loop (Asyncify
      or preload into FS before boot).
- [ ] Stub/neutralize `Win32CDManager` (no CD in browser; satisfy CD check).
- [ ] Persistence: user prefs / saves to IDBFS.

### Data load with original code
- [ ] Load real `INIZH.big`; original INI parser reads it (objects, weapons,
      locomotors, armor, FX, command sets/buttons, control bars, science, etc.).
- [ ] `GameText`/string tables load (CSF/GameText) for the chosen language.
- [ ] Map cache builds / loads.
- [ ] Harness state query: dump counts of parsed templates to prove data loaded.

---

## M4 — First pixels (W3D → WebGL2)

### WW3D2 device bring-up
- [ ] Map W3D render device init onto the WebGL2 context.
- [ ] Vertex/index buffer abstraction → GL buffers.
- [ ] Texture upload: DDS/DXT decode (or transcode) → GL textures; mipmaps.
- [ ] Render-state mapping (blend, depth, cull, alpha test) → GL state.
- [ ] Fixed-function pipeline emulation via generated GLSL ES shaders.
- [ ] Port/translate `wwshade` shaders + `W3DShaderManager` to GLSL ES.
- [ ] Matrix/transform stack and viewport/camera setup.

### Increasing fidelity (each step verified by screenshot)
- [ ] Clear to a color (prove the GL path works).
- [ ] 2D blits / `Image`/`DisplayString` text rendering.
- [ ] Single textured mesh renders.
- [ ] Terrain heightmap (`BaseHeightMap`/`HeightMap`/`FlatHeightMap`) renders.
- [ ] Scene/camera (`W3DScene`, `W3DDisplay`) renders the shell/menu background.
- [ ] Particles (`W3DParticleSys`), shadows, water, shroud, decals (later).
- [ ] Reach the **main menu rendering** end-to-end; screenshot it.

---

## M5 — Input & UI

- [ ] Mouse: Pointer events → engine `Mouse`/`W3DMouse` (move, buttons, wheel).
- [ ] Keyboard: DOM keyboard events → engine `Keyboard` (mapping, repeat, focus).
- [ ] Pointer lock / capture behavior where needed.
- [ ] Cursor rendering (engine-drawn cursor vs CSS cursor).
- [ ] `GameClient/GUI` widgets receive events and are clickable.
- [ ] Navigate shell menus (Single Player, Skirmish, Options) via harness.
- [ ] Harness: click named UI elements through the engine command path.
- [ ] Touch input mapping (stretch, for mobile).

---

## M6 — Playable skirmish (no audio/video)

- [ ] Load a skirmish map through the real map loader.
- [ ] Players/factions/generals set up from INI.
- [ ] Units/structures spawn and render on terrain.
- [ ] Selection (single, box, double-click) works.
- [ ] Movement orders + pathfinding (`AI`, locomotors) execute.
- [ ] Combat: weapons, damage, armor, FX resolve correctly.
- [ ] Production: build structures/units, resources (supplies) flow.
- [ ] `ScriptEngine` runs map scripts.
- [ ] Fixed-timestep simulation is **deterministic** (same seed → same result).
- [ ] AI opponent plays a skirmish.
- [ ] Win/lose conditions trigger.
- [ ] Harness: start match, step N frames, move/attack, assert state changes.
- [ ] Replay/recorder (`Recorder.cpp`) records and plays back deterministically.

---

## M7 — Audio (Miles → Web Audio)

- [ ] Re-target `MilesAudioManager` (and `WWVegas/Miles6`/`WPAudio`) to Web Audio.
- [ ] Decode original audio formats (WAV/MP3/Miles streams) via WebAudio/WebCodecs.
- [ ] 2D SFX playback with the engine's audio event system (INIAudioEventInfo).
- [ ] 3D positional audio (panning/attenuation) tied to camera/world.
- [ ] Music playback + transitions.
- [ ] EVA voice / unit voices.
- [ ] Volume/mixer controls wired to options UI.
- [ ] Respect browser autoplay policy (resume AudioContext on user gesture).
- [ ] Harness: assert audio events fire (state/log), not just sound.

---

## M8 — Video (Bink → WebCodecs)

- [ ] Re-target `VideoDevice/Bink` (`BinkVideoPlayer`/`VideoStream`) to WebCodecs
      or `<video>`.
- [ ] Decide path for `.bik` files: transcode offline vs in-browser decode.
- [ ] Logo / intro movie plays.
- [ ] Mission briefing / cutscene playback with audio sync.
- [ ] In-engine video surfaces (e.g. comms video) render to a texture.
- [ ] Skippable; integrates with game flow/state machine.

---

## M9 — Networking (GameSpy / LAN → WS/WebRTC)

- [ ] Re-target UDP transport (`udp.cpp`, `Transport`) onto WebRTC DataChannel
      or a WebSocket relay.
- [ ] Lockstep frame sync (`FrameData`/`FrameDataManager`/`ConnectionManager`)
      works across browser clients.
- [ ] LAN API (`LANAPI`) over a browser-discoverable transport / relay.
- [ ] GameSpy matchmaking/chat (`GameSpy*`) → modern relay or stub gracefully.
- [ ] NAT/firewall helpers replaced by WebRTC ICE.
- [ ] Cross-client **determinism** validated (no desync) over many frames.
- [ ] File transfer / map transfer path.
- [ ] Harness: drive a 2-client match in two headless contexts; assert in sync.

---

## M10 — Hardening, content, polish

### Performance & memory
- [ ] Frame-time budget; profile hotspots (sim vs render).
- [ ] wasm memory tuning; detect/fix leaks; texture/audio memory caps.
- [ ] Consider threads (pthreads + SharedArrayBuffer, COOP/COEP) where it helps.
- [ ] Consider WebGPU backend as a successor to WebGL2.
- [ ] Asset streaming / caching strategy for large BIGs.

### Content completeness (Zero Hour)
- [ ] All factions + all generals' powers/upgrades/units load and play.
- [ ] All skirmish maps load.
- [ ] Single-player campaign(s) playable (scripts, objectives, cinematics).
- [ ] Challenge mode (Zero Hour generals challenge).
- [ ] Save / load a game (serialization round-trips correctly).
- [ ] Options persist (graphics, audio, controls) via IDBFS.

### Robustness & compatibility
- [ ] Cross-browser: Chrome, Firefox, Safari (note WebCodecs/threads gaps).
- [ ] Mobile / touch viability (stretch).
- [ ] Error reporting + crash recovery; surfaced through harness.
- [ ] Handle context loss (WebGL context lost/restored).

### Base game
- [ ] Repeat the device re-targeting for `Generals/Code` (base game) once Zero
      Hour is stable (shares most device code).

---

## Cross-cutting: harness & verification (ongoing, never "done")

- [ ] Keep the RPC command surface growing with each subsystem (boot, menu nav,
      unit select/move/order, match start/step, state + log readback).
- [ ] Screenshot-diff regression suite for menus and in-game scenes.
- [ ] Deterministic-replay regression (record once, assert identical playback).
- [ ] Net-sync regression (two clients, assert no desync).
- [ ] CI runs build + harness smoke + screenshot diffs on every change.
- [ ] Document how to run the harness and interpret failures.

## Cross-cutting: project hygiene

- [ ] Keep `PROJECT.md` / `TODO.md` updated as milestones move.
- [ ] Track which original files are compiled, shimmed, or re-targeted (avoid
      accidental rewrites of platform-independent logic — see the hard rules).
- [ ] Record every browser-API bridge so the original-vs-port boundary stays clear.
