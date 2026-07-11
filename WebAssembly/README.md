# Project New Shoes WebAssembly runtime

Working area for the Project New Shoes browser/WebAssembly port. See the
repo-root `AGENTS.md` for the goal and strategy.

**The port compiles the original source**, not reimplementations. The goal is to
build `GeneralsMD/Code` with Emscripten and re-target its platform/device layer
(`GameEngineDevice`, `Libraries`) onto browser APIs. The original engine already
contains the data layer (INI parsing in `GameEngine/Source/Common/INI/`,
compression and BIG-archive I/O in `Libraries` / `GameEngineDevice`); reuse it
rather than re-writing it.

## What's here

Asset tooling for obtaining real game data to test the port against:

- `tools/mode1_2352_to_iso.mjs` — convert raw MODE1/2352 disc images to ISO.
- `tools/extract_zh_big_sample.sh` — extract `INIZH.big` from the disc images in
  `../assets` (`npm run extract:real-big`). Needs `7z`.
- `tools/extract_zh_runtime_archives.sh` — extract the current runtime BIG
  inventory from the local disc images (`npm run extract:runtime-archives`).
  If base Command & Conquer: Generals disc images are also present, it also
  extracts `INI.big` and `English.big` for original startup fallback data.
- `harness/` — a minimal browser harness with a WebGL2-backed black canvas and
  JS RPC stub for boot/frame/log/state/screenshot commands. This is port
  infrastructure only; it does not implement or simulate game behavior.

Extracted archives land under ignored `artifacts/real-assets/`.
See `ASSETS.md` for the asset ownership rules and browser delivery plan.
See `SOURCE_INVENTORY.md` for the current runtime-vs-tools library inventory.

### Play-page host controls

`harness/play.html` leaves the running game free of custom controls. Player-
facing display and diagnostic options live in the Project New Shoes Desktop Settings
window under **Game & Display**. Embedders and browser diagnostics can control
the same settings through `window.CnCPort.play`:

```js
await window.CnCPort.play.configure({
  performanceOverlay: { enabled: true, historySeconds: 5, graphMaxMs: 50 },
  display: { mode: "dynamic" }, // or { mode: "fixed", width, height }
  diagnostics: "lite",
});
```

The performance overlay is off by default. It shows client/logic FPS, engine
and presentation frame times, engine p95/max, and a scrolling graph when
enabled. The same host surface exposes fullscreen, shader-tier, console, and
issue-recorder controls. A host can provide initial settings before the page
modules run with `window.CnCPortPlayConfig` using the same
`performanceOverlay`, `display`, `diagnostics`, and `shaderTier` fields.

Verify the local real-asset sample pipeline:

```sh
npm run verify:assets
```

This requires the user-supplied Zero Hour disc images in `../assets` and `7z`.
Set `VERIFY_ASSETS_FORCE_CONVERT=1` to force both `.bin` images through
`mode1_2352_to_iso.mjs` instead of accepting up-to-date ISO outputs.
Base Generals disc images are not required for this sample verification.
`npm run extract:runtime-archives` auto-detects base `.bin` images in
`../assets` when their names contain `Generals` and `Disc 1`/`Disc 2` but not
`Zero Hour`; set `CNC_GENERALS_DISC1_IMAGE=/path/to/disc1.bin` and
`CNC_GENERALS_DISC2_IMAGE=/path/to/disc2.bin` to use explicit paths.

Run the opt-in real BIG archive smoke:

```sh
npm run test:real-big
npm run test:real-big-browser
npm run test:runtime-archives-browser
npm run test:vertical-integrations
```

