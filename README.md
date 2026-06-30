# Command & Conquer: Generals + Zero Hour — WebAssembly Browser Port

This repository is a **port of the actual Command & Conquer: Generals and Zero
Hour C++ source code to WebAssembly**, so the **real game** runs in a web
browser. It is built by compiling the genuine engine source already in this repo
and re-targeting its platform/device layer (DirectX 8 / W3D, Miles audio, Bink
video, Win32, GameSpy) onto browser APIs (WebGL2/WebGPU, Web Audio, WebCodecs,
DOM input, WebSockets/WebRTC).

It is **not** a reimplementation, **not** a clone, and **not** an "inspired-by"
mini-game. It is the original simulation, AI, rendering, audio, video, input, and
networking — recompiled for the browser. The upstream source is EA's official
Generals/Zero Hour release (preserved at the bottom of this file).

> **Status: early. The engine boots, parses real game data, and is putting the
> first real pixels on a WebGL canvas (see [Current status](#current-status)).**
> It is not yet a playable game in the browser.

---

## The idea in one paragraph

The original game already cleanly separates **platform-independent game logic**
(`GameEngine/`) from **platform-specific device code** (`GameEngineDevice/`,
`Libraries/`). That separation is the whole reason this port is feasible: we
**keep the game code and replace the platform.** The simulation, AI, INI/data
loading, object/weapon/locomotor behavior, and the W3D scene graph compile to
wasm largely as-is; only the device interfaces that talk to DirectX, Miles,
Bink, Win32, and GameSpy get re-implemented against browser equivalents.

The hard rule: **if code already exists in the original source, reuse it
(compile/port it).** New machinery is written only when a platform/device
dependency genuinely cannot work in the browser and must be re-targeted to a
browser API. We do not re-write engine or data logic that already exists and is
platform-independent.

---

## Where the real source lives

```
Generals/Code/          original Generals (base game) source
GeneralsMD/Code/        original Zero Hour source  ← primary port target
  GameEngine/           platform-INDEPENDENT game logic (sim, AI, INI, GUI, …)
                        → compiles to wasm largely as-is
  GameEngineDevice/     platform-SPECIFIC device implementations:
    W3DDevice/            3D rendering on DirectX 8 / the WW3D (W3D) engine
    MilesAudioDevice/     audio via the Miles Sound System
    VideoDevice/          video via Bink
    Win32Device/          OS layer: window, files, input, timing
  Libraries/Source/     vendored deps: DX90SDK, WWVegas (W3D), GameSpy,
                        Compression (RefPack/zlib/LZH), STLport, …

WebAssembly/            the port work area: Emscripten build, browser shims,
                        device re-targeting, asset tooling, and the harness
```

The platform-independent data layer — INI parsing in
`GameEngine/Source/Common/INI/`, compression and BIG-archive I/O in `Libraries`
/ `GameEngineDevice` — is reused directly, not rewritten.

---

## How it works: replacing every platform dependency

The port keeps the original game code and swaps each device/library dependency
for a browser-native target. Toolchain: **Emscripten** (`emcc`/`em++`).

| Original dependency | Browser replacement |
|---|---|
| DirectX 8 / W3D rendering | **WebGL2** (baseline) → WebGPU (later) |
| Miles Sound System (audio) | **Web Audio API** |
| Bink (video) | **WebCodecs** / `<video>` |
| Win32 — window, files, input, time | **Emscripten** + DOM / Canvas / Pointer + Keyboard events |
| GameSpy (networking) | **WebSockets / WebRTC** |
| File / BIG archive I/O | **fetch** + in-memory FS (MEMFS), range-backed archive streaming |
| STLport | **libc++** (migration pass across the source) |
| MSVC / Win32 types, pragmas, SEH | portable shims + Emscripten/Clang equivalents |

Concretely, that means:

- **Rendering** — the DirectX 8 calls the WW3D engine makes are serviced by a
  D3D8→WebGL2 shim: render-state mapping, fixed-function pipeline emulation via
  generated GLSL ES shaders, texture upload (DDS/DXT), vertex/index buffers,
  matrix/camera setup. This is the single largest effort.
- **Files & assets** — the original `Win32BIGFileSystem` / `FileSystem` path is
  preserved; game data comes from **user-supplied BIG archives** fetched into
  MEMFS (or streamed via HTTP range requests), then read by the original
  archive/INI code. Assets are never bundled — players supply their own from
  discs/installs they own.
- **Audio / video / input / net** — each device interface
  (`MilesAudioDevice`, `VideoDevice`, `Win32Device`, GameSpy) gets a browser
  back end behind the engine's existing interface, so the engine above it is
  unchanged.

---

## Don't work blind: the harness

A wasm/browser build is graphical and interactive, so progress is verified by a
**scriptable headless-browser harness** (Playwright), not by eyeballing. The
harness boots the build, drives the engine through its **own command/RPC
surface** (`window.CnCPort.rpc(...)`), reads back structured probe state
(draw-call counts, texture uploads, parsed-data checks), and **captures canvas
screenshots**. Nothing rendering-related is considered done until the harness
boots it and a screenshot or state check proves it.

The work proceeds as small, individually-verified **"verticals"**: each new
capability (a 2D blit, a font glyph, a mapped UI image, a terrain tile, a shipped
mesh, a Bink frame) is driven end-to-end through real engine code against real
assets and asserted on real pixels before it lands.

### Running it

From `WebAssembly/` (requires Emscripten, Node, and user-supplied disc images in
`../assets` for the asset-backed smokes):

```sh
npm run verify:assets               # extract/verify real BIG archives from discs
npm run build:wasm                  # build the current wasm targets
npm run test:real-big-browser       # boot the harness, read real INIZH.big via the original BIG reader
npm run test:vertical-integrations  # run the combined render/data verticals
```

See `WebAssembly/README.md` for the full tooling, `WebAssembly/ASSETS.md` for
asset ownership/delivery rules, and `WebAssembly/SOURCE_INVENTORY.md` for the
runtime-vs-tools library inventory.

---

## Current status

Early but moving. Roughly:

- **Done / working:** Emscripten build skeleton and asset pipeline (extract real
  BIG archives from discs); the platform-independent core compiles with DX/Win32
  shims; the engine boots far enough to parse **real game data through the
  original INI parser** (e.g. `Terrain.ini` → 247 terrain types) and read BIG
  archives via the original `FileSystem` path; a WebGL2-backed harness with
  RPC + screenshot capture.
- **In progress — first pixels (W3D → WebGL2):** real game pixels are reaching
  the canvas through the **original W3D draw path** — 2D fills/lines/gradients,
  font/text glyphs, the real **MainMenu** logo and controls (mapped UI images
  from real archives), real **terrain** texture tiles and a shipped-map height
  patch rendered through `RTS3DScene`, shipped 3D meshes, and Bink frames decoded
  to textures. Each is a verified isolated vertical; full menu/scene composition
  is the next visible milestone.
- **Not started yet:** input wired to a rendered, clickable GUI; a playable
  skirmish (sim + AI + scripts driving a match); audio (Miles → Web Audio);
  video (Bink → WebCodecs); networking (GameSpy/LAN → WS/WebRTC); hardening,
  save/load, and full content.

### Milestones (rough order)

`M0` build skeleton & asset pipeline · `M1` compile the platform-independent
core (DX/Win32 shims, STLport→libc++) · `M2` boot to a black window · `M3`
real file/data subsystem (original INI parser reads real archives) · **`M4`
first pixels (W3D → WebGL2)** ← current · `M5` input & UI · `M6` playable
skirmish · `M7` audio · `M8` video · `M9` networking · `M10` hardening.

**Definition of done:** the real Zero Hour boots in a stock browser from
user-supplied assets, renders the menu and an in-game match, accepts input,
plays a skirmish vs. AI with audio, and (stretch) supports multiplayer — all
driven and verifiable through the headless harness.

See `PROJECT.md` (architecture, milestones, risks), `TODO.md` (open checklist),
`DONE.md` (completed history), and `IDEAS.md` (deferred designs) for detail.

### Known hard problems

- **WW3D / DirectX 8 fixed+shader pipeline → WebGL2** — the largest single
  effort (fixed-function emulation, shader translation, render-state mapping,
  DDS/DXT texture formats).
- **STLport vs libc++** behavioral differences across thousands of files, and
  ABI/layout (`#pragma pack`, struct packing) consistency across translation
  units.
- **Determinism for multiplayer** — float behavior, RNG, and frame timing must
  match across clients for lockstep sync.
- **Threads & blocking calls** — original threading (audio/net/file) and
  blocking I/O must map to the Emscripten main loop, Web Workers/pthreads, or
  Asyncify without deadlocking.
- **Assets are proprietary & user-supplied** — never bundled. Bink and Miles
  ship only as interfaces in the source; their implementations are re-targeted,
  not ported line-for-line.

---

## Original upstream source (preservation notes)

The code in `Generals/` and `GeneralsMD/` is EA's official source release for
Command & Conquer: Generals and its expansion Zero Hour, originally provided for
preservation and Steam Workshop support
([C&C Generals](https://steamcommunity.com/workshop/browse/?appid=2229870) ·
[Zero Hour](https://steamcommunity.com/workshop/browse/?appid=2732960)).

To run any compiled binaries you must own the game (e.g. the
[C&C Ultimate Collection](https://www.ea.com/en-gb/games/command-and-conquer/command-and-conquer-the-ultimate-collection/buy/pc)).

### Building the original Win32 source (upstream, not the wasm port)

The original code targets Win32. The legacy workspace `rts.dsw` builds in MSVC
6.0 (SP6 for binary-matching Generals 1.08 / Zero Hour 1.04), or can be
converted via MSVC .NET 2003 → MSVC 2015+. Modern MSVC enforces newer C++
standards, so extensive changes are needed before it compiles, more so for
Win64. Rebuilding the original tools/binaries requires replacements for several
proprietary libraries (DirectX SDK, STLport 4.5.3, 3DSMax 4 SDK, NVASM,
BYTEmark, Miles Sound System, Bink, SafeDisk, GameSpy SDK, ZLib, LZH-Light) —
see the git history of this file for the original expected paths.

`STLport` requires changes to compile; [stlport.diff](stlport.diff) is provided
for the original build (apply against STLport 4.5.3).

---

## License

This repository and its contents are licensed under the GPL v3 license, with
additional terms applied. See [LICENSE.md](LICENSE.md) for details.