This also requires the user-supplied disc images. It builds the current wasm
targets, verifies/extracts `INIZH.big`, then uses the original
`Win32BIGFileSystem` and `FileSystem` path to index and read real INI files from
the extracted archive under Node or the browser harness. The browser variant
also boots the main `cnc-port` harness and verifies `window.CnCPort.rpc("mountArchive")`
can fetch `INIZH.big` into MEMFS and probe it through the same original BIG
reader. The runtime-archives variant extracts the inventoried local BIG set,
then boots the main `cnc-port` harness, fetches all runtime archives into one
MEMFS directory with `window.CnCPort.rpc("mountArchives")`, and verifies every
archive plus the aggregate `*.big` archive tree through the original BIG reader.
If optional base `INI.big`/`English.big` archives exist in
`artifacts/real-assets/`, the smoke includes them too, mounted with names that
sort after the Zero Hour archives so the original no-overwrite archive tree
keeps Zero Hour files ahead of base fallback files.
The verified aggregate archive directory and `*.big` mask are also registered
in the wasm bootstrap state before the harness calls `boot`, then checked again
after boot so the later original engine startup path has a stable preloaded
archive-set contract. During `boot`, the wasm bootstrap now consumes that
registered archive set by probing the aggregate path through the original
`Win32BIGFileSystem`; the result is reported as `archiveMount.bootProbe`.
The same smoke verifies `assetProbe.gameText` by loading the real English
`Generals.csf` through original `GameText.cpp` and checking known
title/control-bar labels plus `CONTROLBAR:` prefix enumeration. It also checks
`assetProbe.gameData` by loading the real `Data\INI\GameData.ini` through the
original `Common/INI.cpp::load` path into original `GlobalData.cpp`, then
verifying shipped values such as the shell map, FPS limit, cloud-map flag,
rubble height, group-select volume, and particle limit. The bootstrap reports
this as `gameData.source = "GameEngine/Common/INI.cpp::load"`. It now also
checks `assetProbe.water` by loading real `Data\INI\Water.ini` through original
`Common/INI.cpp::load`, `Common/INI/INIWater.cpp`, and `GameClient/Water.cpp`,
verifying shipped water textures, scroll/repeat values, and transparency
settings. It also checks `assetProbe.weather` by loading real
`Data\INI\Weather.ini` through original `Common/INI.cpp::load` and
`GameClient/Snow.cpp`, verifying shipped
snow/weather settings. It also checks `assetProbe.mapCache` by loading the real
`Maps\MapCache.ini` through original `Common/INI.cpp::load` and
`Common/INI/INIMapCache.cpp`, verifying shipped map counts plus known ShellMapMD
and Tournament Desert entries. The bootstrap also reports `dataSummary`, a
compact harness state object that rolls the real archive, parser, template,
map, and string counts into one startup-readiness view. It also reports
`startupAssets`, which stays `missing_runtime_archives` without a registered
runtime archive set, moves to
`pending_boot_probe` after preload registration, and only becomes `ready` after
the boot-time archive/GameData/Water/Weather/GameText/MapCache probes pass.
It also reports `originalEngineStartup`, which keeps full original
`GameEngine.cpp::init` separate from the bootstrap preflight: it lists missing
default/startup files from the current archive set and reports browser device
factory readiness as false until real browser-backed factories replace the
compile-only surface. With a real base `INI.big` present, the runtime-archives
smoke expects those missing default/startup INI paths to become ready and the
remaining `originalEngineStartup` status to advance to browser device-layer
work. This is still a bootstrap preflight; full original
all-block INI loading, startup CRC coverage, default+shipped water/weather
loading, map water/weather overrides, water/weather rendering, and live
map-cache rebuilds remain part of engine startup work.
`npm run test:vertical-integrations` is the broader progress gate: after one
build and runtime-archive extraction it runs the runtime archive startup path,
range-backed startup archive path, WindowZH-backed MainMenu layout callbacks,
mapped-image display rendering, and shipped W3D mesh rendering. Use it when a
change should prove the port is moving across subsystems instead of only deeper
inside one startup probe.

## Toolchain

The pinned Emscripten version is recorded in `emscripten-version.txt`; this
workspace currently targets Emscripten `3.1.6`.

Install and activate that version with `emsdk`:

```sh
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install "$(cat /path/to/CnC_Generals_Zero_Hour/WebAssembly/emscripten-version.txt)"
./emsdk activate "$(cat /path/to/CnC_Generals_Zero_Hour/WebAssembly/emscripten-version.txt)"
source ./emsdk_env.sh
```

Build the current wasm skeleton:

```sh
npm run build:wasm
```

The build uses `emcmake cmake` and writes generated files to ignored `dist/`.
It currently builds the port boundary bootstrap plus focused original library
slices, not the full original engine. The browser bootstrap links and executes
an original `GameEngine/Common/RandomValue.cpp` deterministic probe so the
harness can prove original code is present in the loaded wasm module. It also
reports a browser-backed `emscripten_get_now()` timing probe through the harness
state so manual and scheduled bootstrap ticks can be checked for monotonic
advancement before the real engine timing layer replaces the bootstrap. The
bootstrap also links original `Win32Device/Common/Win32CDManager.cpp` and
reports `cdManagerProbe`, proving the browser Win32 drive shims let the original
CD manager initialize to a no-drive state without blocking. GameClient CD-start
prompts still need to be routed through browser asset readiness before engine
startup is complete.
The selected baseline flags are:

- ES module output with `MODULARIZE=1` / `EXPORT_ES6=1`.
- Browser/worker environment.
- Memory growth enabled, 64 MiB initial memory, 2 GiB maximum memory.
- 1 MiB stack via `TOTAL_STACK=1048576`.
- Debug assertions enabled for the bootstrap build.
- Exported C symbols: `cnc_port_boot`, `cnc_port_frame`,
  `cnc_port_start_main_loop`, `cnc_port_stop_main_loop`,
  `cnc_port_probe_archive`, `cnc_port_register_archive_set`, `cnc_port_state`.

Clean generated wasm files:

```sh
npm run clean:wasm
```

## Harness

Run the local harness server:

```sh
npm run serve:harness
```

Run the headless smoke test:

```sh
npm run test:harness
```

The smoke test starts a local static server, boots the browser harness through
`window.CnCPort.rpc("boot")`, advances deterministic frames through
`window.CnCPort.rpc("frame", { count })`, verifies the wasm-scheduled
Emscripten main-loop tick bridge plus its browser-backed timing probe, verifies
that wasm stdout/stderr is captured by the harness log, checks the WebGL2
canvas/RPC state, exercises resize handling, and writes screenshots to
`artifacts/screenshots/`.

The same harness exposes `window.CnCPort.rpc("mountArchive", { url, name })` and
`window.CnCPort.rpc("mountArchives", { path, archives })` for real-asset tests.
These commands fetch user-supplied BIG archives, write them under `/assets/` in
the wasm MEMFS, then ask `cnc-port` to verify the mounted archive or archive set
with the original `Win32BIGFileSystem`. After a verified archive-set mount,
`cnc-port` records the aggregate archive directory, mask, count, and byte total
in its C++ state under `archiveMount`. `mountArchives` is valid before `boot`;
the runtime archive smoke uses that ordering to match the eventual engine
startup preload path and asserts the boot-time `archiveMount.bootProbe` result.
It also asserts the C++ `assetProbe.gameText` result from original
`GameText.cpp` over the fetched English CSF, asserts `assetProbe.gameData`
through original `Common/INI.cpp::load` over real `GameData.ini`, asserts
`assetProbe.water` through original `INIWater.cpp` / `GameClient/Water.cpp`
over real `Water.ini`, asserts `assetProbe.weather` through original
`GameClient/Snow.cpp` over real `Weather.ini`, asserts `assetProbe.mapCache`
through original `INIMapCache.cpp` over real `Maps\MapCache.ini`, asserts
`dataSummary` for aggregate parser/template/map/string counts, and checks
`startupAssets` for the missing, pending, and ready archive states. It also
asserts `originalEngineStartup`, including the current missing default/startup
INI list and the fact that browser device factories are not runtime-ready yet.
Full original engine startup, all-block INI parsing, language initialization,
font loading, water/weather rendering, and live map-cache rebuilds remain open.

The human `harness/play.html` entry uses the integrated Project New Shoes desktop and local
asset wizard instead of those development URLs. Its worker accepts installed
folders and original ISO/IMG/MODE1-BIN media, extracts the required CAB/MSZIP
members directly to OPFS, and calls
`window.CnCPort.rpc("mountPreparedArchives", { path, archives })` before real
engine init. Session, remembered-source, and persistent-browser-install modes
are available; none upload or redistribute game data. `?autostart=1` retains
the ignored-artifact fetch path for unattended regression gates.

Run the wasm-backed smoke test:

```sh
npm run test:wasm
```

Run all current wasm checks, including the original EAC compression codec,
CompressionManager EAC-backed routes, WWDebug core/profile, WWLib
Base64/CRC/file-core/file-INI/fixed/hash/image-misc/LZO/MD5/
platform-compat/public-key/RAMFile/SHA/stream-core/StringClass/surface-core/
utility-core, WWMath core geometry/collision, GameEngine Common
string/file/data/header compatibility smokes, and the expanded GameClient
utility smoke:

```sh
npm run test:all
```

Run only the original EAC compression smoke:

```sh
npm run test:compression-eac
```

Run only the original CompressionManager smoke:

```sh
npm run test:compression-manager
```

Run only the original WWDebug core smoke:

```sh
npm run test:wwdebug-core
```

Run only the original WWDebug profile/memory smoke:

```sh
npm run test:wwdebug-profile
```

Run only the original WWLib Base64 smoke:

```sh
npm run test:wwlib-base64
```

Run only the original WWLib CRC smoke:

```sh
npm run test:wwlib-crc
```

Run only the original WWLib FileClass/Buffer smoke:

```sh
npm run test:wwlib-file-core
```

Run only the original WWLib file/INI smoke:

```sh
npm run test:wwlib-file-ini
```

Run only the original WWLib fixed-point smoke:

```sh
npm run test:wwlib-fixed
```

Run only the original WWLib hash-table smoke:

```sh
npm run test:wwlib-hash
```

Run only the original WWLib Targa/window globals smoke:

```sh
npm run test:wwlib-image-misc
```

Run only the original WWLib LZO codec/stream smoke:

```sh
npm run test:wwlib-lzo
```

Run only the original WWLib MD5 smoke:

```sh
npm run test:wwlib-md5
```

Run only the original WWLib platform compatibility smoke:

```sh
npm run test:wwlib-platform-compat
```

Run only the original WWLib multiprecision public-key smoke:

```sh
npm run test:wwlib-public-key
```

Run only the original WWLib RAMFile smoke:

```sh
npm run test:wwlib-ramfile
```

Run only the original WWLib SHA smoke:

```sh
npm run test:wwlib-sha
```

Run only the original WWLib stream-core smoke:

```sh
npm run test:wwlib-stream-core
```

Run only the original WWLib StringClass smoke:

```sh
npm run test:wwlib-string
```

Run only the original WWLib in-memory surface/PCX smoke:

```sh
npm run test:wwlib-surface-core
```

Run only the original WWLib utility-core smoke:

```sh
npm run test:wwlib-utility-core
```

Run only the original WWMath core geometry/collision smoke:

```sh
npm run test:wwmath-core
```

Run only the GameEngine case-variant header smoke:

```sh
npm run test:gameengine-header-case
```

Run only the original GameEngine Common core smoke:

```sh
npm run test:gameengine-common-core
```

Run only the expanded original GameClient utility smoke:

```sh
npm run test:gameclient-utility
```
