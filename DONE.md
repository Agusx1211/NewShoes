# DONE.md — Completed port checklist history

Completed checklist entries moved out of `TODO.md` so agents can load the open
plan cheaply. Search this file before redoing historical work, and add newly
completed work here when an item leaves `TODO.md`.

Grouped by the same milestones as `PROJECT.md` / `TODO.md`.

---

## Performance / profiling (2026-07-07 session)

- [x] Add opt-in D3D8 buffer upload producer attribution to the real runtime
      profile. The wasm D3D8 shim now passes the current engine frame profile
      marker through buffer updates when
      `PERF_PROFILE_D3D8_BUFFER_PRODUCERS=1`; `bridge.js` aggregates top
      producers by upload bytes, dynamic/`NOOVERWRITE`/`DISCARD` mix, and
      upload timing, and `runtime_frame_profile.mjs` diffs those producers per
      measured frame. Verified with `node --check
      WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `npm --prefix
      WebAssembly run build:port`, a local SwiftShader producer profile, and a
      Mac M4/Metal profile copied to
      `WebAssembly/artifacts/perf/runtime-frame-profile-buffer-producers-mac.json`.
      The Mac run reported `ANGLE Metal Renderer: Apple M4`, producer tracking
      enabled, 137 buffer updates, 326 KB uploaded, 253 KB `NOOVERWRITE`,
      72.6 KB `DISCARD`, 0.060 ms `bufferSubDataMs`, and a useful top-producer
      breakdown led by water render, terrain extra-blend, volumetric shadow
      VB/IB uploads, shoreline, and water-track batch unlock.

## User-reported play bugs (2026-07-06 session)

- [x] Fix skirmish loading screens never appearing before map load. The browser
      skirmish first-call `startNewGame` defer now creates the real
      `MultiPlayerLoadScreen`, binds `TheSkirmishGameInfo`, hides the mouse,
      draws `LOAD_PROGRESS_START`, and returns at the frame boundary before the
      synchronous map load runs. The real-engine client-state JSON now probes
      the key `MultiplayerLoadScreen.wnd` windows, and the skirmish harness
      captures a loading-screen screenshot plus canvas pixel variance before
      waiting for the active match. Verified with `node --check
      WebAssembly/harness/skirmish_start_smoke.mjs`, `npm --prefix
      WebAssembly run build:port`, `node
      WebAssembly/harness/skirmish_start_smoke.mjs`, and `npm --prefix
      WebAssembly run build:port:release`; the harness captured
      `WebAssembly/artifacts/screenshots/skirmish-start-loading-screen.png`
      with `loadingMap=true`, visible `MultiplayerLoadScreen.wnd` controls,
      and 12/12 visible non-black sample points before the match loaded.
- [x] Add real-runtime military subtitle diagnostics for the truncated-text
      investigation. `InGameUI` now exposes Emscripten-only read accessors for
      the active military subtitle, and the real engine frame JSON reports
      `gameplay.militarySubtitle` with active state, full source text, reveal
      index, lifetime, and currently displayed lines. This let the existing
      startup vertical harness distinguish true text truncation from the
      original typewriter reveal. Verified with `npm run build:port`,
      `STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=60
      STARTUP_VERTICAL_SCREENSHOT_DIR=artifacts/screenshots/text-subtitle-check-60
      node harness/startup_vertical_smoke.mjs` showing full text
      `Somewhere in Southern Kazakhstan\nEn route to Baikonur` at length 53
      with displayed prefix `Somewhere in Southe` at index 19, and
      `STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=300
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60
      STARTUP_VERTICAL_SCREENSHOT_DIR=artifacts/screenshots/text-subtitle-check
      node harness/startup_vertical_smoke.mjs` showing the subtitle inactive by
      logic frame 300.
- [x] Mount localized English audio/speech archives in the human and real
      skirmish boot paths. `play.mjs`, startup/skirmish/input/perf/shellmap and
      real FX harness archive specs now include `SpeechEnglishZH.big` and
      `AudioEnglishZH.big` alongside the existing ZH audio archives, matching
      the native `audio_payload_archives_ready()` contract. The playable page
      status text now reports the dynamic 23-archive mount count. Before this,
      a play-style boot reported `audioRuntimeAssets.ready=false` with
      `audioEnglishZH=false` and `speechEnglishZH=false`; after the change,
      `play.html?diag=lite` reports `audioRuntimeAssets.ready=true` with all six
      required audio archives present and the mixer buses connected. Verified
      with `node --check` on all edited harness scripts,
      `REAL_AUDIO_BROWSER_ARGS='--headless=new' node
      harness/real_audio_event_smoke.mjs`, and a Playwright
      `play.html?diag=lite` Start-button boot that reached the ready audio
      archive contract.
- [x] Fix human-play startup audio readiness for natural menu music. The
      playable `harness/play.html` path now resumes Web Audio from any page
      pointer gesture, including the overlay Start button, and creates the
      default `music` / `sound` / `sound3D` / `speech` mixer `GainNode` buses as
      soon as the context is running. `play.mjs` also requests audio runtime and
      mixer readiness at startup and records the result in issue-recorder
      session context. This prevents original init/menu audio requests from
      being dropped before the player ever clicks the canvas. Verified with
      `node --check WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/play.mjs`, a Playwright `play.html` Start-button
      check that reported `AudioContext` running with all four mixer buses
      connected, `REAL_AUDIO_BROWSER_ARGS='--headless=new' node
      harness/real_audio_event_smoke.mjs` with local Chromium, and a full
      `play.html?diag=lite` init that scheduled three natural music streams,
      ending on
      `Data\Audio\Tracks\USA_11.mp3` through
      `AudioBufferSourceNode -> GainNode -> musicGainNode ->
      AudioDestinationNode` with no stream error.
- [x] Fix live skirmish shadow flicker/breakage. The browser D3D8 bridge now
      masks D3D8 stencil reference/read/write masks to the actual WebGL
      stencil-bit width before `gl.stencilFunc`, `gl.stencilMask`, and stencil
      clears. This preserves the original D3D8 masked-test behavior for the
      gameplay shadow pass that submits `0x80808080` with mask `0xC0`; WebGL
      was previously clamping the raw reference to 255 instead of applying the
      low 8-bit value 128, so masked volumetric shadows could flicker or break.
      The skirmish and shell-map harness captures can now include D3D8 draw
      history, applied stencil state, and the last D3D8 clear. Verified with
      `node --check WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/skirmish_start_smoke.mjs`, `node --check
      WebAssembly/harness/shellmap_texture_label_capture.mjs`, `node
      harness/smoke.mjs`, and `SKIRMISH_START_MAP='maps\tournament
      desert\tournament desert.map' SKIRMISH_START_POST_ACTIVE_FRAMES=60
      SKIRMISH_START_EXPECT_SURVIVE=1
      SKIRMISH_START_CAPTURE_D3D8_HISTORY=1
      SKIRMISH_START_OUTPUT=/tmp/skirmish-shadow-history-fixed.json
      SKIRMISH_START_SCREENSHOT=/tmp/skirmish-shadow-history-fixed.png node
      harness/skirmish_start_smoke.mjs`: Tournament Desert survived to frame
      205 with active skirmish state, the applied shadow stencil state was
      `ref=128`, `mask=192`, `writeMask=255`, and the screenshot no longer
      showed the large invalid dark shadow blob over the local base.
- [x] Fix the live skirmish minimap terrain render. The browser D3D8 caps now
      stop advertising `D3DFMT_R8G8B8` as a supported texture format, so
      original `W3DRadar::initializeTextureFormats()` selects `X8R8G8B8`
      instead of a 24-bit surface that `SurfaceClass::DrawPixel()` cannot
      write. `W3DRadar::buildTerrainTexture()` now locks the terrain surface
      once and writes the same packed radar colors into it, reducing the
      Tournament Desert radar terrain texture from 65,540 tiny uploads to 8.
      The existing skirmish harness can request `128x128` D3D8 texture samples
      and post-active survival frames. Verified with `npm run build:port` and
      `SKIRMISH_START_MAP='maps\tournament desert\tournament desert.map'
      SKIRMISH_START_POST_ACTIVE_FRAMES=60 SKIRMISH_START_POST_ACTIVE_CHUNK=30
      SKIRMISH_START_EXPECT_SURVIVE=1
      SKIRMISH_START_OUTPUT=/tmp/skirmish-tournament-desert-radar-batched.json
      SKIRMISH_START_SCREENSHOT=/tmp/skirmish-tournament-desert-radar-batched.png
      node harness/skirmish_start_smoke.mjs`: active skirmish survived to frame
      205, the radar terrain texture sampled non-black pixels, and the
      screenshot shows terrain in the LeftHUD minimap.
- [x] Fix live skirmish fog-of-war rendering. `cnc-port` now enables the
      original heightmap-owned `W3DShroud` before real engine creation, so the
      production `PartitionManager::refreshShroudForLocalPlayer` path drives
      `W3DDisplay::setShroudLevel` into the terrain shroud texture instead of
      leaving `BaseHeightMapRenderObjClass::m_shroud` null under the probe-era
      minimal-heightmap gate. The skirmish harness now records shroud
      diagnostics from frame summaries, samples the live texture size, and
      includes those dimensions in D3D8 texture inventory checks. Verified with
      `npm run build:port` and
      `SKIRMISH_START_MAP='maps\tournament desert\tournament desert.map'
      SKIRMISH_START_POST_ACTIVE_FRAMES=60 SKIRMISH_START_POST_ACTIVE_CHUNK=30
      SKIRMISH_START_EXPECT_SURVIVE=1
      SKIRMISH_START_OUTPUT=/tmp/skirmish-shroud-enabled.json
      SKIRMISH_START_SCREENSHOT=/tmp/skirmish-shroud-enabled.png node
      harness/skirmish_start_smoke.mjs`: Tournament Desert survived to frame
      205, `shroudReady` and `textureReady` were true for a 64x128 shroud
      texture, the 5x5 logic/visual grid had zero mismatches, local Command
      Center and Worker cells were clear at visual level 255, fogged samples
      read around 125, and the screenshot shows the local base clear with
      surrounding fogged terrain.

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
- [x] Add a startup archive inventory tool for the original `GameEngine.cpp`
      boot paths. `npm run inventory:startup-archives` parses the current
      `artifacts/real-assets/*.big` set with the original mixed BIGF endian
      contract, indexes 12,199 files across 17 archives, reports
      `INIZH.big`, `EnglishZH.big`, `W3DEnglishZH.big`, and `MapsZH.big` as the
      current startup-path candidate archives, and records the remaining absent
      default INI / `Rank.ini` / `CommandMap.ini` gaps without treating missing
      assets as tool failures.
- [x] Classify startup archive inventory gaps by source: the tool now reports
      optional base archive presence, per-file `missingDetails`, and
      `missingByReason`, with `--strict` failing only when files are missing
      from a present source archive or from the Zero Hour runtime set itself.
      Current Zero Hour-only assets remain strict-clean because the remaining
      default/startup INI gaps are expected from absent base `INI.big`.
- [x] Add a bounded `--require-base-startup` verification mode to the startup
      archive inventory tool so agents can prove the current startup-file
      blocker when the optional base Generals startup archives
      (`INI.big`/`English.big`) are supplied. It fails nonzero (`ok=false`)
      when any optional base startup archive is absent or incomplete, while
      preserving the existing `--strict` behavior for Zero Hour-only assets.
      The JSON now exposes `baseArchiveReadiness` (per archive `present`,
      expected/found/missing startup file counts, `complete`),
      `baseArchiveStartupReady`, owner-specific `missingBaseFiles`, and, on
      failure, `requireBaseStartupFailures`. Current Zero Hour-only assets fail
      under the new mode by design (no `INI.big`/`English.big` mounted).
- [x] Extend the startup archive inventory with source-ordered
      `AudioManager::init` audio INI coverage and a bounded
      `--require-audio-startup` mode. The current Zero Hour-only assets now
      report shipped `Music.ini`, `SoundEffects.ini`, `Speech.ini`, `Voice.ini`,
      `MiscAudio.ini`, and `Default\SoundEffects.ini` entries in `INIZH.big`,
      while failing the new mode on the absent `AudioSettings.ini`,
      `Default\Music.ini`, `Default\Speech.ini`, and `Default\Voice.ini`.
- [x] Resolve the current base Generals startup archive set in the local asset
      pipeline. `extract_zh_runtime_archives.sh` now extracts or preserves
      `INI.big`, `English.big`, `Window.big`, `Terrain.big`, and
      `Textures.big` when supplied, `npm run inventory:startup-archives`
      indexes 22 archives / 16,360 files under `--strict`, and the bounded
      inventory modes now pass for base startup files, audio startup INIs, and
      `Window\Menus\BlankWindow.wnd`. The runtime and range-backed browser
      smokes mount the base startup/layout archives and advance original
      startup to the post-`CreateGameEngine` browser device frontier instead
      of the old missing-file frontier. Verified with
      `npm --prefix WebAssembly run inventory:startup-archives`,
      `node WebAssembly/tools/inventory_startup_archives.mjs WebAssembly/artifacts/real-assets --require-base-startup`,
      `node WebAssembly/tools/inventory_startup_archives.mjs WebAssembly/artifacts/real-assets --require-audio-startup`,
      `node WebAssembly/tools/inventory_startup_archives.mjs WebAssembly/artifacts/real-assets --require-blank-window-layout`,
      `node WebAssembly/harness/runtime_archives_smoke.mjs`, and
      `node WebAssembly/harness/startup_range_backed_archives_smoke.mjs`.
- [x] Define how assets reach the browser (fetch from a path / drag-drop /
      file picker) — assets are **user-supplied**, never committed.
- [x] Document the legal stance: code is open; game data is the user's own.

### Harness (bootstrap)
- [x] Stand up Playwright/Puppeteer headless harness that loads the page.
- [x] Screenshot capture utility writing to `artifacts/screenshots/`.
- [x] Restore original `GameLogic` update dispatch in `GameEngine::update`.
      Removed the Emscripten-only qualified `TheGameLogic->GameLogic::update()`
      bypass and returned the real path to `TheGameLogic->UPDATE()`, now that
      the mixed-ABI header burn-down leaves `cnc-port` with zero direct and
      zero linked shadow-header offenders. Verified the old null
      indirect-call frontier with the real startup browser path:
      `STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=60
      node WebAssembly/harness/startup_vertical_smoke.mjs` reaches
      post-campaign MD_USA01 frames and captures
      `startup-vertical-real-init-post-campaign.png`. Also verified with
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly run verify:cnc-port-real-headers`,
      `npm --prefix WebAssembly run verify:cnc-port-weak-stubs`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and
      `git diff --check`. At that point the related
      `Thing::cncPortSetObjectPosition/Orientation` and
      `Object::cncPortReactToTransformChangeFromThing` bridge helpers still
      crashed the bridge-buffer scene when removed; their later removal is
      recorded below.
- [x] Replace the remaining Emscripten-only bridge transform dispatch
      workaround with the real virtual `Thing`/`Object` transform-reaction
      path. Deleted `Thing::cncPortSetObjectPosition`,
      `Thing::cncPortSetObjectOrientation`, and
      `Object::cncPortReactToTransformChangeFromThing`, then returned
      `TerrainLogic::Bridge::Bridge` to the original `bridge->setPosition()`
      and `bridge->setOrientation()` calls so bridge construction reaches
      `Object::reactToTransformChange` through the normal vtable path. The
      focused bridge runtime now keeps a retained probe `GameClient`, installs
      bounded no-op script/audio/drawable global owners, processes only the
      original destroy-list path where the probe needs teardown, and handles an
      empty `GameLogic` object lookup vector without requiring a full reset.
      Verified with `npm --prefix WebAssembly run build:port`,
      `terrain_bridge_buffer_scene_smoke.mjs` under
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=240000` with the real INIZH, MapsZH,
      Terrain, W3D, and Textures archive set, and
      `npm --prefix WebAssembly run test:startup-vertical`, including
      `harness-smoke-ww3d-terrain-bridge-buffer-scene-canvas.png` and the
      startup vertical screenshots through campaign start.
- [x] A JS↔engine RPC/command channel stub (`boot`, `log`, `state`,
      `screenshot`).
- [x] Add a bounded harness `frame` RPC that drives the exported wasm
      `cnc_port_frame` path and smoke-tests deterministic frame advancement,
      so future engine ticks can be driven through the same command surface.
- [x] Harness smoke test runnable locally (`npm run test:harness`).
- [x] Wire the harness smoke test into CI.

---

## M1 — Compile the platform-independent core

### Compatibility shims
- [x] Targeted Win32/exception shim for `WWVegas/WWDebug/wwdebug.cpp` core
      message/assert plumbing under wasm.
- [x] Replace the `WWDebug` x86 breakpoint path with an Emscripten/clang trap
      fallback while preserving the original MSVC path.
- [x] Add Emscripten fallbacks for original `BaseType.h` float
      rounding/truncation helpers where MSVC inline assembly cannot compile.
- [x] Add a minimal WWVegas compiler shim for `__cdecl`/global new guards used
      by `always.h` under clang/Emscripten.
- [x] Add target-local MSVC compatibility flags needed by original
      `WWLib/random.cpp` and `WWMath/v3_rnd.h` under clang/Emscripten.
- [x] Add legacy WWLib header shims for `<new.h>`, `<iostream.h>`, and native
      C++ `bool` compatibility under clang/Emscripten.
- [x] Add lowercase `crc.h` and portable `_lrotl` compatibility for original
      WWLib CRC sources under clang/Emscripten.
- [x] Add portable `stricmp` compatibility for original WWLib/WW3D
      case-insensitive lookup paths under clang/Emscripten.
- [x] Add browser/compiler shims for original WWLib narrow `TCHAR` strings,
      Windows wide-to-narrow conversion, and critical sections under
      clang/Emscripten.
- [x] Add lowercase include wrappers for original WWLib `wwfile.h` and `buff.h`
      under the case-sensitive wasm build.
- [x] Add lowercase include wrapper for original WWLib `ramfile.h` under the
      case-sensitive wasm build.
- [x] Add lowercase include wrappers for original WWLib `pipe.h`, `straw.h`,
      and `rndstraw.h` under the case-sensitive wasm build.
- [x] Add lowercase include wrapper for original WWLib `vector.h` under the
      case-sensitive wasm build.
- [x] Add lowercase include wrappers for original WWLib file/INI/public-key
      headers (`rawfile.h`, `ini.h`, `int.h`, `mpmath.h`, `pk.h`, `index.h`,
      `listnode.h`, `slist.h`, `slnode.h`, `bsearch.h`, `point.h`, `xpipe.h`,
      `xstraw.h`) under the case-sensitive wasm build.
- [x] Add lowercase include wrappers for original WWLib palette/RLE/tag-block
      headers (`palette.h`, `rgb.h`, `rle.h`, `tagblock.h`) under the
      case-sensitive wasm build.
- [x] Add lowercase include wrappers for original WWDebug allocator and WWLib
      Targa headers (`fastallocator.h`, `targa.h`) under the case-sensitive
      wasm build.
- [x] Add a case-variant include wrapper for original `WWLib/RefCount.h`
      users reached by W3D terrain tile data under the case-sensitive wasm
      build.
- [x] Add lowercase include wrappers for original WWLib surface and PCX headers
      (`surface.h`, `pcx.h`) under the case-sensitive wasm build.
- [x] Add portable `strupr`/`strrev` compatibility for original WWLib utility
      sources under clang/Emscripten.
- [x] Add portable `_snprintf`, `_wcsicmp`, `MultiByteToWideChar`, and
      `OutputDebugString` compatibility for original WWLib INI/wide-string
      sources under clang/Emscripten.
- [x] Add MSVC `_vsnwprintf` `%hs` compatibility and browser no-op
      `SetWindowText` / `SetWindowTextW` fallbacks needed by original
      `GameClient/GameText.cpp` under clang/Emscripten.
- [x] Add minimal `direct.h`/`osdep.h` compatibility for original WWLib
      POSIX-style raw-file and `_UNIX` paths under clang/Emscripten.
- [x] Qualify original WWLib `Vector.H` dependent base access so container
      templates compile under standard clang/Emscripten lookup rules.
- [x] Qualify original WWLib `INDEX.H`/`Point.h` template dependent names so
      INI support containers compile under standard clang/Emscripten lookup
      rules.
- [x] Add a target-local RandomString compatibility include so `StringClass` is
      complete before `DynamicVectorClass<StringClass>` is instantiated.
- [x] Add clang-compatible explicit static allocator definitions for original
      WWLib `AutoPoolClass` users (`multilist.cpp`, `slnode.cpp`, and later
      W3D pooled nodes) under Emscripten.
- [x] Add browser/compiler shims for original WinMM `mmsystem.h` timing calls
      used by `SysTimeClass` and WWSaveLoad under Emscripten.
- [x] Add browser/compiler shims for original Win32 file attributes, file
      deletion, PE image headers, and version-resource fallbacks used by
      WWLib `verchk.cpp` and Wwutil under Emscripten.
- [x] Add browser/compiler shims for original Win32 `_MAX_DRIVE`,
      `_MAX_FNAME`, `_MAX_EXT`, `_splitpath`, and `MoveFile` users needed by
      WWLib MIX archive creation and rewrite paths under Emscripten.
- [x] Add browser/compiler shims for original Win32 `_MAX_PATH` and
      `GetModuleFileName` users needed by `GameEngine/Common` memory-pool
      initialization under Emscripten.
- [x] Add browser/compiler shims for original MSVC `<process.h>` and Win32
      `Sleep` users needed by WWLib `ThreadClass` under the current `_UNIX`
      wasm build.
- [x] Add lowercase include wrappers for original WWLib mono debug-output
      headers and Win32 message-loop compatibility types/functions needed by
      WWLib `msgloop.cpp` under the current empty browser queue.
- [x] Add browser/compiler shims for original Win32 message-box flags,
      topmost-window positioning, and CD-drive probing used by the current
      Win32Device common compile frontier under Emscripten.
- [x] Add a minimal `D3DX8Math.h` vector/matrix shim for original
      `GameEngine/Common` Bezier helpers under Emscripten.
- [x] Add lowercase include wrappers for original GameEngine `Common/File.h`
      and `lib/basetype.h` users under the case-sensitive wasm build.
- [x] Add case-variant include wrappers for original GameEngine/WWVegas headers
      reached by the next broad Common/GameClient probes (`Common/OVERRIDE.h`,
      `Common/SimplePlayer.h`, `Common/URLLaunch.h`, `Lib/Basetype.h`,
      `WW3D2/ColType.h`, and `WWMath/Matrix3D.h`), with wasm compile smoke
      coverage for the currently browser-usable wrappers.
- [x] Add case-variant include wrappers for original GameClient utility sources
      (`GameClient/view.h`, `lib/BaseType.h`, `WWMATH/Vector2.h`,
      `WWMATH/Vector3.h`, and `WWMATH/Vector4.h`) under the case-sensitive
      wasm build.
- [x] Add lowercase `wwmath/vector3.h` and `wwmath/matrix3d.h` wrappers for original
      `Common/CRCDebug.h` users under the case-sensitive wasm build.
- [x] Add case-variant include wrappers for additional original GameClient
      menu/control sources (`GameClient/GadgetCheckbox.h`,
      `GameClient/Hotkey.h`, and `GameClient/mouse.h`) under the
      case-sensitive wasm build.
- [x] Add a minimal DirectInput keyboard scan-code shim for original
      `GameClient/KeyDefs.h` users under the browser build, preserving the
      engine's existing key values for the later DOM keyboard-event bridge.
- [x] Add browser/compiler shims for original GameClient IME and replay-menu
      compile coverage (`mbstring.h`, Win32 IMM handles/constants,
      `GlobalMemoryStatus`, `FormatMessageW`, `CopyFile`, and shell desktop
      folder helpers) under clang/Emscripten.
- [x] Add case-variant include wrappers for the next original GUI compile
      batch (`Windows.h`, `common/GameType.h`, `Gamelogic/GameLogic.h`,
      `Gameclient/WindowLayout.h`, `Gameclient/GameWindowManager.h`, and
      `GameClient/Controlbar.h`) under the case-sensitive wasm build.
- [x] Add the missing original `ChallengeGenerals` `Image` pointer forward
      declaration plus temporary `Common/INI.h` bridge declarations for
      `parseChallengeModeDefinition` and `parseWindowTransitions`.
- [x] Add temporary `Common/INI.h` `MultiIniFieldParse` and
      `initFromINIMultiProc` bridge declarations so original multi-table INI
      users can compile while the real INI implementation is still offline.
- [x] Add browser registry API fallbacks, a legacy `<io.h>` POSIX alias shim,
      and a lowercase `Common/SubSystemInterface.h` wrapper for additional
      original `GameEngine/Common` sources under Emscripten.
- [x] Add fixed underlying types for the first broad batch of original
      MSVC-style enum forward declarations (`AcademyClassificationType`,
      `WaypointID`, `ShadowType`, `BodyDamageType`, `CommandSourceType`,
      `CommandOption`, `ProductionID`, `ProductionType`, `GadgetGameMessage`,
      `RadiusCursorType`, `StealthLookType`, `EvaMessage`,
      `CanAttackResult`, and `LegalBuildCode`) so the existing headers compile
      under standard clang/Emscripten without changing enumerator values.
- [x] Add fixed underlying types for the next original GameLogic/GameClient
      enum-forward batch (`HackerAttackMode`, `WeaponBonusConditionType`,
      `WeaponSetType`, `ArmorSetType`, `WeaponStatus`, `RadarPriorityType`,
      `EditorSortingType`, `AttitudeType`, and `BattlePlanStatus`) so the
      current headers compile under standard clang/Emscripten without changing
      enumerator values.
- [x] Add a fixed underlying type for the original `GUICommandType`
      forward declarations reached by the current ControlBar/AI/command
      translation include graph under standard clang/Emscripten.
- [x] Add a fixed underlying type for the original `ScienceType` forward
      declarations reached by the current science/special-power/player-template
      include graph under standard clang/Emscripten.
- [x] Extend the target-local `Common/STLTypedefs.h` shim with original
      `AsciiStringList` aliases needed by `PlayerTemplate` side-list helpers.
- [x] Add a target-local `Common/GameAudio.h` include-order shim so original
      `GameAudio.h`'s MSVC-style enum redeclarations and `FieldParse` pointer
      declarations compile under clang/Emscripten.
- [x] Add a target-local lowercase `Common/Bitflags.h` wrapper for original
      GameEngine sources that include `Common/BitFlags.h` with alternate
      casing under the case-sensitive wasm build.
- [x] Extend the temporary `Common/Xfer.h` shim with unsigned-byte and
      unsigned-int transfer routes needed by original audio event state
      serialization users under clang/Emscripten.
- [x] Qualify original GameEngine `BitFlags` static name-list specializations
      in `KindOf.cpp`, `DisabledTypes.cpp`, and `ObjectStatusTypes.cpp` so
      they compile under standard clang/Emscripten template rules.
- [x] Qualify original GameEngine `SparseMatchFinder` dependent iterator types
      so armor/model-condition matching templates compile under standard
      clang/Emscripten lookup rules.
- [x] Qualify original GameEngine `BitFlags.cpp` static name-list
      specializations for `ModelConditionFlags` and `ArmorSetFlags` under
      standard clang/Emscripten template rules.
- [x] Add case-variant include wrappers for original GameNetwork
      `NetworkUtil.h`, `networkdefs.h`, and `transport.h` users under the
      case-sensitive wasm build.
- [x] Route original `Common/PerfTimer` precision-timer reads through the
      existing browser `QueryPerformanceCounter` shim under Emscripten, while
      preserving the x86 `RDTSC` path for non-wasm builds.
- [x] Add fixed underlying types for the original enum forwards needed by the
      real `Common/INI.cpp` and initial `Common/Thing` compile frontier
      (`ObjectID`, `DrawableID`, `KindOfType`, audio enums, `TimeOfDay`,
      terrain LOD/decal, AI debug), preserving original enumerator values.
- [x] Add STLport `<hash_map>` compatibility, including the legacy
      `hash_map::resize` reserve-style call used by original Thing templates.
- [x] Consolidate the `mmsystem.h`/`timeGetTime`, `GetTickCount`, and
      `QueryPerformanceCounter` shims onto the browser `emscripten_get_now()`
      timing source, with harness state coverage for the Win32 timing surface.
- [x] Route the browser `GlobalMemoryStatus` shim through Emscripten heap
      size/max queries so original system-capability logs report the wasm
      memory contract instead of zero-filled placeholders.
- [x] Compile original `Common/System/QuotedPrintable.cpp` after making its
      original UTF-16LE quoted-printable wire format explicit for the wasm
      `WideChar`/`wchar_t` width, with ASCII, Unicode ASCII, and BMP
      round-trip smoke coverage.
- [x] Make original `UnicodeString::nextToken` copy token bytes using
      `sizeof(WideChar)` so tokenization remains valid under wasm's non-MSVC
      wide-character width.
- [x] Make original `GameClient/GameText.cpp` read and decode CSF string
      payloads as explicit 16-bit code units under wasm's 32-bit `WideChar`,
      with browser real-asset coverage against `Data\English\Generals.csf`.
- [x] Make original `DataChunkInput` / `DataChunkOutput` chunky
      `UnicodeString` serialization read and write explicit 16-bit
      little-endian code units instead of host `sizeof(WideChar)`, preserving
      the original Windows map-file wire format under wasm's 32-bit
      `WideChar`. Verified through `test:ww3d-terrain-visual-scene`, whose
      logic-only map preflight and original `W3DTerrainLogic::loadMap` path now
      parse shipped map dictionaries, scripts, polygon triggers, and sides.
- [x] Audit original WWLib `Buffer` ownership/deallocation semantics under
      libc++/wasm with focused runtime smoke coverage for borrowed stack
      buffers, shallow-copy borrowing, assignment release/borrow transfer, and
      idempotent owned-buffer reset before relying on it for asset and file
      buffers.
- [x] Browser boundary shims for 6 undefined link symbols and re-enabled
      `-sERROR_ON_UNDEFINED_SYMBOLS` scoped to `cnc-port`. Shims in
      `WebAssembly/src/wasm_browser_boundary_shims.cpp`:
      `DumpExceptionInfo(unsigned int, EXCEPTION_POINTERS*)`,
      `SetDeviceGammaRamp(HDC,LPVOID)`, WWLib `RegistryClass` ctor/dtor/
      `Get_Int`, and `getQR2HostingStatus`. Target-scoped via
      `target_link_options(cnc-port PRIVATE ...)` in `WebAssembly/CMakeLists.txt`;
      `cnc-port` links green. Merged as commit 1e69eff.
- [x] Separate Release (-O2) cnc-port build: `npm run build:port:release`
      builds cnc-port at -O2 into `build/wasm-release` via env vars
      (`BUILD_TYPE=Release`, `CNC_BUILD_DIR`, `CMAKE_CXX_FLAGS=-O2`) in
      `WebAssembly/tools/build_wasm.sh` + `package.json`; Debug build
      (`build/wasm`, -O0) untouched; both verified green. Merge commits
      897c65c / 7ae5d0c.
- [x] Make targeted `cnc-port` hot-path builds assert their selected dist
      artifacts exist. `WebAssembly/tools/build_wasm.sh` now uses one
      `check_cnc_port_artifacts` helper for full builds and
      `CNC_BUILD_TARGETS=cnc-port` builds, so Debug still verifies
      `dist/cnc-port.js` / `.wasm` and Release verifies
      `dist-release/cnc-port.js` / `.wasm`. Removed the stale open TODO that
      still claimed Debug and Release clobbered the same `dist/` output, and
      added `/WebAssembly/dist-release/` to `.gitignore` so Release artifacts
      stay out of commits like Debug artifacts. Verified with `npm --prefix
      WebAssembly run build:port`, `npm --prefix WebAssembly run
      build:port:release` plus a Debug artifact mtime/size comparison proving
      Release left `dist/` untouched, `npm --prefix WebAssembly run
      build:startup-vertical`, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, and `node
      WebAssembly/tools/run_startup_vertical_smoke.mjs`. The separate
      Release/perf deployment/re-measurement TODO remains open.
- [x] Switch the human `harness/play.html` path to the optimized release
      runtime by default and keep it playable on the Mac. The bridge and issue
      recorder now select `dist-release` for `play.html` unless `?dist=...`
      overrides it, the release build uses native wasm exceptions and
      `ASSERTIONS=0`, and `play.mjs` defaults to the static main-menu path
      while the Release shell-map `GAME_SHELL` load remains an open
      follow-up. Verified `npm --prefix WebAssembly run build:port:release`,
      `npm --prefix WebAssembly run build:port`, JS syntax checks, and Mac M4
      Chrome/Metal `harness/play.html?autostart=1`: `moduleDistDir` was
      `dist-release`, `TheShell` reached `Menus/MainMenu.wnd`,
      `loadingMap=false`, and screenshot
      `WebAssembly/artifacts/screenshots/play-default-dist-release-main-menu.png`
      showed the interactive main menu.
- [x] Restore the optimized Release shell-map path as the default human
      `harness/play.html` flow and fix the Mac frame-344 freeze. The Release
      shell-map load first needed a null guard when map side script lists are
      replaced, then the frame-344 abort was traced with a symbolized Mac build
      to `OpenContain::processDamageToContained()`: old STLport-era loops were
      dereferencing `std::list<Object*>::end()` and relying on a null sentinel
      when empty containers took damage. The affected containment/passenger
      loops now check `it != end()` before `*it`, and `play.html` defaults to
      shellmap-on with `?shellmap=0` as the opt-out. Verified with
      `npm --prefix WebAssembly run build:port:release`, Mac M4 Chrome/Metal
      `harness/runtime_frame_profile.mjs` at 380 measured frames (400 completed
      total, logic frame 398, no abort), and a longer 1,000-measured-frame run
      (1,020 completed total, logic frame 1,018, `loadingMap=false`,
      `inputEnabled=true`, no abort).
### Libraries (compile as-is where possible)
- [x] `Compression/EAC` BTree, Huff, and RefPack codecs compile from original
      source and round-trip smoke runs under wasm.
- [x] Original `CompressionManager` compiles for RefPack/BTree/Huff manager
      routes and smoke-tests header detection, uncompressed-size metadata, and
      round trips over the original EAC codecs under wasm.
- [x] `WWVegas/WWMath` core `pot.cpp`/`tri.cpp`/`v3_rnd.cpp` compiles and
      smoke-tests power-of-two helpers, vector math, triangle containment, and
      vector randomizers under wasm.
- [x] `WWVegas/WWMath` geometry/collision slice (`aabox.cpp`, `lineseg.cpp`,
      `matrix3.cpp`, `matrix4.cpp`, `quat.cpp`, `ode.cpp`, `obbox.cpp`,
      `colmath*.cpp`, etc.) compiles and smoke-tests matrix/quaternion
      transforms, AABox/line/sphere/OBBox collision paths, and ODE integration
      under wasm.
- [x] `WWVegas/WWMath` curve and spline slice (`curve.cpp`,
      `hermitespline.cpp`, `cardinalspline.cpp`, `catmullromspline.cpp`,
      `tcbspline.cpp`) compiles and smoke-tests 1D/3D interpolation plus
      WWSaveLoad factory registration under wasm.
- [x] `WWVegas/WWMath` lookup table and `WWMath::Init` slice
      (`lookuptable.cpp`, `wwmath.cpp`) compiles and smoke-tests default table
      sampling, fast trig table initialization, shutdown, and debug refcount
      cleanup under wasm.
- [x] Full `WWVegas/WWMath` compiles; spot-check vector/matrix results.
- [x] Add D3DX8/matrix compatibility needed by original `WWMath/matrix3d.cpp`
      without replacing the original matrix logic.
- [x] Qualify original `WWLib/simplevec.h` dependent-base accesses needed by
      `WWMath/lookuptable.cpp`, `wwmath.cpp`, and spline sources under
      standard clang/Emscripten lookup rules.
- [x] Compile original `WWMath/vp.cpp` against the browser-safe scalar vector
      processor fallback, keeping the Intel SSE/CPU-detection assembly paths
      behind their original non-Emscripten compiler guards.
- [x] `WWVegas/WWLib` random generator (`random.cpp`) compiles and smoke-tests
      through the WWMath vector randomizers under wasm.
- [x] `WWVegas/WWLib` SHA hashing (`sha.cpp`) compiles and smoke-tests known
      digest vectors, cached results, reset, and split updates under wasm.
- [x] `WWVegas/WWLib` CRC helpers (`crc.cpp`, `realcrc.cpp`) compile and
      smoke-test CRC32 vectors plus `CRCEngine` update consistency under wasm.
- [x] `WWVegas/WWLib` Base64 helpers (`base64.cpp`) compile and smoke-test
      known encodings, padding, ignored whitespace, and binary round trips
      under wasm.
- [x] `WWVegas/WWLib` MD5 hashing (`md5.cpp`) compiles and smoke-tests standard
      digest vectors plus split updates under wasm.
- [x] `WWVegas/WWLib` hash table (`hash.cpp`) compiles and smoke-tests
      add/find/remove/reset/iteration behavior under wasm.
- [x] `WWVegas/WWLib` fixed-point utility (`fixed.cpp`) compiles and
      smoke-tests parsing, formatting, constants, arithmetic, conversion, and
      saturation behavior under wasm.
- [x] `WWVegas/WWLib` StringClass (`wwstring.cpp` plus `trim.cpp`) compiles and
      smoke-tests construction, mutation, formatting, comparison, trimming,
      buffer growth, copy, temporary-buffer, and wide-copy behavior under wasm.
- [x] `WWVegas/WWLib` file core (`wwfile.cpp` plus `buff.cpp`) compiles and
      smoke-tests FileClass formatted writes plus Buffer allocation, reference,
      assignment, and reset behavior under wasm.
- [x] `WWVegas/WWLib` RAMFile (`ramfile.cpp`) compiles and smoke-tests
      open/close, read/write, seek, implicit access, bias, inherited formatted
      writes, allocated buffers, capacity clamping, and delete behavior under
      wasm.
- [x] `WWVegas/WWLib` utility core (`argv.cpp`, `blowfish.cpp`,
      `gcd_lcm.cpp`, `hsv.cpp`, `obscure.cpp`, `palette.cpp`, `rc4.cpp`,
      `rgb.cpp`, `rndstrng.cpp`, `rle.cpp`, `sampler.cpp`, `srandom.cpp`,
      `strtok_r.cpp`) compiles and smoke-tests command-line parsing, crypto
      known vectors, GCD/LCM helpers, color conversion, palette lookup, RLE
      round trips, browser-backed secure seed generation, sampling sequences,
      tokenization, Obfuscate normalization, and RandomString selection
      behavior under wasm.
- [x] `WWVegas/WWLib` pipe/straw stream core (`pipe.cpp`, `straw.cpp`,
      Base64/Blowfish/CRC/SHA pipe and straw adapters, `rndstraw.cpp`,
      `cstraw.cpp`, `vector.cpp`, `jshell.cpp`) compiles and smoke-tests
      in-memory stream chaining, transforms, random, cache, and bit-vector
      behavior under wasm.
- [x] `WWVegas/WWLib` LZO codec and stream adapters (`lzo.cpp`,
      `lzo1x_c.cpp`, `lzo1x_d.cpp`, `lzopipe.cpp`, `lzostraw.cpp`) compile and
      smoke-test direct, pipe, and straw round trips under wasm.
- [x] `WWVegas/WWLib` multiprecision public-key crypto (`mpmath.cpp`,
      `int.cpp`, `pk.cpp`, `pkpipe.cpp`, `pkstraw.cpp`) compiles and
      smoke-tests deterministic RSA block encryption/decryption under wasm.
- [x] `WWVegas/WWLib` file helpers and INI parser (`rawfile.cpp`,
      `ffactory.cpp`, `bfiofile.cpp`, `bufffile.cpp`, `textfile.cpp`,
      `readline.cpp`, `chunkio.cpp`, `ini.cpp`, `widestring.cpp`, `xpipe.cpp`,
      `xstraw.cpp`, `nstrdup.cpp`, `tagblock.cpp`) compile and smoke-test
      raw-file I/O, read/write preservation, INI load/save, scalar values,
      points, rects, and tag-block persistence under wasm.
- [x] `WWVegas/WWLib` MIX archive helpers (`mixfile.cpp`) compile and
      smoke-test archive creation, filename listing, offset-ordered listing,
      biased subfile reads, and missing-file lookups under wasm.
- [x] `WWVegas/WWLib` pooled container helpers (`slnode.cpp`,
      `multilist.cpp`) compile and smoke-test `SimpleDynVecClass`, `SList`,
      `MultiListClass`, and `PriorityMultiListIterator` behavior under wasm.
- [x] `WWVegas/WWLib` debug `RefCountClass` tracking (`refcount.cpp`) compiles
      under wasm and is exercised through lookup-table lifetime cleanup.
- [x] Replace the browser `LaunchWebBrowser` no-native-process fallback with a
      harness-observable `window.open` bridge: original WWLib `LaunchWeb.cpp`
      now calls `window.open` under Emscripten when a browser window exists,
      keeps null/empty/non-browser Node calls false, and `cnc-port` exposes a
      Playwright-smoked `launchWebBrowserProbe` that verifies URL, target,
      features, and return path.
- [x] `WWVegas/WWLib` system timer wrappers (`_timer.cpp`, `systimer.cpp`,
      `stimer.cpp`) compile against browser WinMM timing shims and
      smoke-test the legacy `FrameTimer`/`TickCount` globals.
- [x] `WWVegas/WWLib` CPU detection/system log (`cpudetect.cpp`) compiles
      under wasm and smoke-tests conservative browser reporting: CPUID, RDTSC,
      SIMD, CPU MHz, and cache details unavailable; OS and memory values routed
      through the browser Win32 shims.
- [x] `WWVegas/WWLib` mutex and critical-section wrappers (`mutex.cpp`)
      compile against browser Win32 synchronization shims and smoke-test
      original `MutexClass`, `CriticalSectionClass`, and
      `FastCriticalSectionClass` RAII locking paths under wasm.
- [x] `WWVegas/WWLib` thread wrapper (`thread.cpp`) compiles under wasm and
      smoke-tests the current original `_UNIX` fallback contract for
      construction, idle `Execute`/`Stop`, yielding, and thread-id queries.
- [x] `WWVegas/WWLib` legacy mono debug-output and message-loop helpers
      (`mono.cpp`, `_mono.cpp`, `msgloop.cpp`) compile under wasm and
      smoke-test mono enable/disable/no-op output plus modeless-dialog,
      accelerator, and empty message-pump bookkeeping.
- [x] Replace the current empty Win32 message queue compatibility shim with a
      browser-fed FIFO for `PeekMessage`, `GetMessage`, `PostMessage`, and
      `PostQuitMessage`, with harness coverage proving DOM pointer/key events
      enqueue Win32 messages and `PM_NOREMOVE`/`PM_REMOVE` preserve FIFO
      semantics.
- [x] Compile original WWLib `keyboard.cpp` under wasm with `MapVirtualKey`,
      `ToAscii`, and `GetKeyboardState` shims, and smoke-test
      `Windows_Message_Handler()` feeding keyboard, mouse, and double-click
      messages into the original `WWKeyboardClass` intercept path.
- [x] Add minimal wasm `RegisterClass` / `CreateWindow` / `DispatchMessage`
      WndProc routing and smoke-test both direct dispatch and queued
      `Windows_Message_Handler()` delivery to a registered window procedure.
- [x] Compile original `Win32Mouse.cpp` into a focused wasm target and
      smoke-test its original Win32 message buffer translation for button,
      double-click, move, and wheel events.
- [x] Compile original `Win32GameEngine.cpp` far enough for
      `Win32GameEngine::serviceWindowsOS()` to run in wasm, and smoke-test
      that it drains the browser-backed Win32 queue, dispatches through the
      registered WndProc, and exposes `MSG::time` through `TheMessageTime`.
- [x] Compile original `Main/WinMain.cpp` far enough for the real `WndProc()`
      to run in wasm, and smoke-test queued Win32 mouse messages flowing
      through `Win32GameEngine::serviceWindowsOS()` into the original
      `Win32Mouse` event buffer.
- [x] Extend the original `WndProc()` wasm smoke to cover `WM_SETCURSOR`,
      `WM_KILLFOCUS` / `WM_SETFOCUS`, and `WM_ACTIVATEAPP`, proving cursor
      restoration, `Win32Mouse` focus state, and the D3D reset hook are reached.
- [x] Queue browser printable keyboard input as `WM_CHAR` after `WM_KEYDOWN`,
      with harness coverage proving Shift+A produces Shift keydown, A keydown,
      then an uppercase `WM_CHAR`.
- [x] Link the real `Main/WinMain.cpp` `WndProc()` into the main `cnc-port`
      browser harness and prove a browser-fed `WM_LBUTTONDOWN` drains through
      original `Win32GameEngine::serviceWindowsOS()` into the Win32 mouse
      event buffer under Playwright.
- [x] Map browser pointer double-click sequences to original
      `WM_*BUTTONDBLCLK` messages and prove the main harness pumps them through
      original `WndProc()` into the Win32 mouse double-click state.
- [x] Dispatch `WM_CREATE` and `WM_DESTROY` from the browser Win32
      `CreateWindow` / `DestroyWindow` shims, with message-pump and legacy
      platform smoke coverage for the registered WndProc lifecycle path.
- [x] Route browser canvas focus, blur, and refocus through Win32
      `WM_ACTIVATEAPP`, `WM_ACTIVATE`, `WM_SETFOCUS`, and `WM_KILLFOCUS`
      messages, with Playwright coverage proving original `WndProc()` updates
      the Win32 mouse focus flag and D3D reset hook.
- [x] Factor the original `Win32GameEngine::serviceWindowsOS()` message-pump
      body into an Emscripten-visible helper and have the focused WndProc
      harness call it directly, replacing the raw-storage/reinterpret-cast
      pseudo-object used by the browser message-pump smoke.
- [x] Route browser DOM composition events through Win32
      `WM_IME_STARTCOMPOSITION`, `WM_IME_COMPOSITION`,
      `WM_IME_ENDCOMPOSITION`, and committed `WM_CHAR` messages, with
      Playwright coverage proving the browser-fed queue preserves the IME
      sequence and UTF-16 text payload.
- [x] Finish Win32 engine message-loop enablement on top of the browser-fed
      queue for keyboard, pointer, double-click, focus/activation, lifecycle,
      and DOM composition text paths through the browser device layer.
- [x] Add a `cnc-port` browser RPC and Playwright smoke for the original
      `Win32GameEngine::serviceWindowsOS()` path. The smoke queues a
      browser-backed Win32 message, drains it through the Emscripten-visible
      helper factored from the linked original `Win32GameEngine.cpp`
      `serviceWindowsOS()` body, verifies `TheMessageTime` propagation, proves
      stateful `SetErrorMode` shim behavior for the constructor contract, and
      explicitly leaves real `Win32GameEngine` construction / `GameEngine`
      singleton lifetime as the next startup boundary instead of faking full
      engine ownership.
- [x] Add a focused wasm `Win32GameEngine` lifetime smoke that constructs and
      destroys the linked original `Win32GameEngine.cpp` concrete over a
      minimal browser-owned `GameEngine` lifetime surface, verifies inherited
      focus/quitting/FPS state, and proves the constructor/destructor
      `SetErrorMode` save/restore path. This intentionally does not claim full
      original `GameEngine.cpp` ownership: linking that source still pulls the
      broad startup singleton set that must be owned before `createAudioManager`
      can become the next real init boundary.
- [x] `WWVegas/WWLib` guarded legacy translation units (`Except.cpp`,
      `point.cpp`) compile under their original source guards; this is compile
      coverage only, not a browser exception dialog or enabled Point body.
- [x] `WWVegas/WWLib` version/PE-header helper (`verchk.cpp`) compiles and is
      exercised through Wwutil file-id timestamp coverage under wasm.
- [x] Compile LCW compression stream adapters (`lcw.cpp`, `lcwpipe.cpp`) after
      adding a portable LCW literal-packet `LCW_Comp` path for non-MSVC builds,
      and smoke-test direct LCW plus `LCWPipe` round trips under wasm.
- [x] Compile original `WWVegas/WWLib/load.cpp` and smoke-test
      `Uncompress_Data` with raw and LCW IFF-style block headers under wasm.
- [x] Port original `WWVegas/WWLib/srandom.cpp` to browser entropy through
      Emscripten `getentropy`; keep the original UNIX and Windows seed paths
      intact for non-wasm builds.
- [x] Audit and fix original `WWVegas/WWLib/RLEEngine::Compress` zero-run
      handling at the exact end of a source buffer, with a trailing-zero smoke
      vector under wasm.
- [x] `WWVegas/WWLib` in-memory 2D surface and PCX image helpers (`surface.cpp`,
      `xsurface.cpp`, `blit.cpp`, `pcx.cpp`) compile and smoke-test BSurface
      fills, pixels, lines, rectangles, blits, buffer copies, and PCX decode
      under wasm.
- [x] `WWVegas/WWLib` Targa image utility and Win32 globals (`TARGA.CPP`,
      `win.cpp`) compile and smoke-test truecolor TGA save/load, image flips,
      and original window/focus global state under wasm.
- [x] `WWVegas/WWLib` conversion drawer globals (`_convert.cpp`) compile and
      smoke-test the original `VoxelDrawer`, `UnitDrawer`, `TerrainDrawer`,
      `AnimDrawer`, `NormalDrawer`, and `IsometricDrawer` definitions under
      wasm.
- [x] `WWVegas/WWLib` legacy font metrics (`wwfont.cpp`) compile and
      smoke-test original FONTMAKE-style width, height, line-width, and
      spacing calculations under wasm.
- [x] `WWVegas/WWLib` platform compatibility helpers (`data.cpp`,
      `rcfile.cpp`, `registry.cpp`) compile and smoke-test legacy data loading,
      raw CPS-style uncompression, and current browser no-resource/no-registry
      fallbacks under wasm.
- [x] `WWVegas/WWLib` legacy URL launcher (`LaunchWeb.cpp`) compiles under
      wasm and smoke-tests null, empty, and normal URL calls through the current
      browser-safe no-native-process path.
- [x] Port original WWLib MPU/RDTSC timing helpers (`mpu.cpp`) to the final
      browser timing/CPU-detection contract without preserving x86 inline
      assembly.
- [x] Restore or replace the missing WWLib GNU regex dependency before
      compiling original `regexpr.cpp`; do not stub `RegularExpressionClass`
      users.
- [x] `WWVegas/WWDebug` core `wwdebug.cpp` compiles and smoke-tests message,
      assert, trigger, and profile handlers under wasm.
- [x] `WWVegas/WWDebug` profile/memory slice (`FastAllocator.cpp`,
      `wwmemlog.cpp`, `wwprofile.cpp`) compiles and smoke-tests profile tree
      recording, allocator accounting, and memory-log allocation/free counters
      under wasm.
- [x] Extend the `WWVegas/WWDebug` profile/memory smoke to pin the browser
      `_UNIX` memory-log contract: `MEM_COUNT` and the category name table
      (`Texture`, `Renderer`) stay intact, current/peak category accounting
      remains inert under `DISABLE_MEMLOG`, and `Enable_Memory_Log` toggles its
      flag without charging categories unless `USE_MEMLOG` is defined.
- [x] Port original `WWVegas/WWDebug/wwprofile.cpp` for wasm or restore its
      missing `fastallocator.h` dependency; the current wasm `wwprofile.h`
      shim disables `WWPROFILE` scope timers so culling can compile without
      pulling unresolved profiling manager state.
- [x] Decide whether the browser `_UNIX` build should keep original
      `wwmemlog.cpp` category tracking disabled or introduce a wasm-safe
      thread-local memory-log mode. Decision: keep the original `_UNIX`
      force-disable (`DISABLE_MEMLOG=1`, no per-allocation `MemoryLogStruct`
      header, no category charging) — it is a debug-only feature the engine
      does not rely on for correctness, and enabling it would add a 16-byte
      header to every allocation in a single-threaded browser build. The
      contract is now pinned by the `wwdebug-profile` smoke (category
      count/names intact, current/peak accounting inert, enable flag
      observable but non-charging without `USE_MEMLOG`).
- [x] `WWVegas/WWSaveLoad` core persistence plumbing (`persistfactory.cpp`,
      `saveload.cpp`, `saveloadsubsystem.cpp`, `pointerremap.cpp`,
      `saveloadstatus.cpp`) compiles as a wasm static library for WWMath curve
      and lookup-table users.
- [x] Full `WWVegas/WWSaveLoad` compiles, including definitions, parameters,
      twiddlers, and save/load round-trip coverage.
- [x] Add endian-sensitive smoke coverage for original `ChunkSaveClass` /
      `ChunkLoadClass` save-game chunk bytes under wasm, proving chunk IDs,
      sizes, subchunk flags, micro-chunk headers, and 32-bit payloads preserve
      the original little-endian x86 file contract.
- [x] `WWVegas/Wwutil` compiles and smoke-tests math helpers, string/file
      utilities, read-only attributes, PE-header file-id strings, and removal
      under wasm.
- [x] Identify which `Libraries/Source` deps are runtime-required vs tools-only.

### GameEngine — Common
- [x] Initial `GameEngine/Common` core slice compiles from original sources:
      memory allocator, critical-section wrapper, `AsciiString`, `UnicodeString`,
      `SubsystemInterface`, `GameType`, trig tables, `NameKeyGenerator`,
      `RandomValue`, and engine `crc`, with wasm smoke coverage.
- [x] Expanded `GameEngine/Common` core slice compiles from original sources:
      `MemoryInit.cpp`, `GameCommon.cpp`, `List.cpp`, `DiscreteCircle.cpp`,
      `Dict.cpp`, `Language.cpp`, `System/String.cpp`, `System/encrypt.cpp`,
      `File.cpp`, `LocalFileSystem.cpp`, Bezier helpers, and
      `PartitionSolver.cpp`, with wasm smoke coverage.
- [x] Expanded `GameEngine/Common` startup/type slice compiles from original
      sources: `RAMFile.cpp`, `CDManager.cpp`, `registry.cpp`,
      `DisabledTypes.cpp`, `KindOf.cpp`, and `ObjectStatusTypes.cpp`, with
      wasm smoke coverage for RAM file reads/scans, CD drive bookkeeping,
      browser registry defaults, and type-mask initialization.
- [x] Expanded `GameEngine/Common` facade/geometry slice compiles from original
      sources: `FileSystem.cpp`, `Snapshot.cpp`, `Geometry.cpp`,
      `BitFlags.cpp`, and `MiniLog.cpp`, with wasm smoke coverage for the
      original file-system local/archive dispatch path, facade existence cache,
      file-info and directory-list delegation, music-CD presence probe,
      model-condition and armor-set bit-name tables, and geometry bounds /
      footprint calculations.
- [x] Extend the original `BitFlags` smoke to cover the set-operation surface
      used by GameLogic condition matching and netcode: `any`, `testForAny`,
      `testForAll`, `testForNone`, `countIntersection`, and the set-wise
      `set(BitFlags)`, `clear(BitFlags)`, `clearAndSet`, and `clear()` transfers.
      This is bit-flag bookkeeping coverage only; full condition-matching still
      waits for the linked `Player`/`Thing`/object runtime.
- [x] Expanded `GameEngine/Common` compression/data-chunk slice compiles from
      original sources: `Compression.cpp` and `DataChunk.cpp`, linked against
      the existing original `CompressionManager` slice, with wasm smoke
      coverage for compressed cached-file reads, `DataChunkInput` table / chunk
      parsing, and original `DataChunkOutput` temp-file serialization for
      primitive values, byte arrays, ASCII/Unicode strings, name keys, and
      `Dict` values through the current user-data path shim.
- [x] Expanded `GameEngine/Common` string/network utility slice compiles from
      original source: `QuotedPrintable.cpp`, with wasm smoke coverage for
      ASCII quoted-printable and the original UTF-16LE Unicode wire format used
      by LAN/GameSpy/user-preference paths.
- [x] Compile original `Common/System/Xfer.cpp`, `XferCRC.cpp`,
      `XferLoad.cpp`, and `XferSave.cpp` in the real-header compile frontier
      after resolving the original `Common/Xfer` / `Common/BitFlagsIO` include
      cycle and adding the direct `KindOf` / WWMath matrix dependencies.
- [x] Promote the easy original low-level Common sources into the real-header
      compile frontier after replacing precompiled-header assumptions with
      direct includes: `BitFlags.cpp`, `Dict.cpp`, `DiscreteCircle.cpp`,
      `Language.cpp`, `MessageStream.cpp`, `MultiplayerSettings.cpp`,
      `NameKeyGenerator.cpp`, `PartitionSolver.cpp`, `RandomValue.cpp`,
      `TerrainTypes.cpp`, `crc.cpp`, `version.cpp`, and the browser-buildable
      `System` leaves for strings, compression/data chunks, core game/type
      tables, geometry, masks, lists, trig, quoted printable, subsystem
      interface, and encryption.
- [x] Compile original save-game `Common/System/SaveGame/GameState.cpp` and
      `GameStateMap.cpp` in the real-header compile frontier after adding the
      browser Win32 date/time/current-directory compatibility surface.
- [x] Promote the remaining browser-buildable non-device `Common` core sources
      from `zh_gameengine_common_core` into the real-header compile frontier,
      including original memory/file/archive/system leaves, Bezier helpers,
      audio metadata/request leaves, and RTS accounting/prerequisite leaves.
- [x] Exercise original `Common/System/FileSystem.cpp` facade dispatch for
      archive lookup, `doesFileExist` true/false cache entries, directory
      listing, file-info, and `areMusicFilesOnCD` against the linked local/BIG
      smoke backends and CD manager.
- [x] Remove the `gameengine-common-core-smoke` local `FileSystem::openFile`
      link shim after original `Common/System/FileSystem.cpp` compiles into the
      smoke target with target-local archive/audio singleton globals.
- [x] Add the `Libraries/Source/Compression` include path needed by original
      `Common/System/Compression.cpp` and `DataChunk.cpp`, then compile their
      GameEngine compression/data-chunk facade paths against the existing
      compression manager slice.
- [x] Compile original `Common/System/ArchiveFile.cpp`,
      `ArchiveFileSystem.cpp`, `StreamingArchiveFile.cpp`, and the original
      Win32 BIG reader/system into the wasm core; smoke-test BIG indexing,
      file-info, directory listing, archive fallback reads, and streaming reads.
- [x] Compile original `Common/System/LocalFile.cpp` plus the original
      `Win32LocalFile` / `Win32LocalFileSystem` bridge into the wasm core;
      smoke-test local writes, existence, file-info, directory listing,
      `FileSystem` dispatch, RAM conversion, and whole-file reads.
- [x] Add an opt-in real-asset smoke (`npm run test:real-big`) that verifies
      the original `Win32BIGFileSystem` indexes extracted `INIZH.big`, finds
      real INI entries, and reads `Armor.ini`, `CommandButton.ini`, and
      `Weapon.ini` through the original `FileSystem` archive fallback path
      under Node raw filesystem access.
- [x] Validate the original BIG reader against extracted real archives
      (`INIZH.big` first) through browser asset fetch/MEMFS mounting in the
      harness.
- [x] Validate the browser asset fetch/MEMFS path against every inventoried
      extracted runtime BIG archive with the original `Win32BIGFileSystem`
      indexing and reading at least one file from each archive.
- [x] Exercise original `DataChunkOutput` write/temp-file path in the linked
      Common smoke through the current `GlobalData` user-data path shim,
      round-tripping the generated table/chunk stream through original
      `DataChunkInput`.
- [x] Add endian-sensitive smoke coverage for original `DataChunkOutput`
      save/data bytes under wasm, proving the `CkMp` table, symbol count,
      mapping IDs, chunk ID/version/data-size header, integer, real, byte, and
      ASCII-string length fields preserve the original little-endian x86 file
      contract.
- [x] Compile original `Common/version.cpp` after adding a lowercase
      `Common/Version.h` wrapper and bringing up the `GameClient/GameText`
      interface used by its Unicode formatting path.
- [x] Compile original `Common/System/Directory.cpp`,
      `Common/System/StackDump.cpp`, and `Common/Audio/AudioRequest.cpp` into
      the wasm Common core; smoke-test `AudioRequest` memory-pool
      allocation/release.
- [x] Compile original `Common/CRCDebug.cpp` in the real-header compile
      frontier after making `CRCDebug.h` self-contained for the engine typedefs
      it exposes outside `DEBUG_CRC`.
- [x] Compile original `Common/System/Debug.cpp` and
      `Common/System/FunctionLexicon.cpp` in the real-header compile frontier
      after the DirectInput declaration shim, typed callback-table wrapper,
      explicit `Debug.cpp` `GlobalData`/`StackDump` includes, and Win32
      message/window constants made their original dependencies reachable.
- [x] Link original `Common/System/Debug.cpp` into the browser bootstrap with
      `DEBUG_LOGGING` console output routed through the Emscripten stderr hook,
      with harness state/log coverage for the original `DebugLog` path.
- [x] Compile original `Common/Audio/DynamicAudioEventInfo.cpp` against the
      current temporary `Common/Xfer.h` shim, including unsigned-byte and
      unsigned-int transfer signatures.
- [x] Compile original `Common/Audio/GameMusic.cpp` into the wasm Common core
      as compile coverage for music-track parse metadata and music-manager
      request plumbing.
- [x] Compile original `Common/Audio/AudioEventRTS.cpp`,
      `Common/Audio/GameAudio.cpp`, and `Common/Audio/GameSounds.cpp` into the
      wasm Common core with the current audio, INI, Xfer, GameLogic, and
      object-lookup compatibility surface.
- [x] Compile original `Common/Audio/urllaunch.cpp` into the wasm Common core
      and route `LaunchURL` through a browser `window.open` bridge under
      Emscripten. The Common-core smoke now covers `MakeEscapedURL` and the
      non-browser failure path, while a Playwright harness probe verifies the
      direct original `LaunchURL` call reaches `window.open` with URL, target,
      and features preserved.
- [x] Compile original INI leaf parser sources for currently covered Common
      data (`INIAudioEventInfo.cpp`, `INIMiscAudio.cpp`, and
      `INIMultiplayer.cpp`) after extending the temporary `Common/INI.h`
      bridge with the matching original entry-point declarations.
- [x] Compile additional original INI wrapper sources
      (`INICommandSet.cpp`, `INIControlBarScheme.cpp`, `INIDamageFX.cpp`,
      `INIMapData.cpp`, and `INIModel.cpp`) after extending the temporary
      `Common/INI.h` bridge with the matching original entry-point
      declarations.
- [x] Compile original `Common/INI/INISpecialPower.cpp` and
      `Common/RTS/SpecialPower.cpp` after fixing the `ScienceType` enum-forward
      contract, adding a temporary linkable `INI::parseScience` bridge, and
      qualifying the original special-power bit-name table for clang.
- [x] Compile additional original Common INI leaf parser sources
      (`INICrate.cpp`, `INIDrawGroupInfo.cpp`, `INITerrain.cpp`,
      `INITerrainBridge.cpp`, `INITerrainRoad.cpp`, and `INIUpgrade.cpp`) after
      adding the matching temporary `Common/INI.h` declarations and fixing
      direct header dependencies for `CrateSystem` / `Upgrade`.
- [x] Compile original `Common/RTS/PlayerTemplate.cpp` after restoring the
      `AsciiStringList` typedef surface and adding the matching temporary
      `INI::parsePlayerTemplateDefinition` bridge declaration.
- [x] Compile original `Common/RTS/PlayerList.cpp` in the wasm Common core as
      compile coverage for player-list lifecycle and lookup plumbing.
- [x] Compile original `Common/INI/INICommandButton.cpp` into the GameClient
      utility slice as compile coverage for command-button parsing against the
      current ControlBar/SpecialPower declarations.
- [x] Link and smoke-test the original multiplayer INI parser route through the
      focused browser INI runtime, using original `Common/INI.cpp::load`,
      `INIMultiplayer.cpp`, `MultiplayerSettings.cpp`, `Money.cpp`, and
      `GameNetwork/GameSpy/Chat.cpp` for shipped settings, color, starting
      money, and online chat-color data.
- [x] Link and smoke-test the original special-power INI parser route through
      the focused browser INI runtime, using original `Common/INI.cpp::load`,
      `INISpecialPower.cpp`, `SpecialPower.cpp`, `Science.cpp`, and
      `AcademyStats.cpp` for shipped superweapon metadata, required sciences,
      timer/radius fields, academy classifications, and preserved audio event
      names.
- [x] Link and smoke-test the original player-template INI parser route through
      the focused browser INI runtime, using original `Common/INI.cpp::load`,
      `Common/RTS/PlayerTemplate.cpp`, `Common/RTS/Science.cpp`, and
      `GameText.cpp` for shipped faction/template counts, sides, intrinsic
      sciences, start units/buildings, special-power shortcut metadata, and
      load/score assets exposed through the public original API.
- [x] Link and smoke-test the original AIData INI parser route through the
      focused browser INI runtime, using original `Common/INI.cpp::load`,
      `Common/INI/INIAiData.cpp`, `GameLogic/AI/AI.cpp`, and
      `GameLogic/Map/SidesList.cpp` for shipped tactical timers, resource
      thresholds, guard/combat/group-pathing metadata, side entries, and build
      lists.
- [x] Link and smoke-test the original locomotor INI parser route through the
      focused browser INI runtime, using original `Common/INI.cpp::load`,
      `GameLogic/Object/Locomotor.cpp`, and `LocomotorStore` for shipped
      infantry, vehicle, and air locomotor metadata.
- [x] Link and smoke-test the original DamageFX INI parser route through the
      focused browser INI runtime, using original `Common/INI.cpp::load`,
      `Common/INI/INIDamageFX.cpp`, and `Common/DamageFX.cpp` over shipped
      `Data\INI\DamageFX.ini` with focused FXList lookup and regular-veterancy
      throttle coverage.
- [x] Link and smoke-test the original FXList INI parser route through the
      focused browser INI runtime, using original `Common/INI.cpp::load` and
      `GameClient/FXList.cpp` over shipped `Data\INI\FXList.ini` with harness
      state proving 428 shipped FX lists and selected nugget counts.
- [x] Link `UpgradeCenter` into command-button parser preflight so shipped
      `CommandButton.ini` resolves real upgrade pointers before command-button
      runtime validation.
- [x] Link focused original command-set parser preflight through real
      `INICommandSet.cpp` and shipped `AmericaInfantryRangerCommandSet`, after
      loading the referenced shipped command-button subset through the original
      command-button parser.
- [x] Link and smoke-test the original control-bar scheme parser route through
      the focused browser INI runtime, using original `Common/INI.cpp::load`,
      `INIControlBarScheme.cpp`, `ControlBarScheme.cpp`, and
      `GameClient/Image.cpp` over shipped default and faction schemes with
      original 512 mapped-image resolution.
- [x] Link and smoke-test the original upgrade INI parser route through the
      focused browser INI runtime, using original `Common/INI.cpp::load`,
      `INIUpgrade.cpp`, `Upgrade.cpp`, `NameKeyGenerator`, and shipped
      `Data\INI\Upgrade.ini` for veterancy templates, unique shipped upgrade
      count, build time/cost/type, academy classification, and preserved audio
      event names.
- [x] Link the original draw-group INI parser destination into the focused
      browser INI runtime, using original `INIDrawGroupInfo.cpp` and
      `DrawGroupInfo.cpp`; archive/browser harness state now exposes the
      optional probe, verifies the Zero Hour-only branch does not contain
      `Data\INI\DrawGroupInfo.ini`, and verifies the base `INI.big` branch
      parses the original base `DrawGroupInfo.ini` shape (Arial 10, no player
      color, one-pixel shadow offsets, and 8 accepted fields) through the same
      original parser route.
- [x] Link and smoke-test the original mapped-image parser route through the
      focused browser INI runtime, using original `Common/INI.cpp::loadDirectory`,
      `INIMappedImage.cpp`, and `GameClient/Image.cpp` over shipped
      `Data\INI\MappedImages` data for packed UVs, texture sizes, and rotated
      image status.
- [x] Link and smoke-test the original crate INI parser route through the
      focused browser INI runtime, using original `Common/INI.cpp::load`,
      `INICrate.cpp`, `CrateSystem.cpp`, and `Science.cpp` over the shipped
      `Data\INI\Crate.ini` `CrateData` subset for salvage, elite/heroic, and
      GLA02 money-crate templates.
- [x] Compile original RTS accounting sources `Common/RTS/Handicap.cpp`,
      `MissionStats.cpp`, and `Money.cpp` after fixing the original
      `Team` DLINK clang contract and adding the production map typedefs
      needed by `Player`/`Thing` headers.
- [x] Compile original `Common/RTS/Energy.cpp` and
      `Common/RTS/ProductionPrerequisite.cpp` into the wasm Common core as
      compile coverage for player power accounting and build prerequisite
      logic.
- [x] Compile original `Common/RTS/Science.cpp` against the current temporary
      `Common/INI.h` parser bridge for science definitions and translated
      labels.
- [x] Link and smoke-test original `ScienceStore` metadata behavior through the
      current `Common/INI` bridge, including parsed science registration,
      internal-name round trips, WorldBuilder name enumeration, default purchase
      cost, grantability, and empty translated name/description storage without
      invoking player-owned prerequisite checks.
- [x] Replace the temporary `parseScience`, `parseScienceVector`, and
      `parseAndTranslateLabel` bridge helpers with the real `Common/INI.cpp` /
      `GameText` parse path, then smoke-test science-definition and
      shipped special-power parsing against real INI data, with the original
      academy classification table from `AcademyStats.cpp` linked into the
      runtime smoke. Full player-owned prerequisite checks and full
      default+shipped engine startup remain open.
- [x] Compile original `Common/MultiplayerSettings.cpp` and
      `Common/TerrainTypes.cpp` against the current `Common/INI` parse-table
      bridge, with wasm smoke coverage for terrain defaults, list insertion,
      and default-terrain copying.
- [x] Link and smoke-test original `Common/MultiplayerSettings.cpp` and
      `Common/RTS/Money.cpp` value behavior, including multiplayer defaults,
      color allocation/packing, starting-money choices/defaults, money parsing,
      and amount equality without invoking the deeper economy/audio side
      effects.
- [x] Compile original `Common/PerfTimer.cpp` into the wasm Common core after
      guarding its x86 precision-timer assembly behind the current dormant
      `NO_PERF_TIMERS` build and an Emscripten `QueryPerformanceCounter`
      fallback.
- [x] Compile original `Common/RTS/Team.cpp` in the real-header compile
      frontier as compile coverage for team/prototype ownership paths.
- [x] Compile original `Common/RTS/ActionManager.cpp` in the real-header
      compile frontier after fixing the `WeaponSlotType` enum forward
      declaration to match its fixed underlying type.
- [x] Compile original `Common/RTS/AcademyStats.cpp` in the real-header
      compile frontier after adding its real client random-value and
      `GlobalData` header dependencies.
- [x] Compile original `Common/RTS/ScoreKeeper.cpp` in the real-header compile
      frontier after related `GameLogic`/Thing declarations are reachable.
- [x] Compile original `Common/RTS/ResourceGatheringManager.cpp` in the
      real-header compile frontier after making its header self-contained for
      memory-pool and STL list dependencies.
- [x] Compile original `Common/RTS/Player.cpp` and `TunnelTracker.cpp` in the
      real-header compile frontier after fixing the `AIPathfind.h`
      `PathfindCell` contract and clang loop-scope issues.
- [x] Compile original `Common/DamageFX.cpp` in the real-header compile
      frontier after `Common/Thing` / `Common/OVERRIDE.h`, `GameClient/FXList`
      / `InGameUI`, and `GameLogic/Damage` / `Object` dependencies are
      reachable.
- [x] Compile original `Common/System/BuildAssistant.cpp` in the real-header
      compile frontier after the `AIPathfind.h` `PathfindCell` contract and
      logic random helper dependency are reachable through original headers.
- [x] Compile original `Common/CommandLine.cpp` in the real-header compile
      frontier after making the real `GlobalData` include explicit and adding
      the POSIX-backed `_stat` compatibility aliases.
- [x] Compile original `Common/StateMachine.cpp` in the real-header compile
      frontier once the real `Xfer::xferObjectID` and `Xfer::xferCoord3D`
      declarations are reachable.
- [x] Compile original `Common/MessageStream.cpp` in the real-header compile
      frontier after resolving its clang loop-scope issue while preserving the
      original argument traversal logic.
- [x] Compile original `Common/StatsCollector.cpp` in the real-header compile
      frontier after making `StatsCollector.h` self-contained for
      `AsciiString` and engine basic types.
- [x] Compile original `Common/GlobalData.cpp` in the real-header compile
      frontier after making the real `GlobalData` include explicit and mapping
      the user-data folder lookup to the browser/POSIX platform shim.
- [x] Link and smoke-test original `GlobalData` constructor defaults and
      browser user-data path setup in the wasm bootstrap via
      `globalDataProbe`.
- [x] Link and smoke-test original `Common/CommandLine.cpp` mutating real
      `GlobalData` in the wasm bootstrap via `commandLineProbe`.
- [x] Compile original `Common/UserPreferences.cpp` after the GameSpy Peer/GP
      SDK headers used by `GameNetwork/GameSpy/PeerDefs.h` are available or
      mapped to browser-safe networking interfaces.
- [x] Compile original `Common/Recorder.cpp` after the GameSpy Peer headers
      used by `GameNetwork/GameSpy/PeerDefs.h` are restored or mapped onto the
      browser networking contract.
- [x] Compile original `Common/SkirmishBattleHonors.cpp` in the real-header
      compile frontier.
- [x] Compile original `Common/Thing/ThingFactory.cpp` and
      `ThingTemplate.cpp` in the real-header compile frontier after adding the
      real INI parser, libc++ hash-map compatibility, `SparseMatchFinder`
      standard-library compatibility, and narrow loop-scope/header fixes.
- [x] Compile original `Common/Thing/ModuleFactory.cpp` after
      `RiderChangeContain`'s `ObjectStatusType` / `LocomotorSetType`
      declarations, remaining case-variant `GameLogic` include wrappers, and
      broader behavior-module header dependencies are portable.
- [x] Compile original `Common/GameLOD.cpp` after the particle-priority,
      TerrainVisual/GameClient, and W3D collision include dependencies are
      available.
- [x] Compile original `Common/GameMain.cpp` in the real-header compile
      frontier.
- [x] Compile original `Common/GameEngine.cpp` after the WOL browser / ATL
      dependency (`atlbase.h` through `GameNetwork/WOLBrowser/WebBrowser.h`)
      has a browser compile bridge.
- [x] Compile original `Common/System/Radar.cpp` in the real-header compile
      frontier after preserving the original radar-color lookup loop state
      across clang's standard for-loop scope rules.
- [x] Compile original `Common/System/Upgrade.cpp` in the real-header compile
      frontier with the real INI and upgrade-mask headers.
- [x] Compile original `Common/System/MemoryInit.cpp` pool sizing for the wasm
      engine path instead of relying on smoke-local memory hook defaults.
- [x] Audit original Bezier helper warnings under clang/Emscripten:
      `BezierSegment` array-constructor bound mismatch and
      `BezFwdIterator` conservative pointer-initialization diagnostics.
- [x] Compile original device common leaves in the real-header compile
      frontier: `W3DDevice/Common/W3DConvert.cpp`,
      `Win32Device/Common/Win32CDManager.cpp`, and
      `Win32Device/Common/Win32OSDisplay.cpp`, with current browser no-CD and
      message-box compatibility shims.
- [x] Compile additional lightweight original W3D device leaves in the
      real-header compile frontier: `W3DThingFactory.cpp`,
      `W3DGameLogic.cpp`, and `TileData.cpp`, after fixing
      `WorldHeightMap.h` self-containment and the `WWLib/RefCount.h`
      case-sensitive include path.
- [x] Link and smoke-test lightweight original W3D utility behavior under
      wasm: `TileData.cpp` terrain-tile mip generation and `W3DPoly.cpp`
      polygon clipping, with the original sources also present in the
      real-header compile frontier.
- [x] Compile original `W3DDevice/GameClient/W3DFileSystem.cpp` in the
      real-header compile frontier after adding the `WWLIB/ffactory.h`
      case-sensitive include bridge needed by the original W3D file factory
      header.
- [x] Compile additional original W3D client/UI leaves in the real-header
      compile frontier: `W3DMOTD.cpp`, `W3DDebugDisplay.cpp`,
      `W3DDynamicLight.cpp`, and the currently disabled `W3DGranny.cpp`
      translation unit, after adding exact-case bridges for
      `WW3D2/Light.h` and `lib/baseType.h`.
- [x] Compile the original W3D GUI/factory device batch in the real-header
      compile frontier: `W3DFunctionLexicon.cpp`, `W3DModuleFactory.cpp`, W3D
      gadget draw sources, `W3DControlBar.cpp`, `W3DMainMenu.cpp`,
      `W3DGameFont.cpp`, `W3DGameWindow.cpp`, and `W3DGameWindowManager.cpp`,
      after adding the WW3D2 case-bridge batch, portable function-lexicon
      callback storage, and fixed-underlying enum forwards for the reached W3D
      module headers. This is compile coverage only until browser display,
      input, and renderer paths are harness-driven.
- [x] Compile the original W3D height-map/terrain-support batch in the
      real-header compile frontier: `W3DRadar.cpp`, `BaseHeightMap.cpp`,
      `FlatHeightMap.cpp`, `HeightMap.cpp`, `TerrainTex.cpp`,
      `WorldHeightMap.cpp`, `W3DDebugIcons.cpp`, `W3DDisplayString.cpp`,
      `W3DDisplayStringManager.cpp`, `W3DStatusCircle.cpp`,
      `camerashakesystem.cpp`, `W3DGhostObject.cpp`, and
      `W3DTerrainLogic.cpp`, after adding the reached D3DX/Common/W3D/WWMath
      case bridges and localized standard-clang compatibility fixes for
      original shader-manager, status-circle, camera-shake, and height-map
      code. This is compile coverage only until terrain/render/water paths are
      browser-rendered and harness-verified.
- [x] Compile the original W3D renderer-helper batch in the real-header compile
      frontier: `W3DAssetManager.cpp`, `W3DAssetManagerExposed.cpp`,
      `W3DBibBuffer.cpp`, `W3DBridgeBuffer.cpp`, `W3DCustomEdging.cpp`,
      all `Drawable/Draw/W3D*Draw.cpp` leaves, all
      `Shadow/W3D*Shadow.cpp` leaves plus `W3DBufferManager.cpp`,
      `W3DParticleSys.cpp`, `W3DPropBuffer.cpp`, `W3DRoadBuffer.cpp`,
      `W3DShaderManager.cpp`, `W3DShroud.cpp`, `W3DSmudge.cpp`,
      `W3DSnow.cpp`, `W3DTerrainBackground.cpp`, `W3DTerrainTracks.cpp`,
      `W3DTreeBuffer.cpp`, and `W3dWaypointBuffer.cpp`, after adding the
      reached Benchmark/Bink/DirectInput/D3D/D3DX/Win32 declaration surface,
      case bridges, and localized standard clang compatibility fixes. This is
      compile coverage only until the browser renderer, input, particles,
      shaders, and shadow paths are harness-verified.
- [x] Compile original `W3DDevice/GameClient/W3DScene.cpp` in the
      real-header compile frontier after resolving the reached legacy
      MSVC loop-scope assumptions without changing scene traversal or render
      queue behavior. This is compile coverage only until the browser
      renderer can drive scene/camera output through harness screenshots.
- [x] Compile original `W3DDevice/GameClient/W3DMouse.cpp` in the
      real-header compile frontier after adding the reached Win32 cursor,
      WinMM timing, and Direct3D cursor-update declaration surface plus a
      localized MSVC loop-scope compatibility fix. This is compile coverage
      only until browser pointer events and cursor rendering are wired through
      the real input/display path and harness-verified.
- [x] Compile original `W3DDevice/GameClient/W3DView.cpp` in the
      real-header compile frontier after routing the original `Main/WinMain.h`
      include directory into the wasm target. This is compile coverage only
      until the browser renderer can drive scene/camera output through harness
      screenshots and state queries.
- [x] Compile original `W3DDevice/GameClient/W3DGameClient.cpp` in the
      real-header compile frontier after the reached display, terrain, shadow,
      water, LOD, input, video, and device-factory headers became available.
      This is compile coverage only until the W3D display/input/terrain/video
      device stack links and is harness-driven.
- [x] Compile original `W3DDevice/GameClient/W3DWebBrowser.cpp` in the
      real-header compile frontier through the existing compile-only WOL
      browser bridge plus opaque ATL/`IDispatch` compatibility. This is compile
      coverage only until the original BrowserEngine/embedded-browser path is
      replaced with a browser DOM/iframe or external-link contract.
- [x] Compile original `W3DDevice/GameClient/W3DInGameUI.cpp` in the
      real-header compile frontier with the existing W3D scene/view/render-object
      compatibility surface. This is compile coverage only until move hints,
      selection regions, placement-angle UI, and GUI repaint paths are driven
      by browser display/input and harness screenshots.
- [x] Compile original `W3DDevice/GameClient/W3DTerrainVisual.cpp` in the
      real-header compile frontier after adding the `FlatHeightmap.h`
      case-sensitive include bridge and fixing the reached legacy MSVC loop
      scope in the seismic filter without changing terrain behavior. This is
      compile coverage only until terrain visual load, water grid, bib/prop,
      terrain-track, shadow, smudge, and scene paths are browser-rendered and
      harness-verified.
- [x] Compile original `W3DDevice/GameClient/W3DVideoBuffer.cpp` in the
      real-header compile frontier after resolving its case-sensitive include
      mismatch with the checked-in original `W3DVideobuffer.h`. This is compile
      coverage only until W3D texture/surface locking and video playback paths
      are backed by the browser renderer/video device and harness-verified.
- [x] Compile original `W3DDevice/GameClient/Water/W3DWaterTracks.cpp` in the
      real-header compile frontier after fixing the MSVC-style `waveType`
      enum forward, adding browser no-op virtual-key state compatibility, and
      replacing reached MSVC-only temporary-to-non-const-reference editor calls
      with equivalent lvalue `Vector2` inputs. This is compile coverage only
      until water-track rendering, file I/O, editor input, and water-scene
      integration are browser-backed and harness-verified.
- [x] Compile original `W3DDevice/GameClient/Water/W3DWater.cpp` in the
      real-header compile frontier after adding the explicit D3DX core include
      needed by its inline shader assembly path. This is compile coverage only
      until D3DX shader assembly/creation, reflection render targets, grid and
      river water rendering, water-track integration, and terrain/water scene
      state are mapped to browser renderer APIs and harness-verified.
- [x] Compile original `W3DDevice/GameClient/W3DDisplay.cpp` in the
      real-header compile frontier after adding the reached WWMath/WWLib
      case-sensitive include bridges, Win32 bitmap/local-file/window
      compatibility declarations, and localized MSVC-to-clang fixes for the
      untyped model-state debug constant and debug-display callback call. This
      is compile coverage only until W3D display/device construction, display
      modes, gamma, front-buffer screenshot/movie capture, window state, and
      Direct3D render paths are mapped to browser canvas/renderer APIs and
      harness-verified.
- [x] Compile the first original non-Direct3D `WWVegas/WW3D2` frontier batch as
      `zh_ww3d2_compile_frontier`: animation/render-object helpers,
      collision/intersection helpers, light/projector support, asset/cache and
      exclusion helpers, render-info/sound render-object leaves, and small W3D
      utility/metadata translation units.
- [x] Expand `zh_ww3d2_compile_frontier` to 46 original WW3D2 sources by adding
      hierarchy/animation/LOD definitions, render-object definitions,
      AAB-tree/visibility/spatial helpers, mesh-geometry/build metadata,
      decal/particle/snap-point support, and strip/metal/motion helpers after
      resolving case-sensitive header bridges, Win32 string aliases, and
      localized clang/MSVC loop-scope/template lookup fixes.
- [x] Expand `zh_ww3d2_compile_frontier` to 55 original WW3D2 sources by adding
      animation channel/morph/raw animation bodies, material-info helpers,
      texture filename metadata, DX8 renderer debugger compile coverage, and
      text-texture helper coverage after resolving original header
      forward-declaration gaps, case-sensitive `font.h` / `convert.h` /
      `streakrender.h` bridges, opaque GDI handle typedefs, and localized
      `StringClass` mutable-buffer fixes.
- [x] Expand `zh_ww3d2_compile_frontier` to 82 original WW3D2 sources by adding
      the first Direct3D-adjacent renderer/helper batch (`bitmaphandler.cpp`,
      `bmp2d.cpp`, `boxrobj.cpp`, `camera.cpp`, `decalmsh.cpp`, `dx8fvf.cpp`,
      `dx8polygonrenderer.cpp`, `dx8texman.cpp`, `formconv.cpp`,
      `line3d.cpp`, `linegrp.cpp`, `matpass.cpp`, `matrixmapper.cpp`,
      `mesh.cpp`, `render2d.cpp`, `ringobj.cpp`, `scene.cpp`, `segline.cpp`,
      `seglinerenderer.cpp`, `shattersystem.cpp`, `static_sort_list.cpp`,
      `statistics.cpp`, `streak.cpp`, `streakRender.cpp`,
      `texturethumbnail.cpp`, `txt2d.cpp`, and `ww3dformat.cpp`) after adding
      a declaration-only Direct3D 8/D3DX compile surface, case wrappers for
      `Dx8Wrapper.h` / D3DX headers, Windows `GUID`/`RECT`/`CONST`
      compatibility, and scalar Emscripten fallbacks for original
      `dx8wrapper.h` color packing/clamping x86 assembly.
- [x] Expand `zh_ww3d2_compile_frontier` to 105 original WW3D2 sources by
      adding renderer/material/texture bodies (`assetmgr.cpp`, `dazzle.cpp`,
      `ddsfile.cpp`, `dx8caps.cpp`, `dx8indexbuffer.cpp`, `dx8renderer.cpp`,
      `dx8vertexbuffer.cpp`, `dynamesh.cpp`, `lightenvironment.cpp`,
      `mapper.cpp`, `meshmatdesc.cpp`, `meshmdl.cpp`, `meshmdlio.cpp`,
      `missingtexture.cpp`, `part_buf.cpp`, `shader.cpp`,
      `sortingrenderer.cpp`, `sphereobj.cpp`, `surfaceclass.cpp`,
      `texture.cpp`, `texturefilter.cpp`, `textureloader.cpp`, and
      `vertmaterial.cpp`) after resolving declaration-only D3D8/D3DX/DirectDraw
      compile-surface gaps and localized MSVC-to-clang source-compatibility
      issues without replacing renderer behavior.
- [x] Expand `zh_ww3d2_compile_frontier` to 111 original WW3D2 sources by
      adding frame-grab/screenshot, point-group, projected-texture, text-draw,
      GDI sentence, and WW3D entry coverage (`FramGrab.cpp`, `pointgr.cpp`,
      `render2dsentence.cpp`, `texproject.cpp`, `textdraw.cpp`, and
      `ww3d.cpp`) after adding declaration-only VFW/GDI/WinMM/MPU/D3DX
      compatibility and localized clang fixes for original 16-bit text indices,
      vector resizing, and texture accessors. This is compile coverage only:
      browser GDI text rasterization, VFW frame capture, and renderer runtime
      behavior still need real browser ports and harness screenshots.
- [x] Expand `zh_ww3d2_compile_frontier` to 113 original WW3D2 sources by
      adding `animatedsoundmgr.cpp` and `dx8wrapper.cpp` after adding the
      WWAudio/Miles declaration surface, case-sensitive WWAudio include bridges,
      additional Direct3D 8 render-state/gamma declarations, and localized
      clang fixes for original loop scope and mutable string-buffer assumptions.
      This is compile coverage only: WWAudio/Miles still needs a Web Audio
      runtime port, and the Direct3D wrapper still needs real WebGL2/WebGPU
      backend behavior before any rendering claim is done.
- [x] Expand `zh_ww3d2_compile_frontier` to 114 original WW3D2 sources by
      adding `sr_util.cpp` after introducing a compile-only Surrender
      math/object declaration surface. This covers the original Surrender
      conversion utility translation unit, not the runtime Surrender renderer
      or object model.
- [x] Start `zh_wwshade_compile_frontier` with 17 original `WWVegas/wwshade`
      sources that do not require generated shader blob headers: shader
      definitions/factories/managers, interfaces, loaders, mesh/submesh,
      renderer, simple/gloss/cubemap/legacy W3D paths, and hardware-shader
      helper declarations. This is compile coverage only until the Direct3D
      shader runtime is mapped to a browser renderer.
- [x] Expand `zh_wwshade_compile_frontier` to all 23 original
      `WWVegas/wwshade` C++ sources by generating the legacy
      `*.vsh_code.h` / `*.psh_code.h` headers at build time from the original
      checked-in shader text, then adding the DX6/DX7/DX8 bump variants. This
      is compile coverage only; shader assembly, shader creation, and material
      rendering still need browser renderer mappings before any rendering claim
      is done.
- [x] Start `zh_wwaudio_compile_frontier` with all 19 original
      `WWVegas/WWAudio` C++ sources after adding the reached Miles/Win32
      declaration surface, case-sensitive include bridges, and localized
      clang/MSVC compatibility fixes. This is compile coverage only; the
      current Miles declarations are inert and do not provide Web Audio
      playback.
- [x] Start `zh_miles_audio_device_compile_frontier` with original
      `GameEngineDevice/Source/MilesAudioDevice/MilesAudioManager.cpp` after
      adding the reached `MSS/MSS.h`, DirectSound speaker-config/Bink-handle,
      Miles, and Win32 mutex declaration surface. This is compile coverage only;
      the current declarations are inert and do not provide Web Audio playback,
      sample/stream ownership, decoding, or 3D positioning.
- [x] Start `zh_bink_video_device_compile_frontier` with original
      `GameEngineDevice/Source/VideoDevice/Bink/BinkVideoPlayer.cpp` after
      expanding the compile-only Bink declaration shim for the handle fields,
      surface constants, and API calls used by the original player/stream code.
      This is compile coverage only; `.bik` decoding, video-to-texture upload,
      audio sync, and browser-backed WebCodecs/`<video>` playback remain open.
- [x] Link and smoke-test original `W3DFileSystem.cpp` filename/path dispatch
      through the original WW3D file-factory singleton and `FileSystem`
      facade, covering localized W3D/TGA lookup, shared W3D/DDS lookup,
      loose files, user-data fallback, map-preview fallback, and missing
      assets. This is filesystem dispatch coverage only; browser-backed W3D
      rendering remains open.
- [x] Link and smoke-test original WW3D2 light/render-object behavior through
      `rendobj.cpp`, `light.cpp`, `lightenvironment.cpp`, `camera.cpp`, and
      `ww3d.cpp`, covering ref-counted render-object lifetime, clone/class IDs,
      native screen-size defaults, point/directional light bounds, attenuation
      folded into `LightEnvironmentClass`, and camera defaults. This is runtime
      object/lighting math coverage only; WebGL2/WebGPU rendering remains open.
- [x] Replace the current no-op Win32 cursor position/key-state compatibility
      helpers with browser-fed state for `GetCursorPos`, `SetCursorPos`,
      `SetCursor`, capture bookkeeping, `ScreenToClient`, and
      `GetAsyncKeyState`, with harness coverage proving DOM pointer/F6 events
      are visible through the Win32-style calls reached by W3D mouse and
      water-track code.
- [x] Resolve the `W3DVideoBuffer.cpp` header gap as a case-sensitive include
      mismatch: the source includes `W3DDevice/GameClient/W3DVideoBuffer.h`,
      while the checked-in original header is `W3DVideobuffer.h`; add the wasm
      include bridge and compile the original source without replacing the
      video-buffer interface.
- [x] Expand `zh_ww3d2_compile_frontier` to 115 original WW3D2 sources by
      adding `dx8webbrowser.cpp` after guarding the legacy BrowserEngine DLL
      import with an Emscripten declaration surface. This is compile coverage
      only: the BrowserEngine smart pointer still fails activation under wasm
      until the embedded-browser path has a real browser runtime port.
- [x] `Common/System` (file system iface, BIG archive, streams, memory) compiles.
- [x] `Common/INI` parser compiles as original source in the real-header
      compile frontier (reuse original — do NOT rewrite).
- [x] Compile currently browser-buildable original `Common/INI` leaf/parser
      sources in the real-header compile frontier against real `Common/INI.h`
      (`INIAiData`, animation/audio/command/control-bar/crate/DamageFX,
      draw-group, game-data, map-cache/map-data/mapped-image, misc-audio,
      model, multiplayer, object, particle, special-power, terrain,
      terrain-bridge/road, upgrade, video, water, and weapon parsers).
- [x] Compile original `Common/INI/INIWebpageURL.cpp` after the WOL browser /
      ATL dependency (`atlbase.h`) has a browser URL compile bridge.
- [x] `GameMain.cpp`, `GlobalData.cpp`, `NameKeyGenerator`, `RandomValue`, and
      `crc` compile as part of the real-header compile frontier.
- [x] `GameEngine.cpp` compiles as part of a broader engine archive after its
      WOL browser / ATL dependency is replaced with a browser compile bridge.

### GameEngine — GameClient / GameLogic / GameNetwork (headers + logic)
- [x] Compile the first broad original `GameLogic` real-header batch in the
      compile frontier: `Map/SidesList.cpp`, `System/CaveSystem.cpp`,
      `System/CrateSystem.cpp`, `System/RankInfo.cpp`, `Object/Armor.cpp`,
      core body/create/die/collide/helper/special-power/upgrade module bases,
      crate collide leaves, and the currently browser-buildable object
      create/die/helper/special-power/upgrade leaves. This is compile coverage
      only until the full `Object`, `Player`, `GameLogic`, `AIPathfind`, and
      command/runtime surfaces link.
- [x] Compile the next probed `GameLogic` module leaves in the real-header
      compile frontier after resolving the current clustered blockers:
      `Map/PolygonTrigger.cpp`, `Map/TerrainLogic.cpp`,
      `Object/Body/ActiveBody.cpp`, `Object/Body/UndeadBody.cpp`,
      `Object/Collide/CrateCollide/SalvageCrateCollide.cpp`,
      `Object/Die/CreateCrateDie.cpp`, `Object/Die/CrushDie.cpp`,
      `Object/Die/RebuildHoleExposeDie.cpp`,
      `Object/Helper/StatusDamageHelper.cpp`,
      `Object/Upgrade/CostModifierUpgrade.cpp`,
      `Object/Upgrade/ReplaceObjectUpgrade.cpp`, `System/Damage.cpp`, and
      `System/GameLogicDispatch.cpp`.
- [x] Compile the next broad original `GameLogic` clean-probe batch in the
      real-header compile frontier: `AI/AI.cpp`, `AI/AIDock.cpp`, 20 behavior
      leaves, 7 contain leaves, damage/destroy leaves, `ExperienceTracker`,
      `FiringTracker`, `SimpleObjectIterator`, 43 update leaves, and
      `ScriptEngine/VictoryConditions.cpp`. The frontier now covers 176 of
      259 original `GameLogic` translation units.
- [x] Compile the next source-specific `PreRTS` original `GameLogic` batch in
      the real-header compile frontier: `AI/AIGuardRetaliate.cpp`,
      `AI/AITNGuard.cpp`, `AI/Squad.cpp`, `Object/Contain/CaveContain.cpp`,
      `Object/Contain/TunnelContain.cpp`,
      `Object/Damage/TransitionDamageFX.cpp`,
      `Object/Update/AIUpdate/HackInternetAIUpdate.cpp`,
      `Object/Update/AIUpdate/WanderAIUpdate.cpp`,
      `Object/Update/AutoDepositUpdate.cpp`,
      `Object/Update/CheckpointUpdate.cpp`,
      `Object/Update/CleanupHazardUpdate.cpp`, `Object/Update/EMPUpdate.cpp`,
      `Object/Update/EnemyNearUpdate.cpp`, `Object/Update/FireSpreadUpdate.cpp`,
      `Object/Update/MobMemberSlavedUpdate.cpp`,
      `Object/Update/OCLUpdate.cpp`,
      `Object/Update/PointDefenseLaserUpdate.cpp`,
      `Object/Update/SlavedUpdate.cpp`,
      `Object/Update/StealthDetectorUpdate.cpp`,
      `Object/Update/StealthUpdate.cpp`, and
      `Object/Update/TensileFormationUpdate.cpp`. The frontier now covers 197
      of 259 original `GameLogic` translation units.
- [x] Compile the 45-source `PreRTS` original `GameLogic` batch opened by the
      easy shared blockers: AI group/player/state/turret files, heal/bridge/
      countermeasure/minefield/tech behavior leaves, garrison/open/parachute
      contain leaves, `Object.cpp`, `Locomotor.cpp`, `ObjectCreationList.cpp`,
      22 update leaves, `Weapon.cpp`, `WeaponSet.cpp`, and
      `ScriptActions.cpp` / `ScriptConditions.cpp` / `Scripts.cpp`. This adds
      case-sensitive wrappers (`PreRTS.H`, `Common/XFerCRC.h`,
      `common/DataChunk.h`, `GameLogic/Weaponset.h`,
      `GameLogic\\Weaponset.h`, `WWMath/Vector3.h`), temporary
      `GlobalData` / `INI` / `Xfer` / `GameLogic` compile-surface expansion,
      and localized clang/MSVC compatibility fixes. The frontier now covers 242
      of 259 original `GameLogic` translation units.
- [x] Compile the remaining 17 original `GameLogic` sources after resolving the
      clustered blockers found by the latest source-specific probe:
      `AIPathfind.cpp` legacy bool/null path returns and static declaration,
      missile/laser/neutron/ghost enum and particle-system completeness,
      `KindOfMaskType` self-containment, remaining standard-library iterator
      conversions, `FlightDeckBehavior` / `SlowDeathBehavior` STL portability,
      `ScriptEngine.cpp` attack-priority / Win32 DLL bridge issues, and
      `System/GameLogic.cpp` GameSpy GP include mapping. The maintained
      `zh_gameengine_real_compile_frontier` target now compiles all 259 of 259
      original `GameLogic` translation units.
- [x] Compile original `GameLogic/System/GameLogic.cpp` after the missing
      GameSpy GP SDK include path (`GameSpy/GP/GP.h`) is restored or mapped to
      the browser networking contract.
- [x] Expanded `GameClient` utility slice compiles from original sources:
      `Color.cpp`, `Credits.cpp`, `Display.cpp`, `System/DebugDisplay.cpp`,
      `DisplayString.cpp`,
      `DisplayStringManager.cpp`, `DrawGroupInfo.cpp`, `DrawableManager.cpp`,
      `GUI/GameWindow.cpp`,
      `GUI/GameFont.cpp`, `GUI/HeaderTemplate.cpp`,
      `GUI/Shell/ShellMenuScheme.cpp`,
      `GUI/WinInstanceData.cpp`, `GlobalLanguage.cpp`, `GameText.cpp`,
      `System/Image.cpp`, `LanguageFilter.cpp`, `Line2D.cpp`,
      `ParabolicEase.cpp`, `System/CampaignManager.cpp`, `RadiusDecal.cpp`,
      `System/RayEffect.cpp`, `MessageStream/HintSpy.cpp`, `Snow.cpp`,
      `Statistics.cpp`,
      `View.cpp`, `VideoPlayer.cpp`, `VideoStream.cpp`, and `Water.cpp`, with wasm smoke
      coverage for packed colors,
      debug-display formatting/cursor state, display-string text/font/list
      management, window instance text/tooltip allocation, draw-group defaults,
      `GlobalLanguage` constructor/font defaults and resolution font-size
      adjustment, original string-file loading/fetch/prefix/map string
      handling, header-template creation/lookup/iteration, mapped-image
      defaults/mutators and lookup-shim coverage, credits defaults/parse
      table/style parsing, shell menu scheme defaults/manager lookup,
      encrypted language-filter word loading and
      filtering, 2D clip/intersection/area helpers, easing,
      snow/weather/water defaults, normalization, mu-law helpers, and
      video-list bookkeeping.
- [x] Add lowercase `Common/Filesystem.h` compatibility, `PreRTS.h`
      include-contract parity for `Common/INI.h`/`Common/GlobalData.h`, and
      browser Win32 version/font-resource fallbacks needed to compile original
      `GameClient/GlobalLanguage.cpp` against the current temporary INI and
      GlobalData surfaces.
- [x] Compile original `GameClient/LanguageFilter.cpp` after resolving its
      16-bit word-list buffer contract under wasm `WideChar`/`wchar_t`.
- [x] Compile original `GameClient/GameText.cpp` and smoke-test the string-file
      path through the original `GameTextInterface`, including label fetch,
      escaped text, map string files, prefix lookup, and missing-label fallback.
- [x] Link original `GameText.cpp`/`LanguageFilter.cpp` into the main
      `cnc-port` archive preflight and harness-test real
      `Data\English\Generals.csf` loading from the fetched runtime BIG set,
      including the title label, an America command-center control-bar label,
      and `CONTROLBAR:` prefix enumeration.
- [x] Expose the original GameText registry-selected language and formatted CSF
      path in `assetProbe.gameText`, and require the runtime archive
      Playwright harness to prove the selected `Data\english\Generals.csf`
      path exists before treating the CSF label probe as ready.
- [x] Add a real browser rendering vertical for CSF-backed text:
      `test:ww3d-display-game-text` mounts only
      `Data\English\Generals.csf` from `EnglishZH.big` as a range-backed subset,
      loads it through original `GameText.cpp`, fetches
      `GUI:Command&ConquerGenerals`, feeds that `UnicodeString` to original
      `W3DDisplayString`, and verifies the browser D3D8/WebGL2 draw with a
      screenshot/state check. This proves the thin asset-to-text-to-render path;
      full `GlobalLanguage::init` and local-font startup remain open.
- [x] Compile original `GameClient/DisplayString.cpp`,
      `DisplayStringManager.cpp`, `GUI/GameFont.cpp`,
      `GUI/WinInstanceData.cpp`, and empty legacy `DrawableManager.cpp`; smoke
      test original font reuse/reset, display-string text mutation and manager
      linking, and `WinInstanceData` text/tooltip allocation through
      `TheDisplayStringManager`.
- [x] Compile original `GameClient/System/Image.cpp`, `Water.cpp`, and
      `GUI/HeaderTemplate.cpp` after extending the temporary `Common/INI.h`
      bridge with original scalar, color, bit-string, sub-token, quoted-string,
      and definition declarations needed by those sources; smoke-test image,
      water, and header-template runtime basics.
- [x] Make original `GameClient/Water.h` self-contained for `AsciiString` and
      GameMemory dependencies because it stores `AsciiString` values and uses
      `Overridable` memory-pool macros directly when wasm targets suppress the
      original `PreRTS.h` body.
- [x] Compile original `GameClient/System/Anim2D.cpp` after extending the
      target-local `Common/INI.h` and `Common/Xfer.h` shims with the original
      index-list, duration parser, mapped-image, and unsigned-short transfer
      surface, plus the missing `Anim2DCollection` forward declaration; smoke
      test animation template parse fields, frame allocation, and collection
      lookup/linking.
- [x] Compile original `GameClient/Credits.cpp` and
      `GUI/Shell/ShellMenuScheme.cpp` after the display/view header contract
      provides `FilterModes`, `FilterTypes`, `StaticGameLODLevel`,
      `CellShroudStatus`, `AnimTypes`, and after original INI lookup/image/
      coordinate parse helpers are available through the current temporary
      bridge; smoke-test their non-rendering defaults and parse tables.
- [x] Compile original `GameClient/System/CampaignManager.cpp` after extending
      the temporary INI/Xfer/GameClient-facing bridge with the campaign parse
      entry point and snapshot transfer surface.
- [x] Compile original `GameClient/MapUtil.cpp` after adding Win32
      `SYSTEMTIME` compatibility and the original `GlobalData::m_buildMapCache`
      field/default to the temporary wasm shim.
- [x] Compile original `GameClient/RadiusDecal.cpp` after adding the current
      `Xfer::xferColor`, `GameLogic::getDrawIconUI`, and object-lookup compile
      bridge needed by the original source.
- [x] Compile original `GameClient/MessageStream/HintSpy.cpp` and
      `GameClient/System/RayEffect.cpp` in the GameClient utility target as
      compile coverage for UI hint translation and client ray-effect state.
- [x] Compile original `GameClient/Terrain/TerrainRoads.cpp` in the GameClient
      utility target; `Data\INI\Roads.ini` runtime parser coverage now proves
      definition loading, while map road placement and rendering remain open.
- [x] Compile original `GameClient/GraphDraw.cpp` in the GameClient utility
      target; it is currently compile-only because the active wasm build does
      not define `PERF_TIMERS`.
- [x] Compile original `GameClient/View.cpp` in the GameClient utility target
      after extending the temporary `Common/GlobalData.h` shim with the
      original camera-height fields/defaults; this is compile coverage only
      until the browser display device layer can be exercised through the
      harness.
- [x] Compile original `GameClient/GUI/AnimateWindowManager.cpp` and
      `GUI/ProcessAnimateWindow.cpp` in the GameClient utility target after
      resolving the existing `AnimTypes` forward-declaration contract.
- [x] Compile original GUI/window utility sources
      (`GUI/WindowLayout.cpp`, `GUI/GameWindowManager.cpp`,
      `GUI/GameWindowGlobal.cpp`, `GUI/WindowVideoManager.cpp`, and
      `GUI/ControlBar/ControlBarPrintPositions.cpp`) plus the core gadget
      implementations (`GadgetStaticText.cpp`, `GadgetCheckBox.cpp`,
      `GadgetRadioButton.cpp`, `GadgetProgressBar.cpp`,
      `GadgetHorizontalSlider.cpp`, `GadgetVerticalSlider.cpp`,
      `GadgetTabControl.cpp`, `GadgetTextEntry.cpp`, `GadgetComboBox.cpp`,
      and `GadgetListBox.cpp`) in the GameClient utility target after adding
      DirectInput key constants, Win32 double-click/return-key fallbacks, and
      small clang/MSVC-scope compatibility fixes; this is compile coverage
      only until real window instances are driven through the browser input /
      render path.
- [x] Compile original `GameClient/GUI/ChallengeGenerals.cpp`,
      `GUI/GameWindowManagerScript.cpp`, `GUI/GameWindowTransitions.cpp`, and
      GUI callback utility sources (`GUICallbacks/ExtendedMessageBox.cpp`,
      `GUICallbacks/IMECandidate.cpp`, and `GUICallbacks/MessageBox.cpp`) in
      the GameClient utility target; smoke-test the non-rendering
      `ChallengeGenerals` parse table and state accessors.
- [x] Compile original GameClient-facing INI leaf parser sources
      (`INIAnimation.cpp`, `INIMappedImage.cpp`, `INIVideo.cpp`, and
      `INIWater.cpp`) in the GameClient utility target after adding the
      corresponding temporary `Common/INI.h` declarations and enum-forward
      compatibility.
- [x] Compile original leaf shell/menu callbacks (`CreditsMenu.cpp`,
      `SinglePlayerMenu.cpp`, `PopupCommunicator.cpp`,
      `WOLCustomScoreScreen.cpp`, `WOLMessageWindow.cpp`,
      `WOLQMScoreScreen.cpp`, and `WOLStatusMenu.cpp`) in the GameClient
      utility target; this is compile coverage only until `Shell`, `GameWindow`,
      and the real menu flow can link.
- [x] Compile original `GameClient/GUI/GUICallbacks/ReplayControls.cpp` in the
      GameClient utility target; this is compile coverage only until replay
      state and shell/window flow can link.
- [x] Compile original `GameClient/GUI/GameWindowTransitionsStyles.cpp`,
      `GUI/ControlBar/ControlBarResizer.cpp`, and
      `GUI/Gadget/GadgetPushButton.cpp` in the GameClient utility target after
      resolving their enum-forward, `OVERRIDE`, `MIN`, and temporary INI bridge
      declarations; this is compile coverage only until `GameWindow`,
      `ControlBar`, `InGameUI`, and real radius-decal/render behavior can be
      driven.
- [x] Compile original `GameClient/GUI/GameWindow.cpp` in the GameClient
      utility target after resolving the related enum/header contracts; this is
      compile coverage only until `ControlBar`, `InGameUI`, real decal/display
      behavior, and the browser input/render path are available and
      harness-driven.
- [x] Compile additional original GameClient message/UI/FX leaves in the
      utility target (`Eva.cpp`, `FXList.cpp`, `SelectionInfo.cpp`,
      `MessageStream/GUICommandTranslator.cpp`, `HotKey.cpp`, `LookAtXlat.cpp`,
      `MetaEvent.cpp`, `PlaceEventTranslator.cpp`, `SelectionXlat.cpp`,
      `WindowXlat.cpp`, `GUI/ControlBar/ControlBarScheme.cpp`,
      `GUI/GUICallbacks/InGameChat.cpp`,
      `GUI/GUICallbacks/Menus/KeyboardOptionsMenu.cpp`, and
      `SkirmishMapSelectMenu.cpp`) after adding case-variant wrappers and
      matching temporary `Common/INI.h`, `Common/GlobalData.h`, and
      `GameLogic/GameLogic.h` bridge declarations for the original parser,
      camera/input, replay, and menu fields they reference.
- [x] Compile additional original GameClient dispatch/control-bar/menu leaves
      in the utility target (`GameClientDispatch.cpp`,
      `GUI/ControlBar/ControlBarBeacon.cpp`,
      `ControlBarMultiSelect.cpp`, `ControlBarOCLTimer.cpp`,
      `ControlBarObserver.cpp`, `ControlBarStructureInventory.cpp`,
      `ControlBarUnderConstruction.cpp`,
      `GUI/GUICallbacks/GeneralsExpPoints.cpp`, and menu callbacks for
      disconnect, connection establishment, LAN map/options/lobby, and
      skirmish game options) after adding narrow case wrappers, original
      `GlobalData`/`GameLogic` bridge fields, and localized clang loop-scope /
      callback-cast compatibility fixes.
- [x] Compile the next original GameClient GUI, particle, terrain, and
      drawable-update batch in the utility target
      (`GUI/DisconnectMenu/DisconnectMenu.cpp`,
      `GUI/EstablishConnectionsMenu/EstablishConnectionsMenu.cpp`,
      `GUI/GUICallbacks/ControlBarCallback.cpp`,
      `ControlBarPopupDescription.cpp`, `InGamePopupMessage.cpp`,
      `Menus/GameInfoWindow.cpp`, `Menus/MapSelectMenu.cpp`,
      `Menus/QuitMenu.cpp`, `System/ParticleSys.cpp`,
      `Terrain/TerrainVisual.cpp`, `Drawable/Update/BeaconClientUpdate.cpp`,
      and `Drawable/Update/SwayClientUpdate.cpp`) after restoring original
      `STLTypedefs` aliases and extending the temporary `Xfer`,
      `GlobalData`, and `GameLogic` compile bridges.
- [x] Compile the next vertical original GameClient batch in the utility target
      (`GameClient.cpp`, `InGameUI.cpp`, `Input/Mouse.cpp`,
      `GUI/IMEManager.cpp`, menu callbacks for challenge, difficulty,
      replay, save/load, and replay list/export flow, plus
      `Drawable/Update/AnimatedParticleSysBoneClientUpdate.cpp`) after
      extending the temporary `GlobalData`, `INI`, `Xfer`, `GameLogic`, Win32,
      and IMM compile bridges and making the original `GameClient.cpp`
      preload loop explicit for clang's standard for-scope rules.
- [x] Compile additional original GameClient drawable/debug leaves in the
      utility target (`Drawable.cpp`, `Drawable/DrawableManager.cpp`,
      `System/Smudge.cpp`, and `System/Debug Displayers/AudioDebugDisplay.cpp`)
      after adding original `GlobalData` drawable/debug fields, the
      `INI::parseWeaponTemplate` and `Xfer::xferMatrix3D` bridge surface, a
      `WWMATH/Vector2.h` case wrapper, and standard clang fixes for original
      `WW3D2/dllist.h` include/dependent-base assumptions.
- [x] Compile original ControlBar core/command sources in the GameClient
      utility target (`GUI/ControlBar/ControlBar.cpp`,
      `ControlBarCommand.cpp`, and `ControlBarCommandProcessing.cpp`) after
      adding temporary original INI parser entry declarations, the
      `GameLogic::findControlBarOverride` compile bridge, the original
      `GlobalData::m_downwindAngle` field/default, fixed-underlying
      `MaxHealthChangeType` enum declarations for standard clang, and a
      localized legacy for-scope fix.
- [x] Compile the next original GameClient shell/network menu batch in the
      utility target (`GUI/LoadScreen.cpp`, `GUI/Shell/Shell.cpp`,
      `GUI/GUICallbacks/Diplomacy.cpp`, `NetworkDirectConnect.cpp`,
      `PopupHostGame.cpp`, `PopupJoinGame.cpp`, `PopupLadderSelect.cpp`,
      `PopupPlayerInfo.cpp`, `ScoreScreen.cpp`, `WOLBuddyOverlay.cpp`,
      `WOLLobbyMenu.cpp`, `WOLLocaleSelectPopup.cpp`, `WOLMapSelectMenu.cpp`,
      `WOLQuickMatchMenu.cpp`, and `MessageStream/CommandXlat.cpp`) after
      adding GameSpy include-case wrappers, a compile-only `ghttp` surface,
      original `GlobalData` / `GameLogic` shim parity, `_wtoi`
      compatibility, and localized MSVC loop-scope fixes.
- [x] Compile the final original GameClient source batch in the utility target
      (`DownloadMenu.cpp`, `MainMenu.cpp`, `OptionsMenu.cpp`,
      `WOLGameSetupMenu.cpp`, `WOLLadderScreen.cpp`, `WOLLoginMenu.cpp`,
      `WOLWelcomeMenu.cpp`, and `Input/Keyboard.cpp`) after adding
      WWDownload include-case wrappers, a compile-only WOL browser bridge,
      original options/audio/display `GlobalData` shim parity, `HRESULT` /
      `_spawnl` compatibility, and localized MSVC loop-scope, implicit-int,
      const-correctness, variadic string, and wide-character literal fixes.
- [x] Compile original `GameClient/Input/Mouse.cpp` after adding temporary
      `InGameUI`, mouse INI parse, `GlobalData` cursor/debug, and object lookup
      compile bridges; runtime pointer behavior still waits for the browser
      input/device layer and harness checks.
- [x] `GameNetwork` core (Connection, FrameData, NetPacket, protocol helpers)
      compiles into the wasm archive.
- [x] Compile the first original GameNetwork command/frame slice
      (`Connection.cpp`, `FileTransfer.cpp`, `FrameData.cpp`,
      `FrameDataManager.cpp`, `GameMessageParser.cpp`, `NetCommandList.cpp`,
      `NetCommandRef.cpp`, `NetCommandWrapperList.cpp`,
      `NetMessageStream.cpp`, `NetworkUtil.cpp`, and `User.cpp`) in a wasm
      core archive.
- [x] Link and smoke-test the original GameNetwork utility/frame slice with
      command-id/type policy checks and empty frame readiness through
      `FrameData`/`FrameDataManager`, plus pooled `User` value behavior.
- [x] Expose the original GameNetwork utility/frame slice through the main
      `cnc-port` browser harness state, covering command IDs, frame readiness,
      and packet round-trip parsing without opening raw sockets.
- [x] Compile original `GameNetwork/FrameMetrics.cpp` after extending the
      temporary wasm `Common/GlobalData.h` surface with original network
      history fields/defaults and fixing its legacy MSVC loop-scope assumption.
- [x] Link and smoke-test original `GameNetwork/FrameMetrics.cpp`
      init/reset/cushion history behavior against the current wasm
      `GlobalData` shim.
- [x] Link and smoke-test original `GameNetwork/Connection.cpp` send/ack queue
      behavior through original packetization and `Transport::queueSend`
      buffering without binding UDP sockets.
- [x] Link and smoke-test original `GameNetwork/Connection.cpp` retry behavior
      through original `doSend()` retry gating, retry packetization,
      mismatched-ack retention, and ack removal on the current browser-safe
      `Transport::queueSend` path. Real receive remains separate.
- [x] Link and smoke-test original `GameNetwork/FileTransfer.cpp` map-path
      helper behavior.
- [x] Compile original `GameNetwork/NetPacket.cpp` after resolving its
      clang/libc++ strictness issues (`NetPacketList` null return,
      legacy loop-scope variable use, and `BitFlags::set` enum conversion)
      plus the wasm `WideChar` packet text conversion without changing protocol
      bytes.
- [x] Compile original `GameNetwork/NetCommandMsg.cpp` after adding the
      `SYSTEMTIME` shim and fixing the original `Team` DLINK clang contract.
- [x] Link and smoke-test original `GameNetwork/NetCommandList.cpp`,
      `NetCommandMsg.cpp`, `NetCommandRef.cpp`, and `NetPacket.cpp` sorting,
      attach/detach ownership, and non-game command packet round-trips across
      ack-both/stage1/stage2, frame/run-ahead/chat/progress/file-progress,
      player-leave, run-ahead metrics, destroy-player, keepalive, disconnect,
      packet-router, wrapper, file-announce, disconnect-frame/screen-off, and
      frame-resend request commands, including explicit 16-bit chat-text wire
      serialization under wasm `WideChar`.
- [x] Extend the original `NetCommandList` runtime smoke to cover the remaining
      linked-list mutation surfaces: `appendList` (null/empty no-op, ordered
      merge preserving command id order and relay, source list left intact,
      duplicate command rejection), `removeMessage` (middle/head/tail unlink with
      neighbor relink, detached-but-not-freed ref contract), and the
      `findMessage(NetCommandMsg*)` overload (match by type/player/id plus
      absent-command miss). This is command-list bookkeeping coverage only;
      the broader connection-manager merge path still waits for real
      game-command reconstruction, ack packet paths, and browser transport
      receive.
- [x] Add endian-sensitive smoke coverage for original `NetPacket.cpp`
      frame-command wire bytes under wasm, proving command markers plus
      little-endian `UnsignedInt` frame, `UnsignedShort` command-id, and
      command-count fields match the original x86 protocol contract.
- [x] Link and smoke-test original `GameNetwork/NetCommandWrapperList.cpp`
      chunk reassembly into parsed commands, including incomplete-list
      draining, duplicate chunk handling, relay preservation, and ready-list
      removal after reconstruction.
- [x] Audit and align `NetPacket::ConstructNetCommandMsgFromRawData`
      first-command `NETCOMMANDTYPE_ACKBOTH` defaults with
      `NetPacket::getCommandList` so ACK-both raw command parsing matches the
      original packet-list parser state.
- [x] Link original `GameNetwork/Transport.cpp` and `udp.cpp` into the
      GameNetwork core archive and smoke-test direct transport queue rejection,
      encrypted packet header/payload/CRC preservation, full-queue behavior, and
      connection packet buffering before raw UDP flushing.
- [x] Add endian-sensitive smoke coverage for original `Transport::queueSend`
      encrypted wire bytes under wasm, proving the packet CRC word, packed
      magic-plus-payload word, and trailing non-word payload bytes follow the
      original XOR-plus-`htonl` transport contract before browser WebSocket /
      WebRTC re-targeting.
- [x] Compile original `GameNetwork/Transport.cpp`, `IPEnumeration.cpp`, and
      `udp.cpp` after adding the browser-safe WinSock compile surface and
      preserving the original UDP/transport logic for the later WebSocket/WebRTC
      re-target.
- [x] Compile original `GameNetwork/NAT.cpp` after the GameSpy Peer headers,
      WinMM timing shim, and original `GlobalData` firewall fields are reachable.
- [x] Compile original `GameNetwork/DownloadManager.cpp` after restoring the
      current WWDownload dependency surface from the vendored source.
- [x] Link and smoke-test original `WWDownload` idle state and registry URL
      defaults without starting the raw FTP socket path.
- [x] Link and smoke-test original `GameNetwork/DownloadManager.cpp` queue,
      status, error, and last-local-file behavior against original
      `GameText.cpp`/`LanguageFilter.cpp` and `WWDownload`, without starting
      the raw FTP socket path.
- [x] Compile original `GameNetwork/FirewallHelper.cpp` after adding the
      original firewall fields/defaults to the temporary `GlobalData` shim,
      portable `itoa` compatibility, and explicit loop variables for legacy
      MSVC loop-scope assumptions without changing firewall probing behavior.
- [x] Compile additional original GameNetwork setup/LAN/config sources
      (`DisconnectManager.cpp`, `GameInfo.cpp`, `GUIUtil.cpp`,
      `LANAPIhandlers.cpp`, `LANGameInfo.cpp`, and `GameSpy/GSConfig.cpp`) in
      the wasm core archive after adding original `GlobalData` timing/default
      cash and `Xfer::xferMapName` shim surface plus narrow clang loop-scope
      fixes.
- [x] Compile original `GameNetwork/LANAPICallbacks.cpp` into the wasm core
      archive after adding current `GlobalData` map/FPS bridge fields and the
      original `GameLogic` game-mode / clear-data compile surface.
- [x] Compile original `GameNetwork/LANAPI.cpp` and
      `GameNetwork/ConnectionManager.cpp` into the wasm core archive after
      adding browser-safe Win32 user/computer-name fallbacks, original network
      run-ahead `GlobalData` bridge fields, original `GameLogic` progress
      hooks, and narrow clang loop-scope fixes.
- [x] Restore enough declarative GameSpy Peer/GP/persistent-storage/SNMP/ghttp
      compile surface to compile original `GameNetwork/GameSpy/PeerDefs.cpp`,
      `LadderDefs.cpp`, `Chat.cpp`, `LobbyUtils.cpp`, `MainMenuUtils.cpp`,
      `StagingRoomGameInfo.cpp`, `Thread/ThreadUtils.cpp`, and
      `GameSpyOverlay.cpp` in the real-header compile frontier.
- [x] Compile original GameSpy thread sources (`BuddyThread.cpp`,
      `PeerThread.cpp`, `PingThread.cpp`, `PersistentStorageThread.cpp`, and
      `GameResultsThread.cpp`) after adding the SEH translator shim,
      declarative GameSpy GP/Peer/QR2/Stats compile surface, explicit
      WinSock/WinMM includes, and narrow clang/POSIX socket compatibility fixes.
- [x] Compile original legacy GameSpy chat/GP callback sources
      (`GameSpyChat.cpp` and `GameSpyGP.cpp`) after adding a declarative
      `GameNetwork/GameSpy.h` / `TheGameSpyChat` compile bridge and localized
      clang fixes for STL qualification plus implicit helper return types.
- [x] Restore STLport string-content hash semantics for the wasm port:
      libc++'s `std::hash<const char*>` hashes the pointer value while the
      original STLport build hashed string contents (`__stl_hash_string`),
      silently breaking every by-name `hash_map` lookup (e.g. the
      `ThingFactory` template map made every `ObjectReskin` throw
      `INI_INVALID_DATA`). `STLTypedefs.h` now reproduces STLport 4.5.3's
      `h = 5*h + c` hash for `rts::hash<const char*>` and
      `rts::hash<AsciiString>` under `__EMSCRIPTEN__`. Found independently on
      the ThingFactory template map and the audio event maps; fixed once.
- [x] Fix two wasm memory-corruption ODR/layout hazards on the real-init
      path: the target-local `shims/Common/Xfer.h` fork re-declared `Xfer`
      with a different vtable layout (passing a shim-built `XferCRC` into real
      `INI::load` trapped with a wasm function-signature mismatch) — the shim
      now `#include_next`s the original header and real
      `Common/System/Xfer.cpp` links; and shim-world 12-byte `INI` locals
      (e.g. in `SubsystemInterfaceList::initSubsystem`) could run the real
      9,272-byte `INI` ctor over a 12-byte stack slot — `cnc-port` now links
      the real-world `SubsystemInterface.o`. A full shim-`INI` purge is a
      follow-up in `TODO.md`.
---

## M2 — Boot to a black window

- [x] Link the browser bootstrap module against original `GameEngine/Common`
      deterministic RNG/CRC code (`RandomValue.cpp` and `crc.cpp`) and expose a
      harness-verified `originalCoreProbe` state result on boot. This is only a
      Common-core link probe, not full engine initialization.
- [x] Expose a harness-verified `emscripten_set_main_loop` start/stop bridge
      that advances the current wasm bootstrap tick at 60 Hz. This proves the
      browser scheduling surface only; the real engine tick still needs to
      replace the bootstrap counter.
- [x] Timing layer: `QueryPerformanceCounter`/`timeGetTime` →
      `emscripten_get_now()` / browser `performance.now`, with harness state
      checks for monotonic Win32 timing values.
- [x] Expose a harness-verified wasm timing probe sourced from
      `emscripten_get_now()` so manual frame and `emscripten_set_main_loop`
      ticks report monotonic browser timing. This validates the bootstrap's
      browser timing source only; final engine QPC/WinMM timing consolidation
      remains open.
- [x] Initialize the browser harness canvas with a real WebGL2 drawing buffer,
      resize-synchronized viewport/backing state, black clear, and smoke-tested
      resize assertions. This is the browser bridge surface only; original W3D
      display/device binding remains open.
- [x] Add a harness `clearCanvas` RPC that clears the browser WebGL2 drawing
      buffer to a requested color, verifies pixel readback, captures a
      non-black canvas screenshot, and restores the black boot window. This is
      browser bridge validation only; original W3D display clear remains open.
- [x] Logging/`DEBUG_LOG`/assert routed to browser console + harness.
- [x] Capture Emscripten module stdout/stderr through the browser harness log
      RPC and smoke-test the wasm bootstrap boot line.
- [x] Install original `WWDebug` message/assert handlers in the browser
      bootstrap and harness-test info/warning/error/assert routing through the
      captured wasm stdout stream. This proves the original `WWDebug` handler
      bridge only; full release-crash routing remains open.
- [x] Link original `Common/System/Debug.cpp` into the browser bootstrap and
      harness-test `DEBUG_LOG` console output through captured wasm stderr.
- [x] Expose a harness-verified bootstrap `startupAssets` state that reports
      missing runtime archives as `missing_runtime_archives`, reports registered
      archive sets as `pending_boot_probe` before boot, and only reports
      `ready` after the boot-time archive/Armor/Science/SpecialPower/
      PlayerTemplate/Multiplayer/Terrain/TerrainRoads/GameData/Water/Weather/
      Video/GameText/MapCache probes pass. This is bootstrap preflight only;
      full engine-init missing-asset handling remains open.
- [x] Expose a harness-verified `originalEngineStartup` readiness state that
      distinguishes linked original code from runnable original startup, reports
      missing `GameEngine.cpp` startup files, and keeps browser device factory
      readiness explicit instead of invoking `GameEngine::init()` with stubs.
- [x] Feed the harness-verified `FileSystem` facade probe into
      `originalEngineStartup.browserDeviceLayer`, so local MEMFS readiness is
      reported on plain boot and archive filesystem readiness is reported after
      the runtime BIG set is registered and boot-probed, while the overall
      browser device layer remains pending.
- [x] Feed the harness-verified original `GlobalData`, `CommandLine`, and
      no-CD `Win32CDManager` probes into `originalEngineStartup` setup/device
      readiness fields, while keeping `GameEngine::init()` blocked on missing
      startup assets and unimplemented browser renderer/audio/input devices.
- [x] Mark `originalEngineStartup.originalSetup` as probe-only and not yet
      runtime-owned, so the harness distinguishes focused setup validation from
      durable singleton ownership by the real engine startup path.
- [x] Before promoting setup probes to durable bootstrap-owned singleton
      residency, refactor exported archive/data probes to preserve an already
      initialized memory manager and restore resident globals without calling
      `shutdownMemoryManager()` out from under the bootstrap.
- [x] Convert the remaining focused setup/device probes (`GlobalData`,
      `FileSystem`, no-CD manager, GameNetwork) to preserve an already
      initialized memory manager before any of them are reused under
      runtime-owned bootstrap singleton residency.
- [x] Expose a harness-verified `originalEngineStartup.startupFiles.baseIniArchive`
      diagnostic that distinguishes the current Zero Hour-only archive preflight
      from the base Generals `INI.big` startup/default INI files still required
      by original `GameEngine.cpp`, without marking engine startup ready.
- [x] Expose a harness-verified `originalEngineStartup.deviceFactoryFrontier`
      contract sourced from the original startup order: `CreateGameEngine`
      maps to `Win32GameEngine`, the current first unowned init factory is
      `createAudioManager` at `GameEngine.cpp:434`, and later W3D/audio/client/
      logic/radar factories remain explicit probe-only blockers until browser
      replacements exist.
- [x] Add `npm run verify:gameengine-startup-order`, a pure Node source
      verifier that checks the original `GameEngine.cpp` init order,
      `WinMain.cpp` `CreateGameEngine` mapping, and inline `Win32GameEngine`
      factory mappings against the line numbers and concrete classes exposed by
      the startup frontier.
- [x] Extend the startup frontier with the `AudioManager::init` audio INI
      preflight behind the first unowned `createAudioManager` factory. The
      harness now proves the current Zero Hour archive set has shipped
      `Music.ini`, `SoundEffects.ini`, `Speech.ini`, `Voice.ini`, `MiscAudio.ini`,
      and `Default\SoundEffects.ini`, while `AudioSettings.ini` and the other
      default audio INIs remain absent until the base Generals startup archives
      are supplied.
- [x] Expose the exact missing `AudioManager::init` startup INI paths directly
      on `originalEngineStartup.deviceFactoryFrontier.audioStartupFiles.missing`.
      The plain smoke asserts all ten paths missing before archives are mounted,
      the runtime/archive smokes assert the current four optional-base audio INI
      gaps, and the optional base archive path asserts the list clears before
      advancing the frontier to the Web Audio backend blocker.
- [x] Extend `npm run verify:gameengine-startup-order` to source-check the
      `AudioManager::init` audio INI load order and line anchors from
      `GameAudio.cpp`, keeping the harness-visible `audioStartupFiles` contract
      tied to original source facts instead of hand-maintained JSON.
- [x] Add `npm run verify:miles-audio-device-frontier`, a source verifier for
      the next audio device startup frontier: `MilesAudioManager::init` line
      anchors, `AudioManager::init` → `openDevice` → `AIL_set_file_callbacks`
      ordering, `openDevice` Miles call ordering, header declarations, and the
      current compile-only `Mss.H` shim surface.
- [x] Feed the verified `MilesAudioManager::init/openDevice` frontier into the
      harness-visible startup device JSON, including the exact Miles call order,
      source line anchors, Web Audio target, and compile-only `Mss.H` shim
      blockers behind `createAudioManager`.
- [x] Document the verified Miles audio device frontier in
      `SOURCE_INVENTORY.md`, preserving that Miles/WWAudio remain
      compile-only and inert until real Web Audio scheduling, decoding, handle
      ownership, and harness-observable playback exist.
- [x] Add a vertical startup singleton ownership slice before the first device
      factory: the wasm bootstrap now installs browser-owned original
      `SubsystemInterfaceList`, `GlobalData`, `GameLODManager`, and `MapCache`
      instances, publishes the original globals, verifies
      `SubsystemInterfaceList::initSubsystem`/`postProcessLoadAll`/`resetAll`/
      `shutdownAll` with an original subsystem object, and exposes
      `startupSingletons` through the C++ state JSON plus the browser harness.
      The state is also folded into
      `originalEngineStartup.originalSetup`, `browserDeviceLayer`, and
      `deviceFactoryFrontier`, keeping `createAudioManager` as the next device
      boundary instead of adding more isolated probes. The slice deliberately
      stops short of full `GameEngine::init()` consumption: current real assets
      still lack base `Data\INI\GameLODPresets.ini`, and the durable
      startup-owned `TheMapCache` is not yet loaded through
      `Maps\MapCache.ini` or advanced into `MapCache::updateCache`.
- [x] Correct the startup singleton frontier to match original
      `GameEngine.cpp` line order: pre-audio readiness now requires owned
      `SubsystemInterfaceList`, `GlobalData`, and initialized
      `GameLODManager`, but no longer treats `MapCache::updateCache` as a
      blocker before `createAudioManager`. The harness-visible device frontier
      now lists `TheAudio` at line 434 as the first unowned factory and keeps
      `TheMapCache` at line 606 as a deferred post-audio startup step.
- [x] Move the startup singleton owner residency off static placement storage.
      The wasm bootstrap now constructs durable original `SubsystemInterfaceList`,
      `GlobalData`, `GameLODManager`, and `MapCache` instances in heap-backed
      storage, exposes `startupSingletons.heapAllocated`, and asserts the field
      in the no-archive and mounted-runtime archive harness paths. The original
      `MSGNEW`/`delete` shutdown path remains open because freeing temporary
      startup owners after archive preflight corrupts the wasm memory pool.
- [x] Keep the mounted-archive startup singleton probe vertical on the next
      real blocker instead of mutating extra subsystem state early. The browser
      bootstrap now checks `GameLOD.ini`/`GameLODPresets.ini` presence before
      exercising `SubsystemInterfaceList::initSubsystem`, reports the owned
      list separately from the deferred init/shutdown proof, and exposes
      `startupSingletons.subsystemShutdownDeferred` when that later proof runs.
- [x] Promote the original pre-audio startup ownership frontier inside the
      browser-visible startup JSON. The durable startup probe now owns and
      initializes original `TheCommandList`, links original
      `Common/System/XferCRC.cpp`, opens `XferCRC("lightCRC")` with an initial
      CRC of zero, and exposes `preAudioInitOwnership` for original
      `GameEngine.cpp` lines 314 (`TheNameKeyGenerator`), 327
      (`TheCommandList`), 338 (`XferCRC`), and 381 (`parseCommandLine`).
      No-archive, runtime-archive, and range-backed archive harness paths now
      assert those fields while preserving `createAudioManager` at line 434 as
      the first unowned factory.
- [x] Add a focused W3D GUI ownership smoke that moves the startup frontier
      beyond probe-only window-manager facts. `w3d-gamewindow-manager-smoke`
      links original `W3DGameWindowManager`, `W3DGameWindow`, and the W3D
      gadget draw callback batch, owns focused `GlobalData`,
      `SubsystemInterfaceList`, `Display`, and `FontLibrary` instances for the
      original GUI contracts, and proves original `winCreate` allocates a
      `W3DGameWindow` plus original `gogoGadgetPushButton` installs the W3D
      push-button draw callback and original input callback. The Node GDI stub
      now covers the wide-text `Render2DSentenceClass` calls needed by this
      non-rendering smoke. Full production `W3DDisplay`, `.wnd` script/layout
      loading, `W3DFunctionLexicon`, and `W3DModuleFactory` runtime startup
      remain open. Verified with
      `cmake --build WebAssembly/build/wasm --target w3d-gamewindow-manager-smoke -j 8`
      and `node dist/w3d-gamewindow-manager-smoke.cjs`.
- [x] Extend the focused W3D GUI ownership smoke into a repaint dispatch
      proof: the same `w3d-gamewindow-manager-smoke` now gives the original
      push-button enabled fill/border colors, calls original
      `GameWindowManager::winRepaint`, and verifies
      `W3DGadgetPushButtonDraw` reaches the focused `Display::drawOpenRect`
      and `Display::drawFillRect` sinks. This is still a Node GUI-dispatch
      proof, not a browser W3DDisplay/WebGL rendering completion. Verified
      with `npm --prefix WebAssembly run test:w3d-gamewindow-manager`.
- [x] Add a focused W3D layout-script vertical proof. The new
      `w3d-window-layout-script-smoke` runs original
      `WindowLayout::load("Menus/BlankWindow.wnd")`, original
      `GameWindowManager::winCreateFromScript`, original `.wnd` layout-block /
      root-window parsing, and original `W3DFunctionLexicon::init()` lookup for
      `W3DMainMenuInit`, then executes `WindowLayout::runInit()` and verifies
      parsed `NameKey`, geometry, enabled status, layout ownership, and window
      teardown. The smoke uses a memory-backed `BlankWindow.wnd` script and
      test-local bodies for unexecuted W3D/base shell callbacks to keep the
      proof bounded; real shell menu layout assets, production W3DDisplay, and
      real shell callback ownership remain open. `test:startup-vertical` now
      includes this smoke and reports the next GUI slice as replacing the
      focused BlankWindow proof with a real shell menu layout. Verified with
      `npm --prefix WebAssembly run test:w3d-window-layout-script` and
      `npm --prefix WebAssembly run test:startup-vertical`.
- [x] Extend the W3D layout-script smoke into real archive-backed GUI parsing:
      it now mounts `artifacts/real-assets/WindowZH.big` through original
      `Win32BIGFileSystem`, loads `Menus/MessageBox.wnd` and
      `Menus/QuitMessageBox.wnd` through original
      `WindowLayout::load -> GameWindowManager::winCreateFromScript`, links
      original `GUI/GUICallbacks/MessageBox.cpp`, and verifies parsed
      `GameWindow` callback pointers for original `MessageBoxSystem`,
      `QuitMessageBoxSystem`, and `PassMessagesToParentSystem`. The smoke also
      executes the original message-box input-focus callback path and keeps
      display/font/text surfaces focused until production W3DDisplay and real
      localized text ownership are ready. `test:startup-vertical` now requires
      this `WindowZH.big` layout and callback-owner proof. Verified with
      `npm --prefix WebAssembly run test:w3d-window-layout-script` and
      `npm --prefix WebAssembly run test:startup-vertical`.
- [x] Advance the archive-backed GUI smoke into original Shell stack ownership:
      `w3d-window-layout-script-smoke` now links original `Shell.cpp`,
      `AnimateWindowManager.cpp`, `ProcessAnimateWindow.cpp`, and
      `ShellMenuScheme.cpp`, constructs original `Shell`, and drives
      `Shell::showShell -> Shell::push` so real `Menus/MainMenu.wnd` is loaded
      from `WindowZH.big` through the existing original
      `WindowLayout::load -> GameWindowManager::winCreateFromScript` path. The
      smoke verifies `MainMenu.wnd:MainMenuParent`, `MainMenuSystem`,
      `W3DMainMenuInit`, `MainMenuShutdown`, and clean
      `Shell::popImmediate` teardown, while leaving original
      `W3DMainMenuInit -> MainMenuInit` execution as the next bounded GUI
      callback slice. Verified with
      `npm --prefix WebAssembly run test:w3d-window-layout-script` and
      `npm --prefix WebAssembly run test:startup-vertical`.
- [x] Replace the test-local W3D main-menu init body with original
      `W3DMainMenu.cpp` ownership in `w3d-window-layout-script-smoke`: the
      target now links original W3D main-menu GUI callbacks, removes duplicate
      local W3D main-menu draw/init stubs, and verifies both the focused
      `BlankWindow.wnd` layout and real Shell-pushed `Menus/MainMenu.wnd`
      execute original `W3DMainMenuInit` through to the current
      `MainMenuInit` boundary. The startup vertical gate now requires
      `callbackPaths:["W3DMainMenuInit->MainMenuInit"]`; first real
      `MainMenu.cpp` behavior remains the next GUI slice. Verified with
      `npm --prefix WebAssembly run test:w3d-window-layout-script` and
      `npm --prefix WebAssembly run test:startup-vertical`.
- [x] Link original `MainMenu.cpp` and original `Mouse.cpp` into
      `w3d-window-layout-script-smoke`, remove the remaining local
      `MainMenu*` callback bodies, and drive real Shell-owned
      `Menus/MainMenu.wnd` through original
      `W3DMainMenuInit -> MainMenuInit`. The smoke now verifies original
      `MainMenuInit` first-run state mutation (`m_breakTheMovie`, mouse
      visibility, `FadeWholeScreen`, `MainMenuParent` focus, dropdown hides)
      plus original `MainMenuSystem(GWM_INPUT_FOCUS)`, while keeping undriven
      campaign/GameSpy/download/options branches as explicit no-op boundaries
      until those menu flows are harness-driven. Verified with
      `npm --prefix WebAssembly run test:w3d-window-layout-script` and
      `npm --prefix WebAssembly run test:startup-vertical`.
- [x] Advance the Shell-owned real `Menus/MainMenu.wnd` path one runtime frame
      past init by running original `MainMenuUpdate` through the parsed layout's
      `LAYOUTUPDATE` callback under focused shell `GameLogic` state. The smoke
      proves `W3DFunctionLexicon` resolves `MainMenuUpdate`, counts the original
      first idle frame crossing the message-box, HTTP, and GameSpy overlay tick
      boundaries once, and verifies it does not enter the download,
      transition/group, or game-start branches in the current harness state.
      Verified with `npm --prefix WebAssembly run test:w3d-window-layout-script`
      and `npm --prefix WebAssembly run test:startup-vertical`.
- [x] Extend the Shell-owned menu vertical from MainMenu into the original
      Credits menu. `w3d-window-layout-script-smoke` now links original
      `Credits.cpp` and `GUI/GUICallbacks/Menus/CreditsMenu.cpp`, mounts real
      `WindowZH.big` plus `INIZH.big`, drives `ButtonCredits` through original
      `GameWindowManager::winSendInputMsg` / `MainMenuSystem`, runs
      `MainMenuUpdate` through the pending `Shell::push`, and verifies
      `Menus/CreditsMenu.wnd`, `CreditsMenuInit`, `CreditsMenuUpdate`,
      `CreditsManager` loading `Data\INI\Credits.ini`, the local
      `AudioManager` device boundary for the credits music event, and clean
      `CreditsMenuShutdown` teardown. Verified with
      `npm --prefix WebAssembly run test:w3d-window-layout-script`,
      `npm --prefix WebAssembly run test:startup-vertical`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Extend the Shell-owned `Menus/MainMenu.wnd` input vertical through the
      Load Replay dropdown. `w3d-window-layout-script-smoke` now drives the
      real `ButtonLoadReplay` `GWM_LEFT_DOWN`/`GWM_LEFT_UP` pair through
      original `GameWindowManager::winSendInputMsg`, `GadgetPushButton`, and
      `MainMenuSystem`, verifies the shipped `MapBorder3` load-replay dropdown
      is unhidden, checks the original `MainMenuLoadReplayMenu` transition
      group, then drives `ButtonLoadReplayBack` back to `MainMenuDefaultMenu`
      without pushing another shell layout. The startup vertical and aggregate
      vertical integration gate both require the new callback paths. Verified
      with `npm --prefix WebAssembly run test:w3d-window-layout-script`,
      `npm --prefix WebAssembly run test:startup-vertical`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Extend the Shell-owned `Menus/MainMenu.wnd` input vertical from Single
      Player faction selection into Difficulty and back. The
      `w3d-window-layout-script-smoke` now owns a local `CampaignManager`
      boundary, drives the real `ButtonUSA` `GWM_LEFT_DOWN`/`GWM_LEFT_UP`
      pair through original `GameWindowManager::winSendInputMsg`,
      `GadgetPushButton`, and `MainMenuSystem`, verifies the original
      `MainMenuFactionUS`, `MainMenuSinglePlayerMenuBackUS`, and
      `MainMenuDifficultyMenuUS` transition calls, then drives
      `ButtonDiffBack` to clear the campaign and return through
      `MainMenuDifficultyMenuUSBack` /
      `MainMenuSinglePlayerUSAMenuFromDiff`. The startup vertical and
      aggregate vertical integration gate both require the new callback paths.
      Verified with `npm --prefix WebAssembly run test:w3d-window-layout-script`,
      `npm --prefix WebAssembly run test:startup-vertical`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Extend the Shell-owned `Menus/MainMenu.wnd` input vertical through the
      Skirmish push boundary. `w3d-window-layout-script-smoke` now owns a
      focused `ScriptEngine` UI-interaction boundary, drives the real
      `ButtonSkirmish` `GWM_LEFT_DOWN`/`GWM_LEFT_UP` pair through original
      `GameWindowManager::winSendInputMsg`, `GadgetPushButton`, and
      `MainMenuSystem`, verifies the original
      `MainMenuFactionSkirmish` / `MainMenuSinglePlayerMenuBackSkirmish`
      transition calls, checks the
      `ShellMainMenuSkirmishPushed` `signalUIInteract` hook, and lets
      `MainMenuUpdate` complete the pending push into the real
      `Menus/SkirmishGameOptionsMenu.wnd` layout while keeping the deeper
      Skirmish menu callbacks at the existing stub frontier. The aggregate
      vertical integration gate requires the new callback path. Verified with
      `npm --prefix WebAssembly run test:w3d-window-layout-script` and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Replace the Shell-pushed `SkirmishGameOptionsMenu` callback stub frontier
      with the real original init/shutdown owner in
      `w3d-window-layout-script-smoke`. The target now links original
      `SkirmishGameOptionsMenu.cpp`, `GameInfo.cpp`, `GUIUtil.cpp`,
      `UserPreferences.cpp`, and `SkirmishBattleHonors.cpp`, seeds focused
      `MultiplayerSettings`, `PlayerTemplateStore`, and `MapCache` owners, and
      lets `MainMenuUpdate` complete the pending
      `Menus/SkirmishGameOptionsMenu.wnd` push into original
      `SkirmishGameOptionsMenuInit`. The smoke verifies in-setup
      `SkirmishGameInfo` creation, starting-cash population, map metadata
      attachment, game-speed text/slider setup, first map start-position
      visibility, original Skirmish opened/closed `ScriptEngine`
      `signalUIInteract` hooks, and original `SkirmishGameOptionsMenuShutdown`
      cleanup before returning to `MainMenu.wnd`. The startup and aggregate
      vertical gates now require the Skirmish init/shutdown callback paths.
      Verified with `npm --prefix WebAssembly run test:w3d-window-layout-script`,
      `node --check WebAssembly/tools/run_startup_vertical_smoke.mjs`,
      `node --check WebAssembly/tools/run_vertical_integrations_smoke.mjs`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Drive the real `SkirmishGameOptionsMenu` `ButtonBack` path from the
      Shell-owned `Menus/MainMenu.wnd` input vertical. The
      `w3d-window-layout-script-smoke` now resolves the original
      `SkirmishGameOptionsMenuInit` / `Update` / `Shutdown` callbacks, clicks
      `SkirmishGameOptionsMenu.wnd:ButtonBack` through
      `GameWindowManager::winSendInputMsg` and `GadgetPushButton`, verifies
      `SkirmishGameOptionsMenuSystem` writes `SkirmishPreferences`, issues a
      pending `Shell::pop`, deletes and nulls `TheSkirmishGameInfo`, clears the
      harness `TheGameInfo` alias before it can be reused, signals the
      Skirmish-closed shell hook through original shutdown, and lets original
      `SkirmishGameOptionsMenuUpdate` complete `shutdownComplete` back to
      `MainMenu.wnd`. The startup and aggregate vertical gates now require the
      new ButtonBack and update-completed pop callback paths. Verified with
      `npm --prefix WebAssembly run test:w3d-window-layout-script`,
      `node --check WebAssembly/tools/run_startup_vertical_smoke.mjs`,
      `node --check WebAssembly/tools/run_vertical_integrations_smoke.mjs`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Drive the real `SkirmishGameOptionsMenu` `ButtonStart` path from the
      Shell-owned `Menus/MainMenu.wnd` input vertical. The
      `w3d-window-layout-script-smoke` now re-enters
      `Menus/SkirmishGameOptionsMenu.wnd` after the proven ButtonBack pop,
      installs focused original `MessageStream` / `CommandList` owners plus a
      browser-safe CD probe owner, clicks
      `SkirmishGameOptionsMenu.wnd:ButtonStart` through
      `GameWindowManager::winSendInputMsg` and `GadgetPushButton`, and verifies
      original `SkirmishGameOptionsMenuSystem`, `CheckForCDAtGameStart`,
      `SkirmishGameInfo::startGame`, selected-map `GlobalData` assignment,
      game-in-progress transition, and the queued `MSG_NEW_GAME` arguments
      `{ GAME_SKIRMISH, DIFFICULTY_NORMAL, 0, gameSpeed }` on
      `TheMessageStream`. The startup and aggregate vertical gates now require
      the new ButtonStart callback path and `MessageStream MSG_NEW_GAME`
      coverage. Verified with
      `npm --prefix WebAssembly run test:w3d-window-layout-script`,
      `node --check WebAssembly/tools/run_startup_vertical_smoke.mjs`,
      `node --check WebAssembly/tools/run_vertical_integrations_smoke.mjs`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Extend the Skirmish `ButtonStart` smoke through the original
      `MessageStream` to `CommandList` handoff. After the real button click
      appends `MSG_NEW_GAME`, `w3d-window-layout-script-smoke` now calls
      `MessageStream::propagateMessages()`, verifies the stream is drained,
      verifies the same `MSG_NEW_GAME` is owned by `TheCommandList`, and
      exercises original `CommandList::reset` cleanup. The startup and
      aggregate vertical gates now require the
      `MessageStream::propagateMessages->CommandList MSG_NEW_GAME` marker and
      coverage text. This intentionally stops before
      `GameLogic::processCommandList`, because the current shell smoke still
      uses a sentinel `TheGameState` and does not yet own the load-screen,
      terrain, player, or script systems needed for the real map-load leg.
      Verified with `npm --prefix WebAssembly run test:w3d-window-layout-script`,
      `node --check WebAssembly/tools/run_startup_vertical_smoke.mjs`,
      `node --check WebAssembly/tools/run_vertical_integrations_smoke.mjs`,
      `git diff --check`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Pin the original `GameLogic` `MSG_NEW_GAME` dispatch frontier after the
      Skirmish start `CommandList` handoff. Added
      `verify:gamelogic-new-game-dispatch-frontier`, which source-checks
      original `MessageStream::propagateMessages`,
      `GameLogic::processCommandList`, `logicMessageDispatcher` argument/FPS
      handling, `prepareNewGame`, and first-call `startNewGame(FALSE)`
      deferral before terrain load. The verifier also asserts that the current
      `w3d-window-layout-script-smoke` still uses the focused `GameLogic` shim,
      sentinel `GameState`, and null `PlayerList::getNthPlayer` boundary, so
      runtime coverage must move to a real original `GameLogic.cpp` /
      `GameLogicDispatch.cpp` target rather than faking the dispatcher in the
      shell smoke. The startup and aggregate vertical gates now require this
      source frontier.
- [x] Drive original `GameLogic::processCommandList` through the
      `MSG_NEW_GAME` runtime dispatch boundary. Added
      `gamelogic-new-game-dispatch-smoke`, which links original
      `GameLogic.cpp`, `GameLogicDispatch.cpp`, and `GameState.cpp`, moves a
      real `MSG_NEW_GAME` from original `MessageStream` to `CommandList`, and
      calls original `GameLogic::processCommandList` through
      `logicMessageDispatcher(MSG_NEW_GAME)`, `prepareNewGame`, and the
      first-call `startNewGame(FALSE)` deferral before terrain load. The smoke
      proves difficulty, BlankWindow creation, shell hide, FPS-limit,
      pending-map promotion, pristine-map recording, loading-map state, and
      rank-points side effects while explicitly reporting the remaining
      focused `PlayerList::getNthPlayer`, `ScriptEngine`, `Shell`,
      `GlobalData`, and BlankWindow adapter boundaries. The startup and
      aggregate vertical gates now require the runtime proof in addition to
      the source frontier. Verified with
      `npm --prefix WebAssembly run verify:gamelogic-new-game-dispatch-frontier`,
      `npm --prefix WebAssembly run test:gamelogic-new-game-dispatch`,
      `npm --prefix WebAssembly run test:startup-vertical`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Replace the focused `Shell::hideShell` adapter in the
      `MSG_NEW_GAME` runtime dispatch smoke with original Shell ownership.
      `gamelogic-new-game-dispatch-smoke` now links original `Display.cpp`,
      `Shell.cpp`, `AnimateWindowManager.cpp`, `ProcessAnimateWindow.cpp`,
      and `ShellMenuScheme.cpp`, seeds an original `Shell::push` over the
      focused in-memory `Menus/BlankWindow.wnd` layout, then proves original
      `GameLogic::prepareNewGame` drives `Shell::hideShell` by observing
      `m_isShellActive` transition to false and one layout shutdown callback.
      The smoke still honestly reports focused `PlayerList::getNthPlayer`,
      `ScriptEngine`, `GlobalData`, and BlankWindow adapter boundaries before
      the deferred terrain/player/script load. Verified with
      `cmake --build WebAssembly/build/wasm --target gamelogic-new-game-dispatch-smoke -j2`
      and `node WebAssembly/dist/gamelogic-new-game-dispatch-smoke.cjs`;
      the updated source/startup/aggregate gates were verified with
      `npm --prefix WebAssembly run verify:gamelogic-new-game-dispatch-frontier`,
      `npm --prefix WebAssembly run test:startup-vertical`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Replace the focused `ScriptEngine::setGlobalDifficulty` adapter in the
      `MSG_NEW_GAME` runtime dispatch smoke with original ScriptEngine
      ownership. `gamelogic-new-game-dispatch-smoke` now links original
      `ScriptEngine.cpp` and `Scripts.cpp`, constructs a real `ScriptEngine`
      without entering full `ScriptEngine::init`, proves the constructor starts
      at `DIFFICULTY_NORMAL`, and verifies original
      `GameLogic::prepareNewGame` forwards the `MSG_NEW_GAME` difficulty to
      original `ScriptEngine::setGlobalDifficulty`. The smoke still honestly
      reports focused `PlayerList::getNthPlayer`, `GlobalData`, and
      BlankWindow adapter boundaries before the deferred terrain/player/script
      load. Verified with
      `node --check WebAssembly/tools/verify_gamelogic_new_game_dispatch_frontier.mjs`,
      `node --check WebAssembly/tools/run_startup_vertical_smoke.mjs`,
      `node --check WebAssembly/tools/run_vertical_integrations_smoke.mjs`,
      `npm --prefix WebAssembly run verify:gamelogic-new-game-dispatch-frontier`,
      `npm --prefix WebAssembly run test:gamelogic-new-game-dispatch`,
      `npm --prefix WebAssembly run test:startup-vertical`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Replace the focused `GlobalData` singleton bridge in the
      `MSG_NEW_GAME` runtime dispatch smoke with original GlobalData
      ownership. `gamelogic-new-game-dispatch-smoke` now links original
      `GlobalData.cpp`, force-includes the original `Common/GlobalData.h`
      before `PreRTS.h`, assigns `TheWritableGlobalData` to the runtime
      `GlobalData` instance, and proves the original `TheGlobalData` macro
      resolves through that writable singleton during
      `GameLogic::prepareNewGame` / `startNewGame(FALSE)`. The source/startup
      gates now reject the old `shim GlobalData bridge` boundary. The smoke
      still honestly reports focused `PlayerList::getNthPlayer` and in-memory
      BlankWindow adapter boundaries before the deferred terrain/player/script
      load. Verified with
      `npm --prefix WebAssembly run verify:gamelogic-new-game-dispatch-frontier`,
      `npm --prefix WebAssembly run test:gamelogic-new-game-dispatch`,
      `npm --prefix WebAssembly run test:startup-vertical`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Replace the focused `PlayerList::getNthPlayer` linker wrap in the
      `MSG_NEW_GAME` runtime dispatch smoke with original PlayerList/Player
      ownership. `gamelogic-new-game-dispatch-smoke` now links original
      `PlayerList.cpp`, `Player.cpp`, and the original neutral-player support
      owners (`AcademyStats`, `Energy`, `Money`, `ScoreKeeper`, `Team`,
      `TunnelTracker`, `Squad`, and `RankInfoStore`), removes the
      `--wrap=_ZN10PlayerList12getNthPlayerEi` linker path, constructs a real
      `PlayerList`, assigns `ThePlayerList`, and proves the dispatcher uses the
      owned neutral player for `MSG_NEW_GAME`. The smoke now reports only the
      focused in-memory BlankWindow layout adapter before the deferred
      terrain/player/script load. Verified with
      `npm --prefix WebAssembly run verify:gamelogic-new-game-dispatch-frontier`,
      `npm --prefix WebAssembly run test:gamelogic-new-game-dispatch`,
      `npm --prefix WebAssembly run test:startup-vertical`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Promote the `Menus/BlankWindow.wnd` gameplay/loading layout blocker into
      the real asset pipeline instead of leaving it as an unexplained in-memory
      smoke adapter. `extract_zh_runtime_archives.sh` now extracts or preserves
      optional base Generals `Window.big`, `runtime_archives_smoke.mjs` mounts
      it as `ZZBase_Window.big` when present, and
      `inventory_startup_archives.mjs` now reports
      `blankWindowLayout.ready` for `Window\Menus\BlankWindow.wnd` with an
      explicit `--require-blank-window-layout` proof mode. The current Zero
      Hour-only asset set is still honest: `WindowZH.big` has no BlankWindow
      layout, so the runtime `gamelogic-new-game-dispatch-smoke` still uses the
      focused in-memory BlankWindow adapter until base `Window.big` is supplied
      and the archive-backed `WindowLayout::load` path can replace it. Verified
      with `npm --prefix WebAssembly run inventory:startup-archives`,
      `npm --prefix WebAssembly run verify:audio-startup-archive-contract`,
      `npm --prefix WebAssembly run verify:gamelogic-new-game-dispatch-frontier`,
      `npm --prefix WebAssembly run test:runtime-archives-browser`,
      `npm --prefix WebAssembly run test:startup-vertical`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Replace the `MSG_NEW_GAME` runtime smoke's focused in-memory
      `Menus/BlankWindow.wnd` adapter with the archive-backed original layout
      path. `gamelogic-new-game-dispatch-smoke` now mounts base
      `Window.big`, links original `FunctionLexicon.cpp`,
      `GameWindowManagerScript.cpp`, and `HeaderTemplate.cpp`, delegates
      `SmokeGameWindowManager::winCreateLayout` to
      `GameWindowManager::winCreateLayout`, and proves both the seeded shell
      layout and `prepareNewGame` background parse
      `Window\Menus\BlankWindow.wnd` from the archive with the original
      `BlankWindow.wnd:BlankWindow` root and 800x600 geometry. The runtime
      boundary is now the deferred terrain/player/script map-load path after
      archive-backed BlankWindow loading. Verified with
      `cmake --build WebAssembly/build/wasm --target gamelogic-new-game-dispatch-smoke -j 4`,
      `node dist/gamelogic-new-game-dispatch-smoke.cjs` from
      `WebAssembly/`,
      `npm --prefix WebAssembly run verify:gamelogic-new-game-dispatch-frontier`,
      `npm --prefix WebAssembly run test:gamelogic-new-game-dispatch`, and
      `npm --prefix WebAssembly run test:startup-vertical`. An attempted
      `npm --prefix WebAssembly run test:vertical-integrations` reached the
      already-tracked `harness/runtime_archives_smoke.mjs` browser-stage hang
      after startup vertical passed and was manually interrupted.
- [x] Advance the `MSG_NEW_GAME` runtime smoke from archive-backed
      `BlankWindow` into the original terrain-load handoff. The smoke now uses
      shipped `Maps\MD_GLA03\MD_GLA03.map` as the pending skirmish map, mounts
      `MapsZH.big`, links original `SidesList.cpp` plus the W3D terrain
      runtime, installs focused device-boundary owners for `GameClient` and
      `TerrainVisual`, and calls original
      `W3DTerrainLogic::loadMap(false)` on the promoted `GlobalData` map. The
      runtime proves `WorldHeightMap` parsed 1907 map objects, 154 waypoints,
      11 sides, 97 teams, time-of-day notification, the
      `TerrainLogic::loadMap` -> `TerrainVisual::load` handoff, and the
      `MD_GLA03` 3800x3800 extent. The boundary is now continuing
      `startNewGame` after terrain load into side/player/script population.
      Verified with
      `cmake --build WebAssembly/build/wasm --target gamelogic-new-game-dispatch-smoke -j 4`,
      `node dist/gamelogic-new-game-dispatch-smoke.cjs` from
      `WebAssembly/`,
      `npm --prefix WebAssembly run verify:gamelogic-new-game-dispatch-frontier`,
      `npm --prefix WebAssembly run test:gamelogic-new-game-dispatch`, and
      `npm --prefix WebAssembly run test:startup-vertical`. A bounded
      `timeout 60s npm --prefix WebAssembly run test:vertical-integrations`
      attempt reached `startup-vertical: ok` and then timed out at the
      already-tracked `runtime-archives-startup-data` stage.
- [x] Continue `GameLogic::startNewGame` after the original terrain load into
      original side/player/team/script population. The
      `gamelogic-new-game-dispatch-smoke` runtime now mounts `INIZH.big` and
      base `INI.big`, links original `INI`, `INIAiData`, `INIMultiplayer`,
      `MultiplayerSettings`, `Science`, `PlayerTemplate`,
      `ResourceGatheringManager`, `AI`, `AIPathfind`, `AIPlayer`, and the
      `GameSpy/Chat.cpp` online-chat color parser required by shipped
      `Multiplayer.ini`. It loads shipped startup data, preserves the
      `MD_GLA03` terrain parse, validates 11 parsed sides and 97 teams,
      constructs original per-player `AIPlayer` state, initializes
      `TeamFactory` from the parsed side/team data, populates 11 players
      through original `PlayerList::newGame`, and carries 465 side scripts
      through original `ScriptEngine::newMap`. The boundary is now continuing
      `startNewGame` after side/player/script population into
      radar/partition/ghost/terrain `newMap` and map object spawning. Verified
      with the focused wasm build, direct
      `dist/gamelogic-new-game-dispatch-smoke.cjs` run from `WebAssembly/`,
      `verify:gamelogic-new-game-dispatch-frontier`,
      `test:gamelogic-new-game-dispatch`, and `test:startup-vertical`; a
      bounded `test:vertical-integrations` attempt reached startup-vertical OK
      and timed out at the already-tracked `runtime-archives-startup-data`
      stage.
- [x] Continue `GameLogic::startNewGame` from side/player/script population
      into original `Radar::newMap`. The
      `gamelogic-new-game-dispatch-smoke` target now links original
      `Common/System/Radar.cpp`, installs a focused `ControlBar.wnd:LeftHUD`
      window owner at the true GUI boundary, and calls
      `TheRadar->newMap(TheTerrainLogic)` after original
      `ScriptEngine::newMap`. The runtime proves the radar locates the LeftHUD
      window, inherits the loaded `MD_GLA03` 3800x3800 terrain extent, computes
      128x128 radar samples from that extent, and translates the terrain center
      between world and radar coordinates. The boundary is now continuing
      `startNewGame` after `Radar::newMap` into partition/ghost/terrain
      `newMap` and map object spawning. Verified with the focused wasm build,
      `verify:gamelogic-new-game-dispatch-frontier`,
      `test:gamelogic-new-game-dispatch`, and `test:startup-vertical`; a
      bounded `test:vertical-integrations` attempt reached startup-vertical OK
      and timed out at the already-tracked `runtime-archives-startup-data`
      stage.
- [x] Continue `GameLogic::startNewGame` after original `Radar::newMap` into
      GameData-backed partition setup and shroud refresh. The
      `gamelogic-new-game-dispatch-smoke` target now links original
      `INIGameData.cpp`, `UserPreferences.cpp`, `Weapon.cpp`, and
      `PartitionManager.cpp`, loads `Default\GameData.ini` and
      `GameData.ini` through original `INI::load`, proves the shipped
      `PartitionCellSize = 40`, copies the terrain extent into original
      `GameLogic` width/height, initializes original `PartitionManager` over
      the loaded `MD_GLA03` terrain, and drives
      `refreshShroudForLocalPlayer` through focused display/radar boundaries
      for all 9,216 initial shrouded cells. `VictoryConditions` and
      non-network `OptionPreferences` remain focused boundaries, and the next
      frontier is continuing after partition shroud refresh into
      `GhostObjectManager` reset, `TerrainLogic::newMap`, and map object
      spawning. Verified with `verify:gamelogic-new-game-dispatch-frontier`,
      focused wasm build, direct `dist/gamelogic-new-game-dispatch-smoke.cjs`
      from `WebAssembly/`, `test:gamelogic-new-game-dispatch`, and
      `test:startup-vertical`.
- [x] Continue `GameLogic::startNewGame` after original
      `PartitionManager::refreshShroudForLocalPlayer` into original
      `GhostObjectManager` ownership. The `gamelogic-new-game-dispatch-smoke`
      target now links original `Object/GhostObject.cpp`, removes the focused
      weak `TheGhostObjectManager` singleton, constructs the original manager,
      assigns the loaded local player index, and calls the original
      `reset()` after the partition shroud refresh. The runtime JSON reports
      the owned singleton, initial local-player index, assigned local-player
      index, and reset call, and the frontier now advances to
      `W3DTerrainLogic::newMap` road/bridge render-object ownership before
      base `TerrainLogic::newMap` waypoint/water update and map object
      spawning. Verified with `verify:gamelogic-new-game-dispatch-frontier`,
      focused wasm build, direct `dist/gamelogic-new-game-dispatch-smoke.cjs`
      from `WebAssembly/`, `test:gamelogic-new-game-dispatch`, and
      `test:startup-vertical`.
- [x] Continue `GameLogic::startNewGame` after original
      `GhostObjectManager` reset into original `W3DTerrainLogic::newMap(FALSE)`
      road-buffer handoff and base `TerrainLogic::newMap` waypoint/water setup.
      The `gamelogic-new-game-dispatch-smoke` target now links original
      `TerrainTypes.cpp`, `TerrainRoads.cpp`, `DX8Wrapper.cpp`, `rendobj.cpp`,
      and WW save/load support, constructs a real `BaseHeightMapRenderObjClass`
      owner, loads a render `WorldHeightMap` for `MD_GLA03`, installs original
      `TerrainTypeCollection`/`TerrainRoadCollection` globals, and calls
      original `W3DTerrainLogic::newMap(FALSE)`. The runtime JSON proves the
      render map is attached, the road buffer is initialized and receives the
      new-map handoff, base `TerrainLogic::newMap` updates waypoint Z from
      `getGroundHeight`, and `enableWaterGrid` is called from the real waypoint
      lookup. `W3DBridgeBuffer::loadBridges`, `GenericBridge` object creation,
      bridge/map object spawning, and `Pathfinder::newMap` remain the next
      frontier. Verified with `verify:gamelogic-new-game-dispatch-frontier`,
      focused wasm build, direct `dist/gamelogic-new-game-dispatch-smoke.cjs`
      from `WebAssembly/`, `test:gamelogic-new-game-dispatch`, and
      `test:startup-vertical`.
- [x] Continue the startup `W3DTerrainLogic::newMap(FALSE)` handoff through
      original `W3DBridgeBuffer::loadBridges` and a direct original
      `Pathfinder::newMap` grid proof. `gamelogic-new-game-dispatch-smoke`
      now installs a real `W3DBridgeBuffer` on the focused
      `BaseHeightMapRenderObjClass` owner, with an Emscripten-only weak port
      hook that lets the Node startup smoke defer bridge GPU vertex/index
      allocation while the browser bridge scene keeps the default real
      allocation path. The runtime proves `MD_GLA03` has zero bridge marker
      pairs, the bridge buffer and `TerrainLogic` bridge lists stay empty, the
      original bridge damage-state update is reached, and original
      `Pathfinder::newMap` allocates/classifies the loaded 379x379 terrain
      grid with a readable center ground cell. The frontier now advances to
      the original bridge-like map-object spawning loop that sits before
      `Pathfinder::newMap`; that loop must be promoted before replacing the
      direct no-bridge pathfinder proof with the original ordered
      `startNewGame` sequence. Verified with
      `verify:gamelogic-new-game-dispatch-frontier`,
      `test:gamelogic-new-game-dispatch`, and `test:startup-vertical`.
- [x] Promote the startup post-terrain bridge-like map-object scan before
      `Pathfinder::newMap`. `gamelogic-new-game-dispatch-smoke` now runs the
      original `GameLogic::startNewGame` ordering after
      `W3DTerrainLogic::newMap(FALSE)`: scan the `WorldHeightMap`
      `MapObject` list, skip terrain-owned road/bridge flags, classify
      templates with `ThingTemplate::isBridge()` and
      `KINDOF_WALK_ON_TOP_OF_WALL`, prove `MD_GLA03` has no startup-owned
      bridge-like candidates because the remaining 1,501 map objects have no
      resolved startup `ThingTemplate`, call original `Radar::refreshTerrain`,
      then call original `Pathfinder::newMap`. The source frontier now pins
      the full original creation branch through `TheThingFactory->newObject`,
      `TerrainLogic::addLandmarkBridgeToLogic`, and
      `Pathfinder::addWallPiece`; the remaining boundary is loading real
      object templates into this startup runtime and promoting actual
      bridge/wall object creation when a map supplies those templates.
      Verified with `verify:gamelogic-new-game-dispatch-frontier` and
      `test:gamelogic-new-game-dispatch`, and `test:startup-vertical`.
- [x] Promote the startup vertical into the aggregate cross-subsystem gate.
      `test:vertical-integrations` now runs `run_startup_vertical_smoke.mjs`
      before the archive/audio/network/render/video steps and asserts the
      browser `GameEngine.cpp` startup frontier, full original
      `GameEngine.cpp` constructor/destructor lifetime, original
      `MilesAudioManager::openDevice`, and original W3D window/layout smokes
      remain covered. This does not complete production `GameEngine::init()`;
      it makes the already-proven startup ownership vertical part of the
      always-run integration ladder. Verified with
      `npm --prefix WebAssembly run test:startup-vertical` and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Add the original `GlobalData` power-bar fields used by reached W3D
      control-bar code to the current browser shim: `m_powerBarBase`,
      `m_powerBarIntervals`, and `m_powerBarYellowRange`, with defaults matching
      original `GlobalData.cpp`.
- [x] **Run the real `GameEngine::init()` to completion in the browser and
      render the Zero Hour title screen from real `update()` frames** — the
      strategy-pivot milestone. `cnc_port_real_engine_init()` constructs the
      original `Win32GameEngine` through original
      `WinMain.cpp::CreateGameEngine()` (exposed under
      `CNC_WASM_ENABLE_CREATEGAMEENGINE`), runs real
      `GameEngine::init(argc, argv)` with `-noshellmap -win`, and completes
      all 43 `initSubsystem` stages (TheLocalFileSystem → … → TheThingFactory
      → TheGameClient → TheAI → TheGameLogic → … → TheGameResultsQueue) in
      ~2.8s in headless Chromium against the mounted real archive set,
      returning `quitting=FALSE`; `cnc_port_real_engine_frame(n)` then runs
      the original `execute()` body per frame (`Win32GameEngine::update` →
      `GameEngine::update`: Radar/Audio/GameClient/MessageStream/CDManager/
      GameLogic + `serviceWindowsOS`) — 455 frames with zero exceptions, and
      the canvas shows the real Zero Hour title screen rendered by original
      `W3DGameClient`/`W3DDisplay` over the browser D3D8 layer
      (`artifacts/screenshots/real-init-frames.png`,
      `startup-vertical-real-init.png`). The frontier is computed FROM THE
      RUN via a weak `SubsystemInterfaceList::initSubsystem` hook plus stdout
      markers scraped by the harness across aborts — the hand-authored
      frontier era is over. Supporting work: new
      `zh_gameengine_real_lifecycle_runtime` links the remaining original
      sources (GameEngine.cpp, GameMain.cpp, the GameClient tree incl.
      Shell/InGameUI/MapUtil/menus, GameLogic.cpp, Object.cpp,
      ScriptActions/Conditions, W3DGameClient/W3DGameLogic/W3DMouse/W3DRadar/
      W3DInGameUI) via a real-header PreRTS prelude; browser DirectInput
      keyboard boundary shim (`wasm_dinput_browser.cpp`, `shims/dinput.h`)
      feeds the ORIGINAL `DirectInputKeyboard`; probe-shadow burndown
      (probe GameClient/Object/GameLogic/Display/LoadScreen/OptionPreferences
      reimplementations and all 26 weak `UNUSED_INI_BLOCK_PARSER` stubs
      deleted); fourth ODR corruption bug of the known class found and fixed
      (`wasm_startup_singletons_probe.cpp` shim-header `GlobalData` vs real
      `OptionPreferences` ctor layout); `Debug.cpp` ReleaseCrash and INI
      failures print reasons to stdout under `__EMSCRIPTEN__`. Known residue
      tracked in TODO.md: title→interactive-menu, legacy-probe
      reconciliation (`edgeMapperApply` OOB), 6 undefined boundary symbols,
      ReleaseCrash teardown semantics, per-frame RPC vs main loop.
- [x] Advance the real lifecycle from title-state into Shell-owned
      `Menus/MainMenu.wnd` state and route a browser-posted menu click through
      the original input stack. `cnc_port_real_engine_frame()` now exports real
      client readiness, intro/movie gates, Shell stack/top layout, MainMenu
      window probes, hit-test results, current focus/capture/grab windows, and
      original `Mouse` status. The real init bridge now creates an
      `ApplicationHWnd` backed by the original `WinMain.cpp::WndProc` before
      constructing `Win32GameEngine`, so browser `postMessage` input is
      dispatched by `Win32GameEngine::serviceWindowsOS()` instead of landing on
      a null/non-procedural window. The startup vertical proves real frames
      consume the intro gate, push `MainMenu.wnd`, hit-test
      `MainMenu.wnd:ButtonSinglePlayer`, post Win32 mouse move/down/up, observe
      `Mouse` move to `(644,134)`, grab the original button with
      `WIN_STATE_SELECTED` set on down, then clear the grab/selection on up.
      Rendering residue remains open in TODO: both real-init screenshots still
      show the Zero Hour title pixels rather than a visible menu repaint.
      Verified with `npm --prefix WebAssembly run test:startup-vertical` and
      screenshots `startup-vertical-real-init.png` /
      `startup-vertical-real-init-menu-click.png`.
- [x] Replace the stale-title real-init screenshot with a visible real
      `Menus/MainMenu.wnd` repaint in the startup vertical. The real frame
      bridge now clears the stale movie-break render gate only after the real
      display reports no active movie and the Shell top is `MainMenu.wnd`,
      restoring the original `MainMenuInit` intent without reordering
      `GameClient::update()`. The harness performs the original first-run
      mouse reveal, asserts the break gate is clear, samples WebGL canvas
      pixels in the menu button area, captures visible MainMenu screenshots,
      then clicks the engine hit-tested `ButtonUSA` path and state-verifies
      the difficulty controls. Verified with
      `npm --prefix WebAssembly run test:startup-vertical` and screenshots
      `startup-vertical-real-init.png` /
      `startup-vertical-real-init-menu-click.png`; follow-up visual transition
      alignment after the click remains open in TODO.
- [x] Prove browser keyboard delivery in the same real `MainMenu.wnd`
      lifecycle. The browser bridge now maps DOM key codes into the existing
      browser DirectInput scan-code queue while retaining the Win32 `WM_KEY*`
      messages, and the real-frame JSON reports `TheKeyboard`'s gathered key
      events. `startup_vertical_smoke.mjs` presses and releases `A` with
      Playwright after the visible MainMenu reveal, waits for the DirectInput
      queue, steps real `Win32GameEngine::update()`, and asserts the original
      `DirectInputKeyboard` produced `KEY_A` down/up with the queue drained.
      Verified with `npm --prefix WebAssembly run test:startup-vertical`.
- [x] Align the real `MainMenu.wnd` visual transition state with engine
      hit-testing through the Single Player -> USA difficulty path. The
      `cnc-port` runtime now links the real W3D main-menu draw/init owner
      instead of satisfying `W3DMainMenuInit` from the old weak probe symbol,
      so `Shell::push("Menus/MainMenu.wnd")` runs
      `W3DMainMenuInit -> MainMenuInit` in the real lifecycle. The startup
      vertical harness drives the original first-run reveal from hidden
      button geometry, clicks `ButtonSinglePlayer`, waits until the visible
      `ButtonUSA` hit-test is aligned, clicks `ButtonUSA`, and waits until
      `MainMenuDifficultyMenuUS` finishes with `ButtonEasy` hit-testing
      aligned to the rendered difficulty controls. The final blocker was the
      original `TextTypeTransition` effective-frame path: it shortened
      `m_frameLength` to the label length but only set `m_isFinished` at the
      fixed frame-30 end, so the difficulty label could leave the group
      unfinished forever. `TextTypeTransition::update()` now marks forward
      transitions finished once the effective text length is reached, matching
      the existing `CountUpTransition` pattern. Verified with
      `npm --prefix WebAssembly run test:startup-vertical`,
      `node --check WebAssembly/harness/startup_vertical_smoke.mjs`,
      `node --check WebAssembly/tools/run_startup_vertical_smoke.mjs`,
      `git diff --check`, `wasm-objdump` symbol checks for real
      `W3DMainMenuInit` / `W3DMainMenuDraw`, and screenshot
      `startup-vertical-real-init-menu-click.png`.
- [x] Render the real ShellMapMD shell-map path instead of the black first
      frame. The real lifecycle target now compiles `GameLogic/GameLogic.h`
      through the original header for real-runtime sources while leaving
      probe users on the shim header, and `GameLogic::prepareNewGame()` writes
      `m_gameMode` directly in that original translation unit so the mixed
      wasm link cannot coalesce the weak inline accessor through a
      probe-flavored definition. The shell-map boot now preserves
      `GAME_SHELL`: `lastModeAfterSet=4`, `startNewGame` enters with mode 4,
      pushes `Menus/MainMenu.wnd` through real `W3DMainMenuInit`, and renders
      the shell naval scene/logo in the browser. Verified by rebuilding
      `cnc-port` and driving `harness/play.html?shellmap=1` in headless
      Chromium against the 21 real-init archives: all 43 subsystems complete,
      frame 16 reports 305 objects/drawables, 40 rendered objects,
      `shellTop=Menus/MainMenu.wnd`, center pixel `[10,22,30,255]`, and
      screenshot `artifacts/screenshots/shellmap-real-header-fix-canvas.png`.
- [x] Add a durable real-lifecycle ShellMapMD browser gate. The new
      `test:real-shellmap` package script builds `cnc-port`, mounts the same
      21 whole-file real-init archives, runs original `GameEngine::init()` with
      the shell map enabled, checks the exact 43-subsystem init order, proves
      `MapCache` still contains `Maps\ShellMapMD\ShellMapMD.map`, steps real
      `GameEngine::update()` frames, and asserts `GAME_SHELL`, real
      `Menus/MainMenu.wnd`, the `startNewGame` shell branch, nonzero original
      object/drawable/rendered-object counts, and a nonblank canvas center
      before saving `artifacts/screenshots/shellmap-real-init-gate-canvas.png`.
- [x] Drive the real startup lifecycle from the visible difficulty menu into
      the original easy USA campaign-start path. The startup vertical harness
      now clicks real `ButtonEasy`, records the original `MainMenu.cpp`
      campaign-start state, routes `FileSystem::areMusicFilesOnCD()` through
      the browser-mounted `GensecZH.big` archive for the original CD check,
      runs original `prepareCampaignGame()` / `setupGameStart()`, sets
      `TheWritableGlobalData->m_pendingFile` to
      `Maps\MD_USA01\MD_USA01.map`, reaches `doGameStart()`, and proves the
      queued single-player/easy `MSG_NEW_GAME` arguments before the fade. The
      browser gate also records the last `GameEngine::update()` owner on
      aborts and uses an Emscripten-only qualified `GameLogic::update()` call
      to keep the real logic frame moving past a wasm null indirect-call slot
      in `SubsystemInterface::UPDATE` (tracked in TODO for the real vtable
      ownership fix). Verified with
      `npm --prefix WebAssembly run test:startup-vertical`, including
      screenshot `startup-vertical-real-init-campaign-start.png`.
- [x] Advance the real `ButtonEasy` campaign path through first loaded-map
      rendering frames. Added real-frame breakpoint telemetry across original
      `GameLogic`, `GameClient`, `W3DDisplay`, `W3DView`, `RTS3DScene`,
      WW3D static-sort lists, and `W3DWater` so the harness can stop on the
      next real render frontier without adding probe executables. The real
      path now dispatches `MSG_NEW_GAME`, runs `prepareNewGame`, completes the
      deferred `startNewGame(FALSE)` load for
      `Maps\MD_USA01\MD_USA01.map`, reaches the first loaded-map render frame,
      and fixes the previous frame-179 browser crash in
      `RTS3DScene::Flush` / static-sort `W3DWater` by mounting base
      `W3D.big` as `ZZBase_W3D.big` so the original `new_skybox.W3D` asset is
      available. The startup vertical can now request post-campaign frames and
      captures a post-campaign screenshot plus canvas samples. Verified with
      `npm --prefix WebAssembly run build:startup-vertical`,
      `STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=60 node WebAssembly/harness/startup_vertical_smoke.mjs`
      (post frame 237, no exception), `node --check
      WebAssembly/harness/startup_vertical_smoke.mjs`, `node --check
      WebAssembly/tools/run_startup_vertical_smoke.mjs`, and
      `git diff --check`; screenshot
      `startup-vertical-real-init-post-campaign.png`.
- [x] Mount base texture assets for the real loaded-map startup render. Added
      an Emscripten-only `TextureClass::Apply` diagnostic hook to the real
      engine frame JSON, mounted base `Textures.big` as
      `ZZBase_Textures.big` in the startup vertical whole-archive set, and
      made the post-campaign screenshot gate fail if WW3D applies the missing
      texture fallback. This removes the magenta sky/object fallback on the
      loaded MD_USA01 campaign scene while preserving Zero Hour archive
      precedence. Verified with
      `npm --prefix WebAssembly run build:startup-vertical`, `node --check
      WebAssembly/harness/startup_vertical_smoke.mjs`, `git diff --check`,
      and `STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=60 node
      WebAssembly/harness/startup_vertical_smoke.mjs`: the real path reaches
      frame 237 with no exception, 1,867 texture applies, zero missing-texture
      applies, nonblack sky/terrain canvas samples, and screenshot
      `startup-vertical-real-init-post-campaign.png`.
- [x] Expose loaded-map gameplay state for the real campaign startup path.
      The real-frame JSON now reports letterbox/fade state, `GameLogic`
      mode/loading/pause/frame/object progress, `GameClient` frame and
      drawable counts, local player readiness/side, `InGameUI` input and
      selection state, control-bar readiness plus key `ControlBar.wnd`
      window probes, and `ScriptEngine` fade/freeze/end-state gates. The
      startup vertical can now split post-campaign frames into chunks and
      logs each chunk summary to stderr, making long loaded-map runs
      inspectable without adding a probe target. Verified with
      `npm --prefix WebAssembly run build:startup-vertical`, `node --check
      WebAssembly/harness/startup_vertical_smoke.mjs`, `git diff --check`,
      and `STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=180
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60 node
      WebAssembly/harness/startup_vertical_smoke.mjs`: the real path reaches
      frame 357 with no exception, 2,208 texture applies, zero
      missing-texture applies, 1,374 live objects/drawables, active local
      America player, and the expected still-cinematic script state
      (`letterBoxed=true`, `inputEnabled=false`, control bar hidden) plus
      screenshot `startup-vertical-real-init-post-campaign.png`.
- [x] Expose full ScriptEngine variable snapshots for the real loaded-map
      campaign intro. Added Emscripten-only read-only `ScriptEngine`
      accessors for counters, flags, and sequential scripts, then exports
      the complete counter/flag set in the real-frame JSON and includes a
      compact script summary in post-campaign chunk logs. This keeps the
      original script execution untouched while making campaign cinematic
      gates inspectable from the real `cnc-port` runtime. Verified with
      `npm --prefix WebAssembly run build:startup-vertical`, `node --check
      WebAssembly/harness/startup_vertical_smoke.mjs`, `git diff --check`,
      and two startup-vertical browser runs: the 180-frame run reaches frame
      357 with 94 counters/8 flags, all counters returned
      (`countersTruncated=false`), zero missing-texture applies, and active
      timers such as `CINE_CameraCutTo04=512`; the 720-frame run reaches
      frame 897 / logic frame 720 with 95 counters/8 flags, zero
      missing-texture applies, the original `INTRO_DONE=false` flag still
      unset, active next-phase timers (`CINE_LaunchPadMoveDelay`,
      `CINE_Pt2CameraLocation01Delay`,
      `CINE_Pt2MoveTransportsDelay`), object/drawable count advanced to
      1,284, and screenshot `startup-vertical-real-init-post-campaign.png`
      capturing the current black cinematic phase.
- [x] Expose a prioritized loaded-script catalog for the real MD_USA01
      campaign intro. The real-frame JSON now walks the original loaded
      `TheSidesList` / `ScriptList` / `ScriptGroup` / `Script` objects and
      exports a capped catalog of interesting scripts, conditions, true/false
      actions, parameter values, action/condition template internal names, and
      runtime script flags (`active`, `oneShot`, delay/frame/evaluation
      counters) without parsing `.map` files out-of-band or mutating original
      script state. The catalog prioritizes current/release gates so the cap
      includes both active cinematic branches and the future release path.
      `startup_vertical_smoke.mjs` now summarizes catalog counts and included
      script names in post-campaign chunk logs. Verified with `git diff
      --check`, `node --check WebAssembly/harness/startup_vertical_smoke.mjs`,
      `npm --prefix WebAssembly run build:startup-vertical`, and
      `STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=180
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60 node
      WebAssembly/harness/startup_vertical_smoke.mjs` redirected to
      `/tmp/cnc-startup-catalog-final.json`: the real path reaches frame 357 /
      logic frame 180 with 6,267 texture applies, zero missing texture applies,
      1,374 objects/drawables, visible captioned MD_USA01 intro rendering
      (center pixel `[152,164,189,255]`), `INTRO_DONE=false`,
      `letterBoxed=true`, `inputEnabled=false`, and a catalog of 16 sides, 35
      groups, 291 scripts, 168 interesting scripts, and 96 priority-included
      scripts. The priority set includes `CINE_CameraMoveTo06` setting
      `CINE_LaunchPadMoveDelay`, `CINE_Pt2CameraLocation01Delay`, and
      `CINE_Pt2MoveTransportsDelay`, `Give Player The Game` setting
      `INTRO_DONE`, and `ReturnToPlayerControl` running
      `CAMERA_LETTERBOX_END` / `ENABLE_INPUT`.
- [x] Expose real tactical-view and watched MD_USA01 intro-gate diagnostics in
      the startup vertical. The real-frame JSON now reports `TheTacticalView`
      readiness, view origin/size, look-at position, 3D camera position, zoom,
      pitch, angle, FOV, terrain height, current height above ground, camera
      movement state, time multiplier/freeze state, camera lock, and zoom-limit
      state. `startup_vertical_smoke.mjs` now includes this view state in
      post-campaign chunk summaries and adds compact watched gates for
      `CINE_CameraCutTo04`, `CINE_LaunchPadMoveDelay`,
      `CINE_Pt2CameraLocation01Delay`, `CINE_Pt2MoveTransportsDelay`,
      `INTRO_DONE`, `Inside Base`, `Mission_Phase_Three`,
      `CINE_CameraMoveTo06`, `CINE_LaunchPad & BuggiesMove`,
      `Give Player The Game`, and `ReturnToPlayerControl`. Verified with
      `git diff --check`, `node --check
      WebAssembly/harness/startup_vertical_smoke.mjs`, `npm --prefix
      WebAssembly run build:startup-vertical`, and
      `STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=120
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60 node
      WebAssembly/harness/startup_vertical_smoke.mjs` redirected to
      `/tmp/cnc-startup-view-120.json`: the real path reaches frame 297 /
      logic frame 120 with 2,192 texture applies, zero missing texture
      applies, 1,374 objects/drawables, `fade=4`, `fadeValue=0.984`, black
      center/terrain pixels, `letterBoxed=true`, `inputEnabled=false`,
      `INTRO_DONE=false`, and a live view at position
      `(3558.77,640.25,0)` / camera `(3504.10,642.88,67)` with
      `cameraMovementFinished=false`. The two 60-frame chunk summaries show
      `CINE_CameraCutTo04` counting down from 632 to 572 and keep
      `ReturnToPlayerControl` present but inactive with
      `CAMERA_LETTERBOX_END` / `ENABLE_INPUT`, proving the black frame is
      explainable by the real fade/cinematic gates while the camera/script
      state is still progressing.
- [x] Expand the MD_USA01 intro gate summary through the known return-to-player
      chain. The post-campaign chunk summaries now watch 20 original counters:
      `CINE_MoveTo06Delay`, `CINE_CameraCutTo04`,
      `CINE_LaunchPadMoveDelay`, `CINE_Pt2CameraLocation01Delay`,
      `CINE_Pt2MoveTransportsDelay`, `CINE_ScudSoundDelay`,
      `CINE_BasePullOut01Delay`, `CINE_BackToRocket01Delay`,
      `CINE_BackToBaseDelay`, `CINE_ZoomInMoreOnBaseDelay`,
      `CINE_RocketAirShot01Delay`, `CINE_BackToBaseYetAgainDelay`,
      `CINE_ZoomInMoreOnBaseDelayAgain`, `CINE_RocketAirShot02Delay`,
      `CINE_LastBaseShotDelay`, `CINE_BlowUp`, `CINE_FlashWhiteDelay`,
      `CINE_ReturnToPlayerStartDelay`, `CINE_ReturnToPlayerStartDelay_2`,
      and `Give it back`; and 15 original scripts from
      `CINE_CameraMoveTo06` through `CINE_ReturnToPlayerLocation C`,
      `Give Player The Game`, and `ReturnToPlayerControl`. Verified with
      `git diff --check`, `node --check
      WebAssembly/harness/startup_vertical_smoke.mjs`, and
      `STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=120
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60 node
      WebAssembly/harness/startup_vertical_smoke.mjs` redirected to
      `/tmp/cnc-startup-expanded-gates-120.json`: the real path reaches frame
      297 / logic frame 120 with zero missing texture applies, 20/20 watched
      counters found, 15/15 watched scripts found, `CINE_CameraCutTo04`
      counting down from 632 to 572, and the later
      `CINE_FlashWhiteDelay`, `CINE_ReturnToPlayerStartDelay`, `Give it
      back`, `Give Player The Game`, and `ReturnToPlayerControl` gates present
      but not yet fired.
- [x] Add an opt-in real-init-only mode to the startup vertical. Setting
      `STARTUP_VERTICAL_REAL_INIT_ONLY=1` now skips only the phase1
      archiveless boot and phase2 audio/frontier ownership preflights, then
      opens a fresh page and drives the same real
      `CreateGameEngine()` / `GameEngine::init()` / menu / MD_USA01 path used
      by the default gate. The final JSON reports `mode`, omits skipped
      preflight screenshots/state in fast mode, and still includes the
      post-campaign screenshot when extra frames are requested. Verified with
      `node --check WebAssembly/harness/startup_vertical_smoke.mjs`,
      `git diff --check`,
      `STARTUP_VERTICAL_REAL_INIT_ONLY=1
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=120
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60 node
      WebAssembly/harness/startup_vertical_smoke.mjs` redirected to
      `/tmp/cnc-startup-fast-realinit-120.json` (mode `real-init-only`, 21
      real-init archives, all 43 subsystems completed, frame 297 / logic frame
      120, zero missing-texture applies, 1,374 objects/drawables, campaign
      screenshot captured), and a default full run redirected to
      `/tmp/cnc-startup-full-default.json` (mode `full`, wasm loaded, phase2
      archive count 7, `createFunctionLexicon` frontier preserved, 2,099
      object templates, 21 real-init archives, all 43 subsystems completed).
- [x] Add a condition-driven post-campaign player-control runner to the startup
      vertical. `STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL=1` now
      runs the real MD_USA01 frame loop in chunks and stops early once the
      exported original engine state proves the loaded scene is interactable:
      `GameLogic::isInGame()`, `TheInGameUI->getInputEnabled()`,
      `INTRO_DONE`, no letterbox, and visible/clickable real
      `ControlBar.wnd:ControlBarParent`. The stricter
      `STARTUP_VERTICAL_POST_CAMPAIGN_EXPECT_PLAYER_CONTROL=1` turns that into
      a failing gate when the frame cap expires. Chunk stderr and final JSON
      now include a compact `playerControl` summary so long runs can explain
      whether the intro is still legitimately mid-cinematic or has reached
      usable gameplay. Verified with `node --check
      WebAssembly/harness/startup_vertical_smoke.mjs`, `git diff --check`, and
      `STARTUP_VERTICAL_REAL_INIT_ONLY=1
      STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL=1
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=120
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60 node
      WebAssembly/harness/startup_vertical_smoke.mjs` redirected to
      `/tmp/cnc-startup-player-control-120-final.json`: the real path reaches
      frame 297 / logic frame 120 with two player-control chunks, zero
      missing-texture applies, `INTRO_DONE=false`, input disabled, letterbox
      active, control bar hidden, and `reachedPlayerControl=false`, matching
      the known still-running original intro.
- [x] Add focused release-chain diagnostics to the post-campaign
      player-control chunks. `startup_vertical_smoke.mjs` now mines the
      existing read-only loaded-script catalog for timer actions and
      `TIMER_EXPIRED` conditions touching the watched MD_USA01 intro counters,
      plus the explicit `Give Player The Game` / `ReturnToPlayerControl`
      release scripts. Chunk JSON reports timer units/values, current counter
      state, active countdown blockers, and final release actions such as
      `SET_FLAG INTRO_DONE`, `ENABLE_SCRIPT ReturnToPlayerControl`,
      `CAMERA_LETTERBOX_END`, and `ENABLE_INPUT`, without mutating original
      script state or parsing map files outside the engine. Verified with
      `node --check WebAssembly/harness/startup_vertical_smoke.mjs`,
      `git diff --check -- WebAssembly/harness/startup_vertical_smoke.mjs`,
      and `STARTUP_VERTICAL_REAL_INIT_ONLY=1
      STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL=1
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=60
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60 node
      WebAssembly/harness/startup_vertical_smoke.mjs` redirected to
      `/tmp/cnc-startup-release-chain-final-60.json`: the real path reaches
      logic frame 60 with zero missing texture applies, captures
      `startup-vertical-real-init-post-campaign.png`, reports
      `reachedPlayerControl=false`, includes 22 focused release-chain scripts
      with no unrelated `Player Succeeds` script, and identifies the sole
      active countdown blocker as `CINE_CameraCutTo04=632` while keeping
      `Give Player The Game` and `ReturnToPlayerControl` present with their
      original release actions.
- [x] Add compact player-control phase history to long post-campaign runs.
      `runRealEngineFramesUntilPlayerControl()` now records
      `chunked.phaseChanges` whenever the original player-control predicates
      or active release-chain timer blockers change, while ignoring ordinary
      countdown value decrements within the same phase. This keeps deep
      MD_USA01 intro runs inspectable from the final JSON without changing
      the original engine frame loop or script state. Verified with
      `node --check WebAssembly/harness/startup_vertical_smoke.mjs`,
      `git diff --check -- WebAssembly/harness/startup_vertical_smoke.mjs`,
      and `STARTUP_VERTICAL_REAL_INIT_ONLY=1
      STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL=1
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=60
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60 node
      WebAssembly/harness/startup_vertical_smoke.mjs` redirected to
      `/tmp/cnc-startup-phase-history-60.json`: the real path reaches logic
      frame 60 with zero missing texture applies, captures
      `startup-vertical-real-init-post-campaign.png`, reports
      `reachedPlayerControl=false`, and emits one phase covering frames
      60/logic 60 with `INTRO_DONE=false`, input disabled, letterbox active,
      hidden/non-clickable control bar, and active blocker
      `CINE_CameraCutTo04=632`.
- [x] Add opt-in compact chunk storage for deep post-campaign runs.
      `STARTUP_VERTICAL_POST_CAMPAIGN_COMPACT_CHUNKS=1` now stores/logs a
      compact chunk shape for post-campaign frame batches and
      player-control runs: render texture health, display gates, minimal view
      and gameplay counts, control-bar state, player-control state, and active
      release-chain timer blockers. Default runs still keep the previous full
      chunk summaries, and compact runs still preserve the full final
      `realEngineFrame` result for detailed inspection. Verified with
      `node --check WebAssembly/harness/startup_vertical_smoke.mjs`,
      `git diff --check -- WebAssembly/harness/startup_vertical_smoke.mjs`,
      and `STARTUP_VERTICAL_REAL_INIT_ONLY=1
      STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL=1
      STARTUP_VERTICAL_POST_CAMPAIGN_COMPACT_CHUNKS=1
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=60
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60 node
      WebAssembly/harness/startup_vertical_smoke.mjs` redirected to
      `/tmp/cnc-startup-compact-chunks-60.json`: the real path reaches logic
      frame 60 with zero missing texture applies, captures
      `startup-vertical-real-init-post-campaign.png`, reports
      `compactChunks=true`, keeps `phaseChanges`, preserves a full final
      script catalog (`291` scripts), and shrinks stderr for the same 60-frame
      proof from about 24 KB to about 2 KB while retaining the active blocker
      `CINE_CameraCutTo04=632`.
- [x] Run the compact post-campaign player-control pass past
      `CINE_CameraCutTo04`. Verified with
      `STARTUP_VERTICAL_REAL_INIT_ONLY=1
      STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL=1
      STARTUP_VERTICAL_POST_CAMPAIGN_COMPACT_CHUNKS=1
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=900
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=120 node
      WebAssembly/harness/startup_vertical_smoke.mjs` redirected to
      `/tmp/cnc-startup-player-control-900.json`: the real path completes all
      900 requested post-campaign frames and reaches engine frame 1,077 /
      logic frame 900 with zero missing texture applies, 1,284
      objects/drawables, 55 rendered objects, and the original intro still
      correctly keeping input disabled, letterbox active, and the control bar
      hidden. The phase history now shows `CINE_CameraCutTo04` ending between
      logic frames 600 and 720; the active blockers after that are
      `CINE_LaunchPadMoveDelay`, `CINE_Pt2CameraLocation01Delay`, and
      `CINE_Pt2MoveTransportsDelay`, ending the 900-frame run at values 154,
      274, and 94 respectively. The post-campaign screenshot remains black
      during this original cinematic phase, but the frame state reports 55
      rendered objects and no WW3D missing-texture applies.
- [x] Add a lightweight real-frame summary RPC for long rendered gameplay
      gates. `cnc_port_real_engine_frame_summary()` now calls the same
      original `GameEngine::update()` loop as `cnc_port_real_engine_frame()`,
      but exports a compact summary shape with display/view state, gameplay
      counts, watched MD_USA01 intro counters/flags/scripts, minimal control
      bar state, player-control predicates, texture diagnostics, and frame
      timing. The browser bridge exposes it as `realEngineFrameSummary`, and
      `startup_vertical_smoke.mjs` can opt into it with
      `STARTUP_VERTICAL_POST_CAMPAIGN_LIGHTWEIGHT=1` for post-campaign
      player-control chunks while preserving the verbose endpoint by default.
      Verified with `node --check WebAssembly/harness/startup_vertical_smoke.mjs`,
      `node --check WebAssembly/harness/bridge.js`, `git diff --check`,
      `npm --prefix WebAssembly run build:port`, and
      `STARTUP_VERTICAL_REAL_INIT_ONLY=1
      STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL=1
      STARTUP_VERTICAL_POST_CAMPAIGN_COMPACT_CHUNKS=1
      STARTUP_VERTICAL_POST_CAMPAIGN_LIGHTWEIGHT=1
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=120
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60 node
      WebAssembly/harness/startup_vertical_smoke.mjs` redirected to
      `/tmp/cnc-startup-lightweight-120.json`: the real browser path reaches
      logic frame 120 with `summary=true`, `lightweightFrames=true`, zero
      missing texture applies, 1,374 objects/drawables, input still disabled,
      letterbox/control-bar gates still locked as intended by the original
      intro, and `CINE_CameraCutTo04` counting down from 632 to 572 across the
      two 60-frame chunks. A larger 300-frame chunk was intentionally aborted
      after staying CPU-active too long without a harness checkpoint; future
      deep rendered runs should use smaller chunks or add RPC progress/timeouts.
- [x] Trace the late MD_USA01 player-control timer owner from the real loaded
      script graph. The startup vertical can now launch a caller-selected
      browser (`STARTUP_VERTICAL_BROWSER_EXECUTABLE` / `CHROME_PATH` plus
      `STARTUP_VERTICAL_BROWSER_ARGS`) and write screenshots to
      `STARTUP_VERTICAL_SCREENSHOT_DIR`, which let the Mac GPU verifier run the
      same harness under Chrome/Metal. The real-frame JSON now includes full
      details for watched intro scripts, sequential-script queue snapshots, and
      a passive counter-reference scan over loaded original scripts. Verified
      with `node --check WebAssembly/harness/startup_vertical_smoke.mjs`,
      `node --check WebAssembly/harness/play.mjs`, `node --check
      WebAssembly/harness/static-server.mjs`, `npm --prefix WebAssembly run
      build:port`, `git diff --check`, and a 2,400-frame Mac Chrome/Metal
      run using `STARTUP_VERTICAL_REAL_INIT_ONLY=1`,
      `STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL=1`,
      `STARTUP_VERTICAL_POST_CAMPAIGN_COMPACT_CHUNKS=1`,
      `STARTUP_VERTICAL_POST_CAMPAIGN_LIGHTWEIGHT=1`, and 120-frame chunks.
      The run reached logic frame 2,286 with no exception and zero missing
      texture applies, but did not reach player control: `Give Player The Game`
      is active and waits on `TIMER_EXPIRED("Give it back")`; the `Give it
      back` counter exists at value `0` with `isCountdownTimer=false`; and the
      only loaded producer reference is unsuffixed `Start_Mission_Intro`
      setting that timer, while the late return chain enabled
      `Start_Mission_Intro SS1`, whose actions do not set it.
- [x] **Reach original player control on the real MD_USA01 boot path.** The
      earlier 2,400-frame runs stopped too early: the `Start_Mission_Intro SS1`
      chain is NOT a dead end and needs no forced flags. Dynamic timer tracing
      (weak `#ifdef __EMSCRIPTEN__` hooks in `ScriptEngine.cpp` +
      `wasm_real_engine_init.cpp` script-event/dynamic-counter export) proved
      the real chain resolves on its own: `ss1a`→`ss1b`→`ss2`→`ss3`→`ss_over`
      plus the `ss* fade` counters, then `Start_Mission_Intro` sets
      `Give it back`, `Give Player The Game` fires `INTRO_DONE`, and
      `ReturnToPlayerControl` runs `CAMERA_LETTERBOX_END`/`ENABLE_INPUT`. A Mac
      Chrome/Metal 3,600-frame run (`STARTUP_VERTICAL_REAL_INIT_ONLY=1`,
      `..._UNTIL_PLAYER_CONTROL=1`, compact+lightweight, 120-frame chunks)
      reached player control at engine frame 3,417 / logic frame 2,560:
      `reachedPlayerControl=true`, `inputEnabled=true`, `introDone=true`,
      `letterBoxed=false`, `controlBarClickable=true`, `objectCount=881`, and
      zero WW3D missing-texture applies throughout. `startup-vertical-real-init-
      post-campaign.png` confirms the HUD/control bar/radar/money composite at
      player control. Nothing was forced — the `Give it back` diagnosis in the
      preceding item was simply a too-short run, not a real activation
      mismatch. NOTE: the tactical view (terrain + world) renders black at this
      frame; see the open "Black terrain" TODO for the remaining visual bug.
- [x] **FIX the black terrain (THE big in-game visual bug)** — commit
      08a1839. Root cause: **WebGL's `gl.clear(DEPTH_BUFFER_BIT)` respects
      `gl.depthMask`, but D3D8's `Clear` ignores the write masks.** A prior draw
      (a transparent/UI pass with ZWRITE off) left `depthMask=false`, so the
      per-frame depth clear was **silently skipped** → the depth buffer kept
      stale close values → the terrain (drawn later) failed the depth test and
      rendered black (motion-correlated "dragged black silhouettes"; MD_USA01
      fully black). NOTHING about the terrain geometry/lighting/textures was
      wrong — proven by `depthFunc=ALWAYS` rendering it perfectly, and by
      Fable's depth-write kill-switch bisection whose *calibration failure*
      (killing ALL depth writes did NOT reproduce ALWAYS) pointed from draws to
      the clear/state. Fix: `bridge.js` `paintD3D8Clear` forces `depthMask` on
      around `gl.clear` and restores it. Companion shim fixes
      (`wasm_d3d8_shim.cpp`): forward `Clear` on ZBUFFER/STENCIL too (depth-only
      clears were dropped — only D3DCLEAR_TARGET forwarded); and skip browser
      draws/clears while an offscreen render target is bound (`SetRenderTarget`
      is a framebuffer-less stub, so RTT/shadow/reflection passes were rendering
      into the main canvas) — interim until real render-to-texture. Verified:
      naval shell map 20.8%→0% black, renders beaches/water/rocks/units
      correctly under SwiftShader; MD_USA01 renders textured cliffs, a cloudy
      skybox, a tree, and units on the Mac GPU (Chrome/Metal), 0 missing texture
      applies, where it was previously 100% black. A full boot-to-player-control
      run on the Mac GPU (3417 engine frames / logic frame 2560) reached
      `reachedPlayerControl=true` with `inputEnabled=true`, `introDone=true`,
      `letterBoxed=false`, `controlBarClickable=true`, 881 objects, 0 missing
      texture applies, and the interactive tactical view renders the full
      MD_USA01 base scene correctly — detailed desert/farmland terrain (dirt
      roads, a wheat field), an oil derrick, a barn, a hangar, walls, USA tanks/
      Humvee, an infantry squad, and the complete control bar/radar/money HUD —
      the exact frame that was pure-black before the fix. General lesson for the
      port: WebGL clears respect write masks, D3D clears do not.
- [x] Refresh texture-bound shader uniforms outside the D3D8 render-state hash
      cache. The native draw-state hash covers transforms, material, lights,
      render states, texture-stage states, clip planes, and transform masks, but
      not `SetTexture` bindings; the browser bridge now keeps a cached applied
      render-state object while always rebinding the texture availability,
      sampler-unit, texture-semantic, LOD-bias, and texture-coordinate transform
      uniforms per draw. Framebuffer/clear paths invalidate the cached applied
      state alongside the hash, and transformed draw diagnostics now keep a
      scene-history ring with texture readiness/format/storage metadata so UI
      quads do not evict the last 3D draw evidence. Verified with
      `node --check WebAssembly/harness/bridge.js`, `npm --prefix WebAssembly
      run build:port`, `node harness/shipped_mesh_render_smoke.mjs
      artifacts/real-assets/W3DZH.big artifacts/real-assets/TexturesZH.big`,
      `git diff --check`, and Mac Chrome/Metal title verification
      (`ANGLE Metal Renderer: Apple M4`, 43 subsystems, shell-map screenshot
      refreshed at `/home/agusx1211/cnc-mac-verify/mac-verify-title.png`).
- [x] Extend the bridge.js stateHash draw-state cache to skip per-draw
      `normalizeD3D8*` / `textureStage*` JS object rebuilds and the
      texture-availability uniform block when
      `(stateHash, tex0Id, tex1Id, fvf, stride, primitiveType)` is unchanged
      from the previous draw. GL retains state between identical draws,
      making re-issuing redundant. Point-sprite uniforms are always
      reissued (viewport not in stateHash). Correctness-reviewed; render-
      verified clean (Alpine Assault screenshot, 223 objects). Mac perf-
      number measurement pending as follow-up.
- [x] Fix white/broken foot-soldier textures by implementing the D3DX
      surface-copy path used by original W3D house-color texture generation.
      Mac shell-map texture-label captures isolated the broken soldiers to
      generated names like `#-16711936#zhca_uirguard.tga` and
      `#-16711936#zhca_uiworker.tga`: the original W3D asset manager had
      allocated the generated `A8R8G8B8` textures but the wasm D3D8 shim still
      returned `D3DERR_NOTAVAILABLE` from `D3DXLoadSurfaceFromSurface`, so the
      recolored surface pixels never reached WebGL (`ready:false`,
      `sampled:false`, `uploads:0`). The shim now copies/scales same-format
      browser surfaces, uploads texture-owned destination levels, and implements
      2D `D3DXFilterTexture` mip-chain generation from the previous level. A
      new shell-map texture-label capture joins original `TextureClass::Apply`
      names to browser texture ids and draw-history metadata. Verified with
      `node --check WebAssembly/harness/shellmap_texture_label_capture.mjs`,
      `npm --prefix WebAssembly run build:port`, `git diff --check`, and Mac
      Chrome/Metal shell-map captures at frames 360/720: the same generated
      infantry textures now report `ready:true`, `sampled:true`,
      `storage:"rgba8"`, `uploads:1`, and the frame-720 screenshot at
      `/home/agusx1211/cnc-mac-verify/shellmap-texture-labels/shellmap-frame-720.png`
      shows colored infantry instead of white silhouettes.
- [x] Fix the MD_USA01/shell-map first-scene air/water/ship ordering
      regression by preventing transparent texels in opaque texture-alpha
      cutouts from writing depth. The repro frame showed the battleship and
      Chinook as unblended, depth-writing DXT alpha-texture draws whose final
      alpha came from the texture combiner while explicit alpha test was off,
      so WebGL was accepting fully transparent texels into the depth buffer and
      hiding later air/effect draws. The browser D3D8 bridge now derives a
      narrow implicit cutout threshold for only those unblended, depth-writing
      texture-alpha draws, refreshes that uniform outside the render-state hash
      cache because texture identity is per-draw, and leaves blended effect
      passes on the normal blend path. The native shim forwards indexed draw
      base/min/first-index metadata so the harness draw-history bounds match
      the actual indexed triangles. Verified with `node --check
      WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/shellmap_texture_label_capture.mjs`,
      `npm --prefix WebAssembly run build:port`, `node
      harness/shipped_mesh_render_smoke.mjs
      artifacts/real-assets/W3DZH.big artifacts/real-assets/TexturesZH.big`,
      `git diff --check`, and a Mac Chrome/Metal shell-map repro capture:
      `SHELLMAP_CAPTURE_FRAMES=240 SHELLMAP_DRAW_HISTORY_LIMIT=4096
      SHELLMAP_ASSERT_CUTOUT_DEPTH=1 node
      harness/shellmap_texture_label_capture.mjs` reported
      `ANGLE Metal Renderer: Apple M4`, `battleshipCutouts:12`,
      `chinookCutouts:3`, `comancheBlends:9`, and `shockwaveBlends:105`
      with the assertion passing and screenshot
      `/Users/aa/cnc-verify/shellmap-order-frame240-cutout-assert/shellmap-frame-240.png`.
- [x] Add a real shell-map generated-infantry texture assertion to the existing
      texture-label capture harness. `SHELLMAP_ASSERT_INFANTRY_TEXTURES=1`
      now scans the real `WW3DAssetManager`/`HLodClass` draw path for
      generated house-color textures (`#-16711936#zhca_ui*.tga`) and requires
      them to be ready, sampled, uploaded as `rgba8`, and backed by non-white
      sampled texels. This deliberately avoids a bare `MeshClass` probe for
      `AIRNGR_SKN`, because the body mesh is skinned and belongs to the
      original HLOD ownership path. Verified with `node --check
      WebAssembly/harness/shellmap_texture_label_capture.mjs` and a Mac
      Chrome/Metal combined shell-map run:
      `SHELLMAP_CAPTURE_FRAMES=240,720 SHELLMAP_DRAW_HISTORY_LIMIT=4096
      SHELLMAP_ASSERT_CUTOUT_DEPTH=1 SHELLMAP_ASSERT_INFANTRY_TEXTURES=1
      /opt/homebrew/bin/node harness/shellmap_texture_label_capture.mjs`,
      which reported `ANGLE Metal Renderer: Apple M4`, cutout counts
      `battleshipCutouts:12`, `chinookCutouts:3`, `comancheBlends:8`,
      `shockwaveBlends:324`, and infantry counts `drawCount:49`,
      `uniqueTextureCount:4`, `notReady/notSampled/badStorage/missingUploads/
      whiteOnly:0` for `#-16711936#zhca_uirguard.tga`,
      `#-16711936#zhca_uirtunfan.tga`, `#-16711936#zhca_uiter.tga`, and
      `#-16711936#zhca_uiworker.tga`. Screenshots:
      `/Users/aa/cnc-verify/shellmap-nightly-combined-assert/shellmap-frame-240.png`
      and `/Users/aa/cnc-verify/shellmap-nightly-combined-assert/shellmap-frame-720.png`.
- [x] Add a live shell-map battle-FX texture assertion for the reported
      missing explosions. `SHELLMAP_ASSERT_BATTLE_FX_TEXTURES=1` now scans the
      same real shell-map draw history for shipped explosion/shockwave/cloud
      textures, requires the expected transparent FX passes to be blended, and
      verifies the textures are ready, sampled, and uploaded. Assertion mode
      now defaults the draw-history limit to 4096 so busy shell-map frames keep
      enough 3D/effect evidence. Verified on Mac M4 Chrome/Metal with:
      `SHELLMAP_CAPTURE_DIR=/Users/aa/cnc-verify/shellmap-nightly-battle-fx
      SHELLMAP_CAPTURE_FRAMES=240,720 SHELLMAP_ASSERT_CUTOUT_DEPTH=1
      SHELLMAP_ASSERT_INFANTRY_TEXTURES=1
      SHELLMAP_ASSERT_BATTLE_FX_TEXTURES=1 /opt/homebrew/bin/node
      harness/shellmap_texture_label_capture.mjs`, which reported
      `ANGLE Metal Renderer: Apple M4` and passing battle-FX counts
      `shockwave:302`, `cloud:130`, `wave:25`, `explosion:106` for
      `excloud01.tga`, `exexplo03.tga`, `exshockwav.tga`, and `exwave01.tga`.
      Screenshot evidence was copied to
      `WebAssembly/artifacts/screenshots/mac-nightly/shellmap-battle-fx-frame240.png`.
- [x] **Prove D3D8 render-target/FBO correctness in the harness.** Added the
      `d3d8RenderTarget` RPC and smoke assertion around the real D3D8 shim path:
      `CreateTexture(D3DUSAGE_RENDERTARGET)` -> `GetSurfaceLevel(0)` ->
      `CreateDepthStencilSurface` -> `SetRenderTarget` -> `Clear` -> restore
      default backbuffer/depth -> `Clear` -> `Present`. The harness samples the
      offscreen render texture center as `[34,85,170,255]`, then samples the
      restored backbuffer center as `[16,32,48,255]`. The C++ probe and browser
      bridge also assert two FBO binds, zero FBO bind failures, default FBO
      restored to texture ids `0/0`, one texture create/release delta, live
      texture count `0`, browser FBO count `0`, and zero new incomplete-FBO
      events. Direct inspection also confirmed the stale adversarial-review
      claims for FBO release cleanup and bind-failure counting were already
      fixed; the remaining open depth-related task is only texture-owned depth
      attachment support. Verified with `node --check
      WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/smoke.mjs`, `npm --prefix WebAssembly run
      build:port`, a focused Playwright `d3d8RenderTarget` boot/RPC, and
      `EXPECT_WASM=1 node harness/smoke.mjs` through the new assertion. The
      aggregate smoke still fails later at the tracked legacy
      `edgeMapperApply` dlmalloc OOB.
- [x] **Add texture-owned depth/stencil attachments to D3D8 render-target
      FBOs.** The browser bridge now maps D3D8 depth textures with
      `D3DUSAGE_DEPTHSTENCIL` to WebGL2 depth attachments for D16/
      D16_LOCKABLE, D24X8, and D24S8; D24S8 uses
      `DEPTH24_STENCIL8` + `DEPTH_STENCIL_ATTACHMENT`. FBO cache keys now
      include both color and depth texture ids, so rebinding the same color RT
      with a different depth surface cannot alias stale depth state. FBO
      cleanup now removes entries that reference a released or recreated texture
      as either color or depth. Added the `d3d8DepthTextureRenderTarget` RPC
      and smoke assertion around the real D3D8 path:
      `CreateTexture(D3DUSAGE_RENDERTARGET)` plus
      `CreateTexture(D3DUSAGE_DEPTHSTENCIL, D3DFMT_D24S8)` -> `GetSurfaceLevel`
      -> `SetRenderTarget` -> clear color/depth/stencil -> restore default
      backbuffer/depth -> clear/present. Focused Playwright proof:
      render texture id `1`, depth texture id `2`, first FBO bind `{color:1,
      depth:2, 64x32}`, browser attachment `"texture"` with storage
      `"depth24-stencil8"`, offscreen center `[68,51,34,255]`, restored
      backbuffer center `[16,32,48,255]`, 2 browser texture creates/releases,
      2 FBO binds, 0 FBO bind failures, 0 unsupported updates, 0 incomplete-FBO
      events, live texture count `0`, and browser FBO count `0`. Verified with
      `node --check WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/smoke.mjs`, `git diff --check`, `npm --prefix
      WebAssembly run build:port`, the focused Playwright RPC, and
      `EXPECT_WASM=1 node harness/smoke.mjs` through the new assertion. The
      aggregate smoke still fails later at the tracked `edgeMapperApply`
      dlmalloc OOB.
- [x] Let original `W3DShaderManager::init()` acquire its RTT surface on the
      browser D3D8 device without advertising unsupported pixel shaders. The
      D3D8 adapter identity now reports a known fixed-function 3dfx Voodoo5
      class device (`VendorId=0x121a`, `DeviceId=0x0009`) so original
      `W3DShaderManager::getChipset()` returns nonzero and can allocate its
      render-to-texture target, while `PixelShaderVersion` remains `0` and
      `CreatePixelShader` still returns `D3DERR_NOTAVAILABLE`. Added the
      `ww3dShaderManager` RPC/smoke proof: browser Playwright verifies
      `canRenderToTexture=true`, terrain fixed-function shader pass counts are
      populated (`ST_TERRAIN_BASE=2`, `ST_TERRAIN_BASE_NOISE12=3`,
      `ST_FLAT_TERRAIN_BASE=1`), at least one D3D render-target texture is
      created, and the DXT draw probe still passes, proving the adapter
      identity did not regress compressed texture support.
- [x] **Prove real select-to-move at MD_USA01 player control on Mac/Metal.**
      The startup vertical interactivity mode now uses the original input
      setting (`GlobalData::m_useAlternateMouse`) to choose the move button,
      retries bounded in-world destination candidates, and exposes
      Emscripten-only command-path counters from the original
      `CommandTranslator` and `GameLogicDispatch` through
      `querySelection`. A Chrome/Metal run on the M4 verifier reached player
      control (`inputEnabled=true`, `introDone=true`, `localPlayerIndex=2`),
      selected local `AmericaTankPaladin` object `934`, proved it was
      controllable and locally controlled, then found a valid destination at
      screen `{x:656,y:400}`. The click produced original command path evidence:
      `lastClickType=21`, `lastClickIsPoint=1`, `lastClickControllable=1`,
      `lastClickUseAlternateMouse=0`, `lastClickIssuedType=1068`
      (`MSG_DO_MOVETO`), `moveAppendCount=1`,
      `dispatchMoveCommandCount=1`, and `dispatchLastMoveHadGroup=1` at world
      `{x:2211.542969,y:638.956665,z:15.625}`. After 90 real frames the unit
      moved `73.53576040202283` world units (`dx=45.590088`,
      `dy=-57.697937`) and the harness saved
      `/tmp/cnc-metal-verify-20260704d/interact-milestone.png`. Verified with
      `node --check WebAssembly/harness/play.mjs`, `node --check
      WebAssembly/harness/startup_vertical_smoke.mjs`, `npm --prefix
      WebAssembly run build:port`, and
      `STARTUP_VERTICAL_REAL_INIT_ONLY=1
      STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL=1
      STARTUP_VERTICAL_POST_CAMPAIGN_EXPECT_PLAYER_CONTROL=1
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES=3600
      STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK=60
      STARTUP_VERTICAL_POST_CAMPAIGN_COMPACT_CHUNKS=1
      STARTUP_VERTICAL_POST_CAMPAIGN_LIGHTWEIGHT=1
      STARTUP_VERTICAL_PROVE_INTERACT=1` on Chrome/Metal, exiting `0`.
- [x] **Bisect the black-terrain bug down to degenerate terrain geometry**
      (diagnosis only; fix still open — see TODO). Built a fast shell-map
      iteration loop (`WebAssembly/harness/_diag_shell_terrain.mjs`, temp/
      untracked) that boots the naval shell map through the real lifecycle,
      renders N frames, samples a 16×12 black-pixel grid + screenshots + a
      temporary frame-summary terrain probe. Proved the black is **terrain
      GROUND geometry failing to rasterize** (black clear-color shows through),
      NOT shading/texture: props and water render fine over the same area, and
      a diffuse-only terrain override left the black regions pixel-identical
      while changing the drawn terrain. Ruled out (each build+run): texture
      atlas, lighting rig (healthy every frame: 3 lights, ambient≈0.22,
      diffuse=1), renderer/LOD (it is the classic `HeightMapRenderObjClass`,
      never Flat), the cloud/lightmap camera-space-texgen multiply pass,
      VB-upload staleness / ring-buffer scroll (a full re-fill every frame
      changed nothing), and depth-fade (never enabled). Isolated
      terrain-visual smokes render the same classic terrain perfectly (even
      under a camera pan) because their small map fits the terrain window; the
      full boot's large map makes `updateCenter` re-origin the ring-buffer
      window. All experimental engine changes were reverted; the sharp
      diagnosis + next lead (dump `updateVB` vertex positions for a black tile;
      suspect getDisplayHeight/`getXWithOrigin` bounds or ring-buffer origin
      math at the window/map edge) live in the TODO "Black terrain" item.
- [x] Split the hot-path build from the legacy smoke surface:
      `CNC_BUILD_TARGETS` in `tools/build_wasm.sh` selects CMake targets;
      `zh_startup_vertical_hotpath` aggregates exactly what
      `test:startup-vertical` runs; `npm run build:port` /
      `build:startup-vertical` feed the boot loop. Measured after touching
      `GlobalData.h`: hot path 39s wall / 5m22s CPU vs +80s wall / +19m35s
      CPU for the legacy smoke surface alone (~4× CPU). AGENTS.md now pins
      the loop rules: fix the crash the real boot reports (frontier from the
      run), hot-path build in the inner loop, full `build:wasm` only for the
      regression suite where legacy smokes serve as canaries.
- [x] Own `createAudioManager` (`GameEngine.cpp:434`) in the `cnc-port`
      browser boot: `zh_miles_audio_device_compile_frontier` (the real
      `MilesAudioManager.cpp`) plus a new real-header
      `zh_gameengine_audio_runtime` (GameAudio/GameMusic/GameSounds/
      AudioEventRTS/AudioRequest/DynamicAudioEventInfo/INIAudioEventInfo/
      INIMiscAudio/SubsystemInterface) now link into `cnc-port`, and
      `wasm_audio_manager_probe.cpp` constructs the original
      `MilesAudioManager` as `TheAudio`, runs real `AudioManager::init()`
      INI loads (69 music tracks, ~1,400 sound events, ~2,570 streaming
      events through the real INI runtime), the real `isMusicAlreadyLoaded()`
      archive check against base-Generals `Music.big`, `openDevice()` through
      the browser MSS shim (provider selected/opened, 2D/3D pools + listener +
      delay filter), and original-destructor teardown.
      `deviceFactoryFrontier.firstUnownedInitFactory` advances to
      `createFunctionLexicon`@446 only when the boot actually proved all of
      that; archiveless or music-less boots honestly stay at
      `createAudioManager`@434 (`missing_runtime_archives` /
      `music_not_loaded_would_set_quitting`, with `wouldSetQuitting`
      mirroring `GameEngine.cpp:435`). `test:startup-vertical` gates the
      archive-backed boot with an `startup-vertical-audio-owned.png`
      screenshot; `OptionPreferences` audio getters use the real
      `OptionsMenu.cpp` fallback logic (fresh-install defaults, no browser
      persistence yet).
- [x] Expose the `createFunctionLexicon` (`GameEngine.cpp:446`) runtime
      frontier in `cnc-port`: `wasm_function_lexicon_runtime.cpp` constructs
      the original `W3DFunctionLexicon` as `TheFunctionLexicon`, runs its
      `init()`, and verifies the W3D device draw/layout-init callback tables
      (`W3DGadgetPushButtonDraw`, `W3DGameWinDefaultDraw`,
      `W3DMainMenuInit`). The same probe keeps full ownership false because
      the base `FunctionLexicon` tables still resolve through the render
      probe-local base implementation; the startup vertical now reports
      `base_function_lexicon_probe_owned` and keeps
      `deviceFactoryFrontier.firstUnownedInitFactory` at
      `createFunctionLexicon`@446 instead of pretending `createModuleFactory`
      is reached.
- [x] Load the first core base `FunctionLexicon` callback slice in linked
      `cnc-port`: the current wasm `FunctionLexicon::init()` registers the
      base `TABLE_GAME_WIN_SYSTEM`, `TABLE_GAME_WIN_INPUT`, and
      `TABLE_GAME_WIN_TOOLTIP` entries for default/pass-through/message-box,
      push-button, static-text, and tooltip callbacks while
      `W3DFunctionLexicon::init()` continues to provide the W3D device
      draw/layout-init tables. `test:startup-vertical` verifies those core base
      lookups plus the W3D representative lookups and now reports
      `base_function_lexicon_partial_runtime_owned` with
      `originalFunctionLexiconLayoutAndDrawCallbacks` next, keeping
      `createFunctionLexicon`@446 unowned until the base layout/draw callback
      tables are runtime-owned.
- [x] Broaden the linked `cnc-port` base `FunctionLexicon` runtime slice from
      core callbacks to non-network widget/input plus draw callbacks:
      `FunctionLexicon::init()` now registers the original checkbox, radio,
      tab, listbox, combobox, horizontal/vertical slider, progress bar, static
      text, text entry, IME system/input, and IME draw callback names, with
      `IMECandidate.cpp` linked through `zh_window_layout_script_runtime`.
      The startup vertical verifies every added callback-name lookup and now
      reports `base_function_lexicon_widget_draw_runtime_owned` with
      `originalFunctionLexiconLayoutCallbacks` next. `GameWinBlockInput`
      remains deferred until `SelectionTranslator` is runtime-owned, so the
      line-446 frontier stays honest.
- [x] Move the linked `cnc-port` base `FunctionLexicon` layout frontier from
      empty tables to representative original callback ownership:
      `zh_window_layout_script_runtime` now links the original
      `DifficultySelect.cpp`, `KeyboardOptionsMenu.cpp`, and `PopupReplay.cpp`,
      and the reduced wasm `FunctionLexicon::init()` registers
      `DifficultySelectInit`, `KeyboardOptionsMenuUpdate`, and
      `PopupReplayShutdown` in the base layout init/update/shutdown tables.
      The startup vertical verifies those callback-name lookups plus table
      residency and now reports
      `base_function_lexicon_layout_partial_runtime_owned` with
      `originalFunctionLexiconShellLayoutCallbacks` next, keeping
      `createFunctionLexicon`@446 unowned until the remaining non-network
      shell callback graph is linked into the runtime.
- [x] Promote the first original shell menu callback owners into the linked
      `cnc-port` base `FunctionLexicon`: `zh_window_layout_script_runtime`
      now links original `MainMenu.cpp`, `CreditsMenu.cpp`, `Credits.cpp`,
      `ExtendedMessageBox.cpp`, `Shell.cpp`, `AnimateWindowManager.cpp`,
      `ProcessAnimateWindow.cpp`, `ShellMenuScheme.cpp`,
      `GameWindowTransitionsStyles.cpp`, and `CampaignManager.cpp`, while the
      reduced wasm `FunctionLexicon::init()` registers original
      `MainMenu`/`CreditsMenu` system/input/init/update/shutdown callbacks.
      Startup vertical verifies those callback-name lookups in the browser and
      now reports `base_function_lexicon_main_credits_runtime_owned` with
      `originalFunctionLexiconSkirmishAndRemainingShellCallbacks` next.
      Ignored online/download/CD branches remain weak browser boundaries
      (`StartPatchCheck`, `HTTPThinkWrapper`, `DownloadMenuUpdate`,
      `deleteNotificationBox`, `TheRankPointValues`, `DontShowMainMenu`,
      `IsFirstCDPresent`) until their owning features become current.
- [x] Promote the non-network `SkirmishGameOptionsMenu` callback owner into
      the linked `cnc-port` base `FunctionLexicon`: `zh_window_layout_script_runtime`
      now links original `SkirmishGameOptionsMenu.cpp`,
      `SkirmishBattleHonors.cpp`, and `MapUtil.cpp`, while the reduced wasm
      `FunctionLexicon::init()` registers original
      `SkirmishGameOptionsMenu` system/input/init/update/shutdown callbacks.
      Startup vertical verifies those callback-name lookups in the browser and
      now reports `base_function_lexicon_skirmish_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next. The online-heavy
      player-info battle-honor insertion/tooltips and player-template tooltips
      remain weak browser boundaries until their owning popup/WOL surface is
      current; the previous weak `IsFirstCDPresent` fallback is now overridden
      by the original Skirmish owner in this linked runtime.
- [x] Promote the non-network `SinglePlayerMenu` callback owner into the linked
      `cnc-port` base `FunctionLexicon`: `zh_window_layout_script_runtime` now
      links original `SinglePlayerMenu.cpp`, while the reduced wasm
      `FunctionLexicon::init()` registers original `SinglePlayerMenu`
      system/input/init/update/shutdown callbacks. Startup vertical verifies
      those callback-name lookups in the browser and now reports
      `base_function_lexicon_single_player_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the already-linked `DifficultySelect` callback owner from a
      representative init lookup to its full original system/input/init
      FunctionLexicon registration. Startup vertical verifies those three
      callback-name lookups in the browser and now reports
      `base_function_lexicon_difficulty_select_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the already-linked `KeyboardOptionsMenu` callback owner from a
      representative update lookup to its full original
      system/input/init/update/shutdown FunctionLexicon registration, adding
      original `MetaEvent.cpp` so `TheMetaMap` comes from the real input
      owner. Startup vertical verifies those callback-name lookups in the
      browser and now reports
      `base_function_lexicon_keyboard_options_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the already-linked `ExtendedMessageBoxSystem` owner into the
      linked `cnc-port` base `FunctionLexicon`. Startup vertical verifies the
      callback-name lookup in the browser and now reports
      `base_function_lexicon_extended_message_box_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the original `InGamePopupMessage` callback owner into the linked
      `cnc-port` base `FunctionLexicon`: `zh_window_layout_script_runtime` now
      links `InGamePopupMessage.cpp` plus the original `InGameUI.cpp` owner for
      `InGameUI::clearPopupMessageData`, and the focused mouse-stream probe's
      null `TheInGameUI` storage is weak so the real singleton can own the
      global when linked. Startup vertical verifies the system/input/init
      callback-name lookups in the browser and now reports
      `base_function_lexicon_ingame_popup_message_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the already-linked original `IdleWorkerSystem` callback into the
      linked `cnc-port` base `FunctionLexicon`. The callback comes from the
      original `InGameUI.cpp` owner linked for the in-game popup slice, so this
      only widens the reduced system table. Startup vertical verifies the
      callback-name lookup in the browser and now reports
      `base_function_lexicon_idle_worker_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the original `BeaconWindowInput` callback into the linked
      `cnc-port` base `FunctionLexicon`. `zh_window_layout_script_runtime` now
      links original `GUI/ControlBar/ControlBarBeacon.cpp`, and the reduced
      wasm input table registers the beacon edit-window input callback while
      retaining the existing `InGameUI` owner for its ESC deselect path.
      Startup vertical verifies the callback-name lookup in the browser and now
      reports `base_function_lexicon_beacon_window_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the original `ReplayControl` callback owner into the linked
      `cnc-port` base `FunctionLexicon`. `zh_window_layout_script_runtime` now
      links original `GUI/GUICallbacks/ReplayControls.cpp`, and the reduced
      wasm system/input tables register `ReplayControlSystem` and
      `ReplayControlInput`. Startup vertical verifies those callback-name
      lookups in the browser and now reports
      `base_function_lexicon_replay_control_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the original `ChallengeMenu` callback owner into the linked
      `cnc-port` base `FunctionLexicon`. `zh_window_layout_script_runtime` now
      links original `GUI/GUICallbacks/Menus/ChallengeMenu.cpp` together with
      its original `GUI/ChallengeGenerals.cpp` data owner and
      `GUI/WindowVideoManager.cpp` menu-video owner, and the reduced wasm
      system/input/init/update/shutdown tables register the `ChallengeMenu`
      callbacks. Startup vertical verifies those callback-name lookups in the
      browser and now reports
      `base_function_lexicon_challenge_menu_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the original `PopupCommunicator` callback owner into the linked
      `cnc-port` base `FunctionLexicon`. `zh_window_layout_script_runtime` now
      links original `GUI/GUICallbacks/Menus/PopupCommunicator.cpp`, and the
      reduced wasm system/input/init/shutdown tables register
      `PopupCommunicatorSystem`, `PopupCommunicatorInput`,
      `PopupCommunicatorInit`, and `PopupCommunicatorShutdown`. Startup
      vertical verifies those callback-name lookups in the browser and now
      reports `base_function_lexicon_popup_communicator_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the original `MapSelectMenu` callback owner into the linked
      `cnc-port` base `FunctionLexicon`. `zh_window_layout_script_runtime` now
      links original `GUI/GUICallbacks/Menus/MapSelectMenu.cpp`, and the
      reduced wasm system/input/init/update/shutdown tables register
      `MapSelectMenuSystem`, `MapSelectMenuInput`, `MapSelectMenuInit`,
      `MapSelectMenuUpdate`, and `MapSelectMenuShutdown`. Startup vertical
      verifies those callback-name lookups in the browser and now reports
      `base_function_lexicon_map_select_menu_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the original `GameInfoWindowSystem` callback-name owner into the
      linked `cnc-port` base `FunctionLexicon`. `zh_window_layout_script_runtime`
      now links original `GUI/GUICallbacks/Menus/GameInfoWindow.cpp`, and the
      reduced wasm system table registers `GameInfoWindowSystem` only. Startup
      vertical verifies that passive callback-name lookup in the browser and now
      reports `base_function_lexicon_game_info_window_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next; LAN game-info
      population and transport behavior remain outside the owned runtime path.
- [x] Promote the passive original `GameInfoWindowInit` callback-name owner into
      the linked `cnc-port` base `FunctionLexicon` alongside the already-owned
      `GameInfoWindowSystem` lookup. The reduced layout-init table now resolves
      the original initializer from `GameInfoWindow.cpp`; it only seeds
      name-key/window/gadget state, while LAN game-info population remains
      outside the owned runtime path.
- [x] Promote the original `ReplayMenu` callback owner into the linked
      `cnc-port` base `FunctionLexicon`. `zh_window_layout_script_runtime` now
      links original `GUI/GUICallbacks/Menus/ReplayMenu.cpp`, and the reduced
      wasm system/input/init/update/shutdown tables register
      `ReplayMenuSystem`, `ReplayMenuInput`, `ReplayMenuInit`,
      `ReplayMenuUpdate`, and `ReplayMenuShutdown`. Startup vertical verifies
      those callback-name lookups in the browser and now reports
      `base_function_lexicon_replay_menu_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next. The runtime also
      owns a focused browser `SYSTEMTIME` date/time formatting helper for the
      replay list until full original `GameState.cpp` ownership can replace it.
- [x] Promote the original `PopupReplay` modal callback names into the linked
      `cnc-port` base `FunctionLexicon` without claiming the score-screen
      replay-save path. `zh_window_layout_script_runtime` already linked
      original `GUI/GUICallbacks/Menus/PopupReplay.cpp`; the reduced wasm
      input/init/shutdown tables now register `PopupReplayInput`,
      `PopupReplayInit`, and `PopupReplayShutdown`. Startup vertical verifies
      those callback-name lookups in the browser and now reports
      `base_function_lexicon_popup_replay_modal_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next. `PopupReplaySystem`
      and `PopupReplayUpdate` remain open because direct registration retains
      `LastReplayFileName` and `ScoreScreenEnableControls()` from the broader
      original `ScoreScreen.cpp` owner.
- [x] Promote the original `ControlBarInput` callback name into the linked
      `cnc-port` base `FunctionLexicon` without claiming the broader control-bar
      command path. `zh_window_layout_script_runtime` now links original
      `GUI/GUICallbacks/ControlBarCallback.cpp`, and the reduced wasm input
      table registers the passive `ControlBarInput` callback. Startup vertical
      verifies that lookup in the browser and now reports
      `base_function_lexicon_control_bar_input_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next. `ControlBarSystem`
      and `LeftHUDInput` remain open until the gameplay command/radar/player
      ownership surface is runtime-owned instead of weak-stubbed.
- [x] Promote the original `OptionsMenu` callback owner into the linked
      `cnc-port` base `FunctionLexicon` without claiming the online/network
      settings flows behind the same source file. `zh_window_layout_script_runtime`
      now links original `GUI/GUICallbacks/Menus/OptionsMenu.cpp`, the reduced
      wasm system/input/init/update/shutdown tables register the five
      `OptionsMenu` callbacks, and the original `OptionPreferences` definitions
      replace the old `wasm_real_ini_compat.cpp` fallback. To keep first-run
      startup preference reads on browser-safe platform boundaries, original
      `Common/UserPreferences.cpp` now no-ops `load()`/`write()` under
      Emscripten until browser settings storage exists, and original
      `IPEnumeration.cpp` returns no native local addresses under Emscripten
      until LAN/GameSpy networking is ported. Startup vertical verifies all
      five callback-name lookups in the browser and now reports
      `base_function_lexicon_options_menu_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote the original offline `SkirmishMapSelectMenu` callback owner into
      the linked `cnc-port` base `FunctionLexicon`: `zh_window_layout_script_runtime`
      now links original `GUI/GUICallbacks/Menus/SkirmishMapSelectMenu.cpp`,
      and the reduced wasm system/input/init/update/shutdown tables register
      its five callback names. Startup vertical verifies all five lookups in
      the browser and now reports
      `base_function_lexicon_skirmish_map_select_menu_runtime_owned` with
      `originalFunctionLexiconRemainingShellCallbacks` next. The only new
      network-adjacent boundary is the existing `LANPreferences` browser
      fallback gaining `usesSystemMapDir()`, matching the original fresh-install
      default while LAN lobby/GameSpy ownership remains out of scope.
- [x] Promote original W3D `MOTDSystem` into the linked `cnc-port` base
      `FunctionLexicon`: the callback is owned by the already-linked
      `GameEngineDevice/Source/W3DDevice/GameClient/GUI/GUICallbacks/W3DMOTD.cpp`,
      the reduced wasm system table registers its callback name, and startup
      vertical verifies the lookup in the browser. At this frontier the
      FunctionLexicon runtime reported `base_function_lexicon_motd_runtime_owned`
      with `originalFunctionLexiconRemainingShellCallbacks` next.
- [x] Promote original `GameWinBlockInput` into the linked `cnc-port` base
      `FunctionLexicon`: the reduced wasm input table now registers the
      original callback from `GUI/GameWindow.cpp`, and
      `zh_window_layout_script_runtime` links original
      `MessageStream/SelectionXlat.cpp` so `TheSelectionTranslator` and the
      setter methods referenced by the callback come from original source
      instead of weak browser stand-ins. Startup vertical verifies the lookup
      in the browser and reports
      `base_function_lexicon_game_win_block_input_runtime_owned`.
- [x] Promote original `ControlBarObserverSystem` into the linked `cnc-port`
      base `FunctionLexicon` without claiming the broader command/radar HUD
      owner. `zh_window_layout_script_runtime` now links original
      `GUI/ControlBar/ControlBarObserver.cpp`, the reduced wasm system table
      registers `ControlBarObserverSystem`, and startup vertical verifies the
      browser lookup while the broad `ControlBarSystem`/`LeftHUDInput`
      command paths remain deferred. The FunctionLexicon frontier now reports
      `base_function_lexicon_control_bar_observer_runtime_owned`.
- [x] Promote the original command-bar/HUD callback owners into the linked
      `cnc-port` runtime and prove the real gameplay dispatch path in a live
      skirmish. The wasm runtime repairs the original `FunctionLexicon` tables
      early enough for `ControlBar.wnd` creation to bind `ControlBarSystem`,
      `LeftHUDInput`, `GeneralsExpPointsSystem`, and
      `GeneralsExpPointsInput`; `input_select_e2e.mjs` now selects a real GLA
      worker, clicks an original command-bar dozer button, enters
      `GLABarracks` placement, clicks the map, and observes original
      `GameLogicDispatch.cpp` route `MSG_DOZER_CONSTRUCT`. Verified with
      `npm --prefix WebAssembly run build:port` and
      `node WebAssembly/harness/input_select_e2e.mjs`, plus
      `node WebAssembly/harness/startup_vertical_smoke.mjs` confirming the
      FunctionLexicon frontier now has 11 missing groups; screenshot
      `WebAssembly/artifacts/screenshots/input-select-e2e.png`.
- [x] Prove live skirmish map-ground movement dispatch and state change through
      the existing e2e harness. `input_select_e2e.mjs` now queries on-screen
      local non-structure drawables after the real Skirmish Start path reaches
      active gameplay, selects a movable unit through Win32 mouse messages,
      chooses left/right move input based on `m_useAlternateMouse`, requires the
      original `CommandXlat` / `GameLogicDispatch` counters to advance through
      `MSG_DO_MOVETO` with a selected group, then steps frames and requires the
      selected unit's world position to change. Verified with local Chromium:
      `AmericaVehicleDozer#209` dispatched `MSG_DO_MOVETO` to
      `(1518.338,1885.405,18.75)` and moved from
      `(1415,1885,18.75)` to `(1493.630,1893.000,18.75)`, a 79.0 world-unit
      delta, before the existing command-bar construction proof dispatched
      `MSG_DOZER_CONSTRUCT`.
- [x] Prove live skirmish dozer construction creates a real structure object.
      `input_select_e2e.mjs` now snapshots local structure drawables before the
      command-bar click, clicks the original
      `Command_ConstructAmericaBarracks` button, places through Win32 mouse
      messages, requires the original `MSG_DOZER_CONSTRUCT` dispatch, then
      polls `queryDrawables` for a newly-created local `AmericaBarracks`.
      Verified with local Chromium:
      `E2E_BROWSER_EXECUTABLE=/home/agusx1211/.cache/ms-playwright/chromium-1228/chrome-linux/chrome E2E_BROWSER_ARGS='--headless=new' node harness/input_select_e2e.mjs`.
      The run created `AmericaBarracks#224` at screen `(759,360)`, world
      `(1244.230,329.251,18.75)`, body health `1/1000`, and ended with
      `SELECT-MOVE-COMMAND-BAR-AND-CONSTRUCTION-WORK`.
- [x] Prove live skirmish placed structures begin construction after creation.
      `input_select_e2e.mjs` now continues after finding the new local
      structure, steps real frames, re-queries the same drawable/object id, and
      requires body health to rise above its initial placement value. Verified
      with local Chromium:
      `E2E_BROWSER_EXECUTABLE=/home/agusx1211/.cache/ms-playwright/chromium-1228/chrome-linux/chrome E2E_BROWSER_ARGS='--headless=new' node harness/input_select_e2e.mjs`.
      The run selected `Slth_GLAInfantryWorker#209`, dispatched
      `Slth_Command_ConstructGLABarracks` through `MSG_DOZER_CONSTRUCT`, created
      `Slth_GLABarracks#224` at body health `1/1000`, and then observed health
      `14.333334/1000` after 180 real frames.
- [x] Disable the obsolete Win32 copy-protection self-destruct path for browser
      builds. `CopyProtection.h` now leaves `DO_COPY_PROTECTION` enabled for
      native builds but not for Emscripten, matching the browser contract where
      the game runs from user-mounted assets without a Windows launcher/CD
      handshake. This fixes the skirmish auto-lose symptom where local player
      objects disappeared after the original frame-1024 `CopyProtect::validate`
      check posted `MSG_SELF_DESTRUCT`. Verified with `npm run build:port` and
      the live skirmish production e2e below running past frame 1024 with local
      objects intact.
- [x] Prove live skirmish barracks completion and unit production through the
      original command bar. `input_select_e2e.mjs` now waits for the newly placed
      barracks to reach full health, selects the completed producer, clicks a
      real `GUI_COMMAND_UNIT_BUILD` button, requires `MSG_QUEUE_UNIT_CREATE`,
      and polls live drawables for the produced unit template. Verified with
      local Chromium:
      `E2E_BROWSER_EXECUTABLE=/home/agusx1211/.cache/ms-playwright/chromium-1228/chrome-linux/chrome E2E_BROWSER_ARGS='--headless=new' node harness/input_select_e2e.mjs`.
      The run selected `GLAInfantryWorker#209`, built `GLABarracks#224` to
      `1000/1000` health after 600 completion frames, clicked
      `Command_ConstructGLAInfantryRebel`, observed `dispatchQueueUnitCreateCount`
      advance by 1, and created local `GLAInfantryRebel#225` after 300 unit
      production frames.
- [x] Prove a produced live skirmish unit can receive a real attack-move order
      through the original command bar and input path. `input_select_e2e.mjs`
      now waits for the produced unit to settle, selects that exact drawable,
      scans all live drawables for hostile object-attack candidates, and, when
      the default live skirmish has no hostile live targets, clicks the unit's
      real `GUI_COMMAND_ATTACK_MOVE` button and requires
      `MSG_DO_ATTACKMOVETO` plus a measured unit world-position delta. The
      harness also exposes `allDrawables` and a tactical-view `lookAt` RPC for
      future object-attack framing diagnostics. Verified with local Chromium:
      `E2E_BROWSER_EXECUTABLE=/home/agusx1211/.cache/ms-playwright/chromium-1228/chrome-linux/chrome E2E_BROWSER_ARGS='--headless=new' node harness/input_select_e2e.mjs`.
      The run selected `Slth_GLAInfantryRebel#225`, found no hostile live
      skirmish targets, clicked `Command_AttackMove`, observed
      `dispatchLastMoveCommandTypeName=MSG_DO_ATTACKMOVETO`, and measured the
      produced unit moving from `(1200.830,285.852,18.75)` to
      `(1209.616,280.886,18.75)` for
      `SELECT-MOVE-CONSTRUCT-PRODUCE-AND-ATTACK-WORK
      (ATTACK-MOVE-DISPATCHED-AND-UNIT-MOVED)`.
- [x] Close the Fable command-bar in-flight follow-up. The Emscripten-only
      `FunctionLexicon::loadRuntimeTableForPort` now owns only the merged
      tables installed through that API, frees the previous injected table on
      repeat installs, and drops injected tables when `loadTable()` restores
      original static tables during `reset()`/`init()` or destruction. The
      live selection e2e now exits green on selection success while reporting
      command-bar status separately in `commandBarProof`, so a command-bar
      flake no longer hides the previously-green selection signal. The broader
      runtime-injection retirement remains tracked in TODO. Verified with
      `node --check WebAssembly/harness/input_select_e2e.mjs`, `git diff
      --check`, `npm --prefix WebAssembly run build:port`, and
      `node WebAssembly/harness/input_select_e2e.mjs` (`SELECT-AND-COMMAND-BAR-WORK
      (COMMAND-BAR-QUEUE-DISPATCHED)`).
- [x] Make the live skirmish start harness see pixels instead of only booting
      maps. `skirmish_start_smoke.mjs` now requires active matches to report
      `renderedObjectCount > 0`, samples a 12-point WebGL grid after the
      screenshot, and fails unless the canvas has visible non-black pixel
      variance. Verified with `node WebAssembly/harness/skirmish_start_smoke.mjs`
      on Alpine Assault: `renderedObjectCount=3`, 12 visible samples, 12
      unique colors, screenshot
      `WebAssembly/artifacts/screenshots/skirmish-start-smoke.png`.
- [x] Replace the stale "remaining shell callbacks" FunctionLexicon frontier
      label with a structured missing callback-owner inventory in the linked
      startup runtime. `wasm_function_lexicon_runtime` now checks callback
      names without pulling additional owners, reports
      `missingCallbackGroups` / `missingCallbackGroupCount` for save/load,
      quit menu, score-screen/replay-save, LAN/game-network menus,
      WOL/GameSpy overlays,
      direct-connect/download menus, and in-game network menus, and the startup
      harness gates that exact inventory while the first unowned init factory
      remains `createFunctionLexicon`.
- [x] Prove the original `W3DModuleFactory` runtime path in the browser startup
      frontier without pretending the earlier `FunctionLexicon` blocker is done.
      `wasm_module_factory_runtime` now constructs original `W3DModuleFactory`
      through the linked `cnc-port` surface, assigns `TheModuleFactory`, runs
      `W3DModuleFactory::init()`, and verifies public
      `ModuleFactory::findModuleInterfaceMask()` lookups for representative base
      gameplay modules (`ActiveBody`, `DestroyDie`, `InactiveBody`), the client
      update module `BeaconClientUpdate`, and W3D draw modules
      (`W3DDefaultDraw`, `W3DModelDraw`, `W3DLaserDraw`, `W3DPropDraw`).
      Startup vertical reports `moduleFactoryRuntime.status:"ready"` and marks
      the `createModuleFactory` frontier entry runtime-owned while keeping the
      first unowned init factory at `createFunctionLexicon` until the remaining
      callback graph is complete.
- [x] Prove the original `W3DParticleSystemManager` startup runtime path in the
      browser frontier. `wasm_particle_system_runtime` now links the original
      `W3DParticleSys.cpp` plus its original `W3DSnow.cpp` render-path
      dependency into `cnc-port`, constructs original
      `W3DParticleSystemManager` as `TheParticleSystemManager`, runs inherited
      `ParticleSystemManager::init()` against `Data\INI\ParticleSystem.ini`,
      and verifies public template lookups for shipped systems such as
      `TsingMaTrailSmoke`, `JetContrailThin`, `ToxinLenzflare`,
      `SmallTankStruckSmoke`, and `NukeMushroomRing`. Startup vertical reports
      `particleSystemRuntime.status:"ready"` with 1084 templates and marks
      `createParticleSystemManager` runtime-owned while still keeping the first
      unowned init factory at `createFunctionLexicon`.
---

## M3 — File / data subsystem (real data)

### File system device (Win32Device/Common → browser)
- [x] Expose the original `Common/System/FileSystem.cpp` facade through the
      main `cnc-port` browser harness state, proving local MEMFS
      create/write/info/list/read/cache behavior on every boot and archive
      fallback to `Data\INI\Armor.ini` when the runtime BIG set is registered
      before boot. This is focused facade coverage only; persistent IDBFS,
      final browser asset device ownership, and full `GameEngine::init`
      consumption remain open.
- [x] Promote the fetched browser archive registration path to a persistent
      runtime `FileSystem` ownership proof: `wasm_browser_runtime_assets`
      now exposes a harness-visible `fileProbe` proving the browser-owned
      `TheLocalFileSystem`, `TheArchiveFileSystem`, `TheFileSystem`,
      `TheNameKeyGenerator`, and `W3DFileSystem` globals; local
      create/write/info/list/read/cache through that owner; and
      `Data\INI\Armor.ini` owner/read/list/info through the same
      `Win32BIGFileSystem` archive tree when the registered archive set
      contains `INIZH.big`. The full runtime archive and range-backed startup
      browser smokes assert the proof before and after boot, while texture/mesh
      archive-only render smokes keep the startup sentinel branch unattempted.
- [x] Add a main `cnc-port` harness `mountArchive` RPC that fetches a
      user-supplied BIG into Emscripten MEMFS and verifies it through the
      original `Win32BIGFileSystem`, with browser smoke coverage for
      `INIZH.big` required INI files. This proves archive availability to the
      bootstrap only; full engine startup still needs to consume the mounted
      archive set.
- [x] Add a main `cnc-port` harness `mountArchives` RPC that fetches the
      inventoried runtime BIG set into one Emscripten MEMFS directory, verifies
      every archive plus the aggregate `*.big` archive tree through the original
      `Win32BIGFileSystem`, and exposes the mounted archive manifest in harness
      state. This proves the browser can preload the current runtime archive
      set for later engine startup; the exact minimum boot set remains open.
- [x] Register the verified runtime BIG aggregate (`directory + *.big`) in the
      wasm bootstrap's C++ state via an exported `cnc-port` archive-set hook,
      with Playwright coverage proving the engine-side state sees the mounted
      archive directory, mask, count, and byte total.
- [x] Thread mounted archive/source names through the browser archive-set hook,
      expose them in `archiveMount.archives` / `sourceArchives`, and
      harness-prove `originalEngineStartup.startupFiles.baseIniArchive.mounted`
      distinguishes the current Zero Hour-only runtime archive set from a
      mounted base `INI.big` fallback instead of inferring from missing files
      alone.
- [x] Prove the browser harness can fetch, verify, and register the runtime BIG
      set before the wasm bootstrap `boot` RPC, then boot with the archive mount
      state retained. This validates the preload-before-engine-start ordering;
      full original engine initialization still needs to consume that state.
- [x] Have the wasm bootstrap consume the registered runtime archive set during
      `boot` by probing the aggregate `directory + *.big` path through the
      original `Win32BIGFileSystem`, with Playwright coverage for the boot-time
      probe result. This is an asset-startup preflight only; full engine init
      and real INI/data parsing remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\Armor.ini` from `INIZH.big` through original
      `Common/INI.cpp::load` and `GameLogic/Object/Armor.cpp`, expose parsed
      shipped armor coefficients as `assetProbe.armor`, and require it for the
      Playwright `startupAssets.ready` state. This is a focused shipped
      armor-template preflight only; object `ArmorSet` wiring and full gameplay
      template loading remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\DamageFX.ini` from `INIZH.big` through original
      `Common/INI.cpp::load`, `Common/INI/INIDamageFX.cpp`, and
      `Common/DamageFX.cpp`, expose parsed shipped damage-FX definitions and
      throttle frames as `assetProbe.damageFX`, and require it for the
      Playwright `startupAssets.ready` state. This is a focused DamageFX
      metadata/throttle preflight only; FXList resolution/playback and object
      veterancy ownership wait for the real FXList/GameClient/renderer/audio
      and object runtime.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\FXList.ini` from `INIZH.big` through original
      `Common/INI.cpp::load` and `GameClient/FXList.cpp`, expose parsed
      shipped FX-list metadata as `assetProbe.fxList`, and require it for the
      Playwright `startupAssets.ready` state. This is a focused FXList
      metadata preflight only; live FX playback still waits for browser
      renderer/audio/object ownership.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\ParticleSystem.ini` and `Data\INI\Weapon.ini` from `INIZH.big`
      through original `Common/INI.cpp::load`, `INIParticleSys.cpp`,
      `INIWeapon.cpp`, `GameClient/System/ParticleSys.cpp`, and
      `GameLogic/Object/Weapon.cpp`, expose parsed shipped weapon metadata as
      `assetProbe.weapon`, and require it for the Playwright
      `startupAssets.ready` state. This is a focused weapon-template metadata
      preflight only; live projectile creation, firing, delayed damage, FX/OCL
      playback, and object/weapon-set ownership remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\Default\AIData.ini` and optional `Data\INI\AIData.ini`
      overrides from the mounted runtime BIG set through original
      `Common/INI.cpp::load`, `INIAiData.cpp`, `GameLogic/AI/AI.cpp`, and
      `GameLogic/Map/SidesList.cpp`, expose parsed shipped AIData metadata as
      `assetProbe.aiData`, and require it for the Playwright
      `startupAssets.ready` state. This is a focused AI metadata/build-list
      preflight only; live AI updates and pathfinder ownership remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\Locomotor.ini` from `INIZH.big` through original
      `Common/INI.cpp::load` and `GameLogic/Object/Locomotor.cpp`, expose
      parsed shipped Locomotor metadata as `assetProbe.locomotor`, and require
      it for the Playwright `startupAssets.ready` state. This is a focused
      locomotor-template metadata preflight only; live locomotor updates,
      physics, pathing, and object movement ownership remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\Science.ini` from the mounted runtime BIG set through original
      `Common/INI.cpp::load` and `Common/RTS/Science.cpp`, expose parsed
      shipped science metadata as `assetProbe.science`, and require it for the
      Playwright `startupAssets.ready` state. This is a focused science-store
      metadata preflight only; player-owned purchase/prerequisite checks remain
      open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\SpecialPower.ini` from the mounted runtime BIG set through
      original `Common/INI.cpp::load`, `Common/INI/INISpecialPower.cpp`,
      `Common/RTS/SpecialPower.cpp`, `Common/RTS/Science.cpp`, and
      `Common/RTS/AcademyStats.cpp`, expose parsed shipped special-power
      metadata as `assetProbe.specialPower`, and require it for the Playwright
      `startupAssets.ready` state. This is a focused shipped special-power
      preflight only; default-file layering, audio metadata lookup/playback,
      control-bar ownership, and actual power execution remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\PlayerTemplate.ini` from the mounted runtime BIG set through
      original `Common/INI.cpp::load`, `Common/RTS/PlayerTemplate.cpp`,
      `Common/RTS/Science.cpp`, and `GameText.cpp`, expose parsed shipped
      player-template metadata as `assetProbe.playerTemplate`, and require it
      for the Playwright `startupAssets.ready` state. This is a focused
      shipped player-template preflight only; default-file layering,
      mapped-image resolution, command-button/control-bar ownership, and full
      match setup remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\MappedImages` directories from `INIZH.big` through original
      `Common/INI.cpp::loadDirectory`, `Common/INI/INIMappedImage.cpp`, and
      `GameClient/Image.cpp`, expose parsed shipped image metadata as
      `assetProbe.mappedImages`, and cover 14 mapped-image INI files, 1,186
      image definitions, packed UVs, and rotated image status in Playwright.
      This is a mapped-image metadata preflight only; texture upload and UI
      rendering still need the browser renderer.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\Default\ControlBarScheme.ini` and
      `Data\INI\ControlBarScheme.ini` from `INIZH.big` through original
      `Common/INI.cpp::load`, `Common/INI/INIControlBarScheme.cpp`,
      `GameClient/GUI/ControlBar/ControlBarScheme.cpp`, and
      `GameClient/Image.cpp`, expose parsed default and faction scheme
      metadata as `assetProbe.controlBarScheme`, and require it for the
      Playwright `startupAssets.ready` state. This is a focused shipped
      control-bar scheme preflight only; command-bar rendering, ControlBar UI
      ownership, and unresolved optional image references remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\multiplayer.ini` from `INIZH.big` through original
      `Common/INI.cpp::load`, `Common/INI/INIMultiplayer.cpp`,
      `Common/MultiplayerSettings.cpp`, `Common/RTS/Money.cpp`, and
      `GameNetwork/GameSpy/Chat.cpp`, expose parsed shipped multiplayer
      settings as `assetProbe.multiplayer`, and require it for the Playwright
      `startupAssets.ready` state. This is a focused shipped multiplayer
      settings preflight only; LAN/GameSpy lobby flow, player templates, and
      network setup remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\Terrain.ini` from `INIZH.big` through original
      `Common/INI.cpp::load`, `Common/INI/INITerrain.cpp`, and
      `Common/TerrainTypes.cpp`, expose parsed shipped terrain metadata as
      `assetProbe.terrain`, and require it for the Playwright
      `startupAssets.ready` state. This is a focused shipped terrain-type
      preflight only; map terrain loading and W3D terrain rendering remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\Roads.ini` from `INIZH.big` through original
      `Common/INI.cpp::load`, `Common/INI/INITerrainRoad.cpp`,
      `Common/INI/INITerrainBridge.cpp`, and `GameClient/TerrainRoads.cpp`,
      expose parsed shipped road/bridge metadata as `assetProbe.terrainRoads`,
      and require it for the Playwright `startupAssets.ready` state. This is a
      focused shipped terrain-road/bridge preflight only; map road placement,
      bridge gameplay integration, and W3D terrain/bridge rendering remain open.
- [x] Extend the wasm bootstrap archive preflight to load the real English
      CSF through original `GameText.cpp` and expose `assetProbe.gameText`,
      with Playwright coverage for the CSF file, known labels, and
      `CONTROLBAR:` label enumeration. This is a GameText asset preflight only;
      full original GameText startup and language/font initialization remain
      open.
- [x] Extend the wasm bootstrap archive preflight to read real
      `Data\INI\GameData.ini` through the original `Win32BIGFileSystem` /
      `FileSystem` archive path and original `Common/INI.cpp::load`, expose
      shipped `GameData` values from original `GlobalData.cpp` as
      `assetProbe.gameData`, and cover the single-archive and registered
      runtime-archive boot paths in Playwright. This is a focused `GameData`
      preflight only; full all-block original INI loading remains open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\Water.ini` from `INIZH.big` through original
      `Common/INI.cpp::load`, `Common/INI/INIWater.cpp`, and
      `GameClient/Water.cpp`, expose parsed shipped water settings as
      `assetProbe.water`, and require it for the Playwright
      `startupAssets.ready` state. This is a focused shipped water-settings
      preflight only; full default+shipped startup CRC coverage, map overrides /
      `TerrainVisual` skybox replacement, and W3D water rendering remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\Weather.ini` from `INIZH.big` through original
      `Common/INI.cpp::load` and `GameClient/Snow.cpp`, expose parsed snow
      settings as `assetProbe.weather`, and require it for the Playwright
      `startupAssets.ready` state. This is a focused shipped weather-settings
      preflight only; full startup CRC coverage, map overrides, and snow
      rendering remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\Video.ini` from `INIZH.big` through original
      `Common/INI.cpp::load`, `Common/INI/INIVideo.cpp`, and
      `GameClient/VideoPlayer.cpp`, expose parsed shipped video registry
      metadata as `assetProbe.video`, and require it for the Playwright
      `startupAssets.ready` state. This is a focused shipped video-registry
      preflight only; `Data\INI\Default\Video.ini`, Bink/WebCodecs playback,
      audio sync, and video-to-texture rendering remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Maps\MapCache.ini` from the registered runtime archive set through the
      original `Common/INI.cpp::load` and `Common/INI/INIMapCache.cpp`, expose
      shipped map-cache counts and known map entries as `assetProbe.mapCache`,
      and require it for the Playwright `startupAssets.ready` state. This is a
      shipped map-cache load preflight only; live user-map scanning/rebuilds and
      full map loading remain open.
- [x] Extend the wasm bootstrap archive preflight to load real
      `Data\INI\ChallengeMode.ini` from `INIZH.big` through original
      `Common/INI.cpp::load` and `GameClient/GUI/ChallengeGenerals.cpp`, expose
      shipped general-challenge personas as `assetProbe.challengeMode`, and
      cover the single-archive and registered runtime-archive browser smoke
      paths. This is a focused challenge-persona data preflight only; the
      challenge menu flow, campaign setup, and audio/video presentation remain
      open.
- [x] Link original `Win32Device/Common/Win32CDManager.cpp` into the wasm
      bootstrap and harness-test `CreateCDManager()->init()` against the
      browser Win32 drive shims, proving startup reaches a no-CD-drives state
      without blocking. This is the CD-manager device preflight only; the
      GameClient CD-check prompts still need to route through browser asset
      readiness instead of physical media.
### Data load with original code
- [x] Shipped armor templates load from real `Data\INI\Armor.ini` through
      original `Common/INI.cpp::load` and `GameLogic/Object/Armor.cpp`, with
      harness state proving `NoArmor`, `HumanArmor`, and `TankArmor` damage
      coefficients through original `ArmorTemplate::adjustDamage`.
- [x] Shipped DamageFX definitions load from real `Data\INI\DamageFX.ini`
      through original `Common/INI.cpp::load`,
      `Common/INI/INIDamageFX.cpp`, and `Common/DamageFX.cpp`, with harness
      state proving `DefaultDamageFX`, `TankDamageFX`, `SmallTankDamageFX`,
      `StructureDamageFX`, and `InfantryDamageFX` plus parsed frame throttle
      values for selected damage types.
- [x] Shipped FX lists load from real `Data\INI\FXList.ini` through original
      `Common/INI.cpp::load` and `GameClient/FXList.cpp`, with harness state
      proving 428 shipped FX lists plus nugget counts for
      `WeaponFX_ToxinShellWeapon`, `FX_CarOverlappedByCrusher`,
      `FX_DamageTankStruck`, `WeaponFX_MOAB_Blast`, and
      `FX_BunkerBusterExplosion`.
- [x] Shipped object creation lists load from real
      `Data\INI\ObjectCreationList.ini` through original `Common/INI.cpp::load`
      and `GameLogic/Object/ObjectCreationList.cpp` in the wasm metadata-only
      probe, after loading real FXList, Weapon, and ParticleSystem dependencies;
      browser harness state proves 281 shipped OCL definitions, 704 nuggets, and
      sampled entries for firewall segments, technical crush effects, Daisy
      Cutter, Scud Storm, and Sneak Attack tunnel creation.
- [x] Shipped weapon templates load from real `Data\INI\Weapon.ini` through
      original `Common/INI.cpp::load`, `Common/INI/INIWeapon.cpp`, and
      `GameLogic/Object/Weapon.cpp`, after loading real
      `Data\INI\ParticleSystem.ini` through `INIParticleSys.cpp` and
      `ParticleSys.cpp`; full runtime-archive harness state proves 1,084
      particle templates plus Ranger, Crusader, and Tomahawk weapon damage,
      range, delay, clip, death/damage type, fire-sound, and projectile-exhaust
      metadata.
- [x] Shipped science metadata loads from real `Data\INI\Science.ini` through
      original `Common/INI.cpp::load` and `Common/RTS/Science.cpp`, with full
      runtime-archive harness state proving 95 science definitions, base/rank
      science lookup, Paladin purchase/grantable metadata, and translated
      display/description labels.
- [x] Shipped special-power templates load from real
      `Data\INI\SpecialPower.ini` through original `Common/INI.cpp::load`,
      `Common/INI/INISpecialPower.cpp`, `Common/RTS/SpecialPower.cpp`,
      `Common/RTS/Science.cpp`, and `Common/RTS/AcademyStats.cpp`, with full
      runtime-archive harness state proving 79 powers plus Daisy Cutter,
      Carpet Bomb, Crate Drop, Neutron Missile, and Scud Storm fields.
- [x] Shipped player templates load from real
      `Data\INI\PlayerTemplate.ini` through original `Common/INI.cpp::load`,
      `Common/RTS/PlayerTemplate.cpp`, `Common/RTS/Science.cpp`, and
      `GameText.cpp`, with full runtime-archive harness state proving 15
      templates/sides plus America, Observer, Air Force General, and Boss
      template fields.
- [x] Shipped multiplayer settings load from real
      `Data\INI\multiplayer.ini` through original `Common/INI.cpp::load`,
      `Common/INI/INIMultiplayer.cpp`, `Common/MultiplayerSettings.cpp`,
      `Common/RTS/Money.cpp`, and `GameNetwork/GameSpy/Chat.cpp`, with harness
      state proving countdown/beacon/shroud flags, 8 multiplayer colors, 4
      starting-money choices/default, and selected online chat colors.
- [x] Shipped terrain types load from real `Data\INI\Terrain.ini` through
      original `Common/INI.cpp::load`, `Common/INI/INITerrain.cpp`, and
      `Common/TerrainTypes.cpp`, with harness state proving 247 terrain
      collection entries plus selected transition/asphalt/desert/beach/snow
      classes and textures.
- [x] Shipped terrain-road and bridge definitions load from real
      `Data\INI\Roads.ini` through original `Common/INI.cpp::load`,
      `Common/INI/INITerrainRoad.cpp`, `Common/INI/INITerrainBridge.cpp`, and
      `GameClient/TerrainRoads.cpp`, with harness state proving 63 roads,
      27 bridges, selected two-lane/four-lane/dirt-road fields, and the
      Concrete bridge model/texture/FX metadata.
- [x] Replace `assetProbe.gameData`'s scalar preflight with full original
      `Common/INI.cpp::load` over real `GameData.ini` once the linked runtime
      can use the real INI reader and singleton surfaces instead of the
      target-local `Common/INI.h` compatibility bridge.
- [x] Shipped water settings load from real `Data\INI\Water.ini` through
      original `Common/INI.cpp::load`, `Common/INI/INIWater.cpp`, and
      `GameClient/Water.cpp`, with harness state proving parsed morning/night
      textures, repeat/scroll/sky texel fields, standing-water texture,
      transparency depth/min-opacity, and additive-blending flag.
- [x] Shipped weather settings load from real `Data\INI\Weather.ini` through
      original `Common/INI.cpp::load` and `GameClient/Snow.cpp`, with harness
      state proving parsed snow texture, enabled flag, point-sprite flag, and
      numeric snow fields.
- [x] Shipped video registry loads from real `Data\INI\Video.ini` through
      original `Common/INI.cpp::load`, `Common/INI/INIVideo.cpp`, and
      `GameClient/VideoPlayer.cpp`, with harness state proving 41 registered
      videos and the shipped `Sizzle` / `sizzle_review` entry.
- [x] Shipped map cache loads from real `MapsZH.big` through original
      `Common/INI.cpp::load` and `INIMapCache.cpp`, with harness state proving
      parsed map counts plus known ShellMapMD and Tournament Desert entries.
- [x] Harness state query: dump parser/template/map/string counts via
      `dataSummary` state to prove data loaded.
- [x] Link the real `ThingFactory`/`ThingTemplate` object-template surface
      into `cnc-port` and parse the real shipped Object INI set: new
      `zh_gameengine_real_object_ini_runtime` links original
      `ModuleFactory.cpp` + `W3DModuleFactory.cpp` (full 205+19 module
      registrations), `W3DThingFactory/ThingFactory/ThingTemplate/Thing/
      Module/DrawModule/INIObject`, `Science`, `ProductionPrerequisite`, and
      the ~310-source module link closure (all GameLogic behavior modules,
      all 19 W3D draw modules, `Object.cpp`, `Drawable.cpp`, Player/Team/AI
      state machines, `PartitionSolver`, W3D shadow/view/tracks). The
      `wasm_object_ini_runtime.cpp` driver mirrors `GameEngine.cpp:482`
      (`initSubsystem(TheThingFactory, createThingFactory(), &xferCRC,
      "Data\\INI\\Default\\Object.ini", NULL, "Data\\INI\\Object")`) over
      real subsystem stores brought up in init order. `test:object-ini`
      proves in headless Chromium: `Data\INI\Default\Object.ini` plus all 43
      `Data\INI\Object\*.ini` parse through real
      `INI::parseObjectDefinition` into 2,099 `ThingTemplate`s with live
      `XferCRC`, and `findTemplate` lookups verified against real INI data
      (`AmericaVehicleHumvee`, `GLAInfantryRebel`, `AmericaJetRaptor`,
      `ChinaTankOverlord`, `DefaultThingTemplate`) including
      side/cost/KindOf spot checks and module-registration checks.
      `ThingFactory::newObject/newDrawable` stay elided under
      `WASM_REAL_INI_THING_FACTORY_METADATA_ONLY` until the running match
      subsystems link (follow-up in `TODO.md`); ThingFactory/Radar/
      UserPreferences probe stubs were deleted in favor of the real sources.
- [x] Make the `test:object-ini` browser harness bounded and range-backed.
      `harness/object_ini_smoke.mjs` now mounts a 54-entry synthesized
      `INIZH.big` subset (10 prerequisite subsystem INIs, default
      `Object.ini`, and all 43 `Data\INI\Object\*.ini` files) through
      `mountRangeBackedArchiveSet` instead of full-archive `mountArchive`,
      wraps page load/RPC boot/archive/object-probe steps in explicit
      timeouts with captured browser console/page-error context, and reports
      subset bytes/entry count in the JSON result. Verified with
      `npm --prefix WebAssembly run test:object-ini`, proving the original
      `Win32BIGFileSystem` + `INI::loadDirectory` path still parses 2,099
      templates from the real 43-file object set.
- [x] Promote the shipped object-template parse proof into the startup vertical
      archive-backed path. `startup_vertical_smoke.mjs` now mounts all 43
      shipped `Data\INI\Object\*.ini` definitions in its runtime archive set,
      invokes the existing `probeObjectIni` RPC after the archive-backed boot,
      and requires the real `W3DThingFactory` / `ThingFactory` / `INI.cpp`
      object path to parse 2,099 templates plus representative
      `AmericaVehicleHumvee`, `GLAInfantryRebel`, `AmericaJetRaptor`, and
      `ChinaTankOverlord` lookups. The startup frontier still honestly reports
      `createFunctionLexicon` as the first unowned factory, so this is
      post-particle gameplay/data evidence rather than a premature
      `GameEngine.cpp:482` ownership claim.

---

## M4 — First pixels (W3D → WebGL2)

### WW3D2 device bring-up
- [x] Add a focused browser D3D8 runtime shim for `Direct3DCreate8`,
      `CreateDevice`, surface descriptors, viewport state, `BeginScene`,
      `Clear`, `EndScene`, and `Present`, with a wasm smoke proving the first
      device-clear path can be observed through probe counters. This is a D3D8
      factory/device slice only; original `DX8Wrapper::Init` still needs
      target-scoped loader wiring and real WebGL2 draw calls.
- [x] Extend the browser D3D8 shim smoke to cover the CPU-backed resource
      surface: `CreateTexture` level-0 `GetLevelDesc`/`GetLevelCount`/descriptor
      (size, format, type), `LockRect`/`UnlockRect` non-null `pBits` and
      pitch plus sub-rect offset and out-of-range level rejection;
      `CreateVertexBuffer`/`CreateIndexBuffer` `Lock`/`Unlock` with offset/size
      and `size==0` whole-tail semantics plus oversized/out-of-range rejection;
      and the matching `create_texture_calls`/`texture_*rect_calls`/
      `create_*buffer_calls`/`buffer_*calls` probe counters. This is direct
      D3D8 CPU-backed resource coverage only — there are no GL/WebGPU texture or
      buffer uploads in the current shim; those wait for the real WebGL2 render
      device.
- [x] Store D3D8 fixed-function state in the browser shim for
      `SetTransform`/`GetTransform`, `SetViewport`/`GetViewport`, and basic
      `SetRenderState`/`GetRenderState`, with focused smoke coverage for
      matrix round-trips, identity defaults, viewport readback, render-state
      defaults, and probe counters. This is CPU-side state bookkeeping only;
      it does not yet apply those states to WebGL2.
- [x] Implement D3D8 `MultiplyTransform` state mutation in the browser shim
      instead of returning success without changing the transform table. The
      shim now left-multiplies the supplied matrix against the current
      transform, uses identity for unset transform slots, and focused smoke
      coverage verifies `GetTransform` readback plus draw-captured view and
      texture transform matrices before the WebGL2 bridge consumes them.
- [x] Route D3D8 `SetViewport` from the browser shim into the WebGL2 bridge.
      The JS side now scales D3D render-target coordinates into the current
      drawing buffer, applies `gl.viewport`, `gl.scissor`, and `gl.depthRange`,
      reapplies that state before D3D indexed draws, and restores full-canvas
      GL state for generic harness clears/snapshots. A focused
      `d3d8Viewport` RPC proves a sub-rect viewport with non-default
      `MinZ`/`MaxZ`, and the Playwright scene/camera smoke proves original
      `CameraClass::Apply` reaches the browser viewport bridge through the real
      WW3D render path.
- [x] Wire original `WW3D2/dx8wrapper.cpp` D3D8 DLL loading through a
      target-scoped wasm loader hook, with smoke coverage proving
      `DX8Wrapper::Init` reaches `LoadLibrary("D3D8.DLL")`,
      `GetProcAddress("Direct3DCreate8")`, the browser D3D8 factory, adapter
      enumeration, and clean shutdown without enabling the hook for unrelated
      Win32 shim users. This is original loader/init coverage only; the
      original render-device clear still needs WebGL2-backed device behavior.
- [x] Drive the original WW3D render-device path through
      `WW3D::Set_Render_Device`, `DX8Wrapper::Begin_Scene`, `Clear`,
      `End_Scene`, and `Present`, with focused wasm smoke coverage proving the
      browser D3D8 shim now supports the original missing-texture init
      (`CreateTexture`, `LockRect`, `UnlockRect`) and fixed index-buffer
      allocation/locking needed for device-dependent WW3D startup. This is
      wrapper-to-D3D-shim clear coverage only; vertex buffers, real WebGL2
      buffer uploads, texture uploads, and visible GL draws remain open.
- [x] Drive an original in-memory `AABoxRenderObjClass` through
      `WW3D::Begin_Render`, `WW3D::Render`, and `WW3D::End_Render`, with smoke
      coverage proving the wrapper now reaches dynamic vertex/index-buffer
      allocation, stream/index binding, and `DrawIndexedPrimitive` for a
      triangle-list object render while thumbnail texture maintenance is disabled
      in the smoke. This is still no-op D3D8 draw bookkeeping; texture-loader
      frame maintenance, real WebGL2 buffer uploads, shader/state mapping, and
      visible geometry remain open.
- [x] Capture bridge-ready draw data from the browser D3D8 shim by retaining the
      bound stream/index buffers, index format, draw byte ranges, and deterministic
      checksums for the original AABox `DrawIndexedPrimitive` path. This proves
      the WebGL2 upload path can read the actual WW3D-filled vertex/index backing
      stores; it still does not create GL buffers or render visible geometry.
- [x] Bridge the browser D3D8 shim `Clear(D3DCLEAR_TARGET)` path into the harness
      WebGL2 context through the Emscripten module callback, with a wasm-exported
      D3D8 clear probe and Playwright screenshot/pixel coverage proving the
      actual `IDirect3DDevice8::Clear` path paints the canvas.
- [x] Upload the current indexed draw's original WW3D-filled vertex/index byte
      ranges to temporary WebGL2 buffers from the browser D3D8 shim, with a
      wasm-exported original `AABoxRenderObjClass` render probe and Playwright
      screenshot/center-pixel coverage proving the real `DrawIndexedPrimitive`
      path paints visible untextured geometry. This is a first bridge proof only;
      persistent GL buffer ownership, textures, fixed-function state, matrices,
      and shader translation remain open.
- [x] Forward the original D3D world/view/projection transform state captured at
      `DrawIndexedPrimitive` into the browser WebGL2 draw shader, with the
      original AABox render probe and Playwright harness proving the three
      transform matrices are captured (`transformMask == 7`) and used by the
      draw bridge. This applies the current fixed-function transform path for
      untextured AABox geometry only; full matrix stack, viewport/camera, and
      scene coverage remain open.
- [x] Give D3D8 vertex/index buffer resources stable browser buffer IDs and
      persistent WebGL2 buffer ownership, with `Unlock` uploading the
      WW3D-filled backing stores and `Release` deleting the cached GL buffers.
      The original AABox render probe and Playwright harness now prove nonzero
      buffer IDs, browser create/update notifications, and
      `usedPersistentBuffers == true` for the real `DrawIndexedPrimitive` path.
- [x] Track D3D8 lock dirty ranges through the persistent browser buffer bridge
      so `Unlock` uploads only the touched byte range with a destination
      `byteOffset`. The focused D3D8 smoke now covers subrange/tail uploads plus
      invalid nested/stray lock calls, and the Playwright harness proves nonzero
      `gl.bufferSubData` offsets reach WebGL through the `d3d8BufferDirty` RPC.
- [x] Use D3D8 usage/lock hints to pick WebGL buffer usage and
      streaming/orphaning behavior for dynamic buffers instead of treating all
      updates as `DYNAMIC_DRAW` bufferSubData writes. The bridge now maps
      non-dynamic write-only buffers to `STATIC_DRAW`, dynamic buffers to
      `STREAM_DRAW`, and dynamic `D3DLOCK_DISCARD` updates to an orphaning
      `bufferData` call before `bufferSubData`, with focused C++ smoke coverage
      for usage/lock flag propagation and Playwright `d3d8BufferHints` coverage
      proving static/stream usage choices plus dynamic discard orphaning in
      WebGL.
- [x] Add focused texture upload *expectations* coverage through the
      existing browser D3D8 shim (no shim or draw-bridge changes): a new
      `d3d8-texture-upload-readiness-smoke` records the per-format texture
      surface round-trip (`CreateTexture`, mip-level dimension halving,
      per-format `LockRect` pitch, pixel write/read round-trip, sub-rect
      `pBits` offset, `GetSurfaceLevel` AddRef) for the runtime uncompressed
      formats (`A8R8G8B8`, `X8R8G8B8`, `R5G6B5`, `A1R5G5B5`, `A4R4G4B4`,
      `A8`, `L8`, `A8L8`), DXT block-compressed CPU surfaces (`DXT1`,
      `DXT3`, `DXT5`) with `ceil(w/4)*ceil(h/4)*blockBytes` sizing and
      partial-rect lock rejection, and emits a machine-readable D3D8→WebGL2
      texture format mapping spec (per-format GL internalformat/format/type,
      B/R byte-swizzle for ARGB DWORD formats, RGBA8 expansion for the
      ARGB-MSB 16-bit/palette formats, GL_R8/GL_RG8 plus shader
      channel-reconstruction swizzle for A8/L8/A8L8, and
      WEBGL_compressed_texture_s3tc targets with block-byte sizing for
      DXT1/DXT3/DXT5) that the future real DDS/DXT→GL texture upload task
      must satisfy.
- [x] Add the first browser WebGL2 texture-resource bridge for D3D8
      `CreateTexture` / `LockRect` / `UnlockRect` / `Release`, with stable
      browser texture IDs, dirty sub-rect row compaction, uncompressed
      D3D8-format byte conversion (`A8R8G8B8`, `X8R8G8B8`, RGB565, packed
      16-bit ARGB/XRGB, A8/L8/A8L8), explicit unsupported reporting for
      palette formats, and Playwright harness coverage proving full and
      sub-rect uploads reach WebGL and sample back with correct B/R swizzle and
      XRGB opaque alpha. This still does not bind textures into the original
      WW3D draw path or solve real DDS/DXT asset payload upload.
- [x] Add the first D3D8 `SetTexture` → browser WebGL2 bind route for uploaded
      2D textures, with native stage/id counters, null-bind handling, JS
      bound-stage tracking, release-time unbind cleanup, preserved WebGL active
      texture state around uploads, and Playwright harness coverage proving
      stage 0/1 binds, explicit null bind, and release cleanup. This still does
      not translate texture-stage combiner state, sampler state, or sample the
      bound texture in the draw shader.
- [x] Audit and match D3D8 `SetTexture` bound-resource lifetime/reference
      semantics before relying on textures that remain bound across `Release`
      or device reset; the current browser bridge tracks texture IDs and
      release cleanup only.
      *Implemented (GLM-5.2) at the C++ device seam: `BrowserD3DDevice::SetTexture`
      now holds a device reference on the bound texture (AddRef on bind, Release
      the previously-bound on rebind/null), and `~BrowserD3DDevice` Releases
      every still-bound texture on teardown — matching the Microsoft
      `IDirect3DDevice8::SetTexture` contract and the WW3D
      `DX8Wrapper::Set_DX8_Texture`/`Invalidate_Cached_Render_States` shadow.
      A texture still bound now survives the engine releasing its own handle.
      Covered by `tests/d3d8_texture_lifetime_smoke.cpp`
      (`npm run test:d3d8-texture-lifetime`). The JS-side WebGL texture-handle
      release cleanup in `harness/bridge.js` is unchanged and remains covered
      by the `d3d8TextureBind` Playwright RPC.*
      *Hardened (GLM-5.2) the raw same-pointer rebind edge
      (`device->SetTexture(stage, sameTexture)` called repeatedly). The
      unconditional Release-then-AddRef path was fragile when the device-held
      reference was the only remaining reference (engine already released its
      handle): the mid-call `Release` would drop the last reference, destroy
      the object, and the subsequent `AddRef`/vtable lookup touched freed
      memory (observed as a wasm `table index is out of bounds` trap without
      the fix). Added the same-pointer early-return at the top of
      `BrowserD3DDevice::SetTexture`, mirroring the original
      `DX8Wrapper::Set_DX8_Texture` (`if (Textures[stage]==texture) return;`)
      and D3D8 device semantics. Extended `d3d8_texture_lifetime_smoke.cpp`
      with a section that repeatedly rebinds the same pointer (true no-op:
      refcount and `set_texture_calls`/`browser_texture_bind_calls` unchanged)
      and exercises the critical device-only-held-reference rebind that would
      UAF without the guard.*
- [x] Add the first browser WebGL2 stage-0 textured draw path for uploaded and
      bound 2D textures through the existing persistent-buffer
      `DrawIndexedPrimitive` bridge, with a focused D3D8 textured-quad probe,
      `VertexFormatXYZNDUV*` UV0 offset handling, shader sampling that
      multiplies the existing diffuse color, and Playwright center-pixel
      coverage proving a red uploaded texture is sampled. This is still a
      harness bridge slice only: no generalized FVF declaration decoding,
      sampler-state translation, texture-stage combiner mapping, multi-stage
      blending, or original textured mesh/menu rendering yet.
- [x] Implement browser-backed D3D8 user-memory primitive draws. The shim now
      supports `DrawPrimitiveUP` and `DrawIndexedPrimitiveUP` by uploading the
      caller's transient vertex/index data into reusable browser buffers,
      preserving D3D8's stream/index clearing side effects and routing both
      paths through the existing WebGL2 indexed draw bridge. Added
      `d3d8UserPointerDraw` RPC/smoke coverage: a browser Playwright run
      verifies two UP draws reach WebGL, produce a colored center pixel, and
      reuse two transient buffers without public `SetStreamSource`/`SetIndices`
      calls. This unblocks original W3D paths that use UP draws for shader
      manager, smudge, scene overlay, and volumetric-shadow quads.
- [x] Implement browser-backed D3D8 non-indexed and point-sprite draws. The
      shim now routes bound-buffer `DrawPrimitive` calls through the existing
      WebGL2 indexed bridge using an internal sequential index buffer without
      mutating public `SetIndices` state, and the browser shader path captures
      DX8 point render states (`POINTSIZE`, min/max, sprite/scaling flags, and
      scale coefficients) so `D3DPT_POINTLIST` sprites sample textures through
      `gl_PointCoord` even when the FVF has no UVs. Added
      `d3d8NonindexedDraw` and `d3d8PointSpriteDraw` RPC/smoke coverage: a
      browser Playwright run verifies a triangle strip and a textured point
      sprite reach WebGL, sample expected pixels, and report point-sprite
      render-state metadata. This unblocks original W3D paths such as
      `W3DSnow.cpp` that draw texture-backed point lists through fixed-function
      point-sprite state.
- [x] Capture D3D8 `SetTextureStageState` writes through the current
      `DrawIndexedPrimitive` bridge payload, including combiner arguments,
      texture-coordinate index, address modes, and min/mag/mip filters for all
      eight stages, with native D3D8 smoke coverage plus Playwright textured-quad
      assertions proving stage 0/1 state reaches the browser draw probe. This is
      observability only: GL sampler application, fixed-function combiner
      emulation, and multi-stage blending remain open.
- [x] Apply captured D3D8 stage-0 sampler state to the current WebGL2 textured
      draw path, mapping `D3DTSS_MINFILTER`/`MAGFILTER`/`MIPFILTER` and
      `ADDRESSU`/`ADDRESSV` to WebGL texture parameters, with Playwright
      textured-quad assertions proving `LINEAR` min, `NEAREST` mag, `CLAMP`
      U, and `WRAP` V reach the bound GL texture. This still does not emulate
      fixed-function combiner ops, multi-stage sampling, texture transforms, or
      general mip-chain completeness.
- [x] Add the first WebGL2 fixed-function texture combiner subset for the
      current stage-0 draw bridge, applying captured `D3DTSS_COLOROP`,
      `COLORARG1`, and `COLORARG2` for `DISABLE`, `SELECTARG1`,
      `SELECTARG2`, `MODULATE`, and `ADD` over `DIFFUSE`/`CURRENT`/`TEXTURE`
      arguments. A new browser-driven D3D8 combiner probe renders distinct
      texture-select, diffuse-select, modulate, and add cases and verifies the
      resulting center pixels through Playwright. Full multi-stage chaining,
      generated shader variants, texture transforms, and non-stage-0 sampling
      remain open.
- [x] Add the stage-0 D3D8 alpha texture combiner subset for the current
      WebGL2 draw bridge, splitting the fragment shader into separate RGB
      (`D3DTSS_COLOROP`/`COLORARG1`/`COLORARG2`) and alpha
      (`D3DTSS_ALPHAOP`/`ALPHAARG1`/`ALPHAARG2`) paths for `DISABLE`,
      `SELECTARG1`, `SELECTARG2`, `MODULATE`, and `ADD` over
      `DIFFUSE`/`CURRENT`/`TEXTURE` arguments, matching D3D8 fixed-function
      texture-stage semantics (color and alpha ops are independent). The
      existing browser-driven D3D8 combiner probe is extended with four
      alpha-combiner cases (`selectAlphaTexture`, `selectAlphaDiffuse`,
      `modulateAlpha`, `addAlpha`) that drive the alpha output through
      non-trivial texture/diffuse alpha values and verify the result through
      alpha blending (`SRCALPHA`/`INVSRCALPHA`) against an opaque black clear,
      since the WebGL canvas is itself opaque (`alpha:false`). Playwright
      harness coverage proves each alpha op produces the expected center pixel.
      RGB and alpha combiner independence, multi-stage chaining, generated
      shader variants, texture transforms, and non-stage-0 sampling remain open.
- [x] Apply the D3D8 texture argument modifier bits `D3DTA_COMPLEMENT` and
      `D3DTA_ALPHAREPLICATE` in the current stage-0 WebGL2 fixed-function
      combiner path for both color and alpha arguments. The browser combiner
      probe now covers color complement, color alpha-replication, combined
      alpha-replication plus complement, and alpha complement through
      `SRCALPHA` blending, with Playwright center-pixel assertions proving the
      shader applies the modifiers.
- [x] Apply captured `D3DRS_TEXTUREFACTOR` / `D3DTA_TFACTOR` as a source in the
      current stage-0 WebGL2 fixed-function combiner path, including color
      selection, texture-factor modulation, alpha selection through
      `SRCALPHA` blending, and `ALPHAREPLICATE` on the texture factor. The
      browser combiner probe now verifies the captured render-state value
      reaches the shader and produces the expected center pixels.
- [x] Apply stage-0 `D3DTSS_COLORARG0` / `D3DTSS_ALPHAARG0` as the third
      operand for `D3DTOP_MULTIPLYADD` in the current WebGL2 fixed-function
      combiner path. The browser combiner probe now covers the original
      grayscale-style `COLORARG0 = TFACTOR | ALPHAREPLICATE` setup and an
      `ALPHAARG0` variant observed through `SRCALPHA` blending, with
      center-pixel assertions that catch incorrect operand ordering.
- [x] Apply the original grayscale 2D stage pattern through the current WebGL2
      fixed-function combiner bridge by correcting `D3DTOP_MULTIPLYADD` to
      D3D's `ARG0 + ARG1 * ARG2` operand order and adding stage-1
      `D3DTOP_DOTPRODUCT3` over `CURRENT` and `TFACTOR`. The combiner probe now
      renders a non-red texture through the same stage-0/stage-1 setup used by
      original render2d/W3D grayscale code and verifies the luma center pixel.
- [x] Extend the fixed-function texture combiner bridge beyond the current
      stage-0 `DIFFUSE`/`CURRENT`/`TEXTURE` subset to cover `RESULTARG` and
      `D3DTA_TEMP`, with focused browser probes proving `RESULTARG=TEMP`
      preserves `CURRENT` and stage 1 can read `TEMP`. Broader terrain
      rendering remains blocked on the later multi-texture terrain path.
- [x] Extend the WebGL2 fixed-function combiner bridge for original
      `shader.cpp` texture ops beyond select/modulate/add: `MODULATE2X`,
      `MODULATE4X`, `ADDSIGNED`, `ADDSIGNED2X`, `SUBTRACT`, `ADDSMOOTH`,
      `BLENDDIFFUSEALPHA`, `BLENDTEXTUREALPHA`, `BLENDFACTORALPHA`,
      `BLENDCURRENTALPHA`, and `LERP` now render through focused D3D8 browser
      probes with center-pixel checks.
- [x] Add stage-1 `D3DTSS_COLORARG0` support to the current WebGL2
      fixed-function combiner bridge for non-texture stage-1
      `MULTIPLYADD`/`LERP` operands, with focused browser probes proving
      `TFACTOR | ALPHAREPLICATE` drives stage-1 color arg0 without pretending
      stage-1 texture sampling is implemented.
- [x] Apply stage-1 alpha combiner state in the current WebGL2 fixed-function
      bridge instead of always preserving stage-0 alpha. The D3D8 combiner
      probe now includes a stage-1 `ALPHAOP=SELECTARG1` / `ALPHAARG1=TFACTOR`
      case that keeps RGB from `CURRENT`, overrides alpha from
      `D3DRS_TEXTUREFACTOR`, and verifies the result through normal
      `SRCALPHA` blending against black.
- [x] Close the first Fable graphics-audit combiner gap in the browser D3D8
      shader. The fixed-function bridge now implements
      `D3DTOP_BLENDTEXTUREALPHAPM` plus the color-only
      `D3DTOP_MODULATEALPHA_ADDCOLOR`,
      `D3DTOP_MODULATECOLOR_ADDALPHA`,
      `D3DTOP_MODULATEINVALPHA_ADDCOLOR`, and
      `D3DTOP_MODULATEINVCOLOR_ADDALPHA` formulas, carries `D3DTA_SPECULAR`
      into the combiner source table, switches the fragment shader to
      `precision highp float`, and records one-time `d3d8Warnings`/console
      diagnostics for unsupported combiner state or active stages beyond the
      currently rendered 0/1 shader path. The browser combiner probe now runs
      41 cases, including the five new formulas, with pinned center-pixel
      assertions. Verified with `node --check WebAssembly/harness/bridge.js`,
      `node --check WebAssembly/harness/smoke.mjs`, `npm --prefix
      WebAssembly run build:port`, and `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`.
- [x] Apply captured stage-0 `D3DTSS_TEXCOORDINDEX` passthrough UV selection
      in the current WebGL2 textured draw bridge for `VertexFormatXYZNDUV1/2`
      layouts, choosing UV0 or UV1 attribute offsets from the D3D8 stage state
      instead of always sampling UV0. A new browser-driven D3D8 texcoord probe
      renders the same quad through UV0 and UV1 against a red/blue texture and
      verifies distinct center pixels plus selected offsets through Playwright.
      Camera-space generated coordinates, projected coordinates, texture
      transform matrices, non-stage-0 texture coordinates, non-FVF vertex
      declarations, and broader position/blend FVF variants remain open.
- [x] Prove variable-size FVF texture-coordinate decoding through the browser
      WebGL2 draw bridge instead of only through header math. A D3D8 probe now
      renders `D3DFVF_TEX2` with a 3D UV0 followed by 2D UV1 and `D3DFVF_TEX3`
      with 1D UV0, 4D UV1, and 2D UV2; both cases sample a red/blue texture
      from the later 2D coordinate set and verify blue center pixels only if
      the bridge computes the selected offsets (`28` and `36`) from
      `D3DFVF_TEXCOORDSIZE*` metadata. Playwright captures
      `harness-smoke-d3d8-fvf-texcoord-sizes-canvas.png`.
- [x] Apply captured stage-0 `D3DTS_TEXTURE0` transform matrices for the
      current WebGL2 textured draw bridge when `D3DTSS_TEXTURETRANSFORMFLAGS`
      is exactly `D3DTTFF_COUNT2` and the texture coordinates are passthrough
      XYZNDUV UVs. A new browser-driven D3D8 texture-transform probe renders
      disabled and translated-U cases against a red/blue texture, verifying
      distinct center pixels, transform metadata, and `D3DTTFF_COUNT2` coverage
      through Playwright. COUNT1/3/4, projected coordinates, camera-space
      generated coordinates, non-FVF vertex declarations, and broader
      position/blend FVF variants remain open.
- [x] Extend the stage-0 WebGL2 texture-transform bridge beyond
      `D3DTTFF_COUNT2` for passthrough 2D texture sampling. The bridge now
      decodes transform component counts and the projected flag, applies
      non-projected `D3DTTFF_COUNT3`/`COUNT4` by sampling the transformed XY
      components, and supports `D3DTTFF_PROJECTED | D3DTTFF_COUNT3` by dividing
      XY by the transformed third component. The browser-driven D3D8 probe now
      renders disabled, COUNT2, COUNT3, COUNT4, and projected COUNT3 cases
      against a red/blue texture, verifies the sampled center pixels plus
      decoded metadata through Playwright, and captures
      `harness-smoke-d3d8-texture-transform-canvas.png`. Plain COUNT1,
      projected COUNT4, camera-space generated coordinates, non-FVF vertex
      declarations, and broader position/blend FVF variants remain open.
- [x] Apply captured stage-1 `D3DTS_TEXTURE1` transform matrices for the
      current WebGL2 two-texture draw bridge. A browser-driven D3D8 probe now
      binds red stage-0 and red/blue stage-1 textures, enables
      `D3DTSS_TEXTURETRANSFORMFLAGS=D3DTTFF_COUNT2` only on stage 1, sets a
      `D3DTS_TEXTURE1` U translation, and verifies the transformed UV1 sample
      turns the center pixel blue while texture 0 remains untransformed.
      Playwright captures
      `harness-smoke-d3d8-stage1-texture-transform-canvas.png`.
- [x] Add focused browser support and harness proof for generated
      `D3DTSS_TEXCOORDINDEX` texture-coordinate sources in the current WebGL2
      draw bridge. The bridge now accepts camera-space normal, position, and
      reflection-vector sources without requiring vertex UV attributes, feeds
      them through captured texture transforms, and supports projected
      `D3DTTFF_COUNT3` camera-space position sampling. The D3D8 texcoord probe
      now renders UV0/UV1 passthrough plus generated normal/position/reflection
      and projected position cases, verifies metadata and center pixels through
      Playwright, and captures
      `harness-smoke-d3d8-generated-texcoord-canvas.png`. Original W3D mapper,
      water, and terrain call-site integration remains open.
- [x] Prove the original WWShade cubemap apply path against the browser D3D8
      state bridge. `cnc_port_probe_wwshade_cubemap_apply()` constructs the
      original `ShdCubeMapDefClass` / `Shd6CubeMapClass`, creates the real
      `WW3DAssetManager` prerequisite when needed, calls
      `Shd6CubeMapClass::Apply_Shared`, and the Playwright smoke verifies
      stage-0 `D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR`, the
      `DX8_FVF_XYZNDCUBEMAP` FVF, stage combiner state, material sources,
      material values, and D3D8 shim call deltas.
- [x] Prove the original `MatrixMapperClass::Apply` perspective-projection
      path against the browser D3D8 state bridge. `cnc_port_probe_matrixmapper_apply()`
      constructs a real ref-counted `MatrixMapperClass`, configures a deterministic
      `ViewToTexture` transform, calls the original
      `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/matrixmapper.cpp`
      `Apply()` method, and the Playwright smoke verifies stage-1
      `D3DTSS_TCI_CAMERASPACEPOSITION`,
      `D3DTTFF_PROJECTED | D3DTTFF_COUNT3`, the texture transform state, and the
      three perspective rows emitted by the original branch.
- [x] Prove the original `ClassicEnvironmentMapperClass::Apply` path against
      both the browser D3D8 state bridge and a native Node smoke. The browser
      `cnc_port_probe_classic_environment_mapper_apply()` constructs a real
      ref-counted stage-1 mapper, calls the original
      `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp` `Apply()`
      method, and the Playwright smoke verifies
      `D3DTSS_TCI_CAMERASPACENORMAL`, `D3DTTFF_COUNT2`, the texture transform
      state, all four canonical environment-map matrix rows, and D3D8 shim
      call deltas. `classic-environment-mapper-apply-smoke.cjs` independently
      verifies the same original emission through the Node wasm D3D8 shim.
- [x] Prove the original `EnvironmentMapperClass::Apply` path against both
      the browser D3D8 state bridge and a native Node smoke. The browser
      `cnc_port_probe_environment_mapper_apply()` constructs a real
      ref-counted stage-1 mapper, calls the original
      `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp` `Apply()`
      method, and the Playwright smoke verifies
      `D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR`, `D3DTTFF_COUNT2`, the texture
      transform state, all four canonical environment-map matrix rows, and
      D3D8 shim call deltas. `environment-mapper-apply-smoke.cjs`
      independently verifies the same original emission through the Node wasm
      D3D8 shim, including `MAPPER_ID_ENVIRONMENT` and `Needs_Normals()`.
- [x] Prove the original `ScreenMapperClass::Apply` path against both the
      browser D3D8 state bridge and a native Node smoke. The browser
      `cnc_port_probe_screen_mapper_apply()` constructs a real stage-1 mapper
      with deterministic zero scroll speed, nonzero offset/scale, and a seeded
      projection transform, calls the original
      `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp` `Apply()`
      method, and the Playwright smoke verifies
      `D3DTSS_TCI_CAMERASPACEPOSITION`,
      `D3DTTFF_PROJECTED | D3DTTFF_COUNT3`, the texture transform state, all
      four projected matrix rows, D3D8 shim call deltas, and
      `MAPPER_ID_SCREEN`. `screen-mapper-apply-smoke.cjs` independently
      verifies the same original emission through the Node wasm D3D8 shim.
- [x] Prove the original `EdgeMapperClass::Apply` path against both the
      browser D3D8 state bridge and a native Node smoke. The browser
      `cnc_port_probe_edge_mapper_apply()` drives real stage-1 default and INI
      mapper branches, calls the original
      `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp` `Apply()`
      method, and verifies `MAPPER_ID_EDGE`, `Needs_Normals()`,
      `Is_Time_Variant()`, normal versus reflection `TEXCOORDINDEX`,
      `D3DTTFF_COUNT2`, the texture transform state, all four matrix rows
      derived from `Calculate_Texture_Matrix()`, and D3D8 shim call deltas.
      `edge-mapper-apply-smoke.cjs` independently covers the same two branches
      through the Node wasm D3D8 shim with deterministic `VPerSec=0` /
      `VStart` inputs.
- [x] Prove the original `WSClassicEnvironmentMapperClass::Apply` and
      `WSEnvironmentMapperClass::Apply` paths against both the browser D3D8
      state bridge and a native Node smoke. The browser
      `cnc_port_probe_ws_environment_mapper_apply()` drives real stage-1
      mappers on axis X and axis Y, installs a non-identity view transform so
      `WSEnvMapperClass::Calculate_Texture_Matrix()` exercises the inverse-view
      multiplication path, calls the original
      `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp` `Apply()`
      methods, and verifies class-specific mapper IDs, `Needs_Normals()`,
      non-time-variant stage ownership, normal versus reflection
      `TEXCOORDINDEX`, `D3DTTFF_COUNT2`, all four matrix rows, and D3D8 shim
      call deltas. `ws-environment-mapper-apply-smoke.cjs` independently covers
      the same two original classes through the Node wasm D3D8 shim.
- [x] Prove the original `GridClassicEnvironmentMapperClass::Apply` and
      `GridEnvironmentMapperClass::Apply` paths against both the browser D3D8
      state bridge and a native Node smoke. The browser
      `cnc_port_probe_grid_environment_mapper_apply()` drives real stage-1
      grid mappers with deterministic `FPS=0`, `Log2Width=2`, `Last=16`, and
      distinct offsets 5 and 10, calls the original
      `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp` `Apply()`
      methods, and verifies class-specific mapper IDs, `Needs_Normals()`,
      time-variant stage ownership, normal versus reflection `TEXCOORDINDEX`,
      `D3DTTFF_COUNT2`, the grid-cell texture matrix rows derived from
      `Calculate_Texture_Matrix()`, and D3D8 shim call deltas.
      `grid-environment-mapper-apply-smoke.cjs` independently covers the same
      two original classes through the Node wasm D3D8 shim while also proving
      the `Last=0` default expansion to the 4x4 grid frame count.
- [x] Prove the original `GridWSClassicEnvironmentMapperClass::Apply` and
      `GridWSEnvironmentMapperClass::Apply` paths against both the browser
      D3D8 state bridge and a native Node smoke. The browser
      `cnc_port_probe_grid_ws_environment_mapper_apply()` drives real stage-1
      grid world-space mappers with deterministic `FPS=0`, `Log2Width=2`,
      `Last=16`, offsets 5 and 10, and axes X and Y, installs a non-identity
      view transform so `GridWSEnvMapperClass::Calculate_Texture_Matrix()`
      exercises the inverse-view multiplication path, calls the original
      `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp` `Apply()`
      methods, and verifies class-specific mapper IDs, `Needs_Normals()`,
      time-variant stage ownership, normal versus reflection `TEXCOORDINDEX`,
      `D3DTTFF_COUNT2`, view-influenced grid-cell texture matrix rows, and
      D3D8 shim call deltas. `grid-ws-environment-mapper-apply-smoke.cjs`
      independently covers the same two original classes through the Node wasm
      D3D8 shim while also proving the `Last=0` default expansion to the 4x4
      grid frame count.
- [x] Extend the focused browser generated texture-coordinate support into the
      remaining original terrain and water projection generated-coordinate
      state paths. `cnc_port_probe_projection_state_apply()` mirrors the
      original `TerrainShader2Stage::set(pass=2)` noise projection sequence
      from
      `GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DShaderManager.cpp`
      on stage 0 and the original water-noise projection sequence from
      `GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/Water/W3DWater.cpp`
      on stage 2, then the Playwright smoke verifies
      `D3DTSS_TCI_CAMERASPACEPOSITION`, `D3DTTFF_COUNT2`, wrap addressing,
      texture-transform targets `D3DTS_TEXTURE0` / `D3DTS_TEXTURE2`, matrix
      rows, and D3D8 shim call deltas. `water-projection-state-smoke.cjs`
      independently validates the water stage-1/stage-2 state and
      `D3DTS_TEXTURE2` transform through the native Node D3D8 shim.
- [x] Prove uploaded legacy `A8`, `L8`, and `A8L8` textures through the actual
      stage-0 WebGL2 textured draw path, not only through storage readback. The
      draw bridge now records the texture semantic and reconstructs D3D8
      sampler output in the shader (`A8 -> (0,0,0,A)`, `L8 -> (L,L,L,1)`,
      `A8L8 -> (L,L,L,A)`) before the fixed-function combiner runs. A new
      browser-driven probe renders all three formats with point sampling and
      alpha blending where needed, and Playwright verifies center pixels,
      shader semantic modes, lifecycle deltas, and raw upload metadata. Real
      DDS/DXT payloads, palette textures, asset-derived mip chains, and
      multi-stage texture sampling remain open.
- [x] Add the first real browser compressed-texture bridge for synthetic DXT
      payloads: the D3D8 shim now sizes and locks `DXT1`/`DXT3`/`DXT5`
      surfaces as 4x4 block-compressed data, rejects unsafe partial rect locks,
      and the JS bridge maps them to `WEBGL_compressed_texture_s3tc`
      `compressedTexImage2D` uploads. A new browser-driven D3D8 DXT draw probe
      renders valid DXT1 opaque red, DXT3 explicit-alpha red, and DXT5
      interpolated-alpha red blocks through the existing stage-0 textured draw
      path, with Playwright center-pixel and lifecycle assertions. Real DDS
      asset loading, full mip chains, DXT2/DXT4 premultiplied-alpha policy, and
      block-aligned compressed sub-rect updates remain open.
- [x] Resolve the synthetic DXT2/DXT4 browser policy: the JS bridge now accepts
      DXT2/DXT4 uploads by aliasing them to the WebGL S3TC DXT3/DXT5 targets
      while preserving their original storage labels and premultiplied-alpha
      metadata for harness inspection. The D3D8 DXT draw probe now renders
      DXT2 and DXT4 red-alpha blocks beside the existing DXT1/DXT3/DXT5 cases,
      and the C++ texture-readiness smoke records DXT2/DXT4 in its explicit
      D3D8-to-WebGL mapping spec. Real DDS asset loading, full mip chains, and
      block-aligned compressed sub-rect updates remain open.
- [x] Prove the current stage-0 WebGL2 draw bridge handles D3D8 mip-chain
      completeness correctly for synthetic uploaded textures. A new
      browser-driven D3D8 mip-chain draw probe creates a three-level
      `A8R8G8B8` texture, renders an incomplete level-0-only case that must
      fall back to non-mip sampling, then renders a fully uploaded 4x4/2x2/1x1
      chain with `D3DTEXF_POINT` mip filtering and minified UVs that visibly
      sample the smallest mip. Playwright verifies center pixels, initialized
      levels, `completeMipChain`, WebGL `NEAREST_MIPMAP_NEAREST` selection,
      fallback metadata, and lifecycle deltas. Real DDS/DXT asset-derived mip
      loading, generated mip policy, multi-stage sampling, and generalized
      texture declarations remain open.
- [x] Implement the initial browser-backed D3D8 volume texture path:
      `D3DXCreateVolumeTexture` / `CreateVolumeTexture` now create WebGL2
      `TEXTURE_3D` resources, `GetLevelDesc` / `GetVolumeLevel` expose the
      CPU-backed volume levels, `LockBox` / `UnlockBox` upload full volumes and
      dirty sub-boxes with row/slice pitch accounting, and `SetTexture` can
      bind/unbind volume textures. Verified by the browser
      `d3d8VolumeTextureUpload` RPC plus `npm run build:wasm`,
      `node harness/smoke.mjs`, and
      `EXPECT_WASM=1 node harness/smoke.mjs`. Compressed volume DDS uploads and
      shader sampling remain open follow-ups.
- [x] Apply captured D3D8 `D3DTSS_MAXMIPLEVEL` and `D3DTSS_MIPMAPLODBIAS`
      sampler state in the WebGL2 texture bridge once complete mip chains are
      available, and prove the LOD clamp/bias behavior through a focused
      browser draw probe. The bridge now maps `MAXMIPLEVEL` to
      `TEXTURE_BASE_LEVEL`/`TEXTURE_MAX_LEVEL` around uploaded chains and
      applies `MIPMAPLODBIAS` through the GLSL `texture(..., bias)` path, with
      Playwright coverage for incomplete fallback, complete mip sampling,
      base-level clamping, and positive bias selecting the smallest mip.
- [x] Add focused render-state mapping *expectations* coverage through the
      existing browser D3D8 shim (no shim or draw-bridge changes): a new
      `d3d8-render-state-mapping-smoke` records `D3DRS_CULLMODE`,
      `D3DRS_ZENABLE`, `D3DRS_ZWRITEENABLE`, `D3DRS_ZFUNC`,
      `D3DRS_ALPHABLENDENABLE`, `D3DRS_SRCBLEND`/`DESTBLEND`, `D3DRS_BLENDOP`,
      `D3DRS_ALPHATESTENABLE`/`ALPHAFUNC`/`ALPHAREF`, and
      `D3DRS_COLORWRITEENABLE` Set/Get round-trips through the existing shim,
      and emits a machine-readable D3D8→WebGL2 mapping spec (canonical
      `frontFace(GL_CW)`+`cullFace` cull table, ZENABLE/ZWRITE/ZFUNC depth
      table, blend factor/op table, shader-emulated alpha test, and
      color-write mask) that the future real GL-state mapping must satisfy.
- [x] Add focused texture stage state / sampler *expectations* coverage
      through the existing browser D3D8 shim (no shim or draw-bridge changes):
      a new `d3d8-texture-stage-state-mapping-smoke` pins the canonical DX8
      values of the `D3DTSS_*`, `D3DTADDRESS_*`, and `D3DTEXF_*` enumerations
      fed into `Set_DX8_Texture_Stage_State`; replicates
      `TextureFilterClass::_Init_Filters()` locally against the exact caps the
      shim reports (linear min/mag/mip, no anisotropic, `MaxAnisotropy==1`,
      wrap+clamp+mirror addressing), recording the per-stage `_Min/_Mag/_Mip`
      filter tables for NONE/FAST/BEST/DEFAULT under bilinear/trilinear/
      anisotropic modes; verifies the engine's `Apply()` address translation
      (`TEXTURE_ADDRESS_REPEAT`/`CLAMP` → `D3DTADDRESS_WRAP`/`CLAMP`); and
      emits a machine-readable D3D8→WebGL2 sampler mapping spec (the canonical
      min/mip collapse into a single GL `TEXTURE_MIN_FILTER`, separate
      `MAG_FILTER`, `WRAP`/`CLAMP`/`MIRROR`→GL wrap enums, `BORDER`/
      `MIRRORONCE` flagged unsupported, `MAXANISOTROPY` contract) that the
      future S2 sampler-translation task must satisfy.
- [x] Apply the captured D3D8 render-state subset used by the current original
      AABox render path to the browser WebGL2 draw bridge, including
      cull/front-face, depth test/write/func, blend func/op, shader-emulated
      alpha test uniforms, and color-write masks, with C++ state-capture smoke
      coverage plus Playwright harness assertions proving the rendered AABox
      draw path uses the mapped GL state and still paints the canvas. The draw
      bridge also detects Render2D identity-world/view/projection clip-space
      submits and flips the GL cull face for D3D screen-space winding; the
      Render2D and `W3DDisplay::drawImage` smokes assert that path.
- [x] Add the first D3D8 stencil render-state bridge to the browser WebGL2
      draw path. The shim now captures `D3DRS_STENCILENABLE`,
      `STENCILFUNC`, `STENCILREF`, `STENCILMASK`, `STENCILWRITEMASK`, and
      `STENCILFAIL`/`STENCILZFAIL`/`STENCILPASS` into the draw payload, the
      harness requests a stencil buffer and maps the D3D compare/op state to
      `gl.stencilFunc`/`gl.stencilOp`/`gl.stencilMask`, and a focused probe
      writes stencil through a color-masked central quad before drawing a full
      green quad through an `EQUAL` stencil test. Playwright verifies the
      center pixel turns green while a corner remains black, catching both
      missing stencil writes and accidentally disabled stencil tests. Broader
      W3D player-color, occlusion, and projected-shadow stencil flows remain
      open until the original scene/shadow renderer paths are harness-driven.
- [x] Add shader-emulated D3D8 linear fog to the browser WebGL2 draw bridge.
      The shim now captures `D3DRS_FOGENABLE`, `FOGCOLOR`, `FOGSTART`,
      `FOGEND`, `FOGVERTEXMODE`, and `RANGEFOGENABLE` into the draw payload;
      the browser bridge decodes the D3D float-bit start/end values and mixes
      fog color after the fixed-function texture combiner/alpha-test path; and
      a focused D3D8 probe draws a red quad at view-space depth 0.5 with blue
      linear fog from 0..1. Playwright verifies the blended purple center
      pixel and the decoded fog state, covering the render-state path used by
      `DX8Wrapper::Set_Fog` / `ShaderClass` before the original scene fog
      flows are fully harness-driven.
- [x] Add D3D8 fill-mode capture and WebGL2 wireframe emulation to the browser
      draw bridge. The shim now carries `D3DRS_FILLMODE` in the draw payload,
      the bridge keeps CPU-side D3D buffer byte mirrors so indexed triangle
      draws can expand `D3DFILL_WIREFRAME` into temporary `gl.LINES` element
      buffers, and a focused probe draws a green indexed diamond whose
      wireframe includes center-crossing edges. Playwright verifies the
      captured wireframe state, the generated 12 line indices from two
      triangles, and the green center pixel that only appears when the
      wireframe edges render.
- [x] Add D3D8 `D3DRS_ZBIAS` capture and shader depth-bias emulation to the
      browser draw bridge. The shim now carries the z-bias render state in the
      draw payload, the WebGL2 vertex shader shifts clip-space depth for
      positive D3D bias values so both triangles and wireframe line draws move
      toward the camera, and a focused two-pass depth probe draws a red quad
      first, then proves a green same-depth quad with `D3DCMP_LESS` only wins
      after `ZBIAS=8` is applied. Playwright verifies the captured state, GL
      depth function, clamped bias metadata, and green center pixel.
- [x] Fix draw-order/z-order bug: correct `D3DRS_ZBIAS` 24-bit depth-bias
      scale in `WebAssembly/harness/bridge.js` `d3d8DepthBiasInfo`. The
      original code used `2^16` (65536.0) denominator with clamp-to-15,
      pulling decals/shadows/overlay passes ~8× too far toward the camera
      (punching through nearby opaque geometry). Replace with the d3d8to9
      24-bit `CalcDepthBias` denominator `(1<<20)-1` and clamp to D3D8 max 16,
      yielding `ndc = 2*clamped / ((1<<20)-1)`. Verified: `propAfterTerrain`
      / `treeAfterTerrain` / `shroudAfterTerrain` all correct; skirmish smoke
      223 drawables no regression; `RENDERS-OK`. Commit 33641ab.
- [x] Add D3D8 `D3DRS_SHADEMODE` capture and flat-shade emulation to the
      browser draw bridge. The shim now carries shade mode in the draw payload,
      the WebGL2 shader keeps both smooth and `flat` diffuse varyings, and the
      bridge uses first-vertex provoking when available or rotates indexed
      triangle draws into a temporary element buffer so D3D `D3DSHADE_FLAT`
      uses the original first vertex. A focused probe draws a red-first,
      blue-rest triangle and Playwright verifies the captured flat state,
      first-vertex flat path, and red center pixel.
- [x] Add D3D8 `D3DRS_LIGHTING` / `D3DRS_AMBIENT` capture to the browser draw
      bridge. The shim now carries the lighting flag and packed ambient color
      in the draw payload, the JS bridge normalizes them into descriptor
      metadata and ARGB-decoded RGBA, and a focused probe sets lighting false
      with ambient `0xff405060`. Playwright verifies captured state,
      descriptor decoding, persistent buffers, and the green center pixel.
- [x] Add D3D8 `SetMaterial` / `GetMaterial` storage and per-draw
      `D3DMATERIAL8` capture to the browser draw bridge. The shim now keeps a
      WW3D-compatible default material, records material set/get counters,
      exposes the current material as a separate draw payload next to render
      state, and the JS bridge normalizes diffuse, ambient, specular,
      emissive, and power descriptors. A focused probe verifies readback,
      captured material values, persistent buffers, and the green center pixel.
- [x] Add D3D8 material-source render-state capture to the browser draw bridge.
      The draw payload now includes `D3DRS_COLORVERTEX` plus diffuse,
      specular, ambient, and emissive `D3DMATERIALCOLORSOURCE` values, and
      that slice exposed readable descriptor names before shader lighting was
      added. A focused probe sets non-default source choices, verifies the
      per-draw descriptor, persistent buffers, and the green center pixel with
      lighting disabled.
- [x] Add the first browser fixed-function D3D8 lighting shader path for a
      supported directional light. The shim now stores `SetLight` /
      `LightEnable` state, carries an eight-light draw payload, exposes legacy
      and FVF normal offsets to the WebGL2 vertex shader, and applies material
      diffuse/ambient/emissive plus scene ambient and the first enabled
      directional diffuse light when that supported light is present. A focused
      native/browser probe draws adjacent quads with opposite normals and
      Playwright verifies black left and green right pixels plus
      `harness-smoke-d3d8-directional-light-canvas.png`. This was later
      broadened to multiple enabled directional lights; point/spot attenuation,
      specular, and full material-source behavior remain open.
- [x] Extend the browser fixed-function D3D8 lighting shader path from the
      first supported directional light to multiple enabled directional lights.
      The WebGL2 bridge now filters the captured D3D light payload into a
      WW3D-sized directional-light uniform array, reports the selected light
      set in `appliedRenderState.lighting`, and sums each enabled directional
      diffuse/ambient contribution in the vertex shader. A focused
      native/browser probe enables non-adjacent red and blue directional light
      slots, verifies the raw light payload plus selected shader light list,
      and Playwright confirms black left and magenta right pixels with
      `harness-smoke-d3d8-multi-directional-light-canvas.png`.
- [x] Add a focused fixed-function D3D8 specular lighting path for the
      aligned directional-light case. The shim now captures
      `D3DRS_SPECULARENABLE`, the WebGL2 bridge uploads material
      specular/power plus directional light specular colors, and the vertex
      shader adds a gated half-vector specular contribution. A focused
      native/browser probe draws black diffuse/ambient quads with opposite
      normals and verifies that only the front-facing quad turns white from
      specular, with Playwright saving
      `harness-smoke-d3d8-specular-light-canvas.png`. At that point,
      point/spot attenuation, off-axis/transformed specular fidelity, and
      broader material-source behavior remained open.
- [x] Add a focused fixed-function D3D8 off-axis specular lighting proof.
      The native/browser probe `cnc_port_probe_d3d8_specular_offaxis_light`
      draws a black control quad with normal `(0,0,1)` beside a white quad
      whose normal `(0.4472136,0,0.8944272)` matches the half-vector for
      directional light `Direction=(-0.8,0,-0.6)` and material power `64`.
      The JS bridge exposes `d3d8SpecularOffAxisLight`, verifies raw and
      selected light direction/specular state, material power/source state,
      and black/white sampled pixels, with Playwright saving
      `harness-smoke-d3d8-specular-offaxis-light-canvas.png`. At that point,
      transformed specular fidelity and broader lit material-source behavior
      remained open.
- [x] Add a focused transformed fixed-function D3D8 specular normal-matrix
      proof. The WebGL2 draw bridge now transforms fixed-function normals with
      the inverse-transpose world normal matrix on transformed draws, and the
      native/browser probe `cnc_port_probe_d3d8_specular_transformed_light`
      sets world/view/projection transforms with a non-uniform X world scale.
      It draws a black control bar beside a bar whose object-space normals
      only resolve to the white specular half-vector through the correct
      inverse-transpose normal path; the old world-3x3 normal path would leave
      it black. The JS bridge exposes `d3d8SpecularTransformedLight`, verifies
      transform mask/state, material/light specular state, the
      `inverseTransposeWorld` normal-transform descriptor, and black/white
      sampled pixels, with Playwright saving
      `harness-smoke-d3d8-specular-transformed-light-canvas.png`.
- [x] Add a focused D3D8 `D3DRS_NORMALIZENORMALS` proof. The shim now captures
      the state with the D3D8 default of `FALSE`, the browser draw bridge
      carries it as `renderState.normalizeNormals`, and the fixed-function
      lighting shader only normalizes inverse-transpose world normals when
      that state is enabled. The native/browser probe
      `cnc_port_probe_d3d8_normalize_normals` draws a scaled-world diffuse
      control quad with the default false state beside a normalized true
      quad, and Playwright verifies gray/white sampled pixels with
      `harness-smoke-d3d8-normalize-normals-canvas.png`.
- [x] Add a focused D3D8 `D3DRS_LOCALVIEWER` proof. The shim now captures the
      state with the D3D default of `TRUE`, the browser draw bridge carries it
      as `renderState.localViewer`, and the fixed-function specular shader
      switches between camera-relative and orthogonal view directions. The
      native/browser probe `cnc_port_probe_d3d8_local_viewer` draws a dark
      camera-relative specular control quad beside a white orthogonal-viewer
      quad, and Playwright verifies the black/white samples with
      `harness-smoke-d3d8-local-viewer-canvas.png`.
- [x] Add a focused lit fixed-function D3D8 material-source `COLOR1` proof.
      The native/browser probe `cnc_port_probe_d3d8_lit_material_sources`
      sets `COLORVERTEX=TRUE`, uses vertex diffuse colors as both the diffuse
      and ambient material sources, keeps material diffuse/ambient/emissive
      black, and lights adjacent red/green quads with scene ambient plus a
      directional light. The JS bridge exposes `d3d8LitMaterialSources`,
      verifies captured and applied material-source descriptors, light/material
      state, and sampled red/green pixels, with Playwright saving
      `harness-smoke-d3d8-lit-material-sources-canvas.png`. Emissive `COLOR1`
      and `COLOR2` variants remained open.
- [x] Add a focused lit fixed-function D3D8 specular material-source proof.
      The native/browser probe
      `cnc_port_probe_d3d8_lit_specular_material_source` sets
      `COLORVERTEX=TRUE`, keeps diffuse/ambient/emissive material sources
      black, enables specular, and sources `D3DRS_SPECULARMATERIALSOURCE`
      from `D3DMCS_COLOR1` so vertex diffuse colors are the only visible
      contribution. The JS bridge exposes `d3d8LitSpecularMaterialSource`,
      verifies captured/applied material-source descriptors plus specular
      light/material state, and Playwright verifies red/green sampled pixels
      with `harness-smoke-d3d8-lit-specular-material-source-canvas.png`.
      This is D3D8 parity coverage; original WW3D `VertexMaterialClass::Apply`
      actively drives diffuse/ambient/emissive sources but does not set
      `D3DRS_SPECULARMATERIALSOURCE`.
- [x] Add a focused lit fixed-function D3D8 emissive `COLOR2` material-source
      proof. The native/browser probe
      `cnc_port_probe_d3d8_lit_emissive_color2_material_source` uses a
      fixed-function FVF with `D3DFVF_SPECULAR`, 48-byte
      XYZ/normal/diffuse/specular/UV0/UV1 vertices, and
      `SetVertexShader(D3DFVF_XYZ | D3DFVF_NORMAL | D3DFVF_DIFFUSE |
      D3DFVF_SPECULAR | D3DFVF_TEX2)` so the browser draw bridge decodes the
      `COLOR2` stream at specular offset 28. It sets
      `COLORVERTEX=TRUE`, keeps diffuse/specular/ambient material sources on
      `MATERIAL`, sources `D3DRS_EMISSIVEMATERIALSOURCE` from
      `D3DMCS_COLOR2`, and verifies red/blue emissive-only pixels plus FVF
      layout metadata through Playwright with
      `harness-smoke-d3d8-lit-emissive-color2-material-source-canvas.png`.
- [x] Add a focused lit fixed-function D3D8 emissive `COLOR1` material-source
      proof. The native/browser probe
      `cnc_port_probe_d3d8_lit_emissive_color1_material_source` uses
      `SetVertexShader(D3DFVF_XYZ | D3DFVF_NORMAL | D3DFVF_DIFFUSE |
      D3DFVF_TEX2)` with a 44-byte XYZ/normal/diffuse/UV0/UV1 FVF layout, so
      the browser draw bridge decodes `COLOR1` from the diffuse stream at
      offset 24 and proves there is no `COLOR2`/specular stream. It sets
      `COLORVERTEX=TRUE`, keeps diffuse/specular/ambient material sources on
      `MATERIAL`, sources `D3DRS_EMISSIVEMATERIALSOURCE` from
      `D3DMCS_COLOR1`, and verifies red/green emissive-only pixels plus FVF
      layout metadata through Playwright with
      `harness-smoke-d3d8-lit-emissive-color1-material-source-canvas.png`.
- [x] Add a focused fixed-function D3D8 point-light attenuation path. The
      WebGL2 draw bridge now selects enabled point, spot, and directional
      lights into the fixed-function shader uniform set, preserves each
      selected light's original slot metadata, and applies captured D3D8
      range and attenuation coefficients for non-directional lights. A
      focused native/browser probe sets a `D3DLIGHT_POINT` at `(0.5, 0, 1)`
      with linear attenuation, draws a far quad and a near quad, verifies the
      raw point-light payload plus selected shader light list, and Playwright
      confirms the far gray and near white samples with
      `harness-smoke-d3d8-point-light-canvas.png`. Broader original W3D
      quadratic/range/mixed coefficient point-light variants, spot
      cone/falloff variants, off-axis/transformed specular fidelity, and
      broader material-source behavior remained open at that point.
- [x] Add a focused fixed-function D3D8 pure quadratic point-light attenuation
      proof. The native/browser probe exports
      `cnc_port_probe_d3d8_point_quadratic_light`, sets a `D3DLIGHT_POINT` at
      `(0.5, 0, 1)` with `Attenuation0 = 0`, `Attenuation1 = 0`, and
      `Attenuation2 = 1`, then draws the same far and near quads used by the
      linear attenuation proof. The harness RPC verifies the raw light payload,
      selected fixed-function shader light, material state, exact attenuation
      coefficients, and far gray / near white canvas samples, with Playwright
      saving `harness-smoke-d3d8-point-quadratic-light-canvas.png`. Range
      clipping still remained open at that point, alongside mixed attenuation
      coefficients, broader point-light variants, off-axis/transformed
      specular fidelity, and broader material-source behavior.
- [x] Add a focused fixed-function D3D8 point-light range-clipping proof. The
      native/browser probe exports `cnc_port_probe_d3d8_point_range_light`,
      sets a `D3DLIGHT_POINT` at `(0.5, 0, 1)` with `Range = 1.25`,
      `Attenuation0 = 1`, `Attenuation1 = 0`, and `Attenuation2 = 0`, then
      draws the same far and near quads used by the linear point-light proof.
      The harness RPC verifies the raw light payload, selected
      fixed-function shader light, material state, exact range and attenuation
      coefficients, and black outside-range / near-white inside-range canvas
      samples, with Playwright saving
      `harness-smoke-d3d8-point-range-light-canvas.png`. Mixed attenuation
      coefficients still remained open at that point, alongside broader
      point-light variants, off-axis/transformed specular fidelity, and
      broader material-source behavior.
- [x] Add a focused fixed-function D3D8 mixed coefficient point-light
      attenuation proof. The native/browser probe exports
      `cnc_port_probe_d3d8_point_mixed_light`, sets a `D3DLIGHT_POINT` at
      `(0.5, 0, 1)` with `Range = 10`, `Attenuation0 = 0.1`,
      `Attenuation1 = 0.2`, and `Attenuation2 = 0.7`, then draws the same far
      and near quads used by the linear point-light proof. The harness RPC
      verifies the raw light payload, selected fixed-function shader light,
      material state, exact mixed attenuation coefficients, and dim gray /
      near-white canvas samples, with Playwright saving
      `harness-smoke-d3d8-point-mixed-light-canvas.png`. Broader point-light
      variants, off-axis/transformed specular fidelity, and broader
      material-source behavior remain open.
- [x] Add a focused fixed-function D3D8 spot-light hard-cone proof. The
      native/browser probe exports `cnc_port_probe_d3d8_spot_light`, sets a
      `D3DLIGHT_SPOT` with captured position, direction, range, falloff,
      attenuation, `Theta`, and `Phi`, and draws one quad outside the cone plus
      one quad inside the cone. The harness RPC verifies the raw spot-light
      payload, selected fixed-function shader light, material state, and black
      outside / white inside canvas samples, with Playwright saving
      `harness-smoke-d3d8-spot-light-canvas.png`. Smooth spot
      penumbra/falloff variants remained open at that point, alongside broader
      point-light attenuation variants, off-axis/transformed specular
      fidelity, and broader material-source behavior.
- [x] Add a focused fixed-function D3D8 spot-light penumbra/falloff proof. The
      native/browser probe exports `cnc_port_probe_d3d8_spot_falloff`, sets a
      `D3DLIGHT_SPOT` with `Theta < Phi`, `Falloff = 2`, and constant
      attenuation, then draws inside, mid-penumbra, and outside quads. The
      harness RPC verifies the raw light payload, selected shader light,
      material state, and white / gray / black samples, with Playwright saving
      `harness-smoke-d3d8-spot-falloff-canvas.png`. Broader spot-light
      variants, broader point-light attenuation variants, off-axis/transformed
      specular fidelity, and broader material-source behavior remain open.
- [x] Add D3D8 user clip-plane capture and browser shader clipping to the
      WebGL2 draw bridge. The shim now stores six `SetClipPlane` equations,
      exposes `D3DRS_CLIPPING` / `D3DRS_CLIPPLANEENABLE` in draw payloads, and
      the JS bridge discards fragments outside enabled planes while preserving
      the disabled-by-default path. A focused probe draws a green quad across
      plane 0, verifies the captured native/browser plane state, samples black
      left and green right pixels, and screenshots
      `harness-smoke-d3d8-clip-plane-canvas.png`.
- [x] Replace the generic unset `GetRenderState` zero fallback with the same
      per-state D3D8 defaults used by the current draw-capture subset. Direct
      queries now return non-zero defaults such as `COLORVERTEX`,
      `DIFFUSEMATERIALSOURCE`, `SPECULARMATERIALSOURCE`, cull/depth/blend,
      stencil mask/op, fog, shade, lighting, and color-write defaults; focused
      smoke coverage verifies unset default queries still preserve explicit
      `SetRenderState` round-trips.

### Increasing fidelity (each step verified by screenshot)
- [x] Clear to a color (prove the GL path works) through the browser D3D8
      `Clear` path, verified by `harness-smoke-d3d8-clear-canvas.png` and
      top-left pixel sampling in `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Single untextured AABox/debug geometry renders from the original WW3D
      render path, verified by `harness-smoke-ww3d-aabox-canvas.png` and
      center-pixel sampling plus transform-use assertions in
      `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Original `Render2DClass` textured quad/blit renders through
      `TextureClass`, `DX8Wrapper::Set_Texture`, dynamic WW3D vertex/index
      buffers, and the browser D3D8/WebGL2 draw bridge, verified by
      `harness-smoke-ww3d-render2d-canvas.png` and red center-pixel sampling
      in `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Original `W3DDisplay::drawImage` renders a synthetic raw-texture `Image`
      through its real `Render2DClass` helper and the browser D3D8/WebGL2 draw
      bridge, verified by `harness-smoke-ww3d-display-drawimage-canvas.png`
      and red center-pixel sampling in `EXPECT_WASM=1 node harness/smoke.mjs`.
      This proves the Image blit call path only; broader UI image rendering
      remains open.
- [x] Original `W3DDisplay::drawImage` `DRAW_IMAGE_ADDITIVE` mode now drives
      the display-owned additive Render2D branch, verified by
      `harness-smoke-ww3d-display-drawimage-additive-canvas.png`,
      `D3DBLEND_ONE`/`D3DBLEND_ONE` render-state assertions, texture sampling,
      red center-pixel sampling, and black outside-quad sampling in
      `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Original `W3DDisplay::drawImage` `DRAW_IMAGE_SOLID` mode now drives the
      display-owned no-alpha-blend Render2D branch, verified by
      `harness-smoke-ww3d-display-drawimage-solid-canvas.png`,
      `D3DBLEND_ONE`/`D3DBLEND_ZERO` render-state assertions, a low-alpha red
      texture drawn over a blue clear, red center-pixel sampling, and blue
      outside-quad sampling in `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Original `W3DDisplay::drawImage` `DRAW_IMAGE_GRAYSCALE` mode now drives
      the display-owned DOT3 grayscale Render2D branch, verified by
      `harness-smoke-ww3d-display-drawimage-grayscale-canvas.png`,
      `D3DTOP_MULTIPLYADD` / `D3DTOP_DOTPRODUCT3` texture-stage assertions,
      `D3DRS_TEXTUREFACTOR = 0x80A5CA8E`, grayscale center-pixel sampling, and
      black outside-quad sampling in `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Original `W3DDisplay::drawImage` also resolves a filename-backed `Image`
      through `Render2DClass::Set_Texture(const char*)`,
      `WW3DAssetManager::Get_Texture`, `TextureClass::Apply`, and the runtime
      `W3DFileSystem` / `Win32BIGFileSystem` archive path. A dedicated browser
      smoke range-fetches `Art\Textures\cine_moon.dds` from user-supplied
      `TexturesZH.big`, synthesizes a focused runtime BIG archive, draws
      `cine_moon.tga` by filename with `IMAGE_STATUS_RAW_TEXTURE` clear, and
      verifies real DDS-backed pixels plus
      `harness-smoke-ww3d-display-drawimage-file-canvas.png` when the archive
      is present.
- [x] Real mapped-image INI data now hands a real INI-defined `Image` to
      `W3DDisplay::drawImage`: the dedicated browser smoke range-fetches the
      mapped-image INI files from user-supplied `INIZH.big`, range-fetches
      `Data\English\Art\Textures\SCShellUserInterface512_001.tga` from
      user-supplied `EnglishZH.big`, verifies the original
      `WatermarkChina` mapped image (`Status = ROTATED_90_CLOCKWISE`, 160x96
      from a 512x512 atlas), resolves the atlas through
      `WW3DAssetManager`/`TextureClass::Init`/runtime `W3DFileSystem`, and
      screenshots the real TGA-backed blit at
      `harness-smoke-ww3d-display-mapped-image-canvas.png`. The current render
      probes use a focused exact-block loader for the requested image while the
      generic `ImageCollection::load(512)` / `INI::loadDirectory` browser
      ownership/crash frontier remains open.
- [x] Original `W3DDisplay::drawImage` clipping is now covered on the same real
      mapped-image path: the browser smoke applies `W3DDisplay::setClipRegion`
      to the parsed `WatermarkChina` image, verifies the original
      rotated-image clipped UV slice, disables clipping after the draw, samples
      a colored center pixel plus black outside-clip pixels, and screenshots
      `harness-smoke-ww3d-display-mapped-image-clip-canvas.png`.
- [x] Restored the direct `WatermarkChina` mapped-image display smoke to the
      real 512x512 atlas texture instead of the WW3D 128x128 missing texture.
      The regression was a browser runtime ownership mismatch: the focused
      mapped-image probe installed the persistent runtime `FileSystem` /
      `W3DFileSystem` owner, then swapped/restored a different
      `NameKeyGenerator`, so `FileSystem::doesFileExist` cache keys and W3D
      `GameFileClass` lookups could disagree. The mapped-image probe now keeps
      the runtime file-system/name-key owner consistent, and the runtime archive
      owner recreates/reloads recorded range-backed BIG specs when later focused
      WW3D probes ask for an already-loaded archive after `WW3D::Shutdown`.
      This also keeps the shell composite sequence alive when it runs scene,
      mapped-image, and GameText probes in one browser page. The vertical
      validator now matches the current exact-block mapped-image loader while
      the generic `ImageCollection::load(512)` route remains an open TODO.
      Verified with `npm run build:wasm`,
      `node harness/display_mapped_image_smoke.mjs
      artifacts/real-assets/INIZH.big artifacts/real-assets/EnglishZH.big`,
      `node harness/display_mapped_image_clip_smoke.mjs
      artifacts/real-assets/INIZH.big artifacts/real-assets/EnglishZH.big`,
      `node harness/display_game_text_smoke.mjs
      artifacts/real-assets/EnglishZH.big`,
      `node harness/display_shell_composite_smoke.mjs
      artifacts/real-assets/INIZH.big artifacts/real-assets/EnglishZH.big`,
      and `node tools/run_vertical_integrations_smoke.mjs`.
- [x] Original `W3DDisplay::drawImage` non-rotated mapped-image UVs are now
      covered through the same real mapped-image data path: the browser smoke
      range-fetches `SAUserInterface512.INI` and
      `SAUserInterface512_001.tga`, verifies `SAChinook_L`
      (`IMAGE_STATUS_NONE`, 120x96, UVs 367/512..487/512 and 393/512..489/512),
      pins the exact INI/TGA source offsets, draws the atlas slice through
      `W3DDisplay::drawImage`, and screenshots
      `harness-smoke-ww3d-display-mapped-image-unrotated-canvas.png`.
- [x] Browser render smokes now use the original mapped-image directory load
      route instead of the focused exact-block bridge. The shared render probe
      calls `ImageCollection::load(512)`, which drives original
      `INI::loadDirectory` / `INIMappedImage.cpp` over the mounted
      `Data\INI\MappedImages` directory, and the old
      `load_mapped_image_ini_file` parser was removed. Direct mapped-image,
      clipped, non-rotated, MainMenuRuler, shell-composite, and archive-backed
      `MainMenu.wnd` repaint smokes assert the shipped 1,186-image collection,
      then draw through `W3DDisplay::drawImage`, `WW3DAssetManager`,
      `TextureClass::Init`, runtime `W3DFileSystem`, and browser WebGL2. The
      dedicated MainMenuRuler harness now mounts the full mapped-image INI
      directory subset while still drawing the real HandCreated
      `MainMenuRuler` texture. Verified with
      `npm run test:ww3d-display-mapped-image`,
      `npm run test:ww3d-display-mapped-image-clip`,
      `npm run test:ww3d-display-mapped-image-unrotated`,
      `npm run test:ww3d-display-main-menu-ruler`,
      `npm run test:ww3d-display-shell-composite`, and
      `npm run test:ww3d-main-menu-layout-image-repaint`, plus
      `npm run test:vertical-integrations`.
- [x] Original `W3DDisplay::drawFillRect` renders an untextured 2D primitive
      through the display-owned `Render2DClass` helper without using the
      raw-storage-unsafe virtual size setters, verified by
      `harness-smoke-ww3d-display-fillrect-canvas.png`, disabled texture
      sampling, and green center-pixel sampling in
      `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Original `W3DDisplay::drawLine` now drives the display-owned
      `Render2DClass::Add_Line` path as a single untextured line quad,
      verified by `harness-smoke-ww3d-display-line-canvas.png`, disabled
      texture sampling, green center-pixel sampling, and black outside-line
      pixel sampling in `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Original two-color `W3DDisplay::drawLine` now drives the display-owned
      `Render2DClass::Add_Line` / `Add_Quad_HGradient` path as a single
      untextured gradient line quad, verified by
      `harness-smoke-ww3d-display-line-gradient-canvas.png`, disabled texture
      sampling, red-biased left / purple center / blue-biased right pixel
      sampling, and black outside-line pixel sampling in
      `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Original `W3DDisplay::drawOpenRect` now drives the display-owned
      `Render2DClass::Add_Outline`/`Add_Line` path as four untextured quads,
      verified by `harness-smoke-ww3d-display-openrect-canvas.png`, disabled
      texture sampling, yellow border-pixel sampling, and black center-pixel
      sampling in `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Original `W3DDisplay::drawRectClock` now drives the display-owned
      `Render2DClass::Add_Rect`/`Add_Tri` clock-fill path for the percent-88
      branch, verified by `harness-smoke-ww3d-display-rectclock-canvas.png`,
      disabled texture sampling, 14-vertex/6-triangle draw counts, green
      filled-region pixel sampling, and black unfilled/outside pixel sampling
      in `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Original `W3DDisplay::drawRemainingRectClock` now drives the
      display-owned `Render2DClass::Add_Rect`/`Add_Tri` reveal-clock path for
      the percent-50 branch, verified by
      `harness-smoke-ww3d-display-remaining-rectclock-canvas.png`, disabled
      texture sampling, 10-vertex/4-triangle draw counts, red filled-left-half
      pixel sampling, and black right-half/outside pixel sampling in
      `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Single textured mesh renders. A minimal single-textured W3D mesh (a
      camera-facing two-triangle quad) is built in memory through the original
      `ChunkSaveClass`/W3D chunk format, loaded through the original
      `MeshClass::Load_W3D` reader, textured through the original
      `WW3DAssetManager::Get_Texture` path (procedural red `TextureClass`
      pre-registered in the asset-manager texture hash), rendered through
      `WW3D::Render` and the browser D3D8/WebGL2 draw bridge, and verified by
      `harness-smoke-ww3d-textured-mesh-canvas.png` plus red center-pixel,
      texture-sampling, combiner, and transform assertions in
      `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Add the `cnc_port_probe_ww3d_textured_mesh` wasm export,
      `ww3dTexturedMesh` bridge RPC, and Playwright smoke coverage
      analogous to the AABox and Render2D probes.
- [x] Prove original-runtime WW3D emissive `COLOR2` material-source rendering.
      The `cnc_port_probe_ww3d_emissive_color2_material_source` runtime path
      builds a synthetic W3D mesh through original chunk load/render ownership,
      adds a real second color array so `DX8FVFCategoryContainer::Define_FVF`
      emits `D3DFVF_SPECULAR`, then applies a `VertexMaterialClass` with
      diffuse/ambient sources on `MATERIAL` and emissive on `COLOR2`. The
      `ww3dEmissiveColor2MaterialSource` bridge RPC and Playwright smoke verify
      the final browser draw has specular/COLOR2 at byte offset 28,
      `D3DRS_EMISSIVEMATERIALSOURCE == D3DMCS_COLOR2`, fixed-function lighting
      enabled through the original WW3D material path, no texture sampling, and
      green emissive-only pixels in
      `harness-smoke-ww3d-emissive-color2-material-source-canvas.png`.
- [x] Load a real source-tree WW3D required asset through the original
      W3D hierarchy parser in browser wasm: `ShatterPlanes0.w3d` is
      embedded from
      `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/RequiredAssets`
      at build time, the probe recursively scans original W3D chunks,
      loads the `W3D_CHUNK_HIERARCHY` through `HTreeClass::Load_W3D`,
      and the Playwright harness asserts file bytes, chunk discovery,
      hierarchy name, root bone, and pivot count. This asset contains no
      `W3D_CHUNK_HMODEL` or `W3D_CHUNK_MESH`; real source/shipped model
      and mesh parsing/rendering remain open.
- [x] Load a real shipped W3D mesh from `W3DZH.big` through the original
      archive and mesh loader path in wasm: `Win32BIGFileSystem`
      indexes the user-supplied archive, the smoke scans real `.w3d`
      entries for top-level `W3D_CHUNK_MESH`, selects the smallest
      loadable mesh (`art\w3d\cine_moon.w3d`), and asserts
      `MeshClass::Load_W3D` produces the original `CINE_MOON` model
      with 4 vertices, 2 triangles, and the `cine_moon.tga` texture
      reference. This is loader-only coverage; later completed items
      cover browser rendering and real texture upload for this mesh.
- [x] Replace the probe's no-op browser stubs for the Win32 GDI
      functions declared in the `windows.h` shim
      (`CreateFont`, `CreateCompatibleDC`, `CreateDIBSection`,
      `SelectObject`, `DeleteObject`, `SetBkColor`, `SetTextColor`,
      `GetTextMetrics`, `GetDC`, `ReleaseDC`, `DeleteDC`, plus the
      previously-stub-only `ExtTextOutW`/`GetTextExtentPoint32W`) with a
      real browser font/surface bridge (GLM-5.2). A new
      `WebAssembly/src/wasm_win32_gdi_browser.cpp` translation unit owns
      the single browser-target definition of those entry points: a real
      GDI state machine (fonts / DCs / 24bpp BI_RGB top-down DIB sections
      with GDI DWORD-padded strides and CPU-accessible pixel buffers) plus
      synchronous Emscripten EM_ASM hooks (`Module.cncGdiMeasure`,
      `Module.cncGdiRasterizeGlyph`) installed by `harness/bridge.js`
      that rasterize glyphs through a Canvas 2D context and write BGR
      pixels back into the wasm DIB buffer. The original
      `FontCharsClass` / `Render2DSentenceClass` GDI call sequence is
      reused unmodified; only the platform/device dependency is ported.
      Covered by the `cnc_port_probe_gdi_font` export, the `gdiFontProbe`
      RPC, and Playwright `EXPECT_WASM=1 node harness/smoke.mjs` coverage
      proving the bridge rasterizes real glyphs (non-zero coverage,
      plausible canvas-derived metrics) via
      `artifacts/screenshots/harness-smoke-gdi-font-canvas.png`. The node
      smoke targets keep the no-op `wasm_win32_gdi_stub.cpp` so the
      asset-manager font compile path still links without a browser.
- [x] Drive the original `FontCharsClass::Initialize_GDI_Font` +
      `Store_GDI_Char` through the new browser GDI bridge (not just the
      standalone `cnc_port_probe_gdi_font` mirror): the
      `cnc_port_probe_ww3d_font_chars` export creates a focused
      `WW3DAssetManager`, calls `Get_FontChars("Arial", 24, false)`, and
      drives original `Get_Char_Width` / `Blit_Char` calls for real glyph
      cache entries. The Playwright `ww3dFontChars` RPC asserts positive
      original font metrics, glyph widths, ref ownership, and non-zero
      blit coverage from `Store_GDI_Char`.
- [x] Wire `Render2DSentenceClass` text rendering through the browser
      GDI bridge and the existing D3D8/WebGL2 draw bridge end-to-end
      (font → glyph surface → `DX8Wrapper::_Copy_DX8_Rects` → texture →
      `Render2DClass` textured quad). The browser D3D8 shim now copies
      same-format `CopyRects` surface pixels into texture-level surfaces
      and uploads the destination texture; the
      `cnc_port_probe_ww3d_render2d_sentence` export plus
      `ww3dRender2DSentence` RPC render original
      `Render2DSentenceClass` text (`ZEROHOUR`) through the real
      `FontCharsClass` glyph path and verify visible glyph coverage in
      `harness-smoke-ww3d-render2d-sentence-canvas.png`.
- [x] Lift the proven `Render2DSentenceClass` text path into a focused
      `W3DDisplayString` / `DisplayString` text render probe before
      calling full Image/DisplayString text rendering complete: the
      `cnc_port_probe_ww3d_display_string` export creates original
      `W3DFontLibrary` / `W3DDisplayString` objects, drives
      `DisplayString::setText` / `setFont` / `draw` through the
      browser GDI glyph bridge and D3D8/WebGL2 draw bridge, and the
      `ww3dDisplayString` RPC verifies visible text in
      `harness-smoke-ww3d-display-string-canvas.png`.
- [x] Drive a real shipped `.w3d` mesh asset (from `W3DZH.big`) through
      the same `MeshClass::Load_W3D` + browser draw-bridge path instead
      of the synthetic in-memory quad: the browser harness mounts the
      user-supplied `art\w3d\cine_moon.w3d` bytes into MEMFS, the wasm
      probe reads those bytes into a `RAMFileClass`, loads
      `CINE_MOON` through `MeshClass::Load_W3D`, frames its original
      4-vertex/2-triangle shipped geometry from the object-space bounds,
      and verifies `WW3D::Render` reaches the browser D3D8/WebGL2 draw
      bridge with persistent buffers, transforms, texture sampling, red
      center pixels, and
      `harness-smoke-ww3d-shipped-mesh-canvas.png`. The probe registers
      a synthetic red texture under the original `cine_moon.tga` texture
      name for deterministic pixel checks; the follow-up item below
      replaces that synthetic texture with the shipped DDS texture.
- [x] Fetch and upload the real `cine_moon.tga` texture bytes from
      user-supplied texture archives for the shipped mesh render probe,
      replacing the synthetic red texture while preserving screenshot
      and browser draw-state assertions. The harness now extracts
      `Art\W3D\CINE_Moon.W3D` from `W3DZH.big` and
      `Art\Textures\cine_moon.dds` from `TexturesZH.big`, mounts those
      two user-supplied entries into MEMFS, lets original `DDSFileClass`
      resolve the material's `cine_moon.tga` reference to the shipped
      DXT5 DDS, uploads all 7 mip levels through the D3D8 texture
      lock/unlock bridge, and verifies
      `harness-smoke-ww3d-shipped-mesh-canvas.png` has non-synthetic
      real texture color (`[204,191,163,255]`) while the browser draw
      state still reports the original 4-vertex/2-triangle mesh.
- [x] Replace the shipped mesh render smoke's focused Node BIG-entry
      extraction with a browser-safe archive streaming or range-mount
      path once the port can expose large `W3DZH.big` / `TexturesZH.big`
      archives without loading hundreds of megabytes into MEMFS. The
      harness static server now supports HTTP byte ranges, the browser
      bridge can fetch a BIGF header/directory in ranged chunks and mount
      a single archive entry into MEMFS, and the shipped mesh render
      smoke verifies browser-side range loads for
      `Art\W3D\CINE_Moon.W3D` plus `Art\Textures\cine_moon.dds` before
      rendering the real textured mesh screenshot.
- [x] Move the shipped mesh render smoke's range-fetched W3D and
      DDS bytes behind the original archive registration seam: the
      browser bridge now fetches selected BIG entries with HTTP
      `Range`, synthesizes small valid runtime BIG archives, mounts
      those archives under `/assets/runtime`, and registers them
      through the existing `Win32BIGFileSystem`/`FileSystem`/
      `W3DFileSystem` owner before rendering both the real
      `CINE_MOON` mesh and the same-pass multi-texture shipped
      mesh. This proves range-backed bytes can enter through the
      original archive path, but the general on-demand full-archive
      streamer for normal startup remains open.
- [x] Add a focused browser smoke for range-backed runtime archive
      registration independent of rendering: it range-fetches
      `Data\INI\GameData.ini` and `Data\INI\Armor.ini` from the
      user-supplied `INIZH.big`, synthesizes a tiny valid
      `/assets/range-runtime/INIZH.big`, registers it through the
      runtime archive owner, and verifies the original
      `INI.cpp`/`Armor.cpp` parser probes consume those bytes via
      `Win32BIGFileSystem`. This locks the range-backed subset BIG
      path to startup-relevant data while the true on-demand
      full-archive streamer remains open.
- [x] Add a vertical browser startup smoke for range-backed archive
      registration: `npm run test:startup-range-backed-archives-browser`
      builds wasm, extracts the current runtime archives, range-fetches
      51 startup-shaped INI/CSF/map-cache entries from user-supplied
      `INIZH.big`, `EnglishZH.big`, and `MapsZH.big`, synthesizes valid
      `/assets/range-startup/*.big` archives, registers them through
      `Win32BIGFileSystem` before boot, and verifies the wasm boot reaches
      `startupAssets.status == ready` plus the expected
      `originalEngineStartup.status == missing_startup_files` frontier for
      absent base Generals startup INI files.
- [x] Extend the range-backed startup browser smoke to consume optional base
      Generals startup data when supplied: if `INI.big` is present in
      `artifacts/real-assets`, the smoke range-fetches the needed base
      startup/audio INI entries, mounts them as `ZZBase_INI.big` through the
      same synthesized BIG archive path, also mounts `English.big` as
      `ZZBase_English.big` when available, and asserts the with-base branch
      advances original startup to
      `originalEngineStartup.status == browser_device_layer_pending`,
      `deviceFactoryFrontier.nextRequired == CreateGameEngine`, and
      `milesAudioDeviceFrontier.nextRequired == webAudioPlaybackBackend`.
      The current local Zero Hour-only asset set still verifies the no-base
      branch with `optionalBaseArchives: []`.
- [x] Make the range-backed startup smoke a bounded vertical gate instead of a
      possible post-boot hang: archive mount and boot RPCs now have harness
      timeouts with browser log context, boot reuses the registered archive
      preflight when the wildcard path matches, and the C++ state serializer
      reuses the locomotor probe JSON cached during archive preflight so
      post-boot state can report the base-archive blocker.
- [x] Move the Win32GameEngine browser probe into the vertical startup/archive
      harness path: the shared `win32GameEngineProbe` assertion now runs inside
      both `npm run test:runtime-archives-browser` and
      `npm run test:startup-range-backed-archives-browser`, so the same browser
      boot that verifies real archive registration, original startup readiness,
      file/data probes, and Miles startup boundaries also drains a
      browser-backed Win32 message through the linked original
      `Win32GameEngine::serviceWindowsOS()` helper. This still leaves real
      `CreateGameEngine` / original `GameEngine.cpp` singleton ownership open.
- [x] Bring the original `TextureClass::Init` / `TextureLoader`
      foreground and background filename-loading path online for browser
      wasm so real texture probes can use the normal asset-manager
      request flow instead of pre-registering a manually uploaded
      `TextureClass`. The shipped mesh render probe now lets the original
      mesh/material load request `cine_moon.tga` through
      `WW3DAssetManager::Get_Texture`, `TextureClass::Init`, and the
      foreground `TextureLoader` DDS path, with the browser D3D8 shim
      implementing `UpdateTexture` for the original system-memory to
      default-pool texture copy. The harness verifies the mounted
      `Art\Textures\cine_moon.dds` source, all 7 DXT5 mip levels, the
      asset-manager texture hash, and a screenshot-backed WebGL draw with
      the real texture center pixel (`[204,191,163,255]`). The
      `ww3d2-texture-loader-smoke` target also stages a 4x4 TGA in MEMFS,
      requests it by bare name, and asserts the original WWLib Targa path
      initializes a non-missing `TextureClass` plus a second request
      through the asset-manager texture hash.
- [x] Replace the shipped mesh probe's focused `/art/textures/`
      `SimpleFileFactoryClass` search path setup with the original
      W3DDevice file-factory path. The probe now installs the original
      `W3DFileSystem`, routes `cine_moon.tga` lookup through
      `GameFileClass` / `FileSystem` / `Win32BIGFileSystem`, and the
      harness asserts `_TheFileFactory` is the W3D file system while
      the simple factory path is not changed.
- [x] Route the shipped mesh render smoke through registered runtime BIG
      archives instead of focused `Art/...` MEMFS entry mounts. The
      harness now registers full `W3DZH.big` and `TexturesZH.big` under
      `/assets/runtime`, the probe loads them through
      `Win32BIGFileSystem`, and `W3DFileSystem` resolves both
      `art\w3d\cine_moon.w3d` and `art\textures\cine_moon.dds` through
      the original `FileSystem` path before rendering the real texture.
- [x] Lift the shipped mesh probe's local `W3DFileSystem` /
      `FileSystem` / `Win32BIGFileSystem` setup into a shared browser
      runtime asset owner. `mountArchives` now installs the original
      local/archive/file-system/name-key globals and a runtime
      `W3DFileSystem` for the registered BIG set, and the shipped mesh
      smoke asserts that the render probe uses this runtime-owned path
      instead of stack-local file-system objects.
- [x] Exercise the original modern `W3D_CHUNK_MATERIAL_PASS` material
      install path for a real shipped multi-pass mesh. The shipped mesh
      loader smoke now scans `W3DZH.big` through `Win32BIGFileSystem`,
      loads `art\w3d\exglsshd01.w3d` through `MeshClass::Load_W3D`,
      and asserts that the original reader installs two material passes,
      per-pass vertex material/shader/texture data, texture-stage UV
      arrays, and the shipped texture names (`lakedusk.tga`,
      `exglsshd.tga`) instead of the legacy single-material
      `read_per_tri_materials` path used by `CINE_MOON`.
- [x] Extend the material-pass loader coverage to a same-pass
      multi-texture shipped mesh (stage 0 + stage 1 in one pass). The
      shipped mesh loader smoke now loads
      `art\w3d\pablinkliteb.w3d` / `PABLINKLITEB.OBJECT01` through the
      original `MeshClass::Load_W3D` path and asserts that one material
      pass exposes both `psblink.tga` on stage 0 and `psgrad.tga` on
      stage 1, with separate texture-stage UV arrays.
- [x] Teach the browser D3D8/WebGL draw bridge to sample a second bound
      texture stage with UV1. The harness now renders a synthetic
      two-texture quad with red bound on stage 0 and blue bound on stage
      1, verifies the stage-1 combiner reads `D3DTA_TEXTURE` from the
      second sampler, and asserts a blue center pixel.
- [x] Add a browser-verified terrain-style stage-1 alpha texture proof.
      The D3D8 probe now renders a red stage-0 texture with a white
      50%-alpha stage-1 texture using the original terrain two-texture
      fallback combiner shape (`stage0 SELECTARG1 texture`,
      `stage1 MODULATE texture/current`, and `stage1 alpha SELECTARG1 texture`)
      and `SRCALPHA/INVSRCALPHA` blending. The harness asserts
      the D3D/WebGL blend mapping, stage-1 alpha texture availability,
      sampler state, a half-red center pixel, and captures
      `harness-smoke-d3d8-two-texture-alpha-canvas.png`.
- [x] Wire the same-pass multi-texture shipped mesh through browser
      rendering once the WebGL draw bridge samples/applies multiple
      texture stages.
- [x] (GLM-5.2) Browser Win32 GDI font/surface bridge implemented
      (see the M4 WW3D2 device bring-up section above); the GDI entry
      points the original `FontCharsClass` rasterizes through now produce
      real canvas-backed glyphs and metrics. Node smoke targets keep the
      no-op stub.
- [x] Drive the real `FontCharsClass` glyph cache through the bridge.
- [x] Wire `Render2DSentenceClass` text → D3D8/WebGL2 textured quad
      through `DX8Wrapper::_Copy_DX8_Rects`, with browser screenshot
      coverage of visible glyphs.
- [x] Add the `W3DDisplayString` / `DisplayString` screenshot probe on
      top of the proven sentence renderer.
- [x] Add a focused original terrain tile render proof: the
      `cnc_port_probe_ww3d_terrain_tile` export builds a small
      `WorldHeightMap` using original height/tile storage, drives
      `W3DTerrainBackground::setFlip` / `doPartialUpdate` /
      `getFlatTexture` / `drawVisiblePolys`, and the Playwright
      `ww3dTerrainTile` RPC verifies the resulting WebGL draw state,
      texture upload, 32-byte `DX8_FVF_XYZDUV2` vertex layout, colored
      canvas pixels, and
      `harness-smoke-ww3d-terrain-tile-canvas.png`. Full
      `FlatHeightMapRenderObjClass` scene/display ownership remains the
      broader terrain item.
- [x] Extend the terrain tile proof to real archive-backed tile data:
      `test:ww3d-terrain-tile-archive` mounts `TerrainZH.big`, opens
      `Art\Terrain\PTBlossom01.tga`, decodes it through original
      `WorldHeightMap::countTiles` / `readTiles` into `TileData`, and feeds
      that source tile into the existing `W3DTerrainBackground` partial-update
      path. The Playwright smoke verifies the archive entry, tile checksum,
      texture upload, original stage-1 terrain texture bind/sample, 32-byte
      `DX8_FVF_XYZDUV2` vertex layout, colored canvas pixels, and
      `harness-smoke-ww3d-terrain-tile-archive-canvas.png`. Real map height
      data and full `FlatHeightMapRenderObjClass` / scene ownership remain
      open.
- [x] Add the archive-backed terrain tile render smoke to the vertical
      integration runner: `test:vertical-integrations` now gates real
      `TerrainZH.big` tile decoding through original `WorldHeightMap::readTiles`,
      `W3DTerrainBackground` stage-1 texture bind/sample, indexed terrain FVF
      draw submission, and browser WebGL2 colored pixels alongside the shell UI
      and shipped mesh rendering verticals.
- [x] Carry the same real archive-backed terrain tile through the original RTS
      scene terrain-object dispatch: `test:ww3d-terrain-tile-archive-scene`
      mounts `TerrainZH.big`, decodes `Art\Terrain\PTBlossom01.tga` through
      `WorldHeightMap::readTiles`, registers a `CLASSID_TILEMAP` render object
      with `RTS3DScene`, and verifies `WW3D::Render(scene, camera)` enters
      `RTS3DScene::Customized_Render`, reaches `W3DTerrainBackground`, samples
      the stage-1 terrain texture, and produces browser WebGL2 pixels in
      `harness-smoke-ww3d-terrain-tile-archive-scene-canvas.png`.
- [x] Promote the real map terrain scene proof to the original heightmap render
      object: `test:ww3d-terrain-map-patch-scene` now mounts `INIZH.big`,
      `MapsZH.big`, and `TerrainZH.big`, parses
      `Maps\MD_GLA03\MD_GLA03.map` through `WorldHeightMap`, selects a patch
      with loaded source terrain tiles, initializes `HeightMapRenderObjClass`,
      renders through `RTS3DScene::Customized_Render`, verifies the two
      original base/blend terrain passes reach browser `DX8Wrapper` /
      WebGL2 draw history, and captures non-black terrain coverage in
      `harness-smoke-ww3d-terrain-map-patch-scene-canvas.png`.
- [x] Promote the real map terrain scene proof into original
      `W3DTerrainVisual::load` ownership: `test:ww3d-terrain-visual-scene`
      links original `TerrainVisual.cpp` and `W3DTerrainVisual.cpp`, mounts
      `INIZH.big`, `MapsZH.big`, and `TerrainZH.big`, parses
      `Data\INI\Terrain.ini` through original `INI::load` / `INITerrain.cpp`,
      calls `W3DTerrainVisual::load` for `Maps\MD_GLA03\MD_GLA03.map`, proves
      the visual-owned `HeightMapRenderObjClass` is attached by
      `W3DDisplay::m_3DScene`, then renders the source-backed 32x32 terrain
      patch through `WW3D::Render(W3DDisplay::m_3DScene, camera)` to browser
      WebGL2. The Playwright smoke verifies two original terrain draw passes,
      510 colored canvas pixels, and
      `harness-smoke-ww3d-terrain-visual-scene-canvas.png`. Full production
      `W3DTerrainVisual::init` water/tracks/shadow/smudge ownership, full-map
      camera paging, shroud, objects, and gameplay flow remain open.
- [x] Add the visual-owned terrain scene smoke to the vertical integration
      runner: `test:vertical-integrations` now gates
      `test:ww3d-terrain-visual-scene`'s original `W3DTerrainVisual::load`
      path over real `INIZH.big`, `MapsZH.big`, and `TerrainZH.big`, including
      `Data\INI\Terrain.ini` parsing, `Maps\MD_GLA03\MD_GLA03.map` parsing,
      visual-owned `HeightMapRenderObjClass` attachment through
      `W3DDisplay::m_3DScene`, browser texture upload/indexed terrain draws,
      and non-black screenshot coverage in
      `harness-smoke-ww3d-terrain-visual-scene-canvas.png`.
- [x] Extend the visual-owned terrain scene smoke to the original
      `W3DTerrainVisual::load` draw window without post-load patch
      reinitialization. `test:ww3d-terrain-visual-scene` now runs a second
      `ww3dTerrainVisualLoadWindowScene` RPC that keeps the 129x129 draw window
      and origin produced by `W3DTerrainVisual::load`, renders the
      visual-owned `HeightMapRenderObjClass` through `W3DDisplay::m_3DScene`,
      verifies 32 indexed terrain draws and colored WebGL2 pixels, and captures
      `harness-smoke-ww3d-terrain-visual-load-window-scene-canvas.png`. The
      proof intentionally records the current ZH-only archive limitation:
      0/16,384 load-window cells have source-backed terrain tiles, while the
      selected 32x32 visual patch remains source-backed.
- [x] Add the no-reinit `W3DTerrainVisual::load` window proof to the vertical
      integration runner. `test:vertical-integrations` now checks the original
      129x129 load draw dimensions/origin, `HeightMapRenderObjClass` scene
      attachment through `W3DDisplay::m_3DScene`, indexed terrain draws,
      non-black screenshot coverage, and the explicit 16,384-cell missing
      source-backed texture gap under the current ZH-only `TerrainZH.big`
      archive set.
- [x] Add a browser-verified terrain camera-pan proof on top of the
      visual-owned map scene. `test:ww3d-terrain-visual-scene` now runs a
      `ww3dTerrainVisualCameraPanScene` RPC after the source-backed selected
      patch render, moves a real `CameraClass` eye/target over the same
      `W3DTerrainVisual::load` / `HeightMapRenderObjClass` scene, renders two
      `WW3D::Render(W3DDisplay::m_3DScene, camera)` frames, verifies two
      base/blend terrain pass pairs, gates two clears and four indexed terrain
      draws, and captures
      `harness-smoke-ww3d-terrain-visual-camera-pan-scene-canvas.png`.
      `test:vertical-integrations` now checks the camera positions, frame
      counters, terrain draw metadata, and non-black WebGL2 pixels. Continuous
      gameplay-owned camera/update flow remains open.
- [x] Broaden the visual-owned terrain scene smoke into the original logical
      terrain load path. `test:ww3d-terrain-visual-scene` now links original
      `TerrainLogic.cpp`, `W3DTerrainLogic.cpp`, `Scripts.cpp`,
      `ScriptEngine.cpp`, and `ObjectTypes.cpp`, installs focused
      `MapCache` / `GameClient` / `ThingFactory` / `ScriptEngine` ownership,
      preflights the logic-only `WorldHeightMap` parser sections
      (`HeightMapData`, `WorldInfo`, `ObjectsList`, `PolygonTriggers`,
      `SidesList`), then calls original `W3DTerrainLogic::loadMap(query=true)`
      for `Maps\MD_GLA03\MD_GLA03.map`. The harness now requires parser
      completion, source filename, extents, height range, map object count, and
      time-of-day notification to agree with the visual terrain load. Verified
      with `npm --prefix WebAssembly run test:ww3d-terrain-visual-scene`.
- [x] Extend optional base Generals terrain archive extraction and mounting.
      `extract_zh_runtime_archives.sh` now extracts or preserves `Terrain.big`
      and `Textures.big` from supplied base Generals data cabinets/images, and
      `terrain_visual_scene_smoke.mjs` mounts it beside `TerrainZH.big` through
      a `Terrain*.big` mask before calling the original
      `W3DTerrainVisual::load` probe. The bridge and aggregate vertical gate now
      accept either the current ZH-only 0/16,384 source-backed load-window cells
      or improved source-backed cells when `Terrain.big` is present, while still
      requiring all 16,384 load-window cells to be accounted for. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-visual-scene`.
- [x] Add a browser-verified lifecycle proof for the original terrain bib
      buffer path. The new `ww3dTerrainBibBufferLifecycle` RPC constructs
      original `W3DBibBuffer`, checks its vertex/index buffers plus
      normal/highlight texture resources, drives `addBibDrawable`,
      `removeHighlighting`, `removeBibDrawable`, `clearAllBibs`, and
      `freeBibBuffers`, and gates browser D3D8/WebGL2 buffer and texture
      create/update/release deltas. The Playwright smoke captures
      `harness-smoke-ww3d-terrain-bib-buffer-lifecycle-canvas.png`, and
      `test:vertical-integrations` now includes `terrain-bib-buffer-lifecycle`.
      A broader direct removal attempt for the minimal heightmap/road bypass
      still timed out and crashed Chromium after archive mounting, so full
      adjacent terrain ownership remains open. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-bib-buffer-lifecycle`,
      `npm --prefix WebAssembly run test:ww3d-terrain-visual-scene`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Add a browser-verified render-object proof for the original terrain prop
      buffer path. The new `ww3dTerrainPropBufferRender` RPC mounts range-backed
      `W3DZH.big` and `TexturesZH.big` subsets, constructs original
      `W3DPropBuffer`, drives `addProp`, `updatePropPosition`, `doFullUpdate`,
      protected cull, `removeProp`, and `clearAllProps` for shipped
      `CINE_MOON`, and verifies the prop buffer creates a cloned
      `MeshClass` render object from the original `WW3DAssetManager`. The
      focused proof renders that cloned prop object through `WW3D::Render` and
      the browser D3D8/WebGL2 bridge, gates persistent buffers, shipped DXT5
      texture sampling, cleanup deltas, and 158,069 colored screenshot pixels in
      `harness-smoke-ww3d-terrain-prop-buffer-render-canvas.png`, and adds the
      step to `test:vertical-integrations`. This deliberately stopped short of
      the production `W3DPropBuffer::drawProps` queued scene/mesh-renderer
      path, which is covered by the follow-up item below. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-prop-buffer-render`,
      `npm --prefix WebAssembly run test:ww3d-terrain-visual-scene`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Add a browser-verified production scene proof for original terrain prop
      drawing. The new `ww3dTerrainPropBufferScene` RPC mounts range-backed
      `INIZH.big`, `MapsZH.big`, `TerrainZH.big`, `W3DZH.big`, and
      `TexturesZH.big` subsets, parses real `Terrain.ini` and
      `Maps\MD_GLA03\MD_GLA03.map`, initializes an original
      `HeightMapRenderObjClass` over a source-backed patch, installs the real
      `W3DPropBuffer` as the heightmap prop owner, adds shipped `CINE_MOON`
      through `BaseHeightMapRenderObjClass::addProp`, and renders through
      `WW3D::Render(RTS3DScene, CameraClass)`. The harness verifies the frame
      submits terrain base/blend draws first, then flushes the queued prop mesh
      from `HeightMapRenderObjClass::Render` -> `W3DPropBuffer::drawProps` ->
      `RTS3DScene::Flush` -> `TheDX8MeshRenderer.Flush` as a browser-visible
      `XYZNDUV2`/FVF 594 draw using the shipped DXT5 `cine_moon.dds`, captures
      `harness-smoke-ww3d-terrain-prop-buffer-scene-canvas.png`, and adds the
      step to `test:vertical-integrations`. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-prop-buffer-scene`,
      `npm --prefix WebAssembly run test:ww3d-terrain-prop-buffer-render`,
      `npm --prefix WebAssembly run test:ww3d-terrain-visual-scene`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Add a browser-verified production scene proof for original terrain tree
      drawing. The new `ww3dTerrainTreeBufferScene` RPC mounts range-backed
      `INIZH.big`, `MapsZH.big`, `TerrainZH.big`, `W3DZH.big`, and
      `TexturesZH.big` subsets, parses real `Terrain.ini` and
      `Maps\MD_GLA03\MD_GLA03.map`, initializes an original
      `HeightMapRenderObjClass` over a source-backed patch, installs the real
      `W3DTreeBuffer` as the heightmap tree owner, adds shipped
      `PTDogwod01_S` through `BaseHeightMapRenderObjClass::addTree`, and
      renders through `WW3D::Render(RTS3DScene, CameraClass)`. The harness
      verifies the frame submits terrain base/blend draws first, then flushes
      the queued tree from `HeightMapRenderObjClass::Render` ->
      `RTS3DScene::Flush` -> `DoTrees` -> `W3DTreeBuffer::drawTrees` as a
      browser-visible `XYZNDUV1`/FVF 338 draw using
      `Art\Terrain\PTDogwod01_S.tga` and the shipped W3D mesh, captures
      `harness-smoke-ww3d-terrain-tree-buffer-scene-canvas.png`, and adds the
      step to `test:vertical-integrations`. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-tree-buffer-scene`,
      `npm --prefix WebAssembly run test:ww3d-terrain-prop-buffer-scene`,
      `npm --prefix WebAssembly run test:ww3d-terrain-visual-scene`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Add a browser-verified production scene proof for original terrain road
      drawing. The new `ww3dTerrainRoadBufferScene` RPC mounts range-backed
      `INIZH.big`, `MapsZH.big`, `TerrainZH.big`, and `TexturesZH.big`
      subsets, parses real `Terrain.ini` and `Roads.ini` through original
      `INI::load` / `INITerrain.cpp` / `INITerrainRoad.cpp` /
      `INITerrainBridge.cpp` / `TerrainRoads.cpp`, parses
      `Maps\MD_CHI01\MD_CHI01.map`, selects a real source-backed road endpoint
      pair with an available shipped road texture, installs the pair in the
      original `MapObject` linked-list shape, and drives
      `W3DRoadBuffer::loadRoads` plus `W3DRoadBuffer::drawRoads` from
      `HeightMapRenderObjClass::Render`. The harness verifies the frame submits
      terrain base/blend draws first, then flushes the road as browser-visible
      `XYZDUV1`/FVF 322 geometry using `TRThickLine` from `TexturesZH.big`,
      captures `harness-smoke-ww3d-terrain-road-buffer-scene-canvas.png`, and
      adds the step to `test:vertical-integrations`. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-road-buffer-scene`,
      `node WebAssembly/harness/terrain_road_buffer_scene_smoke.mjs`, and
      `node WebAssembly/harness/terrain_visual_scene_smoke.mjs`.
- [x] Add a browser-verified scene proof for original terrain bridge-buffer
      geometry. The new `ww3dTerrainBridgeBufferScene` RPC mounts range-backed
      `INIZH.big`, `MapsZH.big`, `TerrainZH.big`, `W3DZH.big`, and
      `TexturesZH.big` subsets, parses real `Terrain.ini` / `Roads.ini` with
      the original terrain loaders, parses a real bridge pair from
      `Maps\MD_CHI01\MD_CHI01.map`, and drives original
      `W3DBridgeBuffer::loadBridges` / `updateCenter` before drawing the
      enabled bridge geometry through original `W3DBridge::renderBridge`.
      Because optional base Generals archives are not present in this
      workspace, the smoke records the real map bridge template and substitutes
      an available shipped Zero Hour bridge template instead of inventing
      assets. The harness verifies terrain base/blend draws precede the bridge
      draw, bridge geometry uses `XYZNDUV1`/FVF 338 with 36-byte vertices, the
      bridge texture samples in browser WebGL2, projected bridge vertices land
      on the canvas, and
      `harness-smoke-ww3d-terrain-bridge-buffer-scene-canvas.png` is captured.
      Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Broaden the bridge-buffer terrain scene proof to the original
      `W3DBridgeBuffer::drawBridges` wrapper in wireframe mode. The focused
      bridge render object no longer copies the wrapper's material, index,
      vertex-buffer, shader, and bridge-iteration setup in probe code; it pins
      `TheTerrainRenderObject`, clears `TheTerrainLogic`, temporarily suppresses
      the inherited shroud, and calls original
      `W3DBridgeBuffer::drawBridges(TRUE, nullptr)` from
      `HeightMapRenderObjClass::Render`. The harness now records
      `bridgeDrawWrapperInvoked`, `bridgeDrawWrapperWireframe`,
      `bridgeTerrainRenderObjectPinned`, `bridgeShroudOverlaySuppressed`, and a
      positive wrapper draw-call delta, then verifies the bridge draw follows
      the terrain base/blend passes with browser-visible FVF 338/36-byte bridge
      vertices. This was the stepping stone for the following textured wrapper
      proof.
      Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Broaden the bridge-buffer terrain scene proof to the original textured
      `W3DBridgeBuffer::drawBridges(FALSE, nullptr)` wrapper and bridge shroud
      overlay branch. The focused terrain probe runtime now keeps the same
      `BaseHeightMapRenderObjClass` layout as the probe translation unit by
      removing the road-disable compile definition, so `m_bridgeBuffer` and
      `m_shroud` line up under the original road-enabled heightmap fields. The
      bridge scene enables a real base-owned `W3DShroud`, uploads/fills its
      shroud texture through `W3DShroud::render`, pins
      `TheTerrainRenderObject`, and calls the original non-wireframe bridge
      wrapper from `HeightMapRenderObjClass::Render` without suppressing the
      shroud. The browser harness now verifies terrain base/blend draws, the
      textured bridge base draw, then a bridge shroud overlay draw using FVF
      338 36-byte vertices, sampled shroud texture, `D3DCMP_EQUAL`,
      camera-space texture coordinates, and `D3DTTFF_COUNT2`; the C++ probe
      records the bridge draw-call delta and shroud draw-call delta separately.
      Verified with
      `cmake --build WebAssembly/build/wasm --target cnc-port -j 8`,
      `node WebAssembly/harness/terrain_bridge_buffer_scene_smoke.mjs`,
      `npm --prefix WebAssembly run test:ww3d-terrain-road-buffer-scene`, and
      `CNC_PORT_TERRAIN_SCENE_MODE=shroud node WebAssembly/harness/terrain_map_patch_scene_smoke.mjs`.
- [x] Promote the bridge-buffer terrain scene draw from the null
      `TheTerrainLogic` WorldBuilder branch to a retained TerrainLogic-owned
      draw branch. The focused bridge scene now installs a live
      `W3DTerrainLogic` scope for the render, seeds one original logical
      `Bridge` node from the first visual bridge's original `BridgeInfo`, and
      calls `W3DBridgeBuffer::drawBridges(FALSE, TheTerrainLogic)` so the
      original production draw loop walks `TheTerrainLogic->getFirstBridge()`,
      leaves the selected visual bridge enabled, and still submits the textured
      bridge base pass plus shroud overlay in the browser. The probe records
      `terrainLogicInstalledForDraw`, `terrainLogicRetainedForDraw`,
      `bridgeLogicSeededForDraw`, `bridgeDrawTerrainLogicBridgeCount`, and
      `bridgeDrawEnabledBridgeCount`; it also honestly reports the remaining
      production gap with `bridgeLogicAiPathfinderAvailable === false` and
      `bridgeLogicGenericBridgeObjectMissing === true` until the target has real
      AI/pathfinder and `GenericBridge` ThingFactory ownership. Verified with
      `cmake --build WebAssembly/build/wasm --target cnc-port -j 8` and the
      direct `terrain_bridge_buffer_scene_smoke.mjs` browser smoke over
      `INIZH.big`, `MapsZH.big`, `TerrainZH.big`, `W3DZH.big`, and
      `TexturesZH.big`.
- [x] Route the retained bridge-buffer scene through
      `W3DBridgeBuffer::loadBridges(&W3DTerrainLogic, FALSE)` and
      `TerrainLogic::addBridgeToLogic` instead of the probe-only manual bridge
      seed. The terrain probe runtime now links original `AI.cpp`, installs a
      scene-local `AI` under `TheAI`, and provides a focused bridge-layer
      pathfinder surface so `TerrainLogic::addBridgeToLogic` can assign the
      retained logical bridge to pathfind layer 2 through
      `AI::pathfinder()->addBridge()`. The browser bridge scene now reports
      `bridgeLogicAiPathfinderAvailable === true`,
      `bridgeLogicFirstLayerAfterSeed === 2`,
      `bridgeLogicSeededForDraw === true`, and retained bridge draw counts
      without calling `ProbeTerrainLogicForBridgeDraw::seedBridgeForDraw`. The
      remaining production gap is full original AIPathfind/Object/ThingFactory
      ownership: the scene still reports
      `bridgeLogicGenericBridgeObjectMissing === true` until
      `GenericBridge` is created by the real object-template path. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene` and
      `npm --prefix WebAssembly run test:ww3d-terrain-visual-scene`.
- [x] Create the retained bridge-buffer `GenericBridge` through the original
      object-template path. The terrain probe runtime now links original
      `ThingFactory`, `ThingTemplate`, `ModuleFactory`, `DamageFX`, `Armor`,
      bridge/body module sources, and the focused Object/GameLogic ownership
      needed for `TerrainLogic::Bridge::Bridge` to call
      `TheThingFactory->newObject("GenericBridge")`. The browser harness mounts
      `Armor.ini`, `DamageFX.ini`, and `Object/System.ini` from `INIZH.big`,
      extracts the shipped `GenericBridge` block, initializes the module factory
      under the same `NameKeyGenerator` used by INI parsing, and now requires
      `objectRuntime.genericBridgeTemplateLoaded === true` plus
      `bridgeLogicGenericBridgeObjectMissing === false` before accepting the
      bridge render. The shared original `AsciiString` hash now hashes string
      contents under libc++ so `hash_map<AsciiString, ...>` lookups find
      registered templates on wasm. Verified with
      `npm --prefix WebAssembly run build:wasm` and
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=120000 npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Browser-gate direct original `ThingFactory::newObject(GenericBridge)` in
      the bridge-buffer scene. The terrain bridge probe now calls
      `bridge_draw_thing_factory.newObject(findTemplate("GenericBridge"), NULL)`
      inside the same script-engine/module-factory/GameLogic/PartitionManager
      scope used by `W3DBridgeBuffer::loadBridges`, records the returned
      object ID, `GameLogic::findObjectByID` match, body-module readiness, and
      object-count increment, then destroys the temporary bridge and proves
      `GameLogic::update()` removes it before the retained bridge render. The
      browser harness rejects the scene unless the object-runtime JSON proves
      that lifecycle, so a regression back to the metadata-only guard is caught
      without adding a new smoke target. Verified with
      `npm --prefix WebAssembly run build:wasm` and
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=120000 npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Browser-gate direct original `ThingFactory::newDrawable(GenericBridge)`
      in the bridge-buffer scene. The terrain bridge probe now installs focused
      drawable-time `GameClient`, font, display-string, and language owners,
      calls `bridge_draw_thing_factory.newDrawable(...)` for
      `GenericBridge`, proves the returned drawable ID, lookup-table
      match, list head, draw-module readiness, and count increment, then
      destroys the temporary drawable and proves the count and lookup return to
      the pre-create state. `Drawable` construction now tolerates absent
      optional UI image/animation singletons by deferring static icon cache
      initialization until the real collections exist, while caption font
      lookup falls back to a narrow default if `TheInGameUI` is not installed.
      Verified with
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=120000 npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`;
      the harness captured
      `WebAssembly/artifacts/screenshots/harness-smoke-ww3d-terrain-bridge-buffer-scene-canvas.png`.
- [x] Browser-prove original `Pathfinder::newMap()` bridge-layer
      classification in the bridge-buffer scene. The focused bridge terrain
      logic now gives pathfinding an origin-based extent like production
      `W3DTerrainLogic`, keeps its flat probe terrain contract by overriding
      cliff and water checks, removes the hard browser deferral, and runs
      original `AIPathfind::newMap()` / `classifyMap()` for the retained
      logical bridge layer. The harness now rejects deferred pathfinder-map
      runs and requires the browser sample to report `newMapInvoked=true`,
      `newMapSkippedForBrowserSafety=false`, origin preflight
      `minX=0/minY=0`, a 14,112-cell MD_CHI01 extent, bridge-layer clear
      cells after classification, all sampled bridge-layer cells impassable
      after `changeBridgeState(broken)`, and clear cells restored after
      `changeBridgeState(repaired)`. Verified with
      `cmake --build WebAssembly/build/wasm --target cnc-port -j 4` and
      `npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Thread bridge pathfinder cliff classification through the loaded W3D
      terrain render object. The focused bridge terrain logic now delegates
      pathfinder `isCliffCell` queries to `W3DTerrainLogic` when the retained
      `BaseHeightMapRenderObjClass` is installed, records the real query mix
      around original `AIPathfind::newMap()` / `classifyMap()`, and keeps only
      water queries flat because the original water-grid path still depends on
      `TheTerrainVisual` ownership. The browser harness now requires all 14,112
      cliff queries to route through the render object, reports 6,102 true cliff
      cells on the MD_CHI01 bridge extent, and still proves
      `Pathfinder::changeBridgeState(broken/repaired)` against the classified
      bridge layer. Verified with
      `cmake --build WebAssembly/build/wasm --target cnc-port -j 4` and
      `npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Browser-prove W3D bridge visual damage-state sync from retained terrain
      logic. The bridge scene now primes only the cached `W3DBridge` visual
      damage enum to `BODY_RUBBLE` immediately before the normal browser render,
      leaves the retained logical `BridgeInfo.curDamageState` at
      `BODY_PRISTINE`, and requires original
      `W3DBridgeBuffer::drawBridges(FALSE, TheTerrainLogic)` to observe the
      mismatch and restore the visual bridge state to the logical terrain state.
      The harness now reports `bridgeDrawDamageSyncVisualStateBeforeDraw=3`,
      `bridgeDrawDamageSyncVisualStateAfterDraw=0`, matching terrain state, and
      positive bridge vertex/index counts before and after draw. This proves the
      render buffer follows terrain logic without faking a real damaged gameplay
      bridge state. Verified with
      `cmake --build WebAssembly/build/wasm --target cnc-port -j 4` and
      `npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Browser-gate the bridge-buffer pathfinder-map frontier without crashing
      the render harness. The bridge scene now records an original
      `AIPathfind::newMap` preflight for the retained logical bridge layer,
      reports the current MD_CHI01 bridge extent as a 14,112-cell pathfinder
      classification candidate, and deliberately defers the full
      `Pathfinder::newMap()` call because invoking it inside the focused visual
      bridge probe crashes Chromium after `W3DBridgeBuffer::loadBridges`.
      The same scene now proves the seeded original bridge layer survives
      `Pathfinder::changeBridgeState(broken/repaired)` under the focused
      `GameLogic`/`AI` owners and keeps rendering the retained bridge, roads,
      trees, and shroud overlay through the existing browser screenshot harness.
      Verified with `cmake --build WebAssembly/build/wasm --target cnc-port -j 4`
      and `npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Harness-prove the retained `GenericBridge` body-state clamp before
      chasing damaged bridge rendering. The bridge-buffer scene now reads the
      real `GenericBridge` object's `BodyModuleInterface` after
      `W3DBridgeBuffer::loadBridges(&W3DTerrainLogic, FALSE)`, records
      `bridgeLogicFirstBodyDamageStateAfterSeed === BODY_PRISTINE` with
      `MaxHealth === 1`, attempts `setDamageState(BODY_DAMAGED)`, then requires
      the original `ImmortalBody` / `ActiveBody` math to clamp the object and
      retained `BridgeInfo` back to `BODY_PRISTINE`. The same browser render
      proves `W3DBridgeBuffer::drawBridges(FALSE, TheTerrainLogic)` keeps the
      visual bridge damage state pristine after that attempted transition, so
      future damaged/repaired bridge work must locate the real gameplay/script
      state driver instead of faking it with direct body health changes.
      Verified with
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=120000 npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Move the retained `GenericBridge` clamp proof onto the original
      `Object::attemptDamage` body path. The focused object runtime now routes
      `Object::attemptDamage`, `Object::attemptHealing`, and `Object::estimateDamage`
      to the object's `BodyModuleInterface` instead of returning no-ops, and the
      bridge-buffer scene constructs a normal `DamageInfo` for the shipped
      `GenericBridge`. The browser harness now requires
      `bridgeLogicAttemptDamageInvoked === true`,
      `bridgeLogicAttemptDamageActualDealt > 0`,
      `bridgeLogicAttemptDamageActualClipped === 0`, and pristine body,
      retained `TerrainLogic`, and draw-buffer bridge damage state after
      `TerrainLogic::updateBridgeDamageStates`, proving the original
      `ImmortalBody` damage accounting is reached without faking a damaged
      bridge state. Verified with
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=120000 npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Route focused `Object::kill` / `healCompletely` through the original body
      damage/healing path and prove the shipped retained `GenericBridge` is not
      destroyed by a kill request. `Object::kill` now builds the original
      kill-flagged `DamageInfo` and calls `attemptDamage`, while
      `healCompletely` issues the original double large healing request. The
      bridge-buffer browser scene now calls `Object::kill(GenericBridge)`,
      requires the bridge object to remain present with destroyed status false,
      verifies body health/state still clamps to `MaxHealth = 1` /
      `BODY_PRISTINE`, and re-runs `TerrainLogic::updateBridgeDamageStates`
      before drawing to prove retained/drawn bridge state also stays pristine.
      Verified with
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=120000 npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Route focused non-stacking healer requests through the original
      `Object::attemptHealingFromSoleBenefactor` body path and prove the
      retained shipped `GenericBridge` records its sole benefactor without
      faking bridge damage state. The focused object runtime now matches the
      original null-source rejection, frame-expiration gate, benefactor ID /
      expiration update, and `DAMAGE_HEALING` `DamageInfo` call into the
      object's `BodyModuleInterface`; the reduced terrain-probe
      `GameLogic::update()` also advances the frame so this original gate can
      be exercised through a public lifecycle call. The browser bridge scene
      now rejects null-source healing, accepts the first and repeat bridge
      source, verifies `getSoleHealingBenefactor()` matches the bridge object
      ID, then re-runs `TerrainLogic::updateBridgeDamageStates` and draws the
      retained bridge with body, logic, and draw damage states still pristine.
      Verified with `npm --prefix WebAssembly run build:wasm` and
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=120000 npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Route focused object disabled timers through the original frame-gated
      mask/until-frame contract and prove a retained shipped `GenericBridge`
      expires a timed disabled flag through the browser bridge scene. The
      focused object runtime now uses the original core behavior for
      `setDisabled`, `setDisabledUntil`, `getDisabledUntil(DISABLED_ANY)`,
      inactive `clearDisabled` returns, and `checkDisabledStatus` expiry while
      leaving audio/drawable/contain/spawn side effects for the future full
      original owners. The bridge scene now sets `DISABLED_EMP` for two reduced
      `GameLogic::update()` frames, verifies the flag and `getDisabledUntil`
      values remain active before expiry, verifies both are clear at the expiry
      frame, and still renders the retained bridge in the pristine draw state.
      Verified with `npm --prefix WebAssembly run build:wasm` and
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=120000 npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Route focused object invulnerability through the original
      undetected-defector state toggle and prove it on a retained shipped
      `GenericBridge` in the browser bridge scene. The focused object runtime
      now mirrors the original `Object::goInvulnerable` core behavior by
      setting `UNDETECTED_DEFECTOR` for positive durations, clearing it for
      zero duration, and starting `ObjectDefectionHelper`'s timer when that
      helper is installed. The bridge scene now verifies the retained
      `GenericBridge` starts without the undetected-defector bit, sets it after
      `goInvulnerable(4)`, clears it after `goInvulnerable(0)`, and still
      renders the bridge in the pristine draw state. Verified with
      `npm --prefix WebAssembly run build:wasm` and
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=120000 npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Browser-prove the retained `GenericBridge` uses the standard
      `GameLogic::findObjectByID` object lookup path before bridge body and
      render-state checks. The bridge scene now requires the retained bridge's
      `BridgeInfo::bridgeObjectID` to resolve through `TheGameLogic` to the
      same object ID, verifies `INVALID_ID` returns null, verifies a high
      unused ID returns null, and names the lookup in the scene path before the
      damage/healing/disabled/invulnerable bridge object calls. Verified with
      `npm --prefix WebAssembly run build:wasm` and
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=120000 npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Route focused bridge object destruction through the original
      end-of-frame GameLogic destroy-list contract and prove it in the browser
      bridge scene. The focused `GameLogic::destroyObject` now queues the
      object and runs `Object::onDestroy`, `GameLogic::update` processes the
      pending destroy list before advancing the frame, and
      `processDestroyList` removes queued objects from the object list and ID
      lookup table before deleting them. The bridge scene renders the retained
      `GenericBridge` first, then verifies `destroyObject` marks it destroyed
      while leaving it lookup-visible for the rest of the frame, and verifies
      the next `update` removes it from both object count and lookup. Verified
      with `npm --prefix WebAssembly run build:wasm` and
      `CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS=120000 npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
	- [x] Feed the focused terrain road and bridge adjunct buffers from the
	      original logical terrain map-object list. The road and bridge scene probes
	      now call original `W3DTerrainLogic::loadMap(query=true)` against
      `Maps\MD_CHI01\MD_CHI01.map`, keep the resulting full `MapObject` list
      live, collect candidate point pairs from `MapObject::getFirstMapObject()`,
      and hand that list to original `W3DRoadBuffer::loadRoads` /
      `W3DBridgeBuffer::loadBridges` instead of installing a two-node selected
      pair. The road gate requires the logical-load source filename,
      time-of-day notification, map-object presence, typed road pairs, and
      `roadPairMapObjectsInstalled === false`; the bridge gate requires the
      analogous typed bridge pair state, `bridgePairMapObjectsInstalled ===
      false`, and in-place selected-template substitution for the current
	      ZH-only asset gap. `test:vertical-integrations` now includes the bridge
	      scene step and checks the logical handoff for both adjuncts. Verified with
	      `npm --prefix WebAssembly run test:ww3d-terrain-road-buffer-scene` and
	      `npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
	- [x] Batch the focused terrain sidecars into the retained bridge-buffer scene
	      proof. The `ww3dTerrainBridgeBufferScene` RPC now installs original
	      `W3DRoadBuffer`, `W3DTreeBuffer`, and `W3DBridgeBuffer` sidecars on the
	      same `ProbeHeightMapRenderObjWithBridgeBuffer`, loads all typed roads
	      from the full original MD_CHI01 logical `MapObject` list, adds shipped
	      `PTDogwod01_S` tree assets through the original heightmap tree path, and
	      renders terrain, roads, trees, retained-`TerrainLogic` bridge geometry,
	      and the bridge shroud overlay in one browser frame. The harness verifies
	      road draws follow terrain base/blend passes, tree draws flush through
	      `BaseHeightMapRenderObjClass::renderTrees`, bridge draws still follow
	      `W3DBridgeBuffer::drawBridges(FALSE, TheTerrainLogic)`, and the honest
	      `GenericBridge` / AI pathfinder blockers remain reported. Verified with
	      `cmake --build WebAssembly/build/wasm --target cnc-port -j 8` and the
	      direct `node WebAssembly/harness/terrain_bridge_buffer_scene_smoke.mjs`
	      smoke over `INIZH.big`, `MapsZH.big`, `TerrainZH.big`, `W3DZH.big`, and
	      `TexturesZH.big`.
	- [x] Add a browser-verified real-map terrain shroud scene proof. The new
	      `test:ww3d-terrain-shroud-scene` path mounts real `INIZH.big`,
      `MapsZH.big`, and `TerrainZH.big`, parses
      `Data\INI\Terrain.ini` through original `INI::load` / `INITerrain.cpp`,
      parses `Maps\MD_GLA03\MD_GLA03.map` through original `WorldHeightMap`,
      initializes a source-backed `HeightMapRenderObjClass` patch with a real
      `W3DShroud`, calls `W3DShroud::init`, `fillShroudData`, and
      `W3DShroud::render`, then verifies the shroud terrain pass reaches
      browser WebGL2 with `D3DCMP_EQUAL`, camera-space texture projection, and
      `D3DTTFF_COUNT2` texture transform state after the base/blend terrain
      passes. The focused probe uses a guarded direct D3D draw after installing
      the original `W3DShroudMaterialPassClass`, so full production
      `W3DTerrainVisual` / `BaseHeightMapRenderObjClass` shroud ownership
      remains open. The smoke captures
      `harness-smoke-ww3d-terrain-shroud-scene-canvas.png`.
- [x] Retire the focused terrain shroud direct-D3D fallback. The shroud scene
      target now lets `BaseHeightMapRenderObjClass` own `W3DShroud` in shroud
      mode under the existing minimal heightmap-system guard, preserves that
      base-owned shroud in the probe render object, and removes the probe's
      guarded direct `IDirect3DDevice8::DrawIndexedPrimitive` path. The original
      `HeightMapRenderObjClass::Render` extra-pass branch now saves/restores
      `TheTerrainRenderObject` around `W3DShroudMaterialPassClass` material
      install and `renderTerrainPass`, so the browser harness sees the shroud
      draw after the base/blend terrain passes while
      `terrainFallbackInvoked` remains false. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-shroud-scene` plus the
      broader terrain batch:
      `test:ww3d-terrain-map-patch-scene`,
      `test:ww3d-terrain-visual-scene`,
      `test:ww3d-terrain-prop-buffer-scene`,
      `test:ww3d-terrain-tree-buffer-scene`,
      `test:ww3d-terrain-road-buffer-scene`, and
      `test:ww3d-terrain-bridge-buffer-scene`.
- [x] Promote the shroud terrain pass into a visual-owned scene proof. The
      `ww3dTerrainVisualShroudScene` RPC now calls
      `W3DTerrainVisual::load` against the real MD_GLA03 map, installs a
      shroud-capable `HeightMapRenderObjClass` through the visual-owned terrain
      render-object slot, initializes/fills/renders the original `W3DShroud`,
      and then renders `W3DDisplay::m_3DScene`. The browser harness verifies
      source-backed terrain base/blend draws followed by the
      `W3DShroudMaterialPassClass` pass with `D3DCMP_EQUAL`, camera-space
      texture projection, `D3DTTFF_COUNT2`, no fallback draw, and colored
      WebGL2 pixels in
      `harness-smoke-ww3d-terrain-visual-shroud-scene-canvas.png`.
      `test:ww3d-terrain-visual-scene` now runs this visual-owned shroud mode
      beside the baseline visual scene, full-scene water-assets frontier,
      camera-pan, and load-window proofs, and the vertical integration validator
      gates the new visual shroud payload. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-visual-scene` and
      `npm --prefix WebAssembly run test:ww3d-terrain-shroud-scene`.
- [x] Prove visual-owned shroud data updates through the original display shroud
      API. The new `ww3dTerrainVisualShroudUpdateScene` RPC reuses
      `W3DTerrainVisual::load` on the real MD_GLA03 map, keeps a
      shroud-capable `HeightMapRenderObjClass` in the visual-owned terrain
      render-object slot, renders an initial base/blend/shroud frame, routes a
      25x25 clear-cell update through original
      `W3DDisplay::setShroudLevel(CELLSHROUD_CLEAR)`, verifies the sampled
      `W3DShroud` level reaches `GlobalData::m_clearAlpha`, re-renders the
      shroud texture, and renders a second `W3DDisplay::m_3DScene` frame. The
      browser harness gates two ordered `W3DShroudMaterialPassClass` terrain
      draws, a second shroud texture-update count, colored WebGL2 pixels, and
      captures
      `harness-smoke-ww3d-terrain-visual-shroud-update-scene-canvas.png`.
      Verified with `npm --prefix WebAssembly run test:ww3d-terrain-visual-scene`
      and `npm --prefix WebAssembly run test:ww3d-terrain-shroud-scene`.
- [x] Prove visual-owned shroud refresh through original `PartitionManager`. The
      `zh_w3d_terrain_probe_runtime` target now links
      `GameLogic/Object/PartitionManager.cpp`, and
      `ww3dTerrainVisualShroudUpdateScene` runs a third shroud pass that
      constructs a bounded real `PartitionManager`, calls `revealMapForPlayer`,
      then routes `refreshShroudForLocalPlayer` through forwarding display/radar
      adapters into the visual-owned `W3DShroud`. The browser harness verifies
      the fogged sample status/level, display and radar clear/set traffic, a
      third shroud texture upload, three ordered base/blend/shroud terrain
      batches, and WebGL2 pixels in
      `harness-smoke-ww3d-terrain-visual-shroud-update-scene-canvas.png`.
      Verified with
      `node harness/terrain_visual_scene_smoke.mjs artifacts/real-assets/INIZH.big artifacts/real-assets/MapsZH.big artifacts/real-assets/TerrainZH.big`.
- [x] Tighten the visual-owned terrain load-window gate now that base
      `Terrain.big` is available in this workspace. The npm and vertical
      integration invocations now pass `artifacts/real-assets/Terrain.big`
      explicitly, `terrain_visual_scene_smoke.mjs` requires the original
      129x129 `W3DTerrainVisual::load` window to report all 16,384 cells as
      source-backed with zero missing source cells, and the bridge RPC
      validator enforces the same contract for
      `ww3dTerrainVisualLoadWindowScene`. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-visual-scene`.
- [x] Tighten the bridge-buffer terrain scene gate now that base Generals
      runtime archives are available. The extractor now pulls `W3D.big` from
      base `Data2.cab`, the bridge-buffer scene mounts `Terrain.big`,
      `W3D.big`, and `Textures.big` beside the Zero Hour archives, and the
      npm/vertical invocations pass those base sidecars explicitly. The
      `ww3dTerrainBridgeBufferScene` RPC and smoke now require the shipped
      MD_CHI01 `EuropeanBridgeWide` bridge to render without Zero Hour
      template substitution, with an asset-backed bridge candidate and all
      1,024 selected patch cells source-backed by mounted terrain tiles.
      Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Add a combined terrain full-scene missing-water-assets frontier. The
      `test:ww3d-terrain-full-scene` harness now mounts range-backed real
      `INIZH.big`, `MapsZH.big`, `TerrainZH.big`, optional base `Terrain.big`,
      and any matching water texture archives, exposes
      `ww3dTerrainFullScene`, parses original `Data\INI\Water.ini` through
      `INI.cpp` / `INIWater.cpp`, and reports water asset readiness before
      entering full `W3DTerrainVisual::init`. With the current workspace's
      Zero Hour-only texture set it intentionally stops at
      `full-init-missing-water-assets-frontier` with 4 parsed water settings
      and a first missing texture of `TSCloudWis.tga`, avoiding the previous
      browser crash while still rendering the source-backed terrain scene
      through `W3DDisplay::m_3DScene` and capturing
      `harness-smoke-ww3d-terrain-full-scene-canvas.png`. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-full-scene`.
- [x] Promote the terrain full-scene path past the missing-water-assets
      frontier into original water/smudge initialization and browser rendering.
      The terrain probe now installs the runtime W3D archive file system before
      full `W3DTerrainVisual::init`, uses the game-specific `W3DAssetManager`
      singleton expected by W3D water code, links real `Smudge.cpp` /
      `W3DSmudge.cpp` instead of weak smudge method stubs, initializes
      `W3DSmudgeManager` members safely, and preserves the real terrain/global
      file-system owners while loading the map. The full-scene harness now
      passes with real water/smudge init, WebGL2 indexed draw submission, and a
      nonblank terrain screenshot. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-full-scene`.
- [x] Promote the terrain full-scene water/smudge path into the aggregate
      vertical gate. `test:vertical-integrations` now runs the same
      `terrain_visual_scene_smoke.mjs` path with mounted base `Terrain.big` and
      requires the full-scene payload to prove base `Textures.big` water assets,
      original `Data\INI\Water.ini` parsing, full `W3DTerrainVisual::init`,
      `WaterRenderObjClass` scene attachment, source-backed terrain geometry,
      WebGL2 texture uploads/indexed draws, and the
      `harness-smoke-ww3d-terrain-full-scene-canvas.png` screenshot. Real
      gameplay-owned map-load/terrain ownership remains open in `TODO.md`.
- [x] Add a full-init terrain shroud refresh proof beside the full-scene water
      gate. The new `ww3dTerrainFullSceneShroudUpdate` RPC runs full
      `W3DTerrainVisual::init`, keeps the original `HeightMapRenderObjClass`
      terrain render object and its `getShroud()` owner, fills/renders that
      shroud, routes a clear-cell update through original
      `W3DDisplay::setShroudLevel`, and then refreshes through original
      `PartitionManager::refreshShroudForLocalPlayer` using the existing bounded
      partition adapters. The harness verifies original water/smudge ownership
      remains active, three ordered base/blend/shroud browser frames render
      through `W3DDisplay::m_3DScene`, shroud texture uploads advance after both
      updates, and
      `harness-smoke-ww3d-terrain-full-scene-shroud-update-canvas.png` contains
      colored WebGL2 pixels. The aggregate vertical gate now asserts the same
      payload; real gameplay-owned map-load/partition/terrain ownership remains
      open in `TODO.md`. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-full-scene`.
- [x] Source the bounded terrain shroud partition refresh from the loaded
      logical terrain extent. The visual-owned and full-init shroud update
      probes now run original `W3DTerrainLogic::loadMap(query=true)` before
      `PartitionManager::refreshShroudForLocalPlayer`, pass the loaded
      `MD_GLA03` 3800x3800 extent into the partition metrics, record the
      original fast-ceil full source partition count as 381x381 at
      `MAP_XY_FACTOR`, and clamp the browser refresh to a 48x48 source-derived
      partition window. The harness gates both shroud update paths on the
      source extent, bounded cell counts, display/radar set calls, ordered
      base/blend/shroud frames, texture-upload advancement, and colored WebGL2
      screenshots. Production `PlayerList` / `Player`, target-wide
      `GlobalData` partition-cell-size ownership, and full gameplay
      partition/terrain ownership remain open in `TODO.md`. Verified with
      `npm --prefix WebAssembly run test:ww3d-terrain-full-scene`.
- [x] Drive the bounded terrain shroud partition refresh through original
      `GlobalData::m_partitionCellSize`. The terrain probe runtime now
      force-includes the original `Common/GlobalData.h` before the shim
      `PreRTS.h` path and defines `WASM_USE_ORIGINAL_GLOBALDATA`, so the linked
      original `PartitionManager.cpp` resolves `TheGlobalData` through
      `TheWritableGlobalData` instead of the target-local shim singleton. The
      probe removed the 1-unit grid override, writes the source
      `MAP_XY_FACTOR` cell size to `TheWritableGlobalData`, and reports the
      bounded 48x48 partition window at the production 10-unit cell size. The
      browser harness now gates the visual-owned and full-init shroud update
      paths on `partitionCellSize == sourcePartitionCellSize == 10` and
      `terrainExtentHi == (cellCount - 1) * partitionCellSize`. Broader
      gameplay-owned `PlayerList` / `Player`, full `TerrainLogic`, and
      unbounded partition ownership remain open in `TODO.md`. Verified with
      `llvm-nm -C .../PartitionManager.cpp.o`, `npm --prefix WebAssembly run build:wasm`,
      and `npm --prefix WebAssembly run test:ww3d-terrain-full-scene`.
- [x] Replace the bounded terrain shroud player/list layout shim with original
      `PlayerList` / `Player` ownership. `zh_w3d_terrain_probe_runtime` now
      links original `PlayerList.cpp`, `Player.cpp`, and the required RTS
      support owners, while `run_partition_shroud_refresh_probe` constructs the
      real `PlayerList`, installs it as `ThePlayerList`, and uses
      `getLocalPlayer()->getPlayerIndex()` for the original
      `PartitionManager` reveal and shroud-refresh calls. The old
      `ProbePlayerIndexShim` / `ProbePlayerListShim` structs are gone; the
      remaining weak hooks only cover dormant Player AI/object/radar/resource
      branches until the full gameplay owners link into this path. Verified
      with `npm --prefix WebAssembly run build:wasm` and
      `npm --prefix WebAssembly run test:ww3d-terrain-full-scene`.
- [x] Apply D3D face culling before browser wireframe expansion. The
      D3D8/WebGL bridge now projects indexed triangles with the captured
      world/view/projection matrices, classifies CW/CCW winding, applies
      `D3DCULL_CW` / `D3DCULL_CCW` before expanding wireframe draws into GL
      line indices, preserves triangle-strip winding parity, and treats a fully
      culled wireframe batch as a valid zero-count draw. The existing
      `cnc_port_probe_d3d8_fill_mode` path now sets identity transforms and a
      CW cull state over one CCW and one CW triangle, and the browser harness
      requires one emitted triangle, one culled triangle, culling metadata, and
      the expected WebGL pixel. Verified with
      `npm --prefix WebAssembly run build:wasm`, a focused Playwright
      `d3d8FillMode` RPC check, and `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Prove browser D3D8 wireframe depth-bias parity for W3D-style overlay
      passes. The existing `cnc_port_probe_d3d8_z_bias` path now renders a red
      solid depth prepass, switches to `D3DFILL_WIREFRAME` with `D3DRS_ZBIAS=8`
      and `D3DCMP_LESS`, and draws the same-depth green indexed geometry. The
      browser RPC now requires the final draw to carry the biased depth state,
      expand to 12 generated GL line indices, and turn the center pixel green,
      proving the shader depth-bias path applies to wireframe line draws.
      Verified with `npm --prefix WebAssembly run build:wasm` and a focused
      Playwright `d3d8ZBias` RPC check, and
      `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Prove original W3D `EXTRA_PASS_LINE` selection/outline rendering in a
      real `RTS3DScene`. The existing `ww3dRTSScene` RPC now sets
      `SceneClass::EXTRA_PASS_LINE`, renders through `WW3D::Render(scene,
      camera)`, and verifies the depth prepass plus final W3D draw carrying
      `D3DFILL_WIREFRAME`, `D3DRS_ZBIAS=7`, and RGB color writes. The browser
      bridge expands the 12 source triangles into 24 GL line indices after
      culling 8 triangles and emitting 4, then proves visible canvas coverage
      with 4,899 colored pixels and brightest pixel `[25,216,76,255]` in
      `harness-smoke-ww3d-rts-scene-canvas.png`. Verified with
      `npm --prefix WebAssembly run build:wasm`, a focused Playwright
      `ww3dRTSScene` RPC check, and `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Prove original W3D `EXTRA_PASS_CLEAR_LINE` selection/outline rendering
      in a real `RTS3DScene`. The new `ww3dRTSSceneClearLine` RPC shares the
      real scene setup, sets `SceneClass::EXTRA_PASS_CLEAR_LINE`, and verifies
      the original clear-line branch's target-only black clear, alpha-mask
      pass, RGB wireframe overlay, restored native viewport, and browser draw
      under the camera z-range overlay bias (`MaxZ=0.9998999834060669`) with
      `D3DFILL_WIREFRAME` and `D3DRS_ZBIAS=0`. The browser bridge again expands
      the 12 source triangles into 24 GL line indices after culling 8 triangles
      and emitting 4, then proves visible canvas coverage with 4,899 colored
      pixels and brightest pixel `[25,216,76,255]` in
      `harness-smoke-ww3d-rts-scene-clear-line-canvas.png`. Verified with
      `npm --prefix WebAssembly run build:wasm`, a focused Playwright
      `ww3dRTSSceneClearLine` RPC check, and
      `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Add a harness-checked `INI` layout parity proof to the terrain rendering
      probes before chasing the remaining `getSeps()` warm-up workaround.
      `wasm_ini_layout_probe.cpp` is built with the real INI runtime, while
      `wasm_ww3d_terrain_probe.cpp` compares its own `INI` view against that
      runtime for `sizeof(INI)`, the `m_seps` / `m_sepsPercent` /
      `m_sepsColon` / `m_sepsQuote` offsets, and the separator literals.
      `test:ww3d-terrain-map-patch-scene`,
      `test:ww3d-terrain-visual-scene`, and the aggregate vertical gate now
      require the comparison to match. A direct removal attempt still caused
      the map-patch browser RPC to time out and crash after archive mounting,
      so the separator touch remains while the old suspected ODR/member-offset
      mismatch is no longer the active theory. Verified with
      `npm --prefix WebAssembly run build:wasm`,
      `npm --prefix WebAssembly run test:ww3d-terrain-map-patch-scene`, and
      `npm --prefix WebAssembly run test:ww3d-terrain-visual-scene`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Remove the terrain INI separator warm-up workaround. The terrain probe no
      longer calls the `volatile getSeps()` helper before original
      `INI::load`; the helper and all terrain, roads, and water call sites were
      deleted while keeping the harness-checked `INI` layout parity report. The
      browser smokes now prove `Terrain.ini`, `Roads.ini`, and `Water.ini`
      parse through the original INI reader without the warm-up touch, with
      terrain, road/bridge, water, shroud, and source-backed load-window
      screenshots still rendered. Verified with
      `npm --prefix WebAssembly run build:wasm`,
      `npm --prefix WebAssembly run test:ww3d-terrain-map-patch-scene`,
      `npm --prefix WebAssembly run test:ww3d-terrain-full-scene`, and
      `npm --prefix WebAssembly run test:ww3d-terrain-bridge-buffer-scene`.
- [x] Feed shipped map height/blend data into the terrain scene proof:
      `test:ww3d-terrain-map-patch-scene` mounts `INIZH.big`, `MapsZH.big`,
      and `TerrainZH.big`, reads real `Data\INI\Terrain.ini` terrain texture
      mappings into `TerrainTypeCollection`, parses
      `Maps\Tournament Desert\Tournament Desert.map` through the original
      `WorldHeightMap` constructor, and renders a bounded map patch through
      `W3DTerrainBackground` registered as `CLASSID_TILEMAP` in `RTS3DScene`.
      The Playwright smoke verifies map bytes/dimensions/checksums, stage-1
      terrain texture upload/sample, 32-byte terrain FVF draw submission, and
      browser WebGL2 pixels in
      `harness-smoke-ww3d-terrain-map-patch-scene-canvas.png`. Full
      `HeightMapRenderObjClass` / `W3DTerrainVisual` ownership remains open.
- [x] Replace the focused `terrain-texture-mapping-reader` in
      `test:ww3d-terrain-map-patch-scene` with the original
      `INI::load` / `INITerrain.cpp` terrain parser: the browser smoke now
      reads `Data\INI\Terrain.ini` from `INIZH.big` into the original
      `TerrainTypeCollection`, reports 247 terrain types, parses
      `Maps\Tournament Desert\Tournament Desert.map` through
      `WorldHeightMap`, and renders the `RTS3DScene` / `W3DTerrainBackground`
      patch to browser pixels in
      `harness-smoke-ww3d-terrain-map-patch-scene-canvas.png`.
- [x] Add a focused original WW3D `SimpleSceneClass` / `CameraClass`
      ownership proof: `cnc_port_probe_ww3d_scene_camera` adds an
      `AABoxRenderObjClass` to a scene, renders through
      `WW3D::Render(scene, camera)`, and the Playwright
      `ww3dSceneCamera` RPC verifies persistent WebGL buffers,
      transform capture, visible canvas pixels, and
      `harness-smoke-ww3d-scene-camera-canvas.png`. Full
      `RTS3DScene` / `W3DDisplay` shell-map ownership remains open.
- [x] Add a focused original `RTS3DScene` render proof:
      `cnc_port_probe_ww3d_rts_scene` links the real
      `W3DScene.cpp`, builds an `RTS3DScene`, adds an
      `AABoxRenderObjClass`, renders through `WW3D::Render(scene,
      camera)`, verifies scene visibility plus shadow/particle flush
      hooks, and the Playwright `ww3dRTSScene` RPC verifies persistent
      WebGL buffers, transform capture, colored pixels, and
      `harness-smoke-ww3d-rts-scene-canvas.png`. Full `W3DDisplay`
      shell-map ownership remains open.
- [x] Add a focused original `W3DDisplay` static-scene ownership proof:
      `cnc_port_probe_ww3d_display_scene` installs real
      `W3DDisplay::m_3DScene` / `m_2DScene` / `m_3DInterfaceScene`
      ownership, applies `W3DDisplay::setTimeOfDay` to a real
      `LightClass`, renders an `AABoxRenderObjClass` through
      `WW3D::Render(W3DDisplay::m_3DScene, camera)`, and the Playwright
      `ww3dDisplayScene` RPC verifies persistent WebGL buffers,
      transform capture, colored pixels, and
      `harness-smoke-ww3d-display-scene-canvas.png`. Full
      `W3DDisplay::init()` / shell-map rendering remains open.
- [x] Add a composed browser rendering vertical that layers existing original
      shell-facing paths in one screenshot: `test:ww3d-display-shell-composite`
      range-fetches the needed `INIZH.big` mapped-image INI entries,
      `EnglishZH.big` `SCShellUserInterface512_001.tga`, and
      `Generals.csf`, then calls the browser `ww3dDisplayShellComposite` RPC.
      The RPC renders `W3DDisplay::m_3DScene -> WW3D::Render`, real
      exact-block mapped-image data -> `W3DDisplay::drawImage` shell UI art
      (`WatermarkChina`), and `GameText::fetch -> W3DDisplayString::draw` text
      without clearing between probes, and verifies scene, mapped-image, text,
      texture-upload, and center-pixel checks through
      `harness-smoke-ww3d-display-shell-composite-canvas.png`. This is a
      rendering vertical toward shell/menu composition; full
      `WindowLayout` / `GameWindowManager::winRepaint` shell rendering with
      real `W3DDisplay` remains open.
- [x] Add a browser-verified original window repaint vertical on the real W3D
      draw bridge: `test:ww3d-window-repaint` creates a synthetic original
      `W3DGameWindowManager` root plus `gogoGadgetPushButton`, verifies the
      original `W3DGadgetPushButtonDraw` / `GadgetPushButtonInput` callbacks,
      drives `GameWindowManager::winRepaint`, and forwards
      `winOpenRect`/`winFillRect` through a focused vtable-safe `Display`
      adapter into real `W3DDisplay::drawOpenRect` /
      `W3DDisplay::drawFillRect`. The Playwright smoke verifies both Display
      repaint calls, two browser `DrawIndexedPrimitive` calls, untextured
      44-byte Render2D vertices, green button-center pixels, black outside
      pixels, and
      `harness-smoke-ww3d-window-repaint-canvas.png`. This removes the
      counter-only `SmokeDisplay` gap for a minimal original widget repaint;
      at that point, full archive-loaded `WindowLayout` / `.wnd` shell repaint
      was still open.
- [x] Replace the focused shell-layout repaint gap with an archive-backed
      original `WindowLayout` browser repaint smoke: `test:ww3d-window-layout-repaint`
      mounts real `WindowZH.big`, loads `Window\Menus\Defeat.wnd` through
      original `WindowLayout::load -> GameWindowManager::winCreateFromScript`,
      links the original layout parser while keeping legacy probe stubs weak,
      creates real `W3DGameWindow` instances through `W3DGameWindowManager`,
      and drives `GameWindowManager::winRepaint` into real
      `W3DDisplay`/browser D3D8/WebGL2 pixels. The Playwright smoke verifies
      the parsed root/parent callbacks, draw-call counts, blue dialog interior
      pixels, black outside pixels, and
      `harness-smoke-ww3d-window-layout-repaint-canvas.png`.
- [x] Extend archive-backed `WindowLayout` repaint coverage to the real
      MainMenu shell layout: `test:ww3d-main-menu-layout-repaint` mounts
      `WindowZH.big`, loads `Window\Menus\MainMenu.wnd`, resolves the
      `MainMenuSystem`, `MainMenuInput`, `W3DMainMenuInit`, `MainMenuUpdate`,
      and `MainMenuShutdown` callback names, creates W3D-backed windows, prunes
      the focused proof to `MainMenu.wnd:MapBorder4`, and drives
      `GameWindowManager::winRepaint` through `W3DGameWinDefaultDraw`,
      `W3DDisplay::drawOpenRect` / `drawFillRect`, and the browser D3D8/WebGL2
      bridge. The Playwright smoke verifies the parsed MainMenu root and
      MapBorder4 geometry/callbacks/colors, two W3D draw calls, blue border
      pixels, the translucent black interior over the black canvas, black
      outside pixels, and
      `harness-smoke-ww3d-main-menu-layout-repaint-canvas.png`.
- [x] Carry a real image-backed `Menus/MainMenu.wnd` child through the original
      WND repaint stack into browser pixels: `test:ww3d-main-menu-layout-image-repaint`
      range-fetches `WindowZH.big` `Window\Menus\MainMenu.wnd`, `INIZH.big`
      `Data\INI\MappedImages\TextureSize_512\SCSmShellUserInterface512.INI`,
      and `EnglishZH.big`
      `Data\English\Art\Textures\SCSmShellUserInterface512_001.tga`, creates
      the real W3D-backed MainMenu windows, verifies
      `GameWindowManagerScript.cpp::parseDrawData` binds
      `MainMenu.wnd:Logo` to the original `GeneralsLogo` mapped image, and
      drives `GameWindowManager::winRepaint` through
      `W3DGameWinDefaultDraw`, `TheWindowManager->winDrawImage`,
      `ProbeForwardingW3DDisplay -> W3DDisplay::drawImage`,
      `WW3DAssetManager`, `TextureClass::Init`, and the browser
      D3D8/WebGL2 bridge. The Playwright smoke pins the source offsets/sizes,
      target geometry `(504,16)-(791,110)`, `GeneralsLogo` atlas metadata
      (370x120 in a 512x512 TGA), one indexed draw, texture upload/bind calls,
      colored logo pixels, black outside pixels, and
      `harness-smoke-ww3d-main-menu-layout-image-repaint-canvas.png`.
- [x] Add the real MainMenu WND image repaint smoke to the vertical integration
      runner: `test:vertical-integrations` now gates the
      `MainMenu.wnd:Logo` slice alongside the other rendering verticals,
      validating the original `WindowLayout::load`,
      `GameWindowManagerScript.cpp::parseDrawData`,
      `W3DGameWinDefaultDraw`, `W3DDisplay::drawImage`, and browser
      D3D8/WebGL2 pixel path before the shell composite and shipped mesh
      smokes run.
- [x] Promote the real full-screen `MainMenuRuler` WND image child into the
      archive-backed `Menus/MainMenu.wnd` repaint smoke: the browser harness
      now range-mounts `WindowZH.big`, `INIZH.big`, `EnglishZH.big`, and
      `TexturesZH.big`, loads both the `GeneralsLogo` and `MainMenuRuler`
      mapped-image blocks, keeps the real `MainMenu.wnd:MainMenuRuler` and
      `MainMenu.wnd:Logo` children visible, and drives
      `GameWindowManager::winRepaint` through two original
      `W3DGameWinDefaultDraw` image calls into browser WebGL2 indexed draws.
      `npm run test:ww3d-main-menu-layout-image-repaint` now proves the
      full-screen ruler geometry `(0,0)-(800,600)`, logo overlay geometry
      `(504,16)-(791,110)`, `TexturesZH.big`
      `Art\Textures\mainmenuruleruserinterface.tga` upload as a 1024x1024
      texture, at least two `W3DDisplay::drawImage` / browser draw calls,
      colored ruler and logo pixels, and
      `harness-smoke-ww3d-main-menu-layout-image-repaint-canvas.png`.
- [x] Broaden the archive-backed `Menus/MainMenu.wnd` image repaint smoke to a
      nested real push-button image-state branch: the probe now keeps
      `MainMenu.wnd:ButtonSinglePlayer` visible alongside the ruler and logo,
      loads `Buttons-Left`, `Buttons-Middle`, and `Buttons-Right` from the
      shipped `SCSmShellUserInterface512.INI` mapped-image atlas, verifies the
      parsed `W3DGadgetPushButtonImageDraw` / `GadgetPushButtonSystem` /
      `GadgetPushButtonInput` callbacks and enabled image pointers, and drives
      the repaint to 16 `W3DDisplay::drawImage` calls and 20 browser indexed
      draws. `npm run test:ww3d-main-menu-layout-image-repaint` and
      `npm run test:vertical-integrations` now gate the button layout
      `(540,116)-(748,152)`, the three source atlas images, and a scanned
      button-region pixel proof in
      `harness-smoke-ww3d-main-menu-layout-image-repaint-canvas.png`.
- [x] Extend the archive-backed `Menus/MainMenu.wnd` image repaint smoke through
      the real push-button text path: the range-backed `EnglishZH.big` subset
      now includes `Data\English\generals.csf`, the probe creates the original
      `GameTextInterface`, fetches `GUI:SinglePlayer` as `SOLO PLAY`, lets
      `W3DGadgetPushButtonImageDraw` bind the parsed WND font, and renders the
      label with a real `W3DDisplayString`. `npm run
      test:ww3d-main-menu-layout-image-repaint` and `npm run
      test:vertical-integrations` now gate the button text metrics
      `(120x22)`, CSF/GameText readiness, the original path marker
      `GameText::fetch(GUI:SinglePlayer) -> W3DDisplayString::draw button
      label`, 21 browser indexed draws, and a non-empty button text pixel
      region in
      `harness-smoke-ww3d-main-menu-layout-image-repaint-canvas.png`.
- [x] Broaden the same `Menus/MainMenu.wnd` repaint smoke from one visible
      push-button to the real main-menu button stack. The image-mode probe now
      keeps `ButtonSinglePlayer`, `ButtonMultiplayer`, `ButtonOptions`,
      `ButtonCredits`, and `ButtonExit` visible alongside the ruler and logo,
      verifies each child has the original `W3DGadgetPushButtonImageDraw` /
      `GadgetPushButtonSystem` / `GadgetPushButtonInput` callbacks, confirms
      all five use the shipped `Buttons-Left` / `Buttons-Middle` /
      `Buttons-Right` mapped images, and fetches their CSF labels through the
      original `GameTextInterface` before rendering them with
      `W3DDisplayString`. The Playwright harness now samples every added
      button body and text region, gating 72 `W3DDisplay::drawImage` calls, 82
      browser indexed draws, and non-empty pixels for `MULTIPLAYER`, `OPTIONS`,
      `CREDITS`, and `EXIT GAME` in
      `harness-smoke-ww3d-main-menu-layout-image-repaint-canvas.png`. Verified
      with `npm run test:ww3d-main-menu-layout-image-repaint` and
      `npm run test:vertical-integrations`.
- [x] Extend the archive-backed `Menus/MainMenu.wnd` visible button stack
      through `ButtonLoadReplay`: `test:ww3d-main-menu-layout-image-repaint`
      now resolves the shipped `GUI:ReplayMenu` CSF label, preserves the real
      208x35 WND geometry at y=196, binds the same enabled
      `Buttons-Left` / `Buttons-Middle` / `Buttons-Right` images, and verifies
      browser pixels for the button body and text through the original
      `W3DGadgetPushButtonImageDraw` / `W3DDisplayString::draw` path. The
      vertical integration gate also requires this MainMenu child.
- [x] Extend the archive-backed `Menus/MainMenu.wnd` repaint smoke through the
      real hidden static text child: the probe now finds the shipped
      `MainMenu.wnd:StaticTextSelectDifficulty` window, verifies its original
      `W3DGadgetStaticTextDraw` / `GadgetStaticTextSystem` /
      `GadgetStaticTextInput` callbacks, preserves its hidden initial state,
      then runs a focused repaint that unhides the child and hides the
      overlapping Single Player button. The browser harness fetches
      `GUI:SelectDifficulty` from `Data\English\generals.csf`, renders
      `SELECT DIFFICULTY` through a real `W3DDisplayString`, samples a
      non-empty static-text pixel region, and writes
      `harness-smoke-ww3d-main-menu-layout-static-text-repaint-canvas.png`.
      Verified with `npm run test:ww3d-main-menu-layout-image-repaint` and
      `npm run test:vertical-integrations`.
- [x] Extend the archive-backed `Menus/MainMenu.wnd` repaint smoke through the
      real Load Replay dropdown controls: the probe now runs a dedicated
      Load Replay focused mode that unhides the shipped
      `MainMenu.wnd:MapBorder3` parent plus `ButtonLoadGame`, `ButtonReplay`,
      and `ButtonLoadReplayBack`, verifies `PassSelectedButtonsToParentSystem`
      and each `W3DGadgetPushButtonImageDraw` / `GadgetPushButtonSystem` /
      `GadgetPushButtonInput` binding, reuses the original `Buttons-Left` /
      `Buttons-Middle` / `Buttons-Right` mapped images, fetches
      `GUI:MainMenuLoadGame`, `GUI:MainMenuLoadReplay`, and `GUI:Back`
      through `GameText`, and samples non-empty button and label pixels in
      `harness-smoke-ww3d-main-menu-layout-load-replay-repaint-canvas.png`.
      Verified with `npm run test:ww3d-main-menu-layout-image-repaint` and
      `npm run test:vertical-integrations`.
- [x] Extend the archive-backed `Menus/MainMenu.wnd` repaint smoke through the
      real Single Player dropdown controls: the probe now runs a dedicated
      Single Player focused mode that unhides `MainMenu.wnd:MapBorder`,
      `MainMenu.wnd:EarthMap`, and the shipped `ButtonUSA`, `ButtonGLA`,
      `ButtonChina`, `ButtonChallenge`, `ButtonSkirmish`, and
      `ButtonSingleBack` children. The harness verifies the
      `PassSelectedButtonsToParentSystem` ancestry, each
      `W3DGadgetPushButtonImageDraw` / `GadgetPushButtonSystem` /
      `GadgetPushButtonInput` binding, the original `Buttons-Left` /
      `Buttons-Middle` / `Buttons-Right` mapped images, CSF labels
      `GUI:USA`, `GUI:GLA`, `GUI:CHINA_Caps`,
      `GUI:Generals_Challenge`, `GUI:Skirmish`, and `GUI:Back`, and
      non-empty button and text pixels in
      `harness-smoke-ww3d-main-menu-layout-single-player-repaint-canvas.png`.
      Verified with `npm run test:ww3d-main-menu-layout-image-repaint` and
      `npm run test:vertical-integrations`.
- [x] Extend the archive-backed `Menus/MainMenu.wnd` repaint smoke through the
      real Difficulty dropdown controls: the probe now runs a dedicated
      Difficulty focused mode that unhides `MainMenu.wnd:MapBorder4`,
      `MainMenu.wnd:EarthMap4`, `StaticTextSelectDifficulty`, and the shipped
      `ButtonEasy`, `ButtonMedium`, `ButtonHard`, and `ButtonDiffBack`
      children. The harness verifies `PassSelectedButtonsToParentSystem`,
      `W3DGadgetStaticTextDraw`, each `W3DGadgetPushButtonImageDraw` /
      `GadgetPushButtonSystem` / `GadgetPushButtonInput` binding, the original
      `Buttons-Left` / `Buttons-Middle` / `Buttons-Right` mapped images, CSF
      labels `GUI:EasyCaps`, `GUI:MediumDifficultyCaps`, `GUI:HardCaps`,
      `GUI:Back`, and `GUI:SelectDifficulty`, and non-empty title, button, and
      label pixels in
      `harness-smoke-ww3d-main-menu-layout-difficulty-repaint-canvas.png`.
      Verified with `npm run test:ww3d-main-menu-layout-image-repaint` and
      `npm run test:vertical-integrations`.
- [x] Extend the archive-backed `Menus/MainMenu.wnd` repaint smoke through the
      shipped faction-logo strip. The probe now runs a dedicated
      `factionLogoStrip` mode that mounts
      `Data\INI\MappedImages\TextureSize_512\SCLogosUserInterface512.INI`
      from `INIZH.big` and
      `Art\Textures\sclogosuserinterface512_001.tga` from `TexturesZH.big`,
      then unhides `WinFactionUS`, `WinFactionGLA`, `WinFactionChina`,
      `WinFactionTraining`, and `WinFactionSkirmish`. The browser harness
      verifies each child's original `W3DGameWinDefaultDraw` /
      `GameWinDefaultSystem` binding, exact WND geometry, mapped-image
      dimensions including the real 93x84 `Training96` image inside its 96x96
      WND slot, three texture-family WebGL uploads/binds, and non-empty pixels
      in
      `harness-smoke-ww3d-main-menu-layout-faction-logo-repaint-canvas.png`.
      Verified with `npm run test:ww3d-main-menu-layout-image-repaint` and
      `npm run test:vertical-integrations`.
- [x] Extend the archive-backed `Menus/MainMenu.wnd` repaint smoke through the
      disabled `ButtonSinglePlayer` image state. The probe now runs a dedicated
      `disabledButtonSinglePlayer` mode that clears `WIN_STATUS_ENABLED` on the
      real `MainMenu.wnd:ButtonSinglePlayer` child, verifies the parsed
      `Buttons-Disabled-Left` / `Buttons-Disabled-Middle` /
      `Buttons-Disabled-Right` triplet from `MainMenu.wnd` and
      `SCSmShellUserInterface512.INI`, and captures the original
      `W3DGadgetPushButtonImageDraw` disabled triplet draw through
      `ProbeForwardingW3DDisplay -> W3DDisplay::drawImage`. The browser
      harness asserts the disabled triplet appears in the draw sequence, the
      button remains visibly rendered with dim disabled text, and writes
      `harness-smoke-ww3d-main-menu-layout-disabled-button-repaint-canvas.png`.
      Verified with `npm run test:ww3d-main-menu-layout-image-repaint`.
- [x] Extend the archive-backed `Menus/MainMenu.wnd` repaint smoke through the
      hilite `ButtonSinglePlayer` image state. The probe now runs a dedicated
      `hiliteButtonSinglePlayer` mode that sets `WIN_STATE_HILITED` and clears
      `WIN_STATE_SELECTED` on the real `MainMenu.wnd:ButtonSinglePlayer`
      child, verifies the parsed `Buttons-HiLite-Left` /
      `Buttons-HiLite-Middle` / `Buttons-HiLite-Right` triplet from
      `MainMenu.wnd` and `SCSmShellUserInterface512.INI`, and captures the
      original `W3DGadgetPushButtonImageDraw` hilite triplet draw through
      `ProbeForwardingW3DDisplay -> W3DDisplay::drawImage`. The browser
      harness asserts the hilite triplet appears in the draw sequence, the
      button remains visibly rendered with bright label text, and writes
      `harness-smoke-ww3d-main-menu-layout-hilite-button-repaint-canvas.png`.
      Verified with `npm run test:ww3d-main-menu-layout-image-repaint`.
- [x] Extend the archive-backed `Menus/MainMenu.wnd` repaint smoke through the
      pushed `ButtonSinglePlayer` image state. The probe now runs a dedicated
      `pushedButtonSinglePlayer` mode that sets `WIN_STATE_HILITED` and
      `WIN_STATE_SELECTED` on the real `MainMenu.wnd:ButtonSinglePlayer`
      child, verifies the parsed `Buttons-Pushed-Left` /
      `Buttons-Pushed-Middle` / `Buttons-Pushed-Right` triplet from
      `MainMenu.wnd` and `SCSmShellUserInterface512.INI`, and captures the
      original `W3DGadgetPushButtonImageDraw` hilite-selected triplet draw
      through `ProbeForwardingW3DDisplay -> W3DDisplay::drawImage`. The browser
      harness asserts the pushed triplet appears in the draw sequence, the
      button remains visibly rendered with selected-state metadata, and writes
      `harness-smoke-ww3d-main-menu-layout-pushed-button-repaint-canvas.png`.
      Verified with `npm run test:ww3d-main-menu-layout-image-repaint`.
- [x] Add a direct display-level MainMenuRuler mapped-image vertical:
      `test:ww3d-display-main-menu-ruler` range-fetches the full shipped
      `INIZH.big` `Data\INI\MappedImages` directory subset needed by
      `ImageCollection::load(512)` plus `TexturesZH.big`
      `Art\Textures\mainmenuruleruserinterface.tga`, resolves
      `MainMenuRuler` through `ImageCollection::findImageByName`, preloads the
      texture through `WW3DAssetManager` / `TextureClass::Init`, draws the
      full-screen `(0,0)-(800,600)` image with `W3DDisplay::drawImage`, and
      verifies browser WebGL2 edge pixels from the alpha ruler overlay while
      the transparent center remains black.
- [x] Retire the superseded focused MainMenu repaint/ruler gates after real
      startup vertical coverage took ownership of the MainMenu path. The
      active npm scripts no longer advertise
      `test:ww3d-main-menu-layout-repaint`,
      `test:ww3d-main-menu-layout-image-repaint`, or
      `test:ww3d-display-main-menu-ruler`, and
      `test:vertical-integrations` no longer spends time on the curated
      MainMenu image/ruler repaint harnesses. The probe files remain available
      as ad-hoc diagnostics, while the active gate is the real
      `cnc-port` lifecycle: real `GameEngine::init()`, Shell-owned
      `Menus/MainMenu.wnd`, real mouse/keyboard input, visible menu pixels,
      Single Player/USA/difficulty transitions, and `ButtonEasy`
      campaign-start queueing.
- [x] Fix in-game command-bar HUD background frame rendering black. Root cause:
      the `__attribute__((weak))` no-op stubs in
      `wasm_ww3d_render_probe.cpp` for the W3D HUD draw callbacks
      (`W3DCommandBarBackgroundDraw`/`W3DLeftHUDDraw`/`W3DRightHUDDraw`/
      `W3DPowerDraw`/etc.) were not gated behind
      `CNC_PORT_LINKS_REAL_W3D_MAIN_MENU`, unlike the `W3DMainMenu*` stubs.
      cnc-port defines that macro so the real
      `GeneralsMD/.../W3DControlBar.cpp` owners are available in the
      `zh_gameengine_real_lifecycle_runtime` archive — but because the weak
      stubs already satisfied every reference, the linker never pulled
      `W3DControlBar.o`, so every bound HUD draw callback was the empty stub.
      Fix: gate all those stubs with the same `#ifndef
      CNC_PORT_LINKS_REAL_W3D_MAIN_MENU` guard so probe-only builds keep the
      stubs while cnc-port pulls the real strong definitions. Before: the
      metallic command-bar background frame art rendered solid black (center
      region ~74% black). After: `bgDrawCalled=29`, the 1024x256
      `SN/SA/SUCommandBar.tga` atlas binds every frame, center region drops to
      ~14.4% black (metallic frame paints), bottom 20% HUD strip goes from
      22.1%→66.4% non-black. E2e-proven via skirmish smoke screenshot.

---

## M5 — Input & UI

- [x] Focused browser mouse-wheel proof: a DOM wheel event queues
      `WM_MOUSEWHEEL`, the original `WinMain.cpp::WndProc` filters it through
      the application window bounds and feeds `Win32Mouse::addWin32Event`, and
      the wasm harness observes `Win32Mouse::translateEvent` producing the
      expected `MouseIO::wheelPos` and canvas-relative position.
- [x] Focused real Mouse update proof: the standalone wasm `win32-mouse-smoke`
      links original `GameClient/Input/Mouse.cpp` plus original
      `Win32Mouse.cpp`, queues a Win32 left-button event, calls real
      `Mouse::update()` through `Win32Mouse::update()`, verifies the device
      buffer is consumed, and folds the buffered event with original
      `Mouse::processMouseEvent()` into `MouseIO` status. This does not yet
      prove `Mouse::createStreamMessages()` / GUI delivery.
- [x] Focused real Mouse stream-message proof: the standalone wasm
      `win32-mouse-smoke` initializes the original memory pools plus
      `TheMessageStream`, a minimal concrete `Keyboard`, and shimmed
      `GlobalData`, then calls real `Mouse::createStreamMessages()` and
      verifies `MSG_RAW_MOUSE_POSITION` plus
      `MSG_RAW_MOUSE_LEFT_BUTTON_DOWN` arguments from the original
      `MessageStream`.
- [x] Extend the focused real Mouse stream-message proof to cover drag and
      wheel `MSG_RAW_MOUSE_*` output before wiring GUI translator delivery.
- [x] Add a separate real engine Mouse probe, not the current browser
      `Win32Mouse`/`Mouse` shim, that wires `TheMouse == TheWin32Mouse`,
      supplies the required `TheMessageStream` / keyboard / frame globals,
      drives original `Mouse::update()` and `Mouse::createStreamMessages()`,
      and smoke-tests `MSG_RAW_MOUSE_*` output for button, drag, and wheel
      input.
- [x] Add the engine-global fallback-frame proof: the standalone
      `win32-mouse-smoke` now wires `TheMouse == TheWin32Mouse`, drives
      original `Mouse::UPDATE()` / `createStreamMessages()` through
      `TheMouse`, and verifies button, drag, and wheel `MSG_RAW_MOUSE_*`
      output using the original `Win32Mouse` fallback when
      `TheGameClient` is not initialized.
- [x] Extend the engine-global Mouse proof with a non-null original
      `TheGameClient` frame source once minimal GameClient ownership is
      available without constructing the full GUI/display subsystem.
- [x] Add a disabled-by-default normal `tick_frame()` Mouse owner that
      reuses the original WndProc-fed `Win32Mouse` buffer, runs original
      `Mouse::UPDATE()` / `createStreamMessages()` against a persistent
      frame-owned `MessageStream` / `CommandList`, and verifies raw
      `MSG_RAW_MOUSE_*` output through the browser harness while GUI
      translation remains in the focused probe.
- [x] Extend the normal `tick_frame()` Mouse owner browser proof to cover
      held-button `MSG_RAW_MOUSE_LEFT_DRAG` delta output and
      `MSG_RAW_MOUSE_WHEEL` spin output across reset frame-owner state.
- [x] Promote GUI `WindowTranslator` delivery into the normal
      `tick_frame()` Mouse owner: the frame-owned `MessageStream` keeps a
      persistent original `WindowTranslator` plus a persistent probe
      `GameWindowManager` / full-canvas `GameWindow`, and the browser
      smoke proves raw pre-propagation mouse stream snapshots are consumed
      into `GWM_LEFT_DOWN`, `GWM_LEFT_DRAG`, `GWM_LEFT_UP`, and
      `GWM_WHEEL_UP` with `CommandList` drain semantics.
- [x] Make the original Mouse stream probe JSON type-aware so drag,
      wheel, button, and modifier arguments are exposed through semantic
      fields instead of mixed generic `integer1` / `integer2` slots.
- [x] Add a focused browser harness proof that DOM `Shift+A`
      keydown/keyup events queue Win32 `WM_KEY*`/`WM_CHAR` messages,
      translate browser `VK_*` values to original `KEY_*`/`DIK_*`
      codes, feed a browser-backed concrete `Keyboard`, and verify real
      `Keyboard::update()` / `createStreamMessages()` output on the
      original `MessageStream`.
- [x] Add a focused standalone original Keyboard focus-loss/repeat proof:
      `win32-keyboard-focus-repeat-smoke` drives `KEY_LOST` through
      original `Keyboard::updateKeys()` / `resetKeys()` and held-key
      frames through `checkKeyRepeat()`, verifying cleared cached key
      state/modifiers plus `KEY_STATE_AUTOREPEAT` stream output before
      wiring those semantics into browser frame ownership.
- [x] Extend the browser-backed `Keyboard` bridge beyond the focused
      proof with repeat timing, focus-loss reset semantics, and normal
      frame ownership once the broader input loop is ready.
- [x] Add a browser harness proof that repeated
      `originalKeyboardInputProbe` frames preserve a held DOM key
      across empty Win32 queues and produce the original
      `KEY_STATE_AUTOREPEAT` stream message after
      `Keyboard::KEY_REPEAT_DELAY`.
- [x] Add browser blur -> original `KEY_LOST` delivery for the
      browser-backed `Keyboard`, proving `resetKeys()` clears
      held-key state and folded modifiers without emitting raw key
      stream messages.
- [x] Move the browser-backed `Keyboard::update()` /
      `createStreamMessages()` call out of the focused probe and
      into the normal per-frame input loop once that loop owns the
      real `MessageStream` lifecycle.
- [x] Add an opt-in browser harness proof that
      `originalKeyboardFrameTickProbe` drains browser Win32
      keyboard messages, runs the real
      `Keyboard::update()` / `createStreamMessages()` slice
      against a probe-local original `MessageStream`, and
      verifies `MSG_RAW_KEY_DOWN`, autorepeat, and
      focus-loss reset output while marking that the slice is
      not yet promoted into `tick_frame()`.
- [x] Add a disabled-by-default normal `tick_frame()`
      keyboard owner backed by a mirrored Win32 keyboard
      queue and persistent original `MessageStream` /
      `CommandList`, with browser harness proof that Escape
      still reaches original `WndProc` while the mirrored
      `KEY_ESC` reaches the frame-owned `Keyboard` stream.
- [x] Extend the normal `tick_frame()` keyboard owner proof
      to cover held-key autorepeat across empty browser
      queues and browser blur -> original `KEY_LOST` reset
      semantics while the frame-owned path is enabled.
- [x] Focused browser keydown proof: DOM `Escape` queues a Win32
      `WM_KEYDOWN`, the original `WinMain.cpp::WndProc` consumes it through
      the existing browser `Win32GameEngine::serviceWindowsOS` pump, and the
      wasm harness observes the original `VK_ESCAPE` branch posting
      `WM_QUIT` via `PostQuitMessage(0)`. This proves the WndProc key path;
      browser-backed `Keyboard` delivery is covered by the frame-owned input
      owner above.
- [x] Focused real Keyboard stream-message proof: the standalone wasm
      `win32-keyboard-smoke` links original
      `GameClient/Input/Keyboard.cpp`, feeds scripted device events through a
      minimal concrete `Keyboard`, drives original
      `Keyboard::update()` / `updateKeys()` / `createStreamMessages()`, and
      verifies `MSG_RAW_KEY_DOWN`, `MSG_RAW_KEY_UP`, and left-shift modifier
      folding on the original `MessageStream`.
- [x] Add focused Win32 capture bookkeeping coverage:
      `win32-mouse-cursor-smoke` verifies
      `SetCapture` / `GetCapture` / `ReleaseCapture` against the browser
      Win32 shim's captured-window state.
- [x] Add a focused browser harness proof for DOM pointer capture during
      mouse drag: pointerdown claims canvas pointer capture, an
      outside-canvas drag still queues clamped `WM_MOUSEMOVE` through the
      browser input bridge, original `WndProc` feeds `Win32Mouse`, and
      pointerup releases capture.
- [x] Add a focused `win32-mouse-cursor-smoke` proof for the original
      `Mouse()` / `Win32Mouse` cursor contract: `m_winCursors` selects
      `RM_WINDOWS` vs `RM_W3D`, `setCursor(NONE)` and
      `setVisibility(false)` clear the browser Win32 cursor handle, and
      the lost-focus short-circuit preserves the last OS cursor handle.
- [x] Extend cursor rendering verification into the browser harness for
      the OS/CSS cursor path: a focused RPC drives the original
      `Win32Mouse::setVisibility` / `setCursor` path, the original
      `WndProc` `WM_SETCURSOR` branch re-applies `ARROW`, the JS bridge
      maps the browser Win32 cursor handle to canvas `cursor: default`
      vs `cursor: none`, and the Playwright smoke captures
      `harness-smoke-cursor-css-canvas.png`.
- [x] Make human mouse input usable on `harness/play.html` while the real
      W3D cursor remains unrendered. Merged `fable/browser-mouse`: the bridge
      keeps the native CSS cursor visible as a temporary stand-in when the
      original game hides the Win32 cursor, maps browser pointer coordinates
      into the engine display resolution cached from real frames, and
      coalesces queued `WM_MOUSEMOVE` messages / evicts old pending moves so
      a slow Debug frame cannot drop button messages behind a pointermove
      flood. Verified locally after rebuilding `cnc-port` with an inline
      Playwright check against `harness/play.html?autostart=1&shellmap=0`:
      CSS cursor was `default`, a 400-pointermove flood left the Win32 queue
      unoverflowed (`beforeCount=0`, `overflowed=false`), and a real browser
      mouse click on `ButtonSinglePlayer` selected control `4332` through the
      original window system.
- [x] Add a focused original GUI input proof:
      `gamewindow-input-smoke` builds a real `MessageStream` with
      `WindowTranslator`, routes
      `MSG_RAW_MOUSE_LEFT_BUTTON_DOWN` into original
      `GameWindowManager::winProcessMouseEvent`, verifies a concrete
      `GameWindow` receives `GWM_LEFT_DOWN`, and proves the handled raw
      input is destroyed instead of reaching `TheCommandList`.
- [x] Extend the focused original GUI input proof through original
      `Win32Mouse` / `Mouse::createStreamMessages()` output so
      Mouse-created `MSG_RAW_MOUSE_POSITION` and
      `MSG_RAW_MOUSE_LEFT_BUTTON_DOWN` are consumed by
      `WindowTranslator` / `GameWindowManager` instead of reaching
      `TheCommandList`.
- [x] Add a browser harness proof for the same original GUI path:
      a browser-queued Win32 left-button message is pumped through
      original `WinMain.cpp::WndProc`, folded by original `Win32Mouse`
      / `Mouse::createStreamMessages()`, and consumed by
      `WindowTranslator` / `GameWindowManager` with screenshot-capable
      harness coverage still passing.
- [x] Add a focused original widget click proof:
      `gamewindow-input-smoke` now creates a real
      `GadgetPushButton` through original
      `GameWindowManager::gogoGadgetPushButton`, routes raw
      left-down/up messages through `WindowTranslator`, and verifies
      original `GadgetPushButtonInput` sends exactly one `GBM_SELECTED`
      to its owner while consuming the raw messages before
      `TheCommandList`.
- [x] Extend the focused original widget click proof into an observable
      GUI state-change vertical: the button owner's `GBM_SELECTED` handler
      now calls original `GameWindow::winHide(FALSE)` on a hidden target
      window, and `gamewindow-input-smoke` verifies the target's
      `WIN_STATUS_HIDDEN` bit clears after the original click path runs.
      Verified with `npm --prefix WebAssembly run test:gamewindow-input`.
- [x] Extend the browser frame-owned original Mouse GUI proof to a real
      widget: the persistent probe `GameWindowManager` now owns a child
      window wired to original `GadgetPushButtonSystem` /
      `GadgetPushButtonInput`, the Playwright smoke clicks it through
      DOM pointer events and original `Win32Mouse` / `Mouse` /
      `WindowTranslator`, and the harness verifies the owner receives
      `GBM_SELECTED` while the raw messages stay out of `TheCommandList`.
- [x] Add a first named original-GUI click RPC:
      `clickOriginalMouseFrameWidget("frameMouseProbeButton")` resolves
      the frame-owned `GadgetPushButton` from probe geometry, queues
      Win32 mouse messages, steps the original frame-owned Mouse path,
      and verifies `GBM_SELECTED` without raw messages reaching
      `TheCommandList`.
- [x] Move the first named widget's target metadata onto the live
      original `GameWindow`: the probe now reports its decorated name,
      style/status, `winGetScreenPosition` / `winGetSize` rect, and
      C++-derived interior click point, and the bridge rejects stale or
      outside-window target metadata before queueing Win32 messages.
- [x] Add an engine-reported original `GameWindow` list for the
      frame-owned GUI path, including name-key IDs, kind, status/style,
      screen rect, and click point, then make the named-click bridge
      resolve from that list instead of a JS-side allowlist.
- [x] Extend the browser named-widget original-GUI click into a concrete
      state-change vertical: the frame-owned probe now includes a hidden
      named target `GameWindow`, the button owner's original
      `GBM_SELECTED` handler calls `GameWindow::winHide(FALSE)`, and the
      Playwright harness verifies both the C++ probe fields and the
      engine-reported window list move the target from hidden to visible
      after `clickOriginalMouseFrameWidget("frameMouseProbeButton")`.
- [x] Fix in-game input-clicks: set `TheWin32Mouse = &browser_mouse()`
      in the real-engine-init path (`wasm_real_engine_init.cpp`), moving
      `BrowserWin32Mouse` and `browser_mouse()` out of anonymous namespace
      into a shared header (`wasm_browser_mouse.h`) so both
      `wasm_real_engine_init.cpp` and `wasm_wndproc_probe.cpp` reference the
      same instance. Before the fix, `TheWin32Mouse` was NULL in the
      real-engine-init path, so WndProc mouse cases silently dropped events.
      After the fix, in-game drag box-select produces `selectCount > 0`.
      E2e-proven via `input_fix_verification.mjs` (mouse.attached === true).
---

## M6 — Playable skirmish (no audio/video)

- [x] Expose skirmish map/cache state through the real-engine harness.
      `cnc_port_map_cache_probe()` now reports the live `TheMapCache`
      official/multiplayer counts, first official multiplayer map plus
      metadata, `TheSkirmishGameInfo`, and `TheGameInfo`, and
      `realEngineFrameSummary` includes the skirmish game-options widgets
      needed for click-path diagnosis. A focused Playwright real-init probe
      verifies the runtime archive set has 103 maps, 47 official multiplayer
      maps, enabled `Maps\ShellMapMD\ShellMapMD.map`, and first official MP
      map `maps\alpine assault\alpine assault.map` with CRC 3735677156; both
      skirmish/game-info pointers are still absent before opening the
      skirmish menu. Remaining skirmish work is the live menu/options/start
      transition, not global map-cache or archive absence.
- [x] Drive live Skirmish Start into an active real match on Mac Chrome/Metal.
      Added the real AI player sources to `cnc-port`'s lifecycle runtime and
      routed Player-owned AI callbacks through explicit wasm dispatch where the
      inherited AI vtable slots trapped during `GameLogic::startNewGame`.
      A Mac M4 Chrome/Metal run drove Main Menu -> Single Player -> Skirmish
      -> Start through the original Win32 input path, selected
      `maps\alpine assault\alpine assault.map` (2-player, CRC 3735677156),
      and completed post-start frames with `GAME_SKIRMISH`, `loadingMap=false`,
      223 logic objects/drawables, live input/control bar, and a selected
      controllable object. Screenshot evidence is
      `/Users/aa/cnc-verify/cnc-skirmish-loaded-after-ai-dispatch.png`
      with a nonblank 1280x656 canvas center pixel `[158,144,135,255]`.
- [x] Gate Skirmish Start with a repeatable focused harness smoke.
      Added `harness/skirmish_start_smoke.mjs` and `npm run
      test:skirmish-start`, which mount the full runtime archive set, boot the
      real shell map, drive Main Menu -> Single Player -> Skirmish -> Start via
      original Win32 mouse messages, and assert the first official multiplayer
      map reaches an active match. The Mac M4 Chrome/Metal run selected
      `maps\alpine assault\alpine assault.map` (2-player, CRC 3735677156) and
      reached `GAME_SKIRMISH`, `loadingMap=false`, `inputEnabled=true`, 223
      logic objects, and 223 drawables within 30 post-start frames. Screenshot
      evidence was copied to
      `WebAssembly/artifacts/screenshots/skirmish-start-smoke.png`.
- [x] Load a skirmish map through the real map loader.
      Covered by the live Skirmish Start run above: Alpine Assault reaches
      in-game state through the real menu, `SkirmishGameInfo::startGame`,
      `GameLogic::startNewGame`, map load, player/object setup, and post-start
      frame stepping rather than a standalone map probe.
- [x] Units/structures spawn and render on terrain in a skirmish.
      The same Mac/Metal screenshot and state query show a rendered USA base,
      a vehicle, terrain/roads, `objectCount=223`, `drawableCount=223`, and a
      visible/clickable control bar after the map load.
- [x] Load Tournament Desert through the real Skirmish Start path.
      `skirmish_start_smoke.mjs` now accepts `SKIRMISH_START_MAP`, the browser
      bridge exposes `realEngineSetSkirmishMap`, and `cnc_port_map_cache_probe`
      lists all 47 official multiplayer maps for sweep selection. The first
      Tournament Desert repro reached active gameplay but trapped while the map
      script `Supply Dock SE Corner` executed `WAREHOUSE_SET_VALUE`; the new
      wasm-only script-step diagnostic reported the script/action directly.
      Fixed the trap in `W3DSupplyDraw::updateDrawModuleSupplyStatus` by
      keeping supply-bone visual percentage math finite when a map script sets
      warehouse cash on an object whose starting-box maximum is zero. Verified
      with `npm --prefix WebAssembly run build:port`, `npm --prefix
      WebAssembly run test:skirmish-start`, and
      `SKIRMISH_START_MAP='maps\tournament desert\tournament desert.map' node
      harness/skirmish_start_smoke.mjs`; Tournament Desert selected
      CRC `368459242`, reached `GAME_SKIRMISH`, `loadingMap=false`,
      `inputEnabled=true`, 146 objects/drawables, and captured
      `WebAssembly/artifacts/screenshots/skirmish-start-tournament-desert.png`.
- [x] Official multiplayer map sweep: all 47 official maps boot to skirmish
      with `loadingMap=false`, `inputEnabled=true`, `objects > 0`, no traps.
      Verified via `skirmish_start_smoke` across the full map set.
- [x] Prove real LeftHUD/radar movement dispatch at MD_USA01 player control.
      `startup_vertical_smoke.mjs` now supports
      `STARTUP_VERTICAL_PROVE_RADAR=1`, reaches original player control,
      selects a real local `AmericaTankPaladin`, asserts
      `ControlBar.wnd:LeftHUD` is routed through original `LeftHUDInput` /
      `W3DLeftHUDDraw`, verifies the exported radar state is usable for the
      local player, clicks the minimap through the same Win32 mouse queue as
      the rest of the harness, and requires the original command path to
      dispatch a move. The verified run accepted LeftHUD point `(49,481)` in
      the 167x152 HUD window at `(7,443)`, reported
      `dispatchMoveCommandCount` `0 -> 1`,
      `dispatchLastMoveWorldPos=(570.9375,1897.5,56.484375)`, then stepped 90
      real frames and measured the selected Paladin moving 133.03 world units.
      `wasm_real_engine_init.cpp` now exports read-only radar readiness,
      hidden/forced, local-player-has-radar, and usable state for harness
      assertions. Verified with `node --check
      WebAssembly/harness/startup_vertical_smoke.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port`, and
      `STARTUP_VERTICAL_REAL_INIT_ONLY=1 STARTUP_VERTICAL_PROVE_RADAR=1
      STARTUP_VERTICAL_POST_CAMPAIGN_COMPACT_CHUNKS=1
      STARTUP_VERTICAL_POST_CAMPAIGN_LIGHTWEIGHT=1 node
      WebAssembly/harness/startup_vertical_smoke.mjs`; screenshot:
      `WebAssembly/artifacts/screenshots/interact-milestone.png`.
- [x] Prove real force-attack object dispatch and damage at MD_USA01 player
      control.
      `startup_vertical_smoke.mjs` now supports
      `STARTUP_VERTICAL_PROVE_ATTACK=1`, reaches original player control,
      selects a local `AmericaTankPaladin`, exports non-local drawables with
      body health/damage and original `Player::getRelationship(obj->getTeam())`
      metadata, and first searches for visible hostile targets. The verified
      MD_USA01 handoff reported 44 visible non-local drawables but zero visible
      `ENEMIES`, so the harness held CTRL to enter the original force-attack
      mode and clicked neutral `GLATrap` id 710 through the same Win32 mouse
      path. The command path reported `forceAttackModeBeforeClick=true`,
      `lastClickIssuedType=1060`, `lastClickDrawId=710`,
      `dispatchAttackCommandCount 0 -> 1`,
      `dispatchLastAttackCommandType=1060`,
      `dispatchLastAttackHadGroup=1`, and
      `dispatchLastAttackTargetId=710`. After 180 real frames the Paladin moved
      176.78 world units, distance to target closed 320.25 -> 165.26, target
      health changed 100 -> 40, and `lastDamageTimestamp` advanced to 2664.
      Verified with `node --check WebAssembly/harness/startup_vertical_smoke.mjs`,
      `git diff --check`, `npm --prefix WebAssembly run build:port`, and on the
      Mac M4 real GPU with Chrome/Metal:
      `STARTUP_VERTICAL_REAL_INIT_ONLY=1 STARTUP_VERTICAL_PROVE_ATTACK=1
      STARTUP_VERTICAL_POST_CAMPAIGN_COMPACT_CHUNKS=1
      STARTUP_VERTICAL_POST_CAMPAIGN_LIGHTWEIGHT=1 node
      WebAssembly/harness/startup_vertical_smoke.mjs`. Renderer was
      `ANGLE Metal Renderer: Apple M4`; screenshot:
      `WebAssembly/artifacts/screenshots/attack-milestone.png`.
- [x] Prove real attack-move command dispatch and movement at MD_USA01 player
      control.
      `startup_vertical_smoke.mjs` now supports
      `STARTUP_VERTICAL_PROVE_ATTACK_MOVE=1`, reaches original player control,
      selects a local `AmericaTankPaladin`, clicks the original control-bar
      `ButtonCommand11` populated from `Command_AttackMove`
      (`GUI_COMMAND_ATTACK_MOVE`), and then clicks a map destination through the
      same Win32 mouse queue. `querySelection` now exports pending GUI command
      data plus message-type names for command/dispatch counters so the harness
      can assert the real message path without hard-coded enum numbers. The Mac
      Chrome/Metal run accepted destination `(697,260)`, reported
      `guiCommandBeforeDestination=Command_AttackMove`,
      `dispatchMoveCommandCount 0 -> 1`,
      `dispatchLastMoveCommandTypeName=MSG_DO_ATTACKMOVETO`,
      `dispatchLastMoveHadGroup=1`, and dispatch world position
      `(2260.420898,745.552307,15.625)`. After 120 real frames the selected
      Paladin moved 87.18 world units from `(2145,745,15.625)` to
      `(2223.51709,782.886169,15.625)`. Verified with `node --check
      WebAssembly/harness/startup_vertical_smoke.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port`, and on the Mac M4 real GPU:
      `STARTUP_VERTICAL_REAL_INIT_ONLY=1 STARTUP_VERTICAL_PROVE_ATTACK_MOVE=1
      STARTUP_VERTICAL_POST_CAMPAIGN_COMPACT_CHUNKS=1
      STARTUP_VERTICAL_POST_CAMPAIGN_LIGHTWEIGHT=1 node
      WebAssembly/harness/startup_vertical_smoke.mjs`. Renderer was
      `ANGLE Metal Renderer: Apple M4`; screenshot:
      `WebAssembly/artifacts/screenshots/attack-move-milestone.png`.
- [x] Prove the real Generals Experience HUD open/close path at MD_USA01
      player control.
      `startup_vertical_smoke.mjs` now supports
      `STARTUP_VERTICAL_PROVE_GENERALS_EXP=1`, reaches original player
      control, selects a local `AmericaTankPaladin`, clicks
      `ControlBar.wnd:ButtonGeneral` through the original
      `GadgetPushButtonInput` path, and waits for the shipped `GenExpFade`
      transition instead of treating its temporary hidden state as a failure.
      The Mac Chrome/Metal run showed the panel hidden while `GenExpFade` was
      current (`openFirstAttempt` at frame 3378), then visible/clickable with
      `GeneralsExpPointsSystem`/`GeneralsExpPointsInput` ownership after 10
      real frames (`openFinalAttempt` at frame 3387), with `showCount=1` and
      `toggleCount=1`. The same proof clicked
      `GeneralsExpPoints.wnd:ButtonExit` through `GadgetPushButtonInput` and
      verified the panel hidden again at frame 3388 with `hideCount=4`.
      Verified with `node --check
      WebAssembly/harness/startup_vertical_smoke.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:startup-vertical`, and on the Mac
      M4 real GPU with Chrome/Metal:
      `STARTUP_VERTICAL_PROVE_GENERALS_EXP=1
      STARTUP_VERTICAL_REAL_INIT_ONLY=1
      STARTUP_VERTICAL_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      STARTUP_VERTICAL_BROWSER_ARGS="--enable-gpu --use-angle=metal" node
      WebAssembly/harness/startup_vertical_smoke.mjs`. Screenshot:
      `WebAssembly/artifacts/screenshots/generals-exp-milestone.png`.

---

## M7 — Audio (Miles → Web Audio)

- [x] Expose a harness-visible `audioRuntimeAssets` readiness surface that
      proves the registered runtime archive set includes the Zero Hour audio,
      speech, and music BIG payloads (`AudioZH.big`, `AudioEnglishZH.big`,
      `SpeechZH.big`, `SpeechEnglishZH.big`, `MusicZH.big`, `Music.big`)
      while still reporting the browser Web Audio device/runtime as not ready.
- [x] Add `npm run verify:miles-audio-playback-frontier`, a source verifier
      that pins the current Miles sample/stream handle allocation, release,
      start, completion, Bink-sharing, and inert `Mss.H` shim frontier that a
      real Web Audio backend must replace.
- [x] Add `npm run verify:miles-audio-volume-frontier`, a source verifier
      that pins the original audio on/off, focus, volume, per-event
      pitch/volume/loop derivation, Miles mixer volume/pan/rate calls, and 3D
      listener/sample position frontier that the Web Audio backend must
      preserve.
- [x] Add `npm run verify:audio-filename-frontier`, a source-only verifier
      that pins the original audio filename/path generation frontier used
      before any backend can request a payload: `AudioEventRTS::generateFilename`,
      `generateFilenamePrefix`, `generateFilenameExtension`, the
      `SoundManager` filename hook, `MusicTrack` filename parsing, and the
      `GameAudio.cpp` / `AudioSettings.h` field mappings. This verifies source
      structure only, not runtime audio.
- [x] Add `npm run verify:audio-settings-frontier`, a source-only verifier
      for the `AudioSettings` / `AudioManager::init` startup contract: field
      declarations, `audioSettingsFieldParseTable` mappings, original audio INI
      load order, and the `AudioEventRTS::generateFilenamePrefix` settings
      consumer.
- [x] Add `npm run verify:audio-event-request-frontier`, a source-only verifier
      for the original audio event/request lifecycle before backend playback:
      `AudioRequest` play/pause/stop records, `AudioManager::addAudioEvent`
      handle assignment plus filename/play-info generation, music/sound
      handoff, `SoundManager` AR_Play queueing, `removeAudioEvent` AR_Stop
      queueing, dynamic metadata overrides, and `INIAudioEventInfo` metadata
      parsing. This verifies source structure only, not runtime audio.
- [x] Add `npm run verify:audio-request-update-frontier`, a source-only
      verifier for the original queued audio request drain/update contract:
      base `AudioManager` no-op/stub behavior, `removeAllAudioRequests`
      cleanup, `MilesAudioManager::update` ordering, `processRequestList`
      gating/deletion/erase order, and AR_Play/AR_Pause/AR_Stop routing to the
      original Miles playback calls. This verifies source structure only, not
      runtime audio.
- [x] Add `npm run verify:audio-sample-start-frontier`, a source-only verifier
      for the original sample-start contract after AR_Play reaches
      `MilesAudioManager::playAudioEvent`: stream/2D/3D branching, sample-pool
      selection, file loading, completion callback registration, payload handoff
      to AIL, volume/pan/3D positioning setup, and `AIL_start_*` calls. This
      verifies source structure only, not runtime audio.
- [x] Add `npm run verify:audio-completion-frontier`, a source-only verifier
      for the original audio completion/cleanup tail: Miles completion
      callbacks, `MilesAudioManager::notifyOfAudioCompletion`,
      `AudioEventRTS` loop/portion updates, `PS_Stopped` marking,
      `processPlayingList` / `processStoppedList` cleanup, handle release,
      file close, and `AudioEventRTS` deletion. This verifies source structure
      only, not runtime audio.
- [x] Add `npm run verify:audio-playing-event-state-frontier`, a source-only
      verifier for the original playing-record state around active audio:
      `PlayingAudio` fields, `playAudioEvent` list insertion order,
      `notifyOfAudioCompletion` marking `PS_Stopped`, `processPlayingList`
      release/erase drainage, and `AudioEventRTS` event-name/handle identity.
      This verifies source structure only, not runtime audio.
- [x] Add `npm run verify:audio-browser-bridge-contract-frontier`, a
      source-only verifier that stitches the original audio enqueue, drain,
      device-start, completion, and playing-list contracts into the browser
      Web Audio replacement seam: preserve `AudioManager::addAudioEvent`,
      `SoundManager`/`MusicManager` `AR_Play` request queueing,
      `MilesAudioManager::processRequest`, `playAudioEvent`, and the
      `playStream` / `playSample3D` / `playSample` retarget points.
- [x] Add `npm run verify:audio-sound-manager-counters-frontier`, a source-only
      verifier for the original `SoundManager` request gate and 2D/3D sample
      counter contract: lazy configured limit loading, `canPlayNow`
      2D/3D availability checks, start/completion counter mutations,
      reset cleanup, and the `AudioManager` methods a Web Audio backend must
      keep compatible.
- [x] Add `npm run verify:audio-3d-position-frontier`, a source-only verifier
      for the original positional audio path: `AudioEventRTS` position
      ownership, `SoundManager::canPlayNow` distance/shroud culling,
      listener position/orientation updates, one-shot 3D sample
      distance/position setup, per-frame 3D sample position updates, and 3D
      sample volume routing.
- [x] Add `npm run verify:audio-3d-zoom-volume-frontier`, a source-only
      verifier for the original 3D zoom/volume-adjustment path:
      `AudioManager::setVolume` Sound3D recompute, `set3DVolumeAdjustment`
      multiply/clamp/volume-change flag behavior, the fact that `m_zoomVolume`
      is computed in `AudioManager::update` and passed as the adjustment
      argument, and `MilesAudioManager::processPlayingList` re-pushing changed
      volume into already-playing 2D/3D/stream handles.
- [x] Add `npm run verify:audio-options-volume-frontier`, a source-only
      verifier for the original Zero Hour Options-menu volume write path:
      the music/SFX/voice slider control IDs, `saveOptions` slider reads,
      preference writes, SFX 2D/3D split through `m_relative2DVolume`, and
      the exact `TheAudio->setVolume(... | AudioAffect_SystemSetting)` calls
      into `AudioManager::setVolume` script/system volume fields. This
      verifies the source UI contract only, not live browser mixer control.
- [x] Add `npm run verify:audio-options-volume-readback-frontier`, a
      source-only verifier for the original Zero Hour Options-menu persisted
      volume readback path: `OptionsMenuInit` initializes the music, SFX, and
      voice sliders from `OptionPreferences`, including the real
      `VoiceVolume` key through `getSpeechVolume` and the SFX max of 2D/3D
      persisted volumes. This verifies source UI initialization only, not live
      browser mixer control.
- [x] Add `npm run verify:audio-music-manager-frontier`, a source-only
      verifier for the original music playback/transition frontier:
      `MusicTrack` fields and parse table, `MusicManager` AR_Play/AR_Stop
      request construction, `AudioManager` AT_Music routing and music volume
      bus, `Music.ini` parse registration, Miles stream open/volume routing,
      and next/previous/completion track state helpers. This verifies source
      structure only, not runtime Web Audio music playback.
- [x] Add `npm run inventory:audio-payloads`, a real-asset audio payload
      preflight that indexes the current BIG archives, reads shipped
      `Music.ini`, `SoundEffects.ini`, `Voice.ini`, and `Speech.ini` from
      `INIZH.big`, applies the original filename-generation shape to candidate
      music/SFX/voice/speech payload paths, and reports found/missing payloads
      while preserving that `AudioSettings.ini` and Web Audio playback are not
      runtime-ready.
- [x] Expose that audio payload preflight in the browser archive harness as
      `audioPayloadInventory`, built from the mounted MEMFS BIG files and
      asserted by `runtime_archives_smoke.mjs` before and after boot. The
      harness now proves the current Zero Hour audio archives contain resolvable
      music, SFX, voice, and speech payload candidates while still reporting
      `AudioSettings.ini` / Web Audio readiness as future work.
- [x] Extend `npm run inventory:startup-archives` so the
      `AudioManager::init` audio startup gaps report expected source archives:
      the current missing `AudioSettings.ini`, `Default\Music.ini`,
      `Default\Speech.ini`, and `Default\Voice.ini` are now classified as
      absent optional base `INI.big` files, and the base archive readiness
      contract includes the base audio settings/default INIs.
- [x] Expose the same audio startup archive gap in the browser harness as
      `audioPayloadInventory.audioStartupArchiveContract`. Runtime archive
      smoke now asserts the ten original `AudioManager::init` audio INI paths,
      the current four missing optional-base `INI.big` files, the
      `--require-audio-startup` verification command, and the transition from
      `audioStartupArchives` to `browserAudioDevice` when the optional base
      archive is mounted.
- [x] Add `npm run verify:audio-startup-archive-contract`, a source/tooling
      verifier for the same archive contract. It pins the original
      `AudioManager::init` load order, the startup inventory path/flag
      coverage, optional base `INI.big` / `English.big` extraction behavior, and
      the runtime smoke optional-base branch.
- [x] Add `npm run verify:audio-format-frontier`, a real-asset verifier that
      pins the current audio payload encoding frontier before Web Audio decode:
      3,530 `Data\Audio\` entries across the six current audio archives, split
      into 3,523 wav and 7 mp3 entries with zero extension/magic divergence.
      The verifier parses WAV `fmt ` chunks and pins the current codec split
      at PCM (wFormatTag 1: 951) and IMA ADPCM (wFormatTag 17: 2,572). The
      browser archive harness now mirrors this under
      `audioPayloadInventory.payloadFormats`, reporting MP3/PCM WAV as direct
      Web Audio decode candidates while keeping the IMA ADPCM majority blocked
      on an ADPCM decode/transcode step. This still does not decode,
      schedule, or play audio.
- [x] Add `npm run verify:miles-audio-decode-frontier`, a source-only verifier
      that pins the original Miles decode/load boundary: sample payload reads
      through `TheFileSystem`, `AIL_WAV_info` / `AIL_decompress_ADPCM`, cache
      release ownership, decoded buffer handoff to 2D/3D Miles sample handles,
      streaming file callbacks, and inert compile-only `Mss.H` declarations.
      This verifies source structure only, not browser runtime audio.
- [x] Extend the browser runtime archive harness with
      `audioPayloadInventory.decodeProofs`, decoding one real mounted PCM WAV
      (`Data\Audio\Sounds\English\aangr01a.wav`) and one real mounted IMA
      ADPCM WAV (`Data\Audio\Speech\English\dxxoc001.wav`) to PCM sample
      metadata. `runtime_archives_smoke.mjs` now asserts their codec/header
      fields, decoded frame/sample counts, durations, first samples, and sample
      statistics while still reporting that scheduling/playback and Web Audio
      buffer upload are future work.
- [x] Extend the browser runtime archive harness with
      `audioPayloadInventory.webAudioBufferProofs`, uploading the two decoded
      real WAV payloads into Web Audio `AudioBuffer`s through
      `OfflineAudioContext.createBuffer`. `runtime_archives_smoke.mjs` now
      asserts channel count, length, sample rate, duration, normalized sample
      ranges, nonzero frame counts, and first-channel sample anchors while
      preserving that full requested-payload decode/cache and audio scheduling
      are future work.
- [x] Add `audioPayloadInventory.requestedPayloadCachePlan`, a browser
      harness-visible metadata plan for the actual shipped INI audio requests.
      It dedupes 7,933 music/SFX/voice/speech references into 3,335 unique
      resolved payload cache keys, pins archive/section/codec byte counts, and
      records that 2,556 unique IMA ADPCM WAV payloads still need decoding
      before the cache can become real Web Audio buffer storage.
- [x] Add `audioPayloadInventory.requestedPayloadDecodeCacheProof`, a browser
      harness-visible proof that creates real decoded cache entries and Web
      Audio `AudioBuffer` cache entries for representative requested payload
      keys: MP3 music, PCM SFX, PCM voice, IMA ADPCM SFX, and IMA ADPCM
      speech. The smoke pins five cache keys, decoded frame/sample counts,
      1,096,144 decoded PCM bytes, 36,744,192 decoded MP3 float bytes,
      first-sample anchors, and the corresponding buffer upload statistics
      while leaving full requested-payload scheduling open.
- [x] Extend `audioPayloadInventory.requestedPayloadDecodeCacheProof` with an
      OfflineAudioContext scheduling/render proof for the same requested
      payload cache entries. The browser smoke now asserts five scheduled
      `AudioBufferSourceNode`s, five completion callbacks, render timing,
      a capped 10-second music preview window, non-silent rendered windows, and
      rendered sample anchors while leaving engine-driven audio-event
      scheduling open.
- [x] Extend `audioPayloadInventory.requestedPayloadDecodeCacheProof` with a
      browser-visible requested audio event lifecycle proof for the same five
      requested payload cache entries. The smoke now pins synthetic event
      handles, AR_Play request state, sample vs stream playing types,
      `AudioBufferSourceNode` start windows, ordered completion callbacks,
      `PS_Stopped`, and the sample/stream release paths while preserving that
      this is not yet engine-driven playback.
- [x] Extend `audioPayloadInventory.requestedPayloadDecodeCacheProof` with a
      browser-visible 3D positioning proof for a real requested world SFX
      (`ArtilleryBarrageIncomingWhistle` / `gshescre.wav`). The smoke now
      renders the decoded buffer through `AudioBufferSourceNode -> PannerNode`
      with source min/max range, listener/source coordinates, and stereo
      separation metrics pinned, while preserving that this is not yet
      engine-driven 3D playback.
- [x] Extend `audioPayloadInventory.requestedPayloadDecodeCacheProof` with a
      browser-visible Web Audio mixer-bus proof for the same requested payload
      cache entries. The smoke now pins source-default `AudioManager::init`
      music/sound/3D/speech bus gains, routes real requested music, 2D SFX,
      voice, 3D SFX, and speech payloads through `GainNode` buses, observes
      five completion callbacks, and asserts non-silent rendered windows while
      preserving that this is not yet engine-driven mixer playback.
- [x] Add a browser Web Audio runtime user-gesture proof. The harness now
      exposes `browserAudioRuntime`, resumes a real `AudioContext` from canvas
      pointer or keyboard gestures, and `runtime_archives_smoke.mjs` drives a
      Playwright canvas click to assert the context reaches `running` while the
      original engine audio runtime still reports that the browser audio device
      is future work.
- [x] Add a browser Web Audio runtime mixer proof. The harness now exposes
      `browserAudioMixerRuntime`, creates live music/sound/3D/speech
      `GainNode` buses after the gesture-resumed `AudioContext` exists, applies
      source-shaped script/system volume values through the original
      `AudioManager::setVolume` formula, and asserts the real `GainNode.gain`
      values in `runtime_archives_smoke.mjs` while preserving that engine/UI
      control of the mixer is future work.
- [x] Add a browser requested-audio live event lifecycle proof. The archive
      harness now retains the representative decoded requested payload cache,
      starts one real requested payload (`CIAAgentVoiceAttack`) through a live
      `AudioBufferSourceNode -> soundGainNode -> AudioDestinationNode` graph
      after the browser audio gesture and mixer setup, and asserts
      request/start/ended/completion/release log phases while preserving that
      the original engine audio request queue is still future work.
- [x] Add a browser source-shaped audio request queue proof. The archive
      harness now exposes `browserAudioRequestPathRuntime`, drives the same
      real requested `CIAAgentVoiceAttack` payload through an ordered
      `AudioManager::addAudioEvent` handle/filename/play-info phase,
      `SoundManager::addAudioEvent` `AR_Play` queue phase,
      `MilesAudioManager::processRequestList` / `processRequest` dispatch
      phase, and live Web Audio start/completion/release assertions. This is a
      harness proof of the source request contract; the original
      `MilesAudioManager` runtime still needs a browser Web Audio backend.
- [x] Add a focused MSS 2D sample Web Audio playback proof.
      `Mss.H` now notifies the browser bridge when `AIL_start_sample`,
      `AIL_stop_sample`, `AIL_end_sample`, and `AIL_release_sample_handle`
      touch a sample. The wasm `cnc_port_probe_mss_sample_playback_start` /
      `cnc_port_probe_mss_sample_playback_finish` exports drive a valid
      in-memory PCM WAV through `AIL_start_sample`, the bridge schedules it
      after the Web Audio gesture through `AudioBufferSourceNode`, `GainNode`,
      `StereoPannerNode`, `soundGainNode`, and `AudioDestinationNode`, and
      `runtime_archives_smoke.mjs` asserts
      Web Audio completion, MSS end/release state, and the C++ EOS callback.
      `test:vertical-integrations` now gates that runtime archive preload
      includes MSS 2D Web Audio sample playback while preserving that full
      original `MilesAudioManager` event/stream/3D playback remains open.
      Verified with `npm --prefix WebAssembly run test:runtime-archives-browser`,
      `npm --prefix WebAssembly run test:startup-vertical`, and
      `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Stage the real base-Generals `Music.big` through
      `extract_zh_runtime_archives.sh`. The script extracts `Music.big` from
      base Generals CD1 `Data1.cab` into
      `artifacts/real-assets/base-generals/Music.big`, avoiding the 786KB Zero
      Hour copy-protection stub at `artifacts/real-assets/Music.big`; the
      current artifact is 158,818,808 bytes and is the archive mounted by the
      MSS stream playback harness. Verified by direct script inspection,
      `git merge-base --is-ancestor 78eb925 main`, and the existing
      `test:browser-audio-mss-stream` proof below.
- [x] Add browser-backed MSS music stream playback for mounted MP3 tracks.
      `cncPortMssStreamStart` now loads the requested stream from mounted BIG
      archives, decodes MP3 payloads through `AudioContext.decodeAudioData`
      and WAV payloads through the existing browser WAV decoder, then schedules
      an `AudioBufferSourceNode -> GainNode -> musicGainNode ->
      AudioDestinationNode` graph. The new `mssStreamPlaybackProbe` RPC and
      `harness/mss_stream_playback_smoke.mjs` mount the full base
      `base-generals/Music.big` as `Music.big`, resume Web Audio through the
      canvas gesture path, decode `Data\Audio\Tracks\USA_01.mp3`, prove
      9,489,345 decoded MP3 frames / 197.694687 seconds, and stop the active
      stream cleanly. Verified with
      `npm --prefix WebAssembly run test:browser-audio-mss-stream`.
- [x] Make the first MSS startup/device boundary stateful and
      harness-observable. `Mss.H` now records redist directory, startup,
      shutdown, quick-startup arguments, and file callbacks, and returns
      non-invalid digital-driver, provider, listener, and 2D/3D sample handles
      after a valid startup. The wasm `cnc_port_probe_mss_startup` export and
      harness `mssStartupProbe` RPC assert that the startup boundary is ready,
      playback is still not ready, and the next required implementation is a
      Web Audio playback backend.
- [x] Add `npm run verify:mss-startup-probe-contract`, a source-only verifier
      for that MSS startup probe contract. It pins the `Mss.H` stateful
      startup/provider/listener/sample-handle functions, the original
      `MilesAudioManager::openDevice` call order, the harness-visible
      `milesAudioDeviceFrontier` fields, the wasm probe source, CMake export,
      and the `mssStartupProbe` bridge RPC.
- [x] Extend the MSS startup/device boundary through the original
      `MilesAudioManager::initDelayFilter` lookup. `Mss.H` now enumerates
      browser-owned filter providers, including `Mono Delay Filter`, and
      `mssStartupProbe` asserts the filter count/name/handle before shutdown.
      The startup frontier now marks `initDelayFilter` ready while keeping
      `refreshCachedVariables`, playback scheduling, and real filter DSP open.
- [x] Add a focused original `MilesAudioManager::openDevice` runtime smoke.
      `WebAssembly/dist/miles-audio-open-device-smoke.cjs` instantiates the
      original manager, installs minimal target-local audio settings plus a raw
      original-layout `GlobalData::m_audioOn` owner, and drives the real
      `openDevice()` path through the browser `Mss.H` shim. The smoke verifies
      MSS redist/startup/quick-startup arguments, provider enumeration and
      selection, speaker type propagation, listener allocation, 2D/3D sample
      pool allocation, stream count, and `Mono Delay Filter` lookup. `Mss.H`
      now stores its browser runtime in shared C++17 inline storage so
      manager-compiled calls and smoke assertions observe the same state across
      translation units. Verified with
      `cmake --build WebAssembly/build/wasm --target miles-audio-open-device-smoke -j 8`
      and `node WebAssembly/dist/miles-audio-open-device-smoke.cjs`. Full
      `AudioManager::init` INI loading and Web Audio playback remain open.
- [x] Make the MSS 2D sample handle lifecycle stateful and
      harness-observable. `Mss.H` now tracks allocated 2D sample handles,
      initialization, sample file assignment, user data, EOS callbacks, volume,
      pan, playback rate, loop count, millisecond position, start/stop/resume,
      done status, and release. The wasm `cnc_port_probe_mss_sample_lifecycle`
      export and harness `mssSampleLifecycleProbe` RPC assert those state
      transitions while still reporting that Web Audio playback is not ready.
- [x] Add `npm run verify:mss-sample-lifecycle-contract`, a source-only
      verifier for the MSS 2D sample lifecycle contract. It reads only repo
      source (no browser/build/assets) and pins `initSamplePools`, `playSample`,
      and the `releaseMilesHandles`/`freeAllMilesHandles` paths in
      `MilesAudioManager.cpp`, the `Mss.H` 2D sample lifecycle surface
      (allocate/release/init/user-data/set-file/EOS/start/stop/resume/status/
      volume-pan/playback-rate/loop-count), and the runtime probe source
      `WebAssembly/src/wasm_mss_sample_lifecycle_probe.cpp`
      (`cnc_port_probe_mss_sample_lifecycle` plus the key API calls). It emits
      JSON `{ ok, errors, sources, facts }` and exits nonzero on hard failure.
- [x] Add `npm run verify:mss-stream-lifecycle-contract`, a source-only
      verifier for the MSS HSTREAM lifecycle contract. It reads only repo
      source (no browser/build/assets) and pins the `Mss.H` stream lifecycle
      surface (`MSSBrowserStreamState`, stream lookup/allocation, stream
      open/open-by-sample, callback, volume/pan/rate/loop/position/status, both
      `AIL_stream_ms_position` overloads, and close), the runtime probe source
      `WebAssembly/src/wasm_mss_stream_lifecycle_probe.cpp`, and the CMake
      source/export plus bridge cwrap/RPC lines. It emits JSON
      `{ ok, errors, sources, facts }` and exits nonzero on hard failure; this
      source verifier does not prove Web Audio playback.
- [x] Add `npm run verify:mss-3d-sample-lifecycle-contract`, a source-only
      verifier for the MSS 3D provider/listener/sample lifecycle contract. It
      reads only repo source (no browser/build/assets) and pins
      `MilesAudioManager.cpp` `initSamplePools` 3D allocation/user-data calls,
      `playSample3D` ordered file/callback/distances/position/start calls, the
      `releaseMilesHandles`/`freeAllMilesHandles` 3D stop/callback/release
      paths, and the `setDeviceListenerPosition`/`createListener`/`selectProvider`/
      `unselectProvider`/`setSpeakerType` listener/provider/speaker paths; the
      `Mss.H` stateful 3D surface (provider enumerate/open/close/speaker,
      listener open/close, sample allocate/release/file/user-data/callback/
      distances/position/orientation/velocity/volume/loop/offset/rate/occlusion/
      effects/start/stop/resume/end/status, plus the `MSSBrowser3D*` structs and
      find/allocate helpers); the runtime probe source
      `WebAssembly/src/wasm_mss_3d_sample_lifecycle_probe.cpp`
      (`cnc_port_probe_mss_3d_sample_lifecycle`, representative 3D calls, and the
      `sample3DLifecycleReady`/`playbackReady:false`/`nextRequired` JSON); and
      the CMake source/export plus bridge cwrap/RPC lines. It emits JSON
      `{ ok, errors, sources, facts }` and exits nonzero on hard failure; this
      source verifier does not prove Web Audio playback.
- [x] Make the MSS HSTREAM lifecycle stateful and harness-observable. `Mss.H`
      now tracks browser stream handles opened from filenames or 2D sample
      handles, callback registration, volume/pan and float volume-pan, playback
      rate, loop block, loop count, millisecond position, start/pause/resume
      status, and close/release state. The wasm
      `cnc_port_probe_mss_stream_lifecycle` export and harness
      `mssStreamLifecycleProbe` RPC assert those transitions while still
      reporting `playbackReady:false` and
      `nextRequired:"webAudioPlaybackBackend"`; no browser audio node or stream
      decoder is scheduled by this probe.
- [x] Make the MSS 3D provider/listener/sample lifecycle stateful and
      harness-observable. `Mss.H` now tracks open 3D providers, speaker type,
      listener handles, listener position/orientation/velocity, 3D sample
      allocation, user data, sample file assignment, EOS callbacks, distance,
      position, velocity, volume, playback rate, loop count, offset, occlusion,
      effects level, start/stop/resume/end status, callback dispatch, and
      release. The wasm `cnc_port_probe_mss_3d_sample_lifecycle` export and
      harness `mss3DSampleLifecycleProbe` RPC assert those state transitions
      while still reporting `playbackReady:false` and
      `nextRequired:"webAudioPlaybackBackend"`; real Web Audio panning,
      listener binding, and scheduling remain open.
- [x] Broaden the live browser audio request-path runtime proof beyond one 2D
      sample. `browserAudioRequestPathRuntime` now reports covered playing
      types, device starts, audio types, and mixer buses from its source-shaped
      event log, and `harness/runtime_archives_smoke.mjs` drives real decoded
      requested payloads through `PAT_Sample` / `playSample`,
      `PAT_3DSample` / `playSample3D`, and `PAT_Stream` / `playStream` live
      Web Audio completion/release paths. This remains harness-driven proof
      coverage, not original `MilesAudioManager` runtime scheduling.
- [x] Split the browser audio request-path proof into a focused vertical gate.
      `harness/audio_request_path_smoke.mjs` mounts the runtime BIG set, boots
      the browser harness, resumes a real `AudioContext` from the canvas
      gesture, creates the live music/sound/3D/speech `GainNode` mixer buses,
      then drives three real requested decoded payloads through the
      source-shaped `AudioManager::addAudioEvent` /
      `SoundManager::addAudioEvent` / `MilesAudioManager::processRequestList`
      / `MilesAudioManager::processRequest` path. The smoke asserts
      `playSample`, `playSample3D`, and `playStream`, `PAT_Sample`,
      `PAT_3DSample`, and `PAT_Stream`, sound/sound3D/speech buses, Web Audio
      completion callbacks, and release counters. `test:vertical-integrations`
      now includes this as an independent audio vertical. This still does not
      claim the real original `MilesAudioManager` runtime owns Web Audio
      scheduling. Verified with `npm --prefix WebAssembly run
      test:browser-audio-request-path`; the aggregate
      `npm --prefix WebAssembly run test:vertical-integrations` gate includes
      it.
- [x] Drive the original `MilesAudioManager` 2D sample request leg into the
      stateful MSS sample backend. `WebAssembly/tests/miles_audio_play_sample_smoke.cpp`
      installs minimal original file-system/audio singletons, constructs an
      `AudioEventRTS` with `AudioEventInfo`, and calls the protected original
      `MilesAudioManager::processRequest` with an `AR_Play` request. The smoke
      proves `processRequest -> playAudioEvent -> playSample` consumes one
      manager-owned 2D sample handle, loads a valid PCM WAV through
      `AudioFileCache`, parses it with the new `Mss.H` `AIL_WAV_info`, calls
      `AIL_set_sample_file` / `AIL_start_sample`, observes MSS `SMP_PLAYING`,
      drives `AIL_end_sample` through the original EOS callback and
      `notifyOfAudioCompletion`, then releases the `PlayingAudio` back to the
      2D pool. `test:miles-audio-play-sample` runs the focused proof, and
      `test:vertical-integrations` now includes it between the browser audio
      request-path proof and the network verticals. This proves the
      original-manager 2D sample device leg, not the combined browser Web Audio
      completion path; the next audio vertical should merge this manager leg
      with the existing browser MSS `AudioBufferSourceNode` completion harness.
      Verified with `npm --prefix WebAssembly run test:miles-audio-play-sample`
      and `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Add a paired Miles/Web Audio browser-owned vertical gate.
      `WebAssembly/harness/audio_miles_webaudio_vertical_smoke.mjs` first runs
      the original standalone `MilesAudioManager::processRequest ->
      playAudioEvent -> playSample` 2D sample smoke, then boots the browser
      `cnc-port` harness with the real runtime archive set, resumes Web Audio
      from the canvas gesture, drives the MSS sample playback probe through
      `AudioBufferSourceNode.onended`, and plays a source-shaped
      `CIAAgentVoiceAttack` 2D request path event through browser Web Audio.
      `test:browser-audio-miles-webaudio-vertical` and
      `test:vertical-integrations` now gate the paired proof. This is a
      vertical integration of the existing original-manager leg beside browser
      Web Audio completion/release, not yet same-runtime ownership by the
      original `MilesAudioManager`; the standalone original-manager leg still
      reports `browserPlaybackRequested:false`.
- [x] Decode IMA ADPCM at the original Miles boundary: `shims/Mss.H` extends
      `AILSOUNDINFO` to the original Miles 6 field surface, `AIL_WAV_info`
      parses `fmt `/`fact`/`data` chunks, and `AIL_decompress_ADPCM`
      implements the standard IMA ADPCM → PCM16 decode (step/index tables,
      per-channel block headers, 4-byte-per-channel nibble interleave,
      fact-clamped padded final block, mono+stereo), emitting a complete PCM
      WAV freed by a real `AIL_mem_free_lock`. The nibble expansion uses the
      full-precision `((2*delta+1)*step)>>3` variant, chosen because it is
      bit-exact with ffmpeg on the real payloads. Verified: real
      `AudioZH.big` payloads decode with **0 sample diffs** against both an
      independent JS reference decoder and ffmpeg (mono `bairatta.wav`
      38,528 frames; stereo `cleftria.wav` 156,272 samples); the original
      engine branch `AudioFileCache::openFile → AIL_WAV_info →
      AIL_decompress_ADPCM` (MilesAudioManager.cpp:3179-3189) runs over real
      payloads in both the node smoke and inside `cnc-port` in the browser,
      where the decoded PCM schedules through the Web Audio graph
      (non-silent, completion/EOS/release asserted) —
      `test:browser-audio-miles-webaudio-vertical`,
      `verify:miles-audio-decode-frontier`, and
      `verify:audio-format-frontier` gate it. This unblocks the 2,572-file
      IMA ADPCM majority of the shipped audio payloads.
- [x] Play real engine-driven 2D and 3D sample events through Web Audio in
      `cnc-port`. `cnc_port_real_engine_play_audio_event` now invokes the
      original `TheAudio->addAudioEvent` path and pumps real frames through
      `SoundManager::addAudioEvent -> MilesAudioManager::processRequest ->
      playSample/playSample3D -> AIL_start_sample/AIL_start_3D_sample`.
      The browser bridge exposes `realEnginePlayAudioEvent` plus
      `browserMss3DSamplePlaybackRuntime`, and the MSS 3D sample bridge now
      routes through `PannerNode(HRTF) -> sound3DGainNode` instead of the 2D
      sound bus. `real_audio_event_smoke.mjs` proves
      `ArtilleryBarrageIncomingWhistle` as a positional 3D sample and
      `CIAAgentVoiceAttack` as a non-positional 2D sample, both decoded from
      mounted shipped audio archives and scheduled by the real engine audio
      manager. Verified locally with
      `npm --prefix WebAssembly run test:real-audio-event` and on the Mac M4
      Metal-backed Chrome with `REAL_AUDIO_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" REAL_AUDIO_BROWSER_ARGS="--enable-gpu --use-angle=metal" /opt/homebrew/bin/node harness/real_audio_event_smoke.mjs`.
- [x] Drive a real engine-owned music stream through the browser MSS Web Audio
      backend in `cnc-port`. `real_audio_event_smoke.mjs` now plays the shipped
      ZH `MusicTrack` `Game_USA_10` through the original
      `TheAudio->addAudioEvent -> MusicManager::addAudioEvent ->
      MilesAudioManager::processRequest -> playAudioEvent -> AIL_open_stream /
      AIL_start_stream` route, waits for `cncPortMssStreamStart` to decode
      `Data\Audio\Tracks\USA_10.mp3` from `MusicZH.big` with
      `AudioContext.decodeAudioData`, and asserts the live
      `AudioBufferSourceNode -> GainNode -> musicGainNode ->
      AudioDestinationNode` graph. The smoke also exposes
      `realEngineStopAudioEvent`, which calls the original
      `TheAudio->removeAudioEvent(...)` path; the gate uses the original
      `AHSV_StopTheMusic` sentinel and frame-pumps until `cncPortMssStreamStop`
      records stream stop state while preserving concurrently active shell
      music. The bridge now treats mounted archive source names by leaf name, so
      base music mounted as `ZZBase_Music.big` with source
      `base-generals/Music.big` is searched by the stream backend; the same
      smoke proves `Game_USA_01` decodes
      `Data\Audio\Tracks\USA_01.mp3` from `ZZBase_Music.big`. The 2D/3D sample
      assertions now pump real frames while waiting so the gate observes the
      original audio request drain instead of relying on immediate timing.
      Verified with `npm --prefix WebAssembly run test:real-audio-event`.
- [x] Route real engine-owned speech streams through the browser Web Audio
      speech bus. The MSS stream backend now canonicalizes engine filenames and
      BIG directory paths before archive lookup, so mixed-case paths with
      repeated separators such as `Data\Audio\Speech\english\\mg1sc105.wav`
      resolve to shipped speech payloads. Stream bus selection now maps
      `Data\Audio\Speech\...` to `speechGainNode`, while music streams continue
      to use `musicGainNode`. `real_audio_event_smoke.mjs` plays
      `MisGLA01Scorpion105` through the original
      `TheAudio->addAudioEvent -> MilesAudioManager::processRequest ->
      playAudioEvent -> AIL_open_stream / AIL_start_stream` route, verifies
      `AT_Streaming`, decodes `mg1sc105.wav` from `SpeechEnglishZH.big` with
      the browser WAV decoder, asserts the
      `AudioBufferSourceNode -> GainNode -> speechGainNode ->
      AudioDestinationNode` graph, and stops it through the original
      `TheAudio->removeAudioEvent(...)` handle path. Verified with
      `node --check WebAssembly/harness/bridge.js`,
      `node --check WebAssembly/harness/real_audio_event_smoke.mjs`,
      `git diff --check`, `npm --prefix WebAssembly run build:port`, and
      `npm --prefix WebAssembly run test:real-audio-event`.

---

## M8 — Video (Bink → WebCodecs)

- Added `verify:bink-video-device-frontier` (`WebAssembly/tools/verify_bink_video_device_frontier.mjs`), a source-only frontier verifier that reads (never executes) the original Bink video device source/header, the wasm `shims/bink.h` declaration shim, and the wasm `CMakeLists.txt` compile frontier target. It pins the current original Bink video device frontier as exact source lines: `BinkVideoPlayer::init` (128) calls `VideoPlayer::init()` (131) then `initializeBinkWithMiles()` (133); `deinit` (140) calls `releaseHandleForBink()` (142) then `VideoPlayer::deinit()` (143); `open` (221) uses `BinkOpen` on the mod (233), localized (243), and fallback (249) paths then `createStream`; `createStream` (187) sets `m_handle` (200) and `BinkSetVolume` (210); `initializeBinkWithMiles` (283) calls `getHandleForBink` (286), `BinkSoundUseDirectSound` (290), and `BinkSetSoundTrack` (294); the `BinkVideoStream` destructor closes the handle via `BinkClose` (316); and `update`/`isFrameReady`/`frameDecompress`/`frameRender`/`frameNext`/`frameGoto`/`height`/`width`/`frameIndex`/`frameCount` map to `BinkWait`/`BinkDoFrame`/`BinkCopyToBuffer`/`BinkNextFrame`/`BinkGoto`/handle `Height`/`Width`/`FrameNum`/`Frames` fields. It also pins the header declarations and the declarations-only `shims/bink.h` contract, and emits JSON `{ ok, errors, sources, facts }`, exiting nonzero on any missing/moved hard fact. Runtime WebCodecs/`<video>` decode, frame upload, and audio sync remain open.
- Added `inventory:bink-video-payloads` (`WebAssembly/tools/inventory_bink_video_payloads.mjs`), a source/data inventory preflight for shipped Bink video payloads. It reuses the existing BIGF directory-reading style from `inventory_startup_archives.mjs` / `inventory_audio_payloads.mjs`, indexes the current runtime BIG set plus any loose `.bik` files already present under the assets dir, sniffs a small header prefix from each entry, and classifies the leading signature (classic `BIK` or Bink 2 `KB2`) without decoding video. It emits JSON `{ ok, source, assetsDir, archiveCount, bigEntryCount, videoEntryCount, bikInBigCount, looseBikCount, byArchive, entries, looseBikFiles, dataCab, looseBikExtractionRequired, archives, errors, note }`, fails nonzero when archives cannot be read, and under `--expect-current-zh` pins the actually observed data: zero `.bik` entries inside the current Zero Hour runtime BIGs, and the assets dir in one of two honest loose-file states for the disc cabinet `Data1.cab` payloads (`GC_Background.bik` / `VS_small.bik`) — either not-yet-extracted (zero loose `.bik`, `looseBikExtractionRequired` true) or extracted (exactly those two loose `.bik` files with BIK/KB2 signatures). The runtime BIG set has no `.bik` entries and the disc cabinet is the only shipped Bink source, so loose Bink extraction is the prerequisite for any playback work. Runtime playback items in `TODO.md` M8 remain open.
- [x] Preserve the shipped loose Bink payloads during runtime archive
      extraction. `extract_zh_runtime_archives.sh` now extracts
      `GC_Background.bik` and `VS_small.bik` from Zero Hour `Data1.cab`,
      verifies BIK/KB2 header magic, and lists them alongside the runtime BIG
      archives while leaving the ignored binary artifacts out of git. Runtime
      WebCodecs/`<video>` decode, frame upload, and audio sync remain open.
- Added `verify:bink-payload-header-contract`
      (`WebAssembly/tools/verify_bink_payload_header_contract.mjs`), a bounded
      real-data verifier for the shipped loose Bink payload headers. It reads
      the actual extracted `GC_Background.bik` and `VS_small.bik` files from
      `WebAssembly/artifacts/real-assets` (printing a clear `npm run
      extract:runtime-archives` error and exiting nonzero if they are absent)
      and parses only the source-grounded classic-BINK header fields visible
      in the real files and needed by the browser Bink provider front end:
      3-byte `BIK` magic + 1-byte version (BIKi), the u32 size field (file
      size minus 8), frame count, largest frame size, the repeated frame
      count field, width, height, fps numerator, and fps denominator. It
      verifies the size field equals file size minus 8, and under
      `--expect-current-zh` pins the values measured from the real files:
      `GC_Background.bik` 149,700 bytes, BIKi, 180 frames, 800x600, 30/1 fps;
      `VS_small.bik` 310,128 bytes, BIKi, 71 frames, 96x120, 30/1 fps. It
      emits JSON `{ ok, errors, payloads, source }` and fails nonzero on
      mismatch. It does not decode, demux, or play Bink video, and does not
      invent decode behavior. Runtime WebCodecs/`<video>` decode, frame
      upload, and audio sync remain open.
- [x] Add the first browser Bink provider implementation and smoke. `zh_browser_bink`
      now defines the original Bink API functions for real-file open/header
      parsing and frame-cursor lifecycle, and `zh_bink_video_device_compile_frontier`
      links that provider behind the original `BinkVideoPlayer` call path.
      `test:bink-video-provider` builds the wasm smoke, extracts runtime
      archives, opens the real shipped `GC_Background.bik` and `VS_small.bik`
      payloads, verifies their `HBINK` frame/dimension fields (`180` frames at
      `800x600`; `71` frames at `96x120`), proves original-style
      `Data\English\Movies\VS_small.bik` basename resolution, and reports
      `decodeReady:false`. Runtime frame decode/copy, WebCodecs/`<video>`
      presentation, and audio sync remain open.
- [x] Decide the browser path for shipped `.bik` payloads as offline
      transcode to browser-decodable sidecars, and add
      `transcode:bink-video`. `WebAssembly/tools/transcode_bink_video_payloads.mjs`
      reads the user-extracted `GC_Background.bik` and `VS_small.bik` files,
      verifies their classic BIK header facts and FFmpeg source probe metadata,
      emits VP9/Opus WebM files under ignored `artifacts/browser-video/bink`,
      counts output video frames with `ffprobe`, and writes
      `bink-browser-video-manifest.json` preserving source size, signature,
      frames, dimensions, FPS, source/output codecs, and durations. This
      chooses the `<video>` / WebCodecs sidecar input contract for the browser
      port, but runtime manifest lookup, video presentation, frame upload,
      `BinkCopyToBuffer` pixel-copy behavior, and audio synchronization remain
      open.
- [x] Add a browser smoke for the generated Bink sidecars.
      `test:bink-browser-video` runs `transcode:bink-video`, serves the
      generated WebM files through the existing Playwright static server, loads
      them in Chromium as `<video>` elements, checks `canPlayType`, dimensions,
      duration, play progress, seek behavior, same-origin canvas frame
      readability, and captures
      `artifacts/screenshots/harness-smoke-bink-browser-video.png`. This proves
      the sidecar payloads are browser-decodable, but it still does not wire
      them into the original `BinkVideoPlayer` runtime.
- [x] Add `verify:bink-browser-video-outputs` /
      `verify:bink-browser-video-outputs:strict`
      (`WebAssembly/tools/verify_bink_browser_video_outputs.mjs`) for the real
      sidecar manifest emitted by `transcode:bink-video`. It validates
      `artifacts/browser-video/bink/bink-browser-video-manifest.json` for the
      two shipped loose BIK payloads, checks source size/signature, source and
      output codecs, dimensions, frame counts, FPS, durations, and
      `browserDecode` metadata against the current pinned Zero Hour facts, and
      uses `ffprobe` when available to inspect the actual generated WebM
      streams. With `--allow-missing` it reports absent sidecars in JSON and
      exits 0 before transcode output exists; strict mode fails on absent or
      mismatched output. This verifier does not decode Bink inside the
      provider or claim original `BinkVideoPlayer` runtime playback.
- [x] Attach browser sidecar metadata to the current Bink provider handles and
      harness-test that provider/browser contract. `WebAssembly/shims/bink.h`
      now exposes provider query helpers for sidecar availability, relative
      WebM path, video/audio codecs, frame count, and duration while
      `WasmBinkProviderCanDecodeFrames()` still reports false. `zh_browser_bink`
      reads `bink-browser-video-manifest.json`, matches entries by source BIK
      basename, validates frame count and dimensions against the parsed
      `HBINK` header fields, and stores browser-facing relative paths like
      `artifacts/browser-video/bink/GC_Background.webm`.
      `test:bink-video-sidecar-provider` exercises this in the node smoke,
      including original-style `Data\English\Movies\VS_small.bik` basename
      resolution. `test:bink-provider-sidecar-browser` builds an ES module
      smoke, mounts the BIK payloads plus manifest into MEMFS, runs the
      provider query smoke in Chromium, loads the advertised WebMs through
      `<video>`, checks metadata/play/seek/canvas-readback, and captures
      `artifacts/screenshots/harness-smoke-bink-provider-sidecar-video.png`.
      The provider now also emits browser-observable sidecar lifecycle hooks
      for open, `BinkDoFrame`, pending `BinkCopyToBuffer`, `BinkNextFrame`,
      `BinkGoto`, and close; the browser smoke installs
      `Module.cncPortBinkVideo*` hooks and verifies those events for the
      shipped sidecars.
      `verify:bink-video-device-frontier` now pins this provider extension,
      the focused C++/JS/browser harnesses, the CMake smoke targets, and the
      package scripts. `verify:bink-browser-sidecar-contract` complements it
      by pinning the generated manifest schema/path, source-to-sidecar
      metadata association, original-style Bink path aliases, and the
      hook-gated `WasmBinkProviderCanDecodeFrames` / `BinkCopyToBuffer`
      pixel-copy invariant. Original `BinkVideoPlayer` runtime presentation,
      `BinkCopyToBuffer` frame upload, and audio sync remain open.
- [x] Add `verify:bink-runtime-callsite-frontier`
      (`WebAssembly/tools/verify_bink_runtime_callsite_frontier.mjs`, with
      strict alias `verify:bink-runtime-callsite-frontier:strict`), a
      source-only verifier for the original Bink runtime *callsite* frontier
      that any future sidecar-into-`BinkVideoPlayer` presentation bridge must
      preserve. It pins, as exact source lines where stable: the
      `W3DGameClient::createVideoPlayer()` `NEW BinkVideoPlayer` factory
      (`W3DGameClient.h` line 115) and the `GameClient::init()` ownership path
      (`TheVideoPlayer = createVideoPlayer()` at line 411, `->init()` at 414,
      `setName("TheVideoPlayer")` at 415); `BinkVideoPlayer::createStream`
      (187) setting `m_handle` (200) then `BinkSetVolume` (210),
      `BinkVideoPlayer::open` (221) calling `BinkOpen` then
      `createStream(handle)`, and `BinkVideoPlayer::load` (264) delegating to
      `open`; the abstract `VideoBuffer` `lock`/`unlock` (126/127)/`pitch`
      (137)/`format` (138) contract; the `W3DVideoBuffer` surface-backed
      `lock` (167, via `m_texture->Get_Surface_Level()` and
      `m_surface->Lock()`) and `unlock` (190, via `m_surface->Unlock()` +
      `Release_Ref()`) facts; and the existing
      `zh_bink_video_device_compile_frontier` CMake target (2468) compiling
      `BinkVideoPlayer.cpp` (2469). The representative original frame loops
      (`Display::update`, `InGameUI::update`, `WindowVideoManager::update`,
      the `SinglePlayerLoadScreen::init` and `ChallengeLoadScreen::init`
      load-video loops, and `PlayMovieAndBlock` in `ScoreScreen.cpp`) and the
      `ChallengeLoadScreen::init` min-spec `frameGoto(frameCount())` skip path
      (1101, followed by its own ready-wait/decompress/render) are verified by
      robust function-body range/ordered searches rather than brittle
      full-file line equality. It emits JSON `{ ok, errors, sources, facts }`
      and exits nonzero on any missing/moved hard fact. It does NOT mark
      runtime playback, frame upload, or `BinkCopyToBuffer` pixel copy
      complete; those remain open M8 tasks tracked in `TODO.md`.
- [x] Add the first original `BinkVideoPlayer`-owned runtime smoke.
      `test:bink-videoplayer-runtime` builds `bink-videoplayer-runtime-smoke`
      against `zh_bink_video_device_compile_frontier`, `zh_browser_bink`, and
      the original `GameClient/VideoPlayer` implementation, runs
      `transcode:bink-video` so the provider sidecar manifest is present, then
      opens the real shipped loose `GC_Background.bik` and `VS_small.bik`
      payloads through original `BinkVideoPlayer::open` / `load` paths. The
      smoke uses target-local `TheAudio` / `GlobalData` / `VideoBuffer`
      compatibility surfaces only to reach the original runtime path, verifies
      `800x600` / `180` frames and `96x120` / `71` frames, exercises
      `isFrameReady`, `update`, `frameDecompress`, `frameRender`,
      `frameNext`, `frameGoto`, and close, and keeps
      `WasmBinkProviderCanDecodeFrames() == 0`. `verify:bink-video-device-frontier`
      now pins the runtime smoke source, CMake target, NODERAWFS setting, and
      package script. This proves the original player/stream call path under
      wasm; browser presentation, frame upload, `BinkCopyToBuffer` pixel copy,
      and audio sync remain open.
- [x] Add a browser-hooked Bink sidecar copy bridge proof.
      `BinkCopyToBuffer` now delegates to `cncPortBinkCopyToBuffer` when a
      browser sidecar copy hook is installed, passing the original handle,
      source/sidecar metadata, frame cursor, destination pointer, pitch,
      destination dimensions, offset, and Bink surface flags. The browser
      `test:bink-provider-sidecar-browser` smoke still first runs the existing
      no-hook sidecar metadata/lifecycle check with `decodeReady:false`, then
      preloads decoded WebM frames through `<video>`/canvas, installs the copy
      hook, and runs `run_bink_video_sidecar_copy_bridge_smoke` to prove
      `BinkCopyToBuffer` writes nonzero decoded sidecar pixels into wasm memory
      for `GC_Background.bik` and both original/direct `VS_small.bik` paths.
      The provider emits `copyComplete` only after the hook reports a
      successful copy, and `WasmBinkProviderCanDecodeFrames()` is now
      hook-gated instead of unconditionally true. Original `BinkVideoPlayer`
      browser presentation, `W3DVideoBuffer` texture upload/draw integration,
      final Bink surface format conversion, and audio sync remain open.
- [x] Add `verify:bink-w3d-video-buffer-upload-frontier`, a source-only
      verifier for the next M8 upload/presentation contract after
      `BinkCopyToBuffer`. It pins original `BinkVideoStream::frameRender`
      lock/copy/unlock order and `VideoBuffer::Type` to `BINKSURFACE*` mapping,
      the abstract `VideoBuffer` lock/unlock/pitch/height/xPos/yPos/format
      contract, original `W3DVideoBuffer` `TextureClass`/`SurfaceClass`
      allocation/lock/unlock/free ownership, `W3DDisplay::drawVideoBuffer` as
      the eventual 2D textured-quad presentation sink, and the browser D3D8
      shim `LockRect`/`UnlockRect`/`wasm_d3d8_browser_texture_update` dirty
      pixel hook path. The verifier explicitly leaves original
      `BinkVideoPlayer` browser presentation through a real `W3DVideoBuffer`
      and screenshot-proven `W3DDisplay::drawVideoBuffer` path open.
- [x] Add an original `BinkVideoPlayer`-owned browser sidecar copy smoke.
      `test:bink-videoplayer-sidecar-browser` builds
      `bink-videoplayer-browser-runtime-smoke` as an ES module, mounts the
      real shipped `GC_Background.bik` / `VS_small.bik` payloads plus
      `bink-browser-video-manifest.json` into MEMFS, decodes the advertised
      WebM sidecar frames in Chromium, installs `cncPortBinkCopyToBuffer`, and
      calls the original `BinkVideoPlayer` runtime smoke export. The smoke
      verifies `BinkVideoPlayer::open` / `load` create streams from the real
      payloads, `BinkVideoStream::frameDecompress` / `frameRender` drives
      `BinkCopyToBuffer`, decoded sidecar pixels are copied into
      `SmokeVideoBuffer` memory, frame advance/seek/close lifecycle events are
      emitted, and
      `artifacts/screenshots/harness-smoke-bink-videoplayer-sidecar-copy.png`
      is captured. This proves original-player ownership of the sidecar copy
      bridge; real `W3DVideoBuffer` texture upload, `W3DDisplay` presentation,
      final surface-format conversion, and Bink/audio sync remain open.
- [x] Add an original `BinkVideoPlayer` to real `W3DVideoBuffer` browser
      upload proof. The browser D3D8 shim now uploads dirty pixels when a
      texture-owned surface is unlocked directly, which is the original
      `W3DVideoBuffer::lock` / `SurfaceClass::Unlock` path. The new
      `bink-w3d-video-buffer-browser-smoke` target links original
      `W3DVideoBuffer.cpp`, initializes WW3D, mounts the real shipped BIK
      payloads and sidecar manifest, decodes the advertised WebMs in Chromium,
      installs `cncPortBinkCopyToBuffer`, and drives original
      `BinkVideoStream::frameRender(&W3DVideoBuffer)`. The harness
      `test:bink-w3d-video-buffer-browser` verifies decoded sidecar pixels are
      copied into real W3D texture memory and emitted through
      `cncPortD3D8TextureUpdate` as nonzero uploads for `GC_Background`
      (`800x600` visible into a `1024x1024` texture, pitch `4096`) and
      `VS_small` (`96x120` visible into a `128x128` texture, pitch `512`), with
      texture release cleanup and screenshot
      `artifacts/screenshots/harness-smoke-bink-w3d-video-buffer-upload.png`.
      Final presentation through `W3DDisplay::drawVideoBuffer`, final surface
      format policy, and Bink/audio sync remain open.
- [x] Add an original `W3DDisplay::drawVideoBuffer` browser presentation
      smoke for a real `W3DVideoBuffer`. The `cnc-port` runtime now exports
      `cnc_port_probe_ww3d_display_video_buffer`, which initializes WW3D,
      allocates a `TYPE_X8R8G8B8` `W3DVideoBuffer`, locks and fills its
      `128x128` texture-owned surface with synthetic red pixels, unlocks it
      through the original `W3DVideoBuffer` / `SurfaceClass` upload path, and
      calls original `W3DDisplay::drawVideoBuffer` on a probe display with a
      display-owned `Render2DClass`. The harness RPC
      `ww3dDisplayVideoBuffer` and `test:ww3d-display-video-buffer` verify the
      original draw path emits a textured quad (`D3DPT_TRIANGLELIST`, 4
      vertices, 2 primitives, 44-byte stride), binds the same browser texture
      reported by the `W3DVideoBuffer`, uses the expected modulate
      texture/diffuse state with stage 1 disabled, updates/releases browser
      D3D8 textures, and renders red center pixels with black outside pixels
      on the WebGL2 canvas. The smoke captures
      `artifacts/screenshots/harness-smoke-ww3d-display-video-buffer-canvas.png`.
      This proves synthetic `W3DVideoBuffer` presentation through
      `W3DDisplay::drawVideoBuffer`; decoded Bink sidecar frames still need to
      be joined to this display path, and Bink/audio sync remains open.
- [x] Join decoded Bink sidecar frames to original `W3DDisplay::drawVideoBuffer`
      presentation in a focused browser runtime smoke. The existing
      `bink-w3d-video-buffer-browser-smoke` target now links the original
      `zh_w3d_display_drawimage_runtime` display path, keeps the original
      `BinkVideoPlayer` / `BinkVideoStream::frameRender(&W3DVideoBuffer)`
      ownership, then calls original `W3DDisplay::drawVideoBuffer` on a probe
      display with a display-owned `Render2DClass`. The browser harness wires
      the smoke module into the shared D3D8/WebGL bridge, decodes the shipped
      `GC_Background.bik` and `VS_small.bik` WebM sidecars through `<video>` /
      canvas, installs `cncPortBinkCopyToBuffer`, verifies decoded pixels are
      uploaded into real `W3DVideoBuffer` textures, verifies two
      `drawVideoBuffer` indexed quad draws bind and sample those textures with
      the original modulate texture/diffuse combiner and stage 1 disabled, and
      captures `artifacts/screenshots/harness-smoke-bink-w3d-video-buffer-upload.png`.
      `test:bink-w3d-video-presentation-browser` is now an alias for this
      stronger smoke. This proves the focused original-player sidecar frame
      presentation path; full original `Display`/`WindowVideoManager`/
      load-screen movie ownership and Bink/audio sync remain open.
- [x] Add `verify:bink-audio-sync-frontier` (`verify:bink-audio-sync-frontier`
      and strict alias `verify:bink-audio-sync-frontier:strict`), a
      source-only verifier for the remaining Bink audio-sync/frontier
      contract so future browser Bink playback does not break the original
      Miles/Bink handoff. It reads original C++ source (never executes the
      engine or wasm) and pins hard facts around
      `BinkVideoPlayer::init`/`initializeBinkWithMiles`,
      `BinkVideoPlayer::deinit` `TheAudio->releaseHandleForBink()`,
      `initializeBinkWithMiles` `TheAudio->getHandleForBink()` ->
      `BinkSoundUseDirectSound()` with `BinkSetSoundTrack(0,0)` muted-video
      fallback, `createStream` Speech-volume-derived `BinkSetVolume`,
      `notifyVideoPlayerOfNewProvider` tear-down/re-establish lifecycle, the
      abstract `AudioManager` / `VideoPlayer` Bink handle boundary, and
      `MilesAudioManager` ownership of the `m_binkHandle` `PlayingAudio`
      member (constructor `NULL` initializer, destructor leak-assert +
      release, `getHandleForBink` `allocatePlayingAudio` +
      `AudioEventRTS("BinkHandle")` 2D-sample + `AIL_get_DirectSound_info`
      handoff, `releaseHandleForBink` release/null, and
      `selectProvider`/`unselectProvider` driving
      `notifyVideoPlayerOfNewProvider(TRUE/FALSE)`). It is source-only and
      explicitly does NOT complete runtime Bink audio playback, per-frame
      audio-clock frame progression (`BinkWait`), or a Web Audio/DirectSound
      handoff; those remain open M8 tasks tracked in `TODO.md`.
- [x] Add `verify:bink-w3d-video-presentation-frontier`
      (`verify:bink-w3d-video-presentation-frontier` and strict alias
      `verify:bink-w3d-video-presentation-frontier:strict`), a source-only
      verifier (it reads files, never executes the engine or wasm) for the
      original Bink/W3D *video presentation* contract from a browser-uploaded
      `W3DVideoBuffer` texture to final `W3DDisplay::drawVideoBuffer`
      presentation. It is deliberately disjoint from the runtime
      `bink-w3d-video-buffer-browser-smoke` upload smoke and from
      `verify:bink-w3d-video-buffer-upload-frontier` (which pins the
      *upload* contract): this verifier pins the downstream *presentation*
      source contract that the upload must ultimately reach. It asserts that
      `W3DDisplay::drawVideoBuffer(VideoBuffer*, Int, Int, Int, Int)` casts
      its argument to `W3DVideoBuffer*` and drives the display-owned
      `Render2DClass` (`m_2DRender`) in the exact original order
      (`Reset()` -> `Enable_Texturing(TRUE)` ->
      `Set_Texture(vbuffer->texture())` ->
      `Add_Quad(RectClass(startX,startY,endX,endY), vbuffer->Rect(0,0,1,1))`
      -> `Render()`); that `W3DDisplay::createVideoBuffer()` creates a
      `W3DVideoBuffer` through the original format-selection path
      (`DX8Wrapper::getBackBufferFormat()` ->
      `Get_Current_Caps()->Support_Texture_Format` ->
      `W3DFormatToType`, the `WW3D_FORMAT_X8R8G8B8`/`R8G8B8`/`R5G6B5`/
      `X1R5G5B5` `D3DFMT` fallback ladder -> `VideoBuffer::TYPE_*` with the
      no-format `return NULL` path and the `TheGlobalData->m_playIntro`
      low-mem 16-bit override, then `NEW W3DVideoBuffer(format)`); that
      `W3DDisplay::drawImage` proves the SAME display-owned
      `Render2DClass` path (`Reset` -> `Enable_Texturing` -> `Set_Texture`
      -> `Add_Quad` -> `Render`) already has browser-backed textured-quad
      coverage through the `test:ww3d-display-drawimage-file` harness proof
      (`ww3d_display_drawimage_file_probe`, `Render2DClass::Set_Texture`
      source attribution, texture create/update/bind delta check, and
      viewport screenshot); and the CMake/package facts for the current
      `bink-w3d-video-buffer-browser-smoke` upload proof and the
      `test:ww3d-display-drawimage-file` display draw-image target/script it
      relies on. The verifier is honest that this is a source-only
      presentation contract pin: runtime `W3DDisplay::drawVideoBuffer`
      presentation of a Bink video frame, verified by a harness screenshot, was
      still open at the time of that entry; it did NOT claim runtime Bink video
      presentation complete.
- [x] Extend the Bink/W3D browser presentation smoke through focused original
      `WindowVideoManager::playMovie/update/reset` ownership. The
      `bink-w3d-video-buffer-browser-smoke` test now creates a lightweight
      `Display` adapter whose `createVideoBuffer()` returns a real
      `W3DVideoBuffer`, creates a real `GameWindow` through a focused
      `GameWindowManager`, calls original `WindowVideoManager::playMovie` for
      `VS_small`, verifies the manager-attached `WinInstanceData::m_videoBuffer`
      is a valid `W3DVideoBuffer`, then calls original
      `WindowVideoManager::update` so the original manager drives
      `BinkVideoStream::frameDecompress`, `frameRender(videoBuffer)`, and
      `frameNext`. The browser harness now expects three Bink copy/open/close
      lifecycles and three original `W3DDisplay::drawVideoBuffer` indexed draws:
      direct `GC_Background`, direct `VS_small`, and manager-owned `VS_small`.
      `verify:bink-w3d-video-buffer-upload-frontier` and
      `verify:bink-w3d-video-presentation-frontier` now pin the new manager path
      while keeping full original `Display` / load-screen / score-screen movie
      loops and Bink/audio sync open at that point. Verified with
      `npm run build:wasm`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`, and
      `npm run test:bink-w3d-video-buffer-browser`.
- [x] Extend the Bink/W3D browser presentation smoke through focused original
      `Display::playMovie/update/stopMovie` ownership. The
      `bink-w3d-video-buffer-browser-smoke` test now exposes narrow probe
      accessors on the lightweight `Display` adapter, calls original
      `Display::playMovie("VS_small")`, verifies it opens an original
      `BinkVideoStream`, allocates a real `W3DVideoBuffer`, uploads the initial
      texture, calls original `Display::update()` so the original display movie
      loop drives `frameDecompress`, `frameRender(m_videoBuffer)`, and
      `frameNext`, then presents that same buffer through original
      `W3DDisplay::drawVideoBuffer` before calling original `Display::stopMovie`.
      The browser harness now expects four Bink copy/open/close lifecycles and
      four original `W3DDisplay::drawVideoBuffer` indexed draws: direct
      `GC_Background`, direct `VS_small`, Display-owned `VS_small`, and
      manager-owned `VS_small`. `verify:bink-w3d-video-buffer-upload-frontier`
      and `verify:bink-w3d-video-presentation-frontier` now pin the new Display
      path while broader original movie-loop runtime and Bink/audio sync
      remained open at that point.
- [x] Add `verify:bink-ingameui-movie-frontier`
      (`verify:bink-ingameui-movie-frontier` and strict alias
      `verify:bink-ingameui-movie-frontier:strict`), a source-only verifier for
      original `InGameUI` Bink movie ownership. It pins the `InGameUI.h`
      movie/cameo method declarations and `m_videoBuffer` / `m_videoStream` /
      `m_cameoVideoBuffer` / `m_cameoVideoStream` fields, constructor null
      initialization, `InGameUI::update` main/cameo movie frame-loop order,
      `playMovie` / `stopMovie` / `videoBuffer` ownership through
      `TheVideoPlayer` and `TheDisplay`, `playCameoMovie` /
      `stopCameoMovie` / `cameoVideoBuffer` `ControlBar.wnd:RightHUD`
      attachment, and the original `CommandXlat` / `ScriptActions` callsites
      that route demo/objective/radar movies through `TheInGameUI`. This does
      not claim runtime InGameUI playback complete; a focused runtime
      instantiation currently pulls the broad ControlBar/GameLogic/ScriptEngine
      link surface, so runtime InGameUI plus full load-screen / score-screen
      movie-loop ownership remains open. Verified with `npm run build:wasm`,
      `npm run verify:bink-ingameui-movie-frontier`,
      `npm run verify:bink-runtime-callsite-frontier`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`, and
      `npm run test:bink-w3d-video-presentation-browser`.
- [x] Add `verify:bink-loadscore-movie-frontier`
      (`verify:bink-loadscore-movie-frontier` and strict alias
      `verify:bink-loadscore-movie-frontier:strict`), a source-only verifier
      for original load-screen and score-screen Bink movie ownership. It pins
      the `LoadScreen.h` video buffer/stream fields, base `LoadScreen` window
      destroy/update pump, `SinglePlayerLoadScreen::init` mission-movie
      `TheVideoPlayer` open, `TheDisplay` video-buffer allocation,
      ready/decompress/render/advance/draw loop, cleanup, and min-spec
      no-movie branch; `ChallengeLoadScreen::init` background movie loop,
      min-spec final-frame path, and `WindowVideoManager` ownership of the
      portrait and VS overlay movies; and `ScoreScreen` final-victory
      `PlayMovieAndBlock` path through `Menus/BlankWindow.wnd`, `s_blankLayout`
      first-window video-buffer attachment, per-frame draw, and cleanup. It
      also pins the `GameWindowManager::winCreateLayout` /
      `WindowLayout::getFirstWindow` / `WindowLayout::destroyWindows` hooks
      needed by that ScoreScreen path. This is source-only and does not claim
      runtime load-screen or score-screen playback complete; the broader
      CampaignManager/GameInfo/GameWindow layout/LOD/shell/GUI singleton path
      still needs to link and be harness-driven. The adjacent
      `verify:bink-runtime-callsite-frontier` check now also skips the
      commented/inactive branch matches in the load-screen and score-screen
      frame loops so its reported lines point at the active render path.
- [x] Extend the Bink/W3D browser presentation smoke through a focused
      blank-window layout movie path shaped like `ScoreScreen::PlayMovieAndBlock`.
      The `bink-w3d-video-buffer-browser-smoke` test now implements a focused
      `GameWindowManager::winCreateLayout` route that allocates a real
      `WindowLayout`, calls original `WindowLayout::load("Menus/BlankWindow.wnd")`,
      receives the script-created first `GameWindow`, opens `VS_small` through
      `TheVideoPlayer`, allocates a real `W3DVideoBuffer` through `TheDisplay`,
      drives original `BinkVideoStream::frameDecompress`,
      `frameRender(videoBuffer)`, and `frameNext`, attaches that buffer through
      `WinInstanceData::setVideoBuffer`, presents it with original
      `W3DDisplay::drawVideoBuffer`, then detaches, closes, and destroys the
      layout windows. The browser harness now expects five Bink open/copy/close
      lifecycles and five original `W3DDisplay::drawVideoBuffer` indexed draws:
      direct `GC_Background`, direct `VS_small`, Display-owned `VS_small`,
      manager-owned `VS_small`, and blank-layout `VS_small`. This keeps the
      full original InGameUI, load-screen, score-screen loops, and Bink/audio
      sync open while proving the blank-window video-buffer ownership step in
      a harness screenshot. Verified with `npm run build:wasm`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`,
      `npm run verify:bink-loadscore-movie-frontier`, and
      `npm run test:bink-w3d-video-presentation-browser`.
- [x] Extend the Bink/W3D browser presentation smoke through original
      `ScoreScreen::PlayMovieAndBlock`. The focused browser smoke now links
      original `ScoreScreen.cpp` as `zh_score_screen_movie_runtime` with a
      gated `CNC_PORT_SCORE_SCREEN_MOVIE_TEST_HOOKS` control surface that only
      lets the harness install/clear the static `s_blankLayout`; normal
      ScoreScreen behavior is unchanged. The smoke creates the real
      `Menus/BlankWindow.wnd` layout, installs it on original `ScoreScreen`,
      calls original `PlayMovieAndBlock("VS_small")`, verifies the original
      loop services the game engine and presents 70 decoded frames through
      `TheDisplay->draw()`, checks one real `W3DVideoBuffer` texture allocation,
      71 texture uploads (initial clear plus decoded frames), one texture
      release, 70 original `W3DDisplay::drawVideoBuffer` indexed draws, final
      video-buffer detach, stream close, nonzero decoded texture checksum, and
      a browser screenshot/pixel proof. This was later extended by the
      SinglePlayerLoadScreen and ChallengeLoadScreen smokes below; the browser
      harness now expects 11 Bink open/close lifecycles, 696 total decoded
      frame copies, and 696 draw-buffer indexed draws across direct,
      Display-owned, WindowVideoManager, blank-layout, original ScoreScreen,
      original SinglePlayerLoadScreen, and focused original ChallengeLoadScreen
      paths. Full campaign `finishSinglePlayerInit`, campaign-owned
      load-screen setup, campaign-owned Challenge persona setup, InGameUI
      movies, and Bink/audio sync remain open. Verified with
      `npm run build:wasm`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`,
      `npm run verify:bink-loadscore-movie-frontier`, and
      `npm run test:bink-w3d-video-presentation-browser`.
- [x] Extend the Bink/W3D browser presentation smoke through original
      `SinglePlayerLoadScreen::init`. The focused browser smoke now compiles
      original `LoadScreen.cpp` in `zh_gameclient_utility` with a gated
      `CNC_PORT_LOAD_SCREEN_MOVIE_TEST_HOOKS` surface, used only by this harness
      to provide `USA` / `VS_small` movie facts without pulling in the full
      CampaignManager graph. The smoke builds a synthetic
      `Menus/SinglePlayerLoadScreen.wnd` hierarchy, installs real
      `NameKeyGenerator`, `GameText`, `Mouse`, `ImageCollection`, `Display`,
      `GameEngine`, and `GameWindowManager` singletons, calls original
      `SinglePlayerLoadScreen::init(nullptr)`, and verifies the original loop
      services the game engine, uploads the initial texture plus 70 decoded
      frames, presents 70 frames through `TheDisplay->draw()` and original
      `W3DDisplay::drawVideoBuffer`, detaches the load-screen `VideoBuffer`,
      closes the stream, releases the texture in the destructor, and destroys
      the windows. This was later extended by the ChallengeLoadScreen smoke
      below; the browser harness now expects 11 Bink open/close lifecycles, 696
      decoded frame copies, 696 indexed video-buffer draws, 12 texture creates,
      708 texture updates, 11 releases, and captures
      `WebAssembly/artifacts/screenshots/harness-smoke-bink-w3d-video-buffer-upload.png`.
      Campaign-owned load-screen setup, campaign-owned Challenge persona setup,
      campaign `finishSinglePlayerInit`, InGameUI movies, and Bink/audio sync
      remain open. Verified with `npm run build:wasm`,
      `npm run verify:bink-loadscore-movie-frontier`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`, and
      `npm run test:bink-w3d-video-presentation-browser`.
- [x] Extend the Bink/W3D browser presentation smoke through original
      `ChallengeLoadScreen::init`. The focused browser smoke keeps original
      non-test behavior intact, then uses the gated
      `CNC_PORT_LOAD_SCREEN_MOVIE_TEST_HOOKS` surface to provide harness-only
      `GC_Background` and `VS_small`/`VSSmall` movie facts without requiring the
      full CampaignManager/ChallengeGenerals persona graph. The smoke builds a
      synthetic `Menus/ChallengeLoadScreen.wnd` hierarchy with the original
      Challenge window IDs, calls original `ChallengeLoadScreen::init(nullptr)`,
      presents the 800x600 `GC_Background` movie plus recursive child-window
      portrait and VS-overlay `WindowVideoManager` movies through original
      `W3DDisplay::drawVideoBuffer`, and verifies 179 background frames, 372
      managed child-window copies, 551 Challenge presentations, stream
      destructor cleanup, texture release cleanup, nonzero decoded checksums,
      and the browser screenshot/pixel proof. The aggregate harness now expects
      11 Bink open/close lifecycles, 696 decoded frame copies, 696 indexed
      video-buffer draws, 12 texture creates, 708 texture updates, and 11
      releases. Full campaign-owned load-screen setup, campaign-owned
      Challenge persona setup, campaign `finishSinglePlayerInit`, InGameUI
      movies, and Bink/audio sync remain open. Verified with
      `npm run build:wasm`, `npm run verify:bink-loadscore-movie-frontier`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`, and
      `npm run test:bink-w3d-video-presentation-browser`.
- [x] Extend the Bink/W3D browser presentation smoke through the extracted
      ScoreScreen final-campaign movie helper. `ScoreScreen.cpp` now factors
      the original final-campaign movie body and blank-layout cleanup out of
      `finishSinglePlayerInit`; normal non-test behavior still delegates
      through those helpers, while the focused `CNC_PORT_SCORE_SCREEN_MOVIE_TEST_HOOKS`
      build initially skipped the stats/LOD singleton edges that are closed by
      the later final-campaign stats/LOD smoke below. The smoke installs real score-screen push-button windows,
      a `SmokeDisplayStringManager`, and a real `CampaignManager` /
      `Campaign` / final `Mission`, advances the campaign to completion, then
      drives the original final-victory `PlayMovieAndBlock("VS_small")` path.
      The browser harness verifies finish-campaign button state, blank-layout
      cleanup, 70 decoded frame presentations through `TheDisplay->draw()` and
      original `W3DDisplay::drawVideoBuffer`, stream closure, one
      `W3DVideoBuffer` texture lifecycle, and nonzero decoded texture pixels.
      The aggregate Bink/W3D smoke now expects 12 Bink open/close lifecycles,
      766 decoded frame copies, 766 indexed video-buffer draws, 13 texture
      creates, 779 texture updates, and 12 texture releases. At that point full
      non-test `finishSinglePlayerInit` runtime ownership, browser-runtime
      stats/LOD gate execution, InGameUI movies, and Bink/audio sync remained
      open. Verified with
      `npm run verify:bink-loadscore-movie-frontier`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`, and
      `npm run test:bink-w3d-video-presentation-browser`.
- [x] Extend the Bink/W3D browser presentation smoke through the non-final
      victorious `finishSinglePlayerInit` branch. The focused
      `CNC_PORT_SCORE_SCREEN_MOVIE_TEST_HOOKS` build now exposes a narrow
      wrapper for `finishSinglePlayerInit`, a saved-game text hook, and
      branch counters for the broad `GameState::missionSave`,
      `InGameUI::freeMessageResources`, and `ScoreScreenShow` transition edges.
      Normal non-test ScoreScreen behavior still calls the original subsystem
      methods. The smoke builds a real two-mission `CampaignManager` graph,
      advances from `mission1` to `mission2`, verifies `GUI:SaveAndContinue`,
      saved-text visibility, blank-layout cleanup, next-map selection, restored
      score buttons, and one counted save/message/transition edge. This branch
      adds no Bink frames, so the aggregate browser harness still expects 12
      Bink open/close lifecycles, 766 decoded frame copies, 766 indexed
      video-buffer draws, 13 texture creates, 779 texture updates, and 12 texture
      releases. Full non-test `GameState`/`InGameUI`/transition-handler runtime
      ownership, production stat persistence / real LOD singleton ownership,
      InGameUI movies, and Bink/audio sync remain open. Verified with
      `npm run verify:bink-loadscore-movie-frontier`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`, and
      `npm run test:bink-w3d-video-presentation-browser`.
- [x] Extend the focused `finishSinglePlayerInit` browser smoke through the
      non-challenge defeat/retry branch. The same hook build now drives a real
      `CampaignManager` / two-mission campaign with `SetVictorious(FALSE)`,
      verifies `GUI:Retry`, no mission advancement, retry-map preservation,
      zero mission-save calls, one message-resource cleanup, one
      `ScoreScreenShow` transition request, hidden saved-game text, restored
      score buttons, blank-layout cleanup, and display-string cleanup. This
      branch adds no Bink frames, so the aggregate browser harness still
      expects 12 Bink open/close lifecycles, 766 decoded frame copies, 766
      indexed video-buffer draws, 13 texture creates, 779 texture updates, and
      12 texture releases. Full non-test `GameState`/`InGameUI`/
      transition-handler runtime ownership, production stat persistence / real
      LOD singleton ownership, InGameUI movies, and Bink/audio sync remain open. Verified with
      `cmake --build WebAssembly/build/wasm --target bink-w3d-video-buffer-browser-smoke -j 8`,
      `npm run verify:bink-loadscore-movie-frontier`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`, and
      `npm run test:bink-w3d-video-presentation-browser`.
- [x] Extend the focused `finishSinglePlayerInit` browser smoke through the
      challenge win/loss branches. The same hook build now seeds one real
      `ChallengeGenerals` persona and drives a real challenge campaign through
      original `finishSinglePlayerInit` for both `SetVictorious(TRUE)` and
      `SetVictorious(FALSE)`, verifying challenge backdrop hiding, portrait
      selection, formatted win/loss header text, remarks text, saved-text
      visibility, mission save/retry behavior, transition suppression, and
      win/loss audio event/update behavior. These branches add no Bink frames,
      so the aggregate browser harness still expects 12 Bink open/close
      lifecycles, 766 decoded frame copies, 766 indexed video-buffer draws, 13
      texture creates, 779 texture updates, and 12 texture releases. Full
      non-test `GameState`/`InGameUI`/transition-handler runtime ownership,
      production stat persistence / real LOD singleton ownership, production
      Challenge persona ownership, InGameUI movies, and Bink/audio sync remain
      open. Verified with
      `cmake --build WebAssembly/build/wasm --target bink-w3d-video-buffer-browser-smoke -j 8`,
      `npm run verify:bink-loadscore-movie-frontier`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`, and
      `npm run test:bink-w3d-video-presentation-browser`.
- [x] Extend the focused ScoreScreen final-campaign browser smoke through the
      stats/LOD gates and low-res skip. `ScoreScreen.cpp` now keeps production
      final-campaign behavior on the original `SkirmishBattleHonors` /
      `TheGameLODManager` path while the focused
      `CNC_PORT_SCORE_SCREEN_MOVIE_TEST_HOOKS` build exposes counters for the
      stats write gate and the three final-movie LOD checks. The high-detail
      `USA` path records `DIFFICULTY_NORMAL`, `BATTLE_HONOR_CAMPAIGN_USA`, no
      challenge index, all three LOD checks, and still presents 70 `VS_small`
      decoded frames. The low-res `CHALLENGE_3` path records `DIFFICULTY_HARD`,
      `BATTLE_HONOR_CHALLENGE_MODE`, challenge index 3, all three LOD checks,
      opens no Bink stream, presents no frames, and leaves aggregate
      Bink/texture/draw counts unchanged at 12 open/close lifecycles, 766 frame
      copies/draws, 13 texture creates, 779 texture updates, and 12 texture
      releases. Full non-test stat persistence through
      `SkirmishBattleHonors::write`, real `GameLODManager` singleton runtime,
      production Challenge persona ownership, InGameUI movies, and Bink/audio
      sync remain open. Verified with
      `cmake --build WebAssembly/build/wasm --target bink-w3d-video-buffer-browser-smoke -j 8`,
      `npm run verify:bink-loadscore-movie-frontier`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`, and
      `npm run test:bink-w3d-video-presentation-browser`.
- [x] Extend the focused `ChallengeLoadScreen::init` browser smoke through a
      real campaign/persona lookup. The load-screen hook build now preserves
      production behavior while allowing the focused smoke to opt into
      `CampaignManager` / `ChallengeGenerals` data: the selected challenge
      campaign resolves the player persona, the selected mission resolves the
      opponent persona and `GC_Background` movie label, and the fallback movie
      hook remains set to `VS_small` so the test proves the mission-owned movie
      path. The synthetic Challenge layout now creates real static-text gadget
      entries for bio text, and the smoke asserts campaign/opponent lookup
      counters, teletype-rendered player/opponent bio text, player/opponent
      name and taunt audio, `LoadScreenAmbient`, 179 background frames, 372
      managed child-window copies, 551 Challenge presentations, and unchanged
      aggregate browser counts of 12 Bink open/close lifecycles, 766 frame
      copies/draws, 13 texture creates, 779 texture updates, and 12 texture
      releases. Full production Challenge persona setup from the normal
      shell/INI path, full campaign-owned load-screen setup, InGameUI movies,
      and Bink/audio sync remain open. Verified with
      `cmake --build WebAssembly/build/wasm --target bink-w3d-video-buffer-browser-smoke -j 8`,
      `npm run verify:bink-loadscore-movie-frontier`,
      `npm run verify:bink-w3d-video-buffer-upload-frontier`,
      `npm run verify:bink-w3d-video-presentation-frontier`, and
      `npm run test:bink-w3d-video-presentation-browser`.
- [x] Promote the Bink/W3D video presentation path into the aggregate vertical
      integration gate. `test:vertical-integrations` now prepares the browser
      WebM sidecars via `transcode:bink-video`, then runs
      `bink_w3d_video_buffer_upload_smoke.mjs` alongside the startup,
      networking, shell/UI, mapped-image, and shipped-mesh verticals. The gate
      asserts 12 original Bink open/close lifecycles, 766 decoded sidecar frame
      copies, real `W3DVideoBuffer` texture create/update/release counts,
      original `W3DDisplay::drawVideoBuffer` indexed draws, and a nonzero
      browser D3D8/WebGL canvas pixel in
      `harness-smoke-bink-w3d-video-buffer-upload.png`. This promotes an
      existing focused video proof into the always-run vertical suite; it does
      not complete production InGameUI movie ownership, full campaign-owned
      load-screen setup, Bink/audio sync, or final WebCodecs/decoder policy.
      Verified with `npm --prefix WebAssembly run
      test:bink-w3d-video-presentation-browser`; the aggregate
      `npm --prefix WebAssembly run test:vertical-integrations` gate includes
      it as an independent video vertical.

---

## M9 — Networking (GameSpy / LAN → WS/WebRTC)

- [x] Add the first browser relay-shaped GameNetwork byte-path proof.
      The `cnc_port_build_browser_network_relay_packet` wasm export builds a
      real original `NETCOMMANDTYPE_FRAMEINFO` packet through
      `NetPacket::addCommand`, and
      `cnc_port_accept_browser_network_relay_packet` parses a relayed packet
      through `NetPacket::ConstructNetCommandMsgFromRawData`. The harness
      `browserNetworkRelayProbe` RPC carries that serialized packet between two
      logical browser clients through a relay queue, then asserts byte length,
      relay mask, execution frame, player id, command id, frame-command count,
      and relay phases. `test:wasm` now exercises this under Playwright, and
      `test:vertical-integrations` includes it as an independent networking
      vertical. This does not claim WebSocket/WebRTC transport,
      `Transport::m_inBuffer`, `ConnectionManager::doRelay`, frame-sync
      storage, or a two-context match complete. Verified with
      `npm --prefix WebAssembly run test:wasm` and
      `npm --prefix WebAssembly run test:gamenetwork-core`; the aggregate
      `npm --prefix WebAssembly run test:vertical-integrations` gate also
      includes the browser-network-relay step.
- [x] Route a browser-relayed LAN announce through the original `LANAPI`
      discovery surface. The wasm bridge now exports
      `cnc_port_build_browser_lanapi_announce_packet` /
      `cnc_port_accept_browser_lanapi_announce_packet`: the source wasm builds
      a real `LANMessage::MSG_GAME_ANNOUNCE`, the destination wasm injects the
      delivered bytes into `LANAPI::m_transport->m_inBuffer`, calls
      `LANAPI::update`, and asserts `handleGameAnnounce`,
      `ParseGameOptionsString`, and `OnGameList` record one announced game.
      `lanapi_announce_two_contexts_smoke.mjs` boots two isolated Playwright
      contexts / wasm instances and relays only the message hex through Node.
      This proves LAN discovery plumbing, not LAN join/options, GameSpy,
      WebSocket/WebRTC, or a full match sync. Verified with
      `npm --prefix WebAssembly run test:browser-lanapi-two-contexts`; the
      aggregate `test:vertical-integrations` gate includes it as an
      independent networking vertical.
- [x] Drive LANAPI join/options across two isolated browser contexts. The wasm
      bridge now exports
      `cnc_port_build_browser_lanapi_join_request_packet`,
      `cnc_port_accept_browser_lanapi_join_request_packet`, and
      `cnc_port_accept_browser_lanapi_join_accept_packet`: the joiner wasm runs
      original `LANAPI::RequestGameJoin` into `Transport::queueSend` using an
      Emscripten active-message-prefix length to stay under the original
      476-byte UDP packet cap while wasm `WideChar` is still 4 bytes, the host
      wasm injects the delivered request into `Transport::m_inBuffer` and runs
      `LANAPI::update` / `handleRequestJoin`, then the joiner consumes the
      original `MSG_JOIN_ACCEPT` and `MSG_GAME_OPTIONS` replies through
      `handleJoinAccept`, `GameInfoToAsciiString`,
      `ParseAsciiStringToGameInfo`, `OnGameJoin`, and `OnGameOptions`.
      `lanapi_join_options_two_contexts_smoke.mjs` relays only message hex
      through Node between isolated Playwright contexts. This proves LAN
      setup-room join/options plumbing, not LAN game-start, WebSocket/WebRTC,
      GameSpy, or full match sync. Verified with
      `npm --prefix WebAssembly run test:browser-lanapi-join-options-two-contexts`;
      the aggregate `test:vertical-integrations` gate includes it as an
      independent networking vertical.
- [x] Drive LANAPI game-start across two isolated browser contexts into
      original network setup. The wasm bridge now exports
      `cnc_port_build_browser_lanapi_game_start_packet` and
      `cnc_port_accept_browser_lanapi_game_start_packet`: the host wasm runs
      original `LANAPI::RequestGameStart` into `Transport::queueSend` using
      the active-message-prefix length required by the current wasm
      `WideChar` layout, and both host and joiner prove
      `LANAPI::OnGameStart` creates the original `NetworkInterface` path
      through `Network::init`, `Network::initTransport`, and
      `ConnectionManager::parseUserList`. The two-context smoke asserts local
      slots 0/1, two players, run-ahead/frame-rate setup, `MSG_NEW_GAME`
      with `GAME_LAN`, pending map, seed, map-cache lookup, and FPS-limit
      side effects. This proves LAN game-start to network setup, not
      `Network::update` frame readiness, WebSocket/WebRTC, GameSpy, or a full
      match sync. Verified with
      `npm --prefix WebAssembly run test:browser-lanapi-game-start-two-contexts`;
      the aggregate `test:vertical-integrations` gate includes it as an
      independent networking vertical.
- [x] Drive LANAPI game-start state through original `Network::update` into
      first-frame readiness. The wasm bridge now exports
      `cnc_port_probe_browser_lanapi_network_update`, and the harness RPC
      `browserLanApiNetworkUpdateProbe` starts from the same host
      `LANAPI::RequestGameStart` / `LANAPI::OnGameStart` setup as the
      two-context game-start vertical, then sets the probe logic frame to 1,
      appends a real `MSG_FRAME_TICK` to `TheCommandList`, and calls
      `Network::update`. The smoke asserts the original path crosses
      `GetCommandsFromCommandList`, `processCommand`,
      `ConnectionManager::allCommandsReady`,
      `FrameDataManager::allCommandsReady`, `timeForNewFrame`, and
      `RelayCommandsToCommandList`, promoting the local player from pregame to
      connected and flipping `isFrameDataReady()` from false to true. This
      proves first-frame readiness after LAN game-start; it does not claim
      production WebSocket/WebRTC transport, multi-frame deterministic sync,
      desync detection, GameSpy, or a full playable match. Verified with
      `npm --prefix WebAssembly run test:browser-lanapi-network-update`,
      `npm --prefix WebAssembly run test:browser-lanapi-game-start-two-contexts`,
      and `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Extend the LAN game-start network vertical to multi-frame update/desync
      progression. The wasm bridge now exports
      `cnc_port_probe_browser_network_multiframe_lockstep`, and
      `network_multiframe_lockstep_smoke.mjs` starts from the original
      `LANAPI::RequestGameStart` / `LANAPI::OnGameStart` setup, drives frames
      1-3 through original `Network::update`, and resets `TheCommandList`
      between frames to model command consumption. The smoke hard-asserts the
      first-frame `frameDataReady` transition, observes later update calls
      preserving in-game connection state, and exercises original
      `FrameData::allCommandsReady` return states: `FRAMEDATA_NOTREADY` for a
      missing command and `FRAMEDATA_RESEND` for an over-count frame carrying a
      real `NetRunAheadCommandMsg`. This proves single-context multi-frame
      update progression and the original desync frontier; it does not claim
      production WebSocket/WebRTC transport ownership or a two-client match
      staying synchronized.
- [x] Carry original GameNetwork transport bytes through a browser WebSocket
      binary relay. `WebAssembly/harness/websocket-binary-relay-server.mjs`
      implements the minimal RFC 6455 handshake/frame path needed by the
      harness, and `network_websocket_transport_smoke.mjs` boots two isolated
      Playwright contexts, builds the existing two-command original `NetPacket`
      with `NetPacket::addCommand`, sends its bytes as a browser `WebSocket`
      binary frame through the relay, then converts the received bytes back to
      the existing focused accept RPC so the destination still proves
      `Transport::m_inBuffer`, `ConnectionManager::doRelay`, and
      `FrameDataManager::allCommandsReady`. This removes the packet-hex
      inter-context handoff from the GameNetwork transport vertical, but does
      not yet wire WebSocket into production `Transport::doSend` / `doRecv`.
      `test:browser-network-websocket-transport` and
      `test:vertical-integrations` gate the new path.
- [x] Upgrade the GameNetwork WebSocket vertical from raw `NetPacket` payload
      bytes to the production `Transport::queueSend` wire image. The wasm
      probe now exports
      `cnc_port_build_browser_network_transport_wire_packet` and
      `cnc_port_accept_browser_network_transport_wire_packet`: source wasm
      builds the two-command original packet, queues it through
      `Transport::queueSend`, sends exactly the encrypted
      `TransportMessageHeader` + payload bytes that `Transport::doSend` would
      pass to `UDP::Write`, and destination wasm decrypts the delivered bytes,
      validates the original CRC/magic contract, then feeds the decoded packet
      to the existing focused `Transport::m_inBuffer` /
      `ConnectionManager::doRelay` / `FrameDataManager::allCommandsReady`
      path. `verify:websocket-transport-frontier` pins the remaining blocker:
      original `Transport` still directly allocates concrete non-virtual
      `UDP`, so real production ownership still needs a browser
      WebSocket/WebRTC adapter under `Transport::doSend` / `doRecv`.
      `test:browser-network-websocket-transport`,
      `test:vertical-integrations`, and
      `verify:websocket-transport-frontier` gate this frontier.
- [x] Retarget the original UDP transport path to a wasm browser adapter and
      prove it through the WebSocket vertical. `udp.cpp` now keeps native
      socket behavior outside Emscripten, while the wasm build implements the
      original `UDP` API with deterministic incoming/outgoing datagram queues.
      The WebSocket transport probe now initializes original `Transport`,
      queues a two-command packet, drives `Transport::doSend` so
      `UDP::Write` captures one encrypted `TransportMessageHeader` + payload
      datagram, forwards that datagram as a browser `WebSocket` binary frame,
      pushes it into the destination adapter, then drives original
      `Transport::doRecv` and `ConnectionManager::doRelay` into
      `FrameDataManager::allCommandsReady`. This removes the focused
      post-WebSocket packet accept dependency from the WebSocket transport
      smoke; the remaining networking gap is replacing the harness datagram
      queue with a live shared WebSocket/WebRTC endpoint and extending to a
      two-client match-sync harness. Verified with
      `npm --prefix WebAssembly run verify:websocket-transport-frontier`,
      `npm --prefix WebAssembly run test:browser-network-websocket-transport`,
      and `npm --prefix WebAssembly run test:vertical-integrations`.
- [x] Promote the browser UDP adapter from harness queue handoff to a live JS
      WebSocket endpoint. The wasm `UDP::Write` path now first calls
      `Module.cncPortBrowserUdpSend` through the same `EM_JS` bridge pattern
      used by the renderer/audio/video shims, and `UDP::Read` first calls
      `Module.cncPortBrowserUdpRecv`; both still fall back to the deterministic
      C++ datagram queues when the live endpoint is disabled. `bridge.js` owns
      the per-page WebSocket endpoint, sends encrypted datagrams synchronously
      from `Transport::doSend`, queues incoming browser WebSocket frames, and
      supplies them to `Transport::doRecv`. The new
      `network_websocket_live_transport_smoke.mjs` boots two isolated
      Playwright contexts, connects both to the local binary WebSocket relay,
      drives source `Transport::queueSend` / `Transport::doSend`, observes the
      JS endpoint send one 29-byte encrypted datagram, waits for destination JS
      to queue that frame, then drives destination `Transport::doRecv` and
      `ConnectionManager::doRelay` into `FrameDataManager::allCommandsReady`.
      The older fallback-queue WebSocket transport smoke remains green. The
      remaining networking gap is extending this live endpoint into the
      LANAPI/`Network::update` two-client match-sync path. Verified with
      `npm --prefix WebAssembly run test:browser-network-websocket-live-transport`,
      `npm --prefix WebAssembly run verify:websocket-transport-frontier`, and
      `npm --prefix WebAssembly run test:browser-network-websocket-transport`.
- [x] Carry original LANAPI game-start over the live browser UDP endpoint.
      `cnc_port_probe_browser_lanapi_live_game_start_send` now initializes the
      host's real LANAPI `Transport`, calls original
      `LANAPI::RequestGameStart`, and proves `Transport::update` flushes the
      broadcast `MSG_GAME_START` datagram through
      `Transport::doSend -> Module.cncPortBrowserUdpSend` with no fallback
      C++ datagram queue use. `cnc_port_probe_browser_lanapi_live_game_start_receive`
      initializes the joiner's real LANAPI `Transport`, lets
      `LANAPI::update` pull the queued WebSocket datagram through
      `Module.cncPortBrowserUdpRecv -> Transport::doRecv`, and verifies
      original `handleGameStart` / `OnGameStart` create
      `NetworkInterface::createNetwork -> Network::init/initTransport/
      parseUserList` plus the `MSG_NEW_GAME`, map, seed, and FPS-limit side
      effects. `lanapi_live_game_start_smoke.mjs` boots two isolated
      Playwright browser contexts, connects both to the live JS endpoint, sends
      one 66-byte encrypted original LAN game-start datagram through the local
      WebSocket binary relay, and asserts host send and joiner receive endpoint
      counters. The remaining networking gap is driving the running
      `Network::update` frame-sync loop across two live-endpoint browser
      clients. Verified with
      `npm --prefix WebAssembly run test:browser-lanapi-live-game-start`.
- [x] Carry the LANAPI discovery/join/game-start flow through browser
      WebSocket binary frames. `lanapi_websocket_flow_smoke.mjs` boots two
      isolated Playwright contexts, builds the existing original LAN announce,
      join request, join accept/options, and game-start payloads, sends all
      five LANMessage payloads through the browser WebSocket binary relay, and
      then feeds the received bytes to the existing focused original LANAPI
      accept paths. The smoke proves `LANAPI::update`,
      `handleGameAnnounce`, `handleRequestJoin`, `handleJoinAccept`,
      `handleGameOptions`, `handleGameStart`, `OnGameList`, `OnPlayerJoin`,
      `OnGameJoin`, `OnGameOptions`, `OnGameStart`, and
      `NetworkInterface::createNetwork -> Network::init/initTransport/
      parseUserList` across browser-native binary frames. This still does not
      wire WebSocket into production `Transport` / `LANAPI` ownership.
      `test:browser-lanapi-websocket-flow` and `test:vertical-integrations`
      gate the new path.

---

## M10 — Hardening, content, polish

### Performance & memory
- [x] Correct the terrain-track render transform and split its real shell-map
      profile bucket. `TerrainTracksRenderObjClassSystem::flush()` now keeps
      the original static one-track index buffer, writes the same real
      world-space edge/fade vertices, and draws those vertices with an identity
      `D3DTS_WORLD` transform instead of applying a track render object's
      transform to already-world-space decal geometry. Added profile-gated
      markers around terrain-track vertex-buffer lock/write/unlock/setup and
      per-track draw submission. A dynamic per-frame index-buffer batching
      attempt was measured and rejected: it reduced
      `WasmD3D8.browserDrawIndexed.before` but introduced a larger
      `W3DTerrainTracks.flush.unlock.before` upload spike. Verified with
      `git diff --check`, `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly run build:port:release`, and Mac M4
      Chrome/Metal release profiling (`ANGLE Metal Renderer: Apple M4`,
      `realEngineFrameTick`, 60 warmup + 60 measured frames). The kept
      static-index run measured 38.26 ms/frame wall / 36.82 ms average engine
      `lastFrameMs`, with a visible shell-map screenshot; the direct
      moving-vehicle tire-track bug remains open pending a targeted harness
      repro.
- [x] Split real heightmap tile draw profiling and pin the D3D8 bound-diagnostic
      A/B result. `HeightMapRenderObjClass::Render` and
      `renderTerrainPass` now add profile-gated markers around terrain tile
      shader, vertex-buffer bind, and draw submission, with tile polygon/count
      constants and hidden-state checks hoisted out of the inner loops.
      `wasm_d3d8_shim.cpp` exposes an explicit bound-draw diagnostic checksum
      switch and `runtime_frame_profile.mjs` can force it with
      `PERF_PROFILE_D3D8_BOUND_DIAG`, but `bridge.js` keeps the default enabled
      even in `diag=lite`. Mac M4 Chrome/Metal A/B showed disabling the
      checksum path removes `WasmD3D8.DrawIndexedPrimitive.captureBound.before`
      (~7.5 ms/frame -> ~0.03 ms/frame) but regresses total frame time
      (38.32 ms/frame forced-on vs 46.34 ms/frame forced-off) by moving stalls
      into later terrain/GL buckets. Verified with `git diff --check`,
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly run build:port:release`, Mac M4 Chrome/Metal
      sampled runtime profiles, and a visible shell-map terrain/water
      screenshot. The conservative default measured 38.34 ms/frame wall /
      36.92 ms average engine `lastFrameMs`.
- [x] Cache native D3D8 derived draw-state payload before crossing into JS.
      `wasm_d3d8_shim.cpp` now keeps the texture-transform/render-state/
      clip-plane/material/light payload and its derived hash behind a device
      revision, while still capturing world/view/projection matrices for every
      draw. D3D setters invalidate that payload only when the value actually
      changes, so repeated render-state, texture-stage, material, light, clip,
      and texture-transform setters no longer force an identical payload
      rebuild. `wasm_real_engine_init.cpp` exports native derived-state
      hit/miss counters through the real-frame JSON, and
      `runtime_frame_profile.mjs` preserves those counters in samples plus a
      measured-pass delta. Verified with `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `npm --prefix
      WebAssembly run build:port`, `npm --prefix WebAssembly run
      build:port:release`, a local SwiftShader shell-map profile with a
      visible screenshot (measured native cache delta: 189.3 hits/frame,
      47.0 misses/frame), and a same-machine Mac M4 Chrome/Metal A/B against
      baseline commit `d3290787` (`dist-baseline` vs `dist-release`, 60 warmup
      + 60 measured `realEngineFrameTick` frames, engine profile enabled).
      The Mac A/B was neutral/slightly better on total wall time (40.43 ->
      40.32 ms/frame; engine average 39.03 -> 38.89 ms/frame) and reduced the
      targeted sampled native bridge bucket:
      `WasmD3D8.drawBound.capture.before` 0.52 ms -> 0.18 ms on the last
      profiled frame; `WasmD3D8.browserDrawIndexed.before` stayed effectively
      flat at 3.16 ms -> 3.18 ms. The remaining frame frontier is still
      terrain/terrain-track variance rather than this native payload rebuild.
- [x] Reduce terrain-track dynamic vertex-buffer uploads to the visible prefix.
      `TerrainTracksRenderObjClassSystem::flush()` now pre-counts active,
      really-visible track edges and uses `DX8VertexBufferClass::AppendLockClass`
      to lock only the packed visible vertex prefix. The draw loop still emits
      the same per-track static-index draws and preserves the original linked
      list order, but the browser D3D8 shim no longer uploads the unused tail
      of the preallocated terrain-track pool on unlock. Verified with
      `git diff --check`, `npm --prefix WebAssembly run build:port`, `npm
      --prefix WebAssembly run build:port:release`, a local SwiftShader
      runtime profile with a visible screenshot, and Mac M4 Chrome/Metal
      release profiles (`realEngineFrameTick`, 60 warmup + 60 measured frames,
      engine profile enabled). Against the previous `e068f65a` profile, buffer
      updates stayed constant at 381.8/frame, but the final run reduced upload
      traffic from 2.29 MB/frame to 1.81 MB/frame, tracked browser D3D8 work
      from 13.82 ms/frame to 8.64 ms/frame, and wall time from 40.32 ms/frame
      to 39.41 ms/frame. The visible screenshot remained intact.
- [x] Tighten sorted shoreline batching to exact visible dynamic-buffer ranges.
      `BaseHeightMapRenderObjClass::recordShoreLineSortInfos()` now returns
      before indexing the first shoreline tile when the count is zero and
      checks `j < m_numShoreLineTiles` before reading the next tile while
      building x/y-major sort runs. `renderShoreLinesSorted()` now first
      collects the next visible sorted shoreline batch, then locks dynamic
      vertex/index buffers sized to that exact batch instead of the fixed
      512-tile maximum. The emitted tile order, quick-flip indices, material,
      texture, and destination-alpha render state are preserved. Verified with
      `git diff --check`, `npm --prefix WebAssembly run build:port`, `npm
      --prefix WebAssembly run build:port:release`, a local SwiftShader
      runtime profile with a visible screenshot, and Mac M4 Chrome/Metal
      release profiles (`realEngineFrameTick`, 60 warmup + 60 measured frames,
      engine profile enabled). Against the previous no-sample terrain-track
      baseline, buffer upload traffic dropped from 1.814 MB/frame to
      1.771 MB/frame, buffer update time from 8.27 to 7.15 ms/frame, and
      tracked browser D3D8 work from 8.64 to 7.91 ms/frame; sampled runs also
      reduced `WasmD3D8.browserDrawIndexed.before` from 7.21 ms/frame to
      5.15/5.82 ms/frame. Wall time remained noisy rather than conclusively
      improved, so the broader heightmap performance item remains open.
- [x] Cache native D3D8 bound-draw buffer checksums by buffer revision/range.
      `wasm_d3d8_shim.cpp` now keeps a small per-buffer LRU for diagnostic
      vertex/index checksums and invalidates it on non-empty buffer unlocks, so
      `capture_bound_draw()` still publishes the same `last_draw_*_checksum`
      values without re-hashing unchanged static ranges every draw. The real
      frame JSON and `runtime_frame_profile.mjs` now report checksum-cache
      hit/miss deltas beside the existing derived-state cache counters. Verified
      with `git diff --check`, `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly run build:port:release`, a local SwiftShader
      runtime profile with a visible shell-map screenshot, and Mac M4
      Chrome/Metal release profiles (`dist-release`, 60 warmup + 60 measured
      frames, engine profile enabled). The local run measured about 292
      checksum hits/frame and 179 misses/frame. On M4, repeats measured about
      391-395 checksum hits/frame, reduced
      `WasmD3D8.DrawIndexedPrimitive.captureBound.before` from ~9.6 ms/frame to
      0.27 ms/frame, and reduced tracked browser D3D8 work from 7.69-7.91
      ms/frame to 0.66-2.93 ms/frame. End-to-end wall time stayed noisy
      (41.78-45.31 ms/frame), so the next frontier is the remaining stall
      outside this checksum bucket rather than disabling diagnostics.
- [x] Expose D3D8 buffer-upload composition counters in the runtime profile.
      `bridge.js` now reports buffer uploads split by vertex/index buffer,
      dynamic usage, `DISCARD`, `NOOVERWRITE`, orphaned updates, and resizes;
      `runtime_frame_profile.mjs` carries those fields through measured deltas
      and per-frame summaries. Verified with `node --check
      WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port:release`, and a final Mac M4
      Chrome/Metal runtime profile (`ANGLE Metal Renderer: Apple M4`,
      `dist-release`, `diag=lite`, 20 warmup + 30 measured frames, engine
      profile enabled). The final profile reached the same shell-map gameplay
      state (`inGame=true`, logic frame 52, 335 objects/drawables, 75 rendered
      objects, local player America) and measured 36.34 ms/frame wall,
      24.27 ms average engine `lastFrameMs`, and 20.53 ms/frame tracked browser
      D3D8 work. Buffer uploads dominate that tracked browser time:
      `bufferSubDataMs` is 19.83 ms/frame across 386.3 updates/frame and
      1.69 MiB/frame uploaded, with 289.0 vertex updates/frame (1.54 MiB),
      97.3 index updates/frame (0.16 MiB), 372.3 dynamic updates/frame
      (1.12 MiB), 362.7 `NOOVERWRITE` updates/frame (1.02 MiB), only 8.7
      `DISCARD`/orphan updates/frame, and zero resizes. A WebGL2 source-offset
      direct-heap upload experiment was measured and reverted after repeats
      were noisy/neutral-regressive, so the kept change is the counter surface
      and the next frontier is reducing/coalescing real dynamic
      `NOOVERWRITE` upload bursts.
- [x] Batch water-track dynamic vertex-buffer locks by same-texture run.
      `WaterTracksObj::render()` now factors the original wave-position,
      underwater-height, alpha, UV, and vertex write math into
      `writeVertices()`, while `WaterTracksRenderSystem::flush()` locks the
      shared dynamic vertex buffer once per same-texture/capacity chunk, writes
      each track's original four vertices into the locked range, unlocks, and
      draws that chunk before any later `DISCARD`. This preserves the existing
      texture grouping, vertex order, index buffer layout, and the original
      999-page rollover behavior while reducing per-object
      `NOOVERWRITE` lock/unlock/upload bursts. A JS-side deferred
      `NOOVERWRITE` coalescing experiment was measured and rejected: it halved
      WebGL `bufferSubData` calls but regressed ANGLE/Metal upload time, so the
      kept fix is source-level batching at the producer. Verified with
      `git diff --check`, `npm --prefix WebAssembly run build:port`, `npm
      --prefix WebAssembly run build:port:release`, and a Mac M4 Chrome/Metal
      release runtime profile (`ANGLE Metal Renderer: Apple M4`,
      `dist-release`, `diag=lite`, 60 measured frames) that reached in-game
      shell-map state with a screenshot and measured 35.58 ms/frame wall,
      196.2 buffer updates/frame, 99.4 vertex updates/frame, 184.0 dynamic
      updates/frame, 174.1 `NOOVERWRITE` updates/frame, 1.74 MB/frame uploaded,
      and 0.135 ms/frame in `bufferSubDataMs`. The remaining upload frontier is
      reducing real dynamic upload byte volume/ranges, not just call count.
- [x] Cache sorted shoreline vertices in a persistent D3D8 vertex buffer.
      `BaseHeightMapRenderObjClass` now rebuilds a static
      `DX8VertexBufferClass` when shoreline tile data changes, writes the same
      original four `VertexFormatXYZNDUV2` vertices per shoreline tile, and
      keeps the old dynamic VB/IB renderer as a fallback for oversized or
      unavailable buffers. The sorted game renderer now uploads only the
      visible dynamic index range for each batch and draws against the cached
      shoreline vertex buffer with the original quick-flip index order, water
      depth texture coordinates, and destination-alpha render state. Verified
      with `git diff --check`, `npm --prefix WebAssembly run build:port`, `npm
      --prefix WebAssembly run build:port:release`, and a final Mac M4
      Chrome/Metal release runtime profile (`ANGLE Metal Renderer: Apple M4`,
      `dist-release`, `diag=lite`, 60 measured frames, engine profile enabled)
      that reached in-game shell-map state at logic frame 72 with a visible
      screenshot. Against the previous upload-frontier profile, buffer upload
      traffic dropped from 1.74 MB/frame to 0.91 MB/frame, dynamic uploads from
      1.21 MB/frame to 0.38 MB/frame, `NOOVERWRITE` uploads from 1.09 MB/frame
      to 0.31 MB/frame, vertex uploads from 1.58 MB/frame to 0.75 MB/frame,
      update calls from 196.2/frame to 186.6/frame, and `bufferSubDataMs` from
      0.113 to 0.088 ms/frame. The run measured 37.50 ms/frame wall and
      9.83 ms average engine frame time; the remaining upload frontier should
      be reprofiled by producer before further byte-range work.
- [x] Split the D3D8 draw-state cache hash from per-object transforms.
      `wasm_d3d8_shim.cpp` now computes both the original full draw hash and a
      derived-state hash that excludes world/view/projection but still covers
      texture transforms, render state, clip planes, material, lights, and the
      transform mask. The EM_JS draw bridge copies world/view/projection every
      draw for correctness while reusing the expensive render-state/light/
      material payload when only object placement changes, with a 64-entry LRU
      behind the previous-draw fast path. `bridge.js` keys its derived-object
      cache on the same derived hash while keeping the full `stateHash` for GL
      state/uniform updates. The runtime profile now reports derived-cache
      hits/misses. Verified with `node --check
      WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      and `npm --prefix WebAssembly run build:port`. A forced baseline/current
      Mac M4 Chrome/Metal comparison (`ANGLE Metal Renderer: Apple M4`,
      `realEngineFrameSummary`, 10 warmup + 60 measured frames, batch 10)
      improved measured wall time from 77.16 ms/frame at 533.4 draws/frame to
      74.37 ms/frame at 529.8 draws/frame; the optimized measured section
      reported 430.9 derived-cache hits/frame and 98.8 misses/frame. The
      harness captured `runtime-frame-profile.png` during the run.
- [x] Reduce D3D8 per-draw uniform/copy overhead and add conservative adjacent
      draw batching. `bridge.js` now separates non-transform uniform/state
      reuse from the full transform-bearing `stateHash`: world/view/projection
      matrices still upload per draw, while material/light/render-state/
      texture-stage uniforms are skipped on a repeated derived key. The hot
      path also gates the old UI texture census behind `diag=full`, accepts
      transient typed-array matrix views, flushes pending draws at buffer,
      texture, clear, FBO, viewport, readback, and frame-RPC boundaries, and
      batches only ordered-adjacent `diag=lite` solid/Gouraud
      `D3DPT_TRIANGLELIST` draws with the same full native state hash, same
      buffers/layout, same texture bindings, and contiguous index ranges.
      `wasm_d3d8_shim.cpp` now passes world/view/projection as HEAPF32 views
      instead of `Array.from` copies and uses `HEAPU8.subarray()` for buffer
      update uploads; cached texture transforms remain copied because the LRU
      owns them. `runtime_frame_profile.mjs` reports uniform-cache and
      batching counters plus a `PERF_PROFILE_D3D8_BATCH=0` comparison switch.
      Verified with `node --check WebAssembly/harness/bridge.js`, `node
      --check WebAssembly/harness/runtime_frame_profile.mjs`, `git diff
      --check`, `npm --prefix WebAssembly run build:port`, and Mac M4
      Chrome/Metal profile runs (`ANGLE Metal Renderer: Apple M4`,
      `realEngineFrameSummary`, 10 warmup + 60 measured frames, batch 10).
      Final batched run: 72.30 ms/frame, 485.0 WebGL drawElements/frame,
      44.8 merged D3D draws/frame, 383.9 uniform-cache hits/frame, screenshot
      verified visible terrain/water/wakes/units/logo. Same code with
      `PERF_PROFILE_D3D8_BATCH=0`: 73.51 ms/frame and 533.9
      drawElements/frame, showing the first adjacent-only pass saves about
      49 WebGL draw calls/frame and ~1.2 ms/frame on this shell-map slice.
- [x] Profile and trim lite-mode D3D8 buffer CPU mirrors. `bridge.js` now
      exposes buffer update/upload/subData/mirror counters through
      `d3d8PerfSummary()` and keeps full CPU mirrors for default `diag=full`
      diagnostics while skipping vertex-buffer mirrors in `diag=lite`; index
      mirrors remain enabled so flat-shade and wireframe fallback paths can
      still build temporary element arrays. `runtime_frame_profile.mjs` now
      reports buffer update costs and can force old lite vertex mirrors with
      `PERF_PROFILE_D3D8_VERTEX_MIRRORS=1` for A/B comparisons. Verified with
      `node --check WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port`, and Mac M4 Chrome/Metal
      profile runs (`ANGLE Metal Renderer: Apple M4`, `diag=lite`,
      `realEngineFrameSummary`, 10 warmup + 60 measured frames, batch 10).
      Default optimized run measured 73.15 ms/frame with 362.9 buffer
      updates/frame, 2.21 MB uploaded/frame, 0.52 ms/frame total buffer-update
      time, 0.36 MB/frame mirrored, and 3.97 MB/frame of skipped vertex mirror
      writes. Forcing old lite vertex mirrors measured 73.39 ms/frame,
      4.33 MB/frame mirrored, 0 skipped mirror bytes, and 0.57 ms/frame total
      buffer-update time. This removes unnecessary JS heap writes but also
      proves dynamic buffer upload/mirror work is not the dominant current
      frame-time bottleneck.
- [x] Cache hot D3D8 WebGL draw-path bindings and temporary index buffers.
      `bridge.js` now tracks the currently bound D3D8 draw program,
      ARRAY_BUFFER, and ELEMENT_ARRAY_BUFFER to skip redundant
      `gl.useProgram`/`gl.bindBuffer` calls on repeated draws. The wireframe
      fill-mode and flat-shade paths now reuse one grow-only STREAM_DRAW
      element buffer and update it with `bufferSubData`, instead of creating
      and deleting a temporary index buffer every draw. Buffer creation,
      update, release, and id reuse go through the same binding helpers so
      cached bindings are invalidated when the underlying GL buffer is deleted.
      Verified with `node --check WebAssembly/harness/bridge.js`, `git diff
      --check`, and a focused Playwright boot/RPC run covering
      `d3d8TexturedQuad`, `d3d8FillMode`, and `d3d8ShadeMode`: the normal
      textured draw stayed red `[255,0,0,255]`, wireframe temporary-index draw
      stayed green `[0,255,0,255]`, and flat-shade temporary-index draw stayed
      red `[255,0,0,255]`.
- [x] Add a repeatable runtime frame profile and remove per-frame summary
      overhead from the human play loop. `runtime_frame_profile.mjs` boots the
      real shell-map lifecycle, runs warmup/settle frames until the scene is
      drawing, records renderer/wall time/engine `lastFrameMs`/scene counters,
      captures `runtime-frame-profile.png`, and can target either the verbose
      summary RPC or the new minimal tick RPC. `cnc_port_real_engine_frame_tick`
      and bridge RPC `realEngineFrameTick` run the same real
      `GameEngine::update()` path but skip full client-state JSON,
      `snapshotState()`, per-frame bridge log recording, and stdout frame
      logging. `play.html` now uses `realEngineFrameTick`; verbose frame RPCs
      stay available for harness assertions. Verified with
      `npm --prefix WebAssembly run build:port`, local SwiftShader
      `PERF_PROFILE_FRAME_COMMAND=realEngineFrameTick node
      harness/runtime_frame_profile.mjs`, and Mac M4 Chrome/Metal
      `runtime_frame_profile.mjs` runs. Mac shell-map single-frame profile:
      `realEngineFrameSummary` measured 99.5 ms/frame wall with 76.6 ms
      engine `lastFrameMs`; `realEngineFrameTick` measured 77.4 ms/frame wall
      with 76.5 ms engine `lastFrameMs`, removing most wrapper overhead from
      the interactive loop.
- [x] Pace the human play loop to the original logic cadence. The `play.mjs`
      rAF loop no longer steps one `GameEngine::update()` per display frame.
      It accumulates wall time, calls `realEngineFrameTick` at the shipped
      30 Hz logic rate, caps catch-up work to avoid a runaway backlog, skips
      catch-up when the previous engine frame already exceeded the frame
      budget, and reports completed engine ticks instead of browser refresh
      rate. This removes the Fable audit bug where simulation speed was
      coupled to display refresh; overloaded Debug/SwiftShader remains
      throughput-bound until the Release/perf work lands. Verified with
      `node --check WebAssembly/harness/play.mjs`, a local
      `harness/play.html?autostart=1&shellmap=0&logicFps=10` rate check
      measuring 31 frames over 3.08s (10.05 logic fps), and a Mac Chrome/Metal
      `harness/play.html?autostart=1&shellmap=0` rate check measuring 78
      frames over 3.03s (25.7 logic fps) on
      `ANGLE Metal Renderer: Apple M4`.
- [x] Remove leftover per-draw diagnostic work from the `diag=lite` runtime
      path. `paintD3D8DrawIndexed` no longer walks vertex/index buffers to
      build projected bounds and triangle diagnostics when those probe objects
      are immediately discarded, and the hot draw path no longer queries and
      restores `ACTIVE_TEXTURE` around stage 0/1 binds. Full diagnostics still
      collect the same draw-history fields for regression harnesses. Verified
      with `node --check WebAssembly/harness/bridge.js`,
      `PERF_PROFILE_FRAMES=15 PERF_PROFILE_WARMUP_FRAMES=2
      PERF_PROFILE_SETTLE_FRAMES=8 PERF_PROFILE_BATCH=1
      PERF_PROFILE_FRAME_COMMAND=realEngineFrameTick node
      harness/runtime_frame_profile.mjs`, and
      `node harness/weapon_impact_fx_smoke.mjs`. The local SwiftShader
      shell-map tick profile now reports measured post-settle engine frames in
      the 29.0-39.9 ms range (32.7 ms median); wall time still shows a one-time
      first-frame upload stall, with steady measured frames around 100 ms wall
      on the shared software renderer. The synced Mac M4 Chrome/Metal run
      (`ANGLE Metal Renderer: Apple M4`) reports 27.8 ms/frame wall average and
      26.3 ms median engine time for the same 15 measured post-settle frames.
- [x] Cache repeated D3D8 draw state and sampler setup on the browser hot path.
      The EM_JS `wasm_d3d8_browser_draw_indexed` bridge now reuses the copied
      transform/render-state/clip-plane/light/material payload when the native
      draw `stateHash` is unchanged, avoiding repeated WASM-memory copies for
      same-state render-list runs. The WebGL sampler bridge now keys texture
      sampler state and skips redundant `texParameteri` calls on cache hits,
      while preserving full-diagnostic `lastSampler` behavior. Also restored
      missing local D3D enum constants in `harness/smoke.mjs` so the aggregate
      smoke reaches its later known `edgeMapperApply` heap-corruption TODO
      instead of dying in the JS assertions. Verified with
      `npm --prefix WebAssembly run build:port`, focused Playwright RPCs for
      `d3d8TexturedQuad`, `d3d8TwoTextureQuad`,
      `d3d8TwoTextureAlphaQuad`, `d3d8TextureMipChainDraw`,
      `d3d8NonindexedDraw`, `d3d8PointSpriteDraw`, and
      `d3d8UserPointerDraw`, plus Mac M4 Chrome/Metal
      `runtime_frame_profile.mjs`. The 60-frame `realEngineFrameTick`
      profile improved from the pre-change 35.46 ms/frame wall average
      (34.68 ms engine) to 33.42 ms/frame wall average (32.64 ms engine).
      The same Mac build passed the combined shell-map assertion:
      battleship cutouts 12, chinook cutouts 3, comanche blends 8,
      shockwave blends 336, and infantry textures 49 draws / 4 unique
      `#-16711936#zhca_ui*.tga` textures with zero white-only samples.
- [x] Add browser-side D3D8 performance counters to the runtime frame profile
      and remove `diag=lite` upload readback stalls. The harness now exposes
      cumulative WebGL call counters/timers for indexed draws, clears, texture
      conversion/uploads, DXT decode, readPixels, and FBO binds/creates, and
      `runtime_frame_profile.mjs` snapshots those counters around warmup,
      settle, and measured frame passes. `diag=lite` now skips the level-0
      texture sample readback after each upload while `diag=full` keeps the
      existing texture diagnostics for regression probes. Verified with
      `node --check WebAssembly/harness/bridge.js
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      focused Playwright RPC coverage for `d3d8RenderTarget` and
      `d3d8DepthTextureRenderTarget` (`fboIncomplete=0`), a local SwiftShader
      `PERF_PROFILE_FRAME_COMMAND=realEngineFrameTick` runtime profile, and a
      Mac M4 Chrome/Metal 60-frame profile. The Mac run reported
      `ANGLE Metal Renderer: Apple M4`, zero warmup readPixels, zero measured
      readPixels, ~192.4 indexed draws/frame, 33.76 ms/frame wall average,
      32.99 ms average engine `lastFrameMs`, and only ~0.053 ms/frame in the
      tracked browser D3D8 draw/upload/readback/FBO calls.
- [x] Remove the Mac shell-map D3D8 clear depth-mask query stall. The real
      engine frame RPCs now have an opt-in C++ frame profiler
      (`cnc_port_real_engine_set_frame_profile`) that buckets elapsed time
      between engine/render markers, and the runtime frame profile can request
      it with `PERF_PROFILE_ENGINE_PROFILE=1`. That profiler isolated the
      release shell-map stall to `DX8Wrapper.Clear.deviceClear.before`; the
      browser-side clear breakdown then showed almost all of that time was
      `gl.getParameter(gl.DEPTH_WRITEMASK)` in `paintD3D8Clear`, while the raw
      `gl.clear` timer stayed near zero. `bridge.js` now tracks the D3D8
      depth-write mask when applying render state and uses the cached value to
      force/restore depth writes around D3D clears, preserving D3D8 clear
      semantics without a synchronous WebGL state query. Verified with
      `node --check WebAssembly/harness/bridge.js`,
      `node --check WebAssembly/harness/runtime_frame_profile.mjs`, Mac M4
      Chrome/Metal `runtime_frame_profile.mjs` release shell-map runs, and an
      actual `harness/play.html?autostart=1&dist=dist-release&shellmap=1`
      probe that crossed frame 344 and reached frame 526/523. The measured
      Mac tick profile improved from ~69.6 ms/frame with
      ~48.7 ms/frame in the depth-mask query to ~48.8 ms/frame, with D3D8
      clear total time down to ~0.014 ms/frame and the C++ clear bucket down
      to ~0.015 ms. The next top measured buckets are
      `RTS3DScene.flush.sortingFlush` and terrain render.
- [x] Strip debug logging and WWDebug profiling/assert macro paths from the
      Release `cnc-port` build while preserving Debug diagnostics. CMake now
      centralizes the engine debug definitions so Debug keeps
      `DEBUG_LOGGING=1` / `WWDEBUG=1`, while Release uses
      `DISABLE_DEBUG_LOGGING=1`, disables crash/stack/profile debug paths, and
      exports no `WWDEBUG` compile definition from `zh_wwdebug_core` or
      `zh_wwdebug_profile`. The direct `wasm_port_entry.cpp` WWDebug probe now
      gates the assert-hook exercise behind `#ifdef WWDEBUG`, so Release still
      proves release-level WWDebug message routing without requiring the debug
      assert symbols. Verified with `npm --prefix WebAssembly run
      build:port:release`, `npm --prefix WebAssembly run build:port`, release
      compile-command audits (`0` `-DWWDEBUG` matches and `566`
      `-DDISABLE_DEBUG_LOGGING=1` matches for `cnc-port`, while Debug still has
      `220` `-DWWDEBUG=1` and `566` `-DDEBUG_LOGGING=1` matches), local
      SwiftShader `PERF_PROFILE_DIST=dist-release PERF_PROFILE_FRAMES=5
      PERF_PROFILE_WARMUP_FRAMES=5 PERF_PROFILE_SETTLE_FRAMES=5
      PERF_PROFILE_BATCH=1 node WebAssembly/harness/runtime_frame_profile.mjs`,
      and a Mac M4 Chrome/Metal profile after syncing `dist-release`
      (`ANGLE Metal Renderer: Apple M4`, 60 measured frames, batch 10). The Mac
      release summary profile rendered the shell map, advanced from frame 10 to
      frame 70, reported 335 objects / 335 drawables / 88 rendered objects, and
      measured 47.1 ms/frame wall with 49.4 ms average engine `lastFrameMs`,
      ~482 D3D8 draws/frame, zero measured readPixels, and ~1.39 ms/frame in
      tracked browser D3D8 work.
- [x] Compare Release native-wasm-EH against Release JS-EH on the Mac M4
      real-GPU verifier and close the stale separate Release build-dir TODO.
      `build:port:release` already emits the deployed `build/wasm-release` /
      `dist-release` native-EH runtime, and `harness/play.html` defaults to
      that Release dist. Built the comparison runtime with
      `npm --prefix WebAssembly run build:port:release:js-eh`, then audited
      flags: native Release command output contained `1239`
      `-fwasm-exceptions` matches, while `wasm-release-js-eh` had no
      `-fwasm-exceptions` matches and linked with
      `DISABLE_EXCEPTION_CATCHING=0`. Synced both `dist-release` and
      `dist-release-js-eh` to the Mac and profiled them with
      `PERF_PROFILE_FRAME_COMMAND=realEngineFrameTick`,
      10 warmup frames, 120 measured frames, batch 10, Chrome
      `--enable-gpu --use-angle=metal` on
      `ANGLE Metal Renderer: Apple M4`. Native-EH measured 47.99 ms/frame
      wall, 50.47 ms average engine `lastFrameMs`, ~525.7 draws/frame, zero
      measured readPixels, and ~1.34 ms/frame tracked browser D3D8 work.
      JS-EH measured 48.35 ms/frame wall, 47.29 ms average engine
      `lastFrameMs`, ~525.7 draws/frame, zero measured readPixels, and
      ~1.44 ms/frame tracked browser D3D8 work. The JS-EH artifact was also
      larger (`7.9M` wasm vs native `6.8M`). Screenshot inspection confirmed
      the JS-EH run rendered the shell map with terrain, water, ships, wakes,
      and the Zero Hour overlay. Conclusion: exception handling mode is not a
      remaining large perf tax in the current Release runtime; keep native-EH
      as the default and profile original WW3D scene buckets / terrain next.
- [x] Reduce sorted translucent WW3D draw-state replay cost in
      `SortingRenderer::Flush_Sorting_Pool`. Added opt-in C++ frame-profile
      markers inside the original WW3D sorting renderer, then used the Mac M4
      Chrome/Metal release profile to split the prior
      `RTS3DScene.flush.sortingFlush` bucket: the actual z-sort measured only
      about 0.01 ms on the sampled shell-map frame, while
      `SortingRenderer.pool.draw.before` dominated the bucket. The sorted
      replay loop now compares the state actually replayed by
      `Apply_Render_State` (shader bits, material, bound textures, active
      lights, world matrix, and view matrix) and skips re-applying exact
      duplicate state across consecutive sorted runs, while preserving the
      sorted triangle order, run ranges, vertex/index buffers, and draw calls.
      Verified with `npm --prefix WebAssembly run build:port:release`,
      synced `dist-release` to the Mac, and profiled
      `PERF_PROFILE_FRAME_COMMAND=realEngineFrameTick` on
      `ANGLE Metal Renderer: Apple M4`. The profiled diagnostic run dropped
      the sampled sorted draw-replay bucket from ~38.69 ms to ~33.64 ms.
      Normal no-engine-profile 120-frame release shell-map profiles then
      measured 44.88 ms/frame and 40.41 ms/frame wall, versus the prior
      native-EH baseline of 47.99 ms/frame, with zero measured readPixels,
      ~523-526 D3D8 draws/frame, and ~1.19-1.27 ms/frame tracked browser D3D8
      work on the repeat run. The screenshot showed visible terrain, water,
      units/ships, wakes, and the Zero Hour overlay. Also verified the Debug
      build with `npm --prefix WebAssembly run build:port` and the sorted
      particle/FX path with the weapon-impact FX smoke, which selected
      `MarauderTankGun`, created additional particle systems, and captured
      visible
      `EXScorch01.tga`, `exwave01.tga`, `exexplo03.tga`, `excloud01.tga`,
      and `exshockwav.tga` effect draws.
- [x] Split the real shell-map terrain render bucket and trim one redundant
      sorted replay state apply. `HeightMapRenderObjClass::Render` now emits
      opt-in Emscripten frame-profile markers around setup, base tile passes,
      shader reset, shorelines, extra blends, roads, props, scorches, bridges,
      terrain tracks, shroud, post-apply, waypoints, bibs, and cleanup, plus
      the shroud `renderTerrainPass` tile loop. `SortingRenderer::Flush_Sorting_Pool`
      no longer eagerly calls `DX8Wrapper::Apply_Render_State_Changes()` after
      binding the dynamic sorted VB/IB because the first `Draw_Triangles`
      applies the same pending VB/IB changes together with the first replayed
      shader/material/texture/light/transform state. Verified with
      `npm --prefix WebAssembly run build:port:release`,
      `npm --prefix WebAssembly run build:port`, and a synced Mac M4
      Chrome/Metal runtime profile using `realEngineFrameTick`, 10 warmup
      frames, 60 measured frames, batch 10, and
      `PERF_PROFILE_ENGINE_PROFILE=1`. The final run reported
      `ANGLE Metal Renderer: Apple M4`, 48.50 ms/frame wall, 51.2 ms average
      engine `lastFrameMs`, zero measured readPixels, and a visible shell-map
      screenshot with terrain/water/units/logo. The sampled profiled frame now
      identifies the remaining render frontier precisely:
      `SortingRenderer.pool.draw.before` 25.8 ms,
      `HeightMap.render.tilePasses.before` 17.1 ms,
      `W3DWater.render.waterTracks.before` 2.1 ms,
      `RTS3DScene.flush.shadowsStencil.before` 1.45 ms,
      `RTS3DScene.flush.shadowsDecal.before` 1.29 ms, and
      `HeightMap.render.shoreLines.before` 1.22 ms; terrain roads/scorches/
      extra blends/tracks are sub-millisecond.
- [x] Merge adjacent same-state sorted translucent draw runs. The original
      `SortingRenderer::Flush_Sorting_Pool` replay still emitted one
      `Draw_Triangles` call at every sorted source-node boundary even when
      adjacent sorted ranges had identical shader/material/texture/light/
      world/view replay state. The draw loop now merges consecutive same-state
      ranges in the already sorted dynamic index buffer, preserves the exact
      per-triangle order, and expands the submitted `MinVertexIndex`/
      `NumVertices` range to the conservative union of the merged source
      nodes. Verified with `npm --prefix WebAssembly run build:port:release`,
      `npm --prefix WebAssembly run build:port`, and
      `node harness/weapon_impact_fx_smoke.mjs`, which selected
      `MarauderTankGun`, created weapon detonation FX, and captured a visible
      effect screenshot. Synced `dist-release` to the Mac M4 and profiled
      Chrome/Metal with `PERF_PROFILE_FRAME_COMMAND=realEngineFrameTick`,
      10 warmup frames, 60 measured frames, batch 10, and
      `PERF_PROFILE_ENGINE_PROFILE=1`. The run reported
      `ANGLE Metal Renderer: Apple M4`, 47.56 ms/frame wall, 50.07 ms average
      engine `lastFrameMs`, ~481.4 D3D8 draws/frame, zero measured readPixels,
      and a visible shell-map screenshot with terrain, water, wakes, units,
      ships, and the Zero Hour overlay. The merge is correct but only a small
      sampled perf win: `SortingRenderer.pool.draw.before` remains the leading
      bucket at 25.365 ms, with `W3DWater.render.waterTracks.before` at
      10.9 ms and `HeightMap.render.tilePasses.before` at 7.375 ms.
- [x] Split the remaining sorted draw replay bucket into state replay vs draw
      submission. Added a cheap `cnc_port_is_engine_frame_profile_enabled`
      query to the linked wasm runtime and used it once per
      `SortingRenderer::Flush_Sorting_Pool` so fine per-run markers only emit
      during opt-in engine-profile runs. The sorted draw loop now marks
      replay-state application, `DX8Wrapper::Draw_Triangles` submission, and
      post-submit loop overhead around each merged sorted run. Verified with
      `npm --prefix WebAssembly run build:port:release`,
      `npm --prefix WebAssembly run build:port`, and a Mac M4 Chrome/Metal
      runtime profile using `realEngineFrameTick`, 10 warmup frames,
      60 measured frames, batch 10, and `PERF_PROFILE_ENGINE_PROFILE=1`.
      The run reported 47.07 ms/frame wall, 48.47 ms average engine
      `lastFrameMs`, ~485.0 D3D8 draws/frame, zero measured readPixels,
      and a visible shell-map screenshot. The sampled frame proves the sorted
      frontier is draw submission, not state replay:
      `SortingRenderer.pool.draw.submit.before` 24.525 ms across 132 samples,
      `SortingRenderer.pool.draw.state.before` 0.085 ms, and
      `SortingRenderer.pool.draw.submit.after` 0.070 ms. The next work is to
      split/optimize the sorted `DX8Wrapper::Draw_Triangles` submit path.
- [x] Split sorted `DX8Wrapper::Draw_Triangles` submit cost through the native
      wrapper, wasm D3D8 shim, browser bridge call, and JS draw bridge phases.
      Added a nested sorted-submit profile scope around each sorted
      `DX8Wrapper::Draw_Triangles` call and used it to emit opt-in markers in
      `DX8Wrapper::Draw`, `DrawIndexedPrimitive`, `draw_bound_indexed_primitive`,
      and `browser_draw_indexed`. The same scope now tags the EM_JS payload so
      `paintD3D8DrawIndexed` accumulates sorted-only per-phase counters for
      pre-batch work, derived state, texture diagnostics, viewport setup,
      diagnostics, geometry setup, uniform/state setup, draw/batch handling,
      and tail accounting; `runtime_frame_profile.mjs` reports those counters
      in delta and per-frame summaries. Verified with
      `node --check WebAssembly/harness/bridge.js`,
      `node --check WebAssembly/harness/runtime_frame_profile.mjs`,
      `git diff --check`, `npm --prefix WebAssembly run build:port:release`,
      `npm --prefix WebAssembly run build:port`, and a Mac M4 Chrome/Metal
      runtime profile using `realEngineFrameTick`, 10 warmup frames,
      60 measured frames, batch 10, and `PERF_PROFILE_ENGINE_PROFILE=1`.
      The run reported `ANGLE Metal Renderer: Apple M4`, 47.58 ms/frame wall,
      47.03 ms average engine `lastFrameMs`, ~486.6 D3D8 draws/frame, zero
      measured readPixels, and a visible shell-map screenshot. The native-side
      split showed the expensive section remains the JS bridge
      (`WasmD3D8.browserDrawIndexed.before` 20.23 ms on the sampled frame),
      not wrapper state apply, D3D shim capture, hashing, or the final draw
      call. The JS phase counters narrow the next target to uniform/state
      setup: sorted bridge work is 13.825 ms/frame across ~66.9 profiled
      sorted draws/frame, with `sortedDrawUniformMs` 11.924 ms/frame,
      `sortedDrawGeometryMs` 0.950 ms/frame, `sortedDrawDerivedMs`
      0.421 ms/frame, and `sortedDrawDrawOrBatchMs` 0.022 ms/frame.
- [x] Cache repeated browser D3D8 transform, point-sprite, and split
      render-vs-texture uniform setup on the sorted draw bridge. The hot draw
      path now skips repeated world/view/projection uploads using the full
      transform-bearing state hash plus exact matrix comparison, so hash
      collisions cannot reuse stale transforms. Point-sprite uniforms are now
      keyed by their resolved viewport-sensitive values instead of being
      resent on every triangle draw. The old broad non-transform uniform key
      is split so render/material/light uniforms no longer reapply merely
      because the bound texture changes; texture availability, semantic, LOD,
      and texture-transform uniforms keep their texture/layout-sensitive key.
      `runtime_frame_profile.mjs` now reports transform, point-sprite, and
      texture-uniform cache counters. Verified with `node --check
      WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port:release`,
      `npm --prefix WebAssembly run build:port`, and a Mac M4 Chrome/Metal
      runtime profile using `realEngineFrameTick`, 10 warmup frames,
      60 measured frames, batch 10, and `PERF_PROFILE_ENGINE_PROFILE=1`.
      The final run reported `ANGLE Metal Renderer: Apple M4`, 46.70 ms/frame
      wall, 48.85 ms average engine `lastFrameMs`, ~483.3 D3D8 draws/frame,
      zero measured readPixels, and a visible shell-map screenshot. The
      sorted JS bridge work fell from the pre-pass 13.825 ms/frame to
      11.914 ms/frame, with `sortedDrawUniformMs` reduced from 11.924 to
      8.811 ms/frame; actual draw/batch time remained 0.022 ms/frame. The
      measured cache rates are ~409 render-uniform hits/frame vs 74.3 misses,
      ~383.9 texture-uniform hits/frame vs 99.4 misses, ~272.4 transform
      hits/frame vs 210.9 misses, and ~479.8 point-sprite hits/frame vs
      3.5 misses.
- [x] Split the remaining sorted browser draw setup and cache repeated vertex
      attribute layout state. The sorted profile now reports program bind,
      fill/shade info, vertex-attribute setup, texture bind, render-uniform,
      transform-uniform, point-sprite, and texture-uniform subphases inside
      `paintD3D8DrawIndexed`, and `runtime_frame_profile.mjs` reports
      vertex-attribute cache hit/miss counters. The draw bridge now skips
      repeated `enableVertexAttribArray` / `vertexAttribPointer` / fallback
      constant setup when the full vertex-buffer id, byte offset, stride,
      shader attribute locations, FVF-derived offsets, and texture-coordinate
      source key is unchanged; the cache is invalidated on bridge state reset,
      program changes, and buffer object lifetime changes. Verified with
      `node --check WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port:release`, and a Mac M4
      Chrome/Metal runtime profile using `realEngineFrameTick`, 10 warmup
      frames, 60 measured frames, batch 10, and
      `PERF_PROFILE_ENGINE_PROFILE=1`. The pre-cache subphase profile measured
      `sortedDrawVertexAttribMs` 1.439 ms/frame; after the cache the final run
      reported `ANGLE Metal Renderer: Apple M4`, 45.66 ms/frame wall, 48.07 ms
      average engine `lastFrameMs`, zero measured readPixels, and a visible
      shell-map screenshot. Sorted bridge work fell to 9.129 ms/frame;
      `sortedDrawVertexAttribMs` is 0.067 ms/frame, `sortedDrawGeometryMs` is
      0.165 ms/frame, and the remaining sorted cost is uniform setup:
      `sortedDrawUniformMs` 7.671 ms/frame (`sortedDrawRenderUniformMs`
      5.163, `sortedDrawTextureUniformMs` 1.784). The run measured ~103.2
      vertex-attribute cache hits/frame vs ~378.6 misses/frame across all D3D8
      draws.
- [x] Split the sorted browser render-uniform bucket into concrete upload
      groups. The sorted profile now separately reports `applyD3D8RenderState`,
      render-state/lighting object build, base shader uniforms, material
      uniforms, fixed-function light uniforms, texture-stage combiner uniforms,
      and alpha/fog uniforms inside the existing render-uniform block. This
      was a profile-only change; two local cache experiments against GL render
      state and render-uniform typed-array payloads were measured on the Mac
      and not kept because they worsened the sorted uniform bucket. Verified
      with `node --check WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port:release`,
      `npm --prefix WebAssembly run build:port`, and a Mac M4 Chrome/Metal
      runtime profile using `realEngineFrameTick`, 10 warmup frames,
      60 measured frames, batch 10, and `PERF_PROFILE_ENGINE_PROFILE=1`.
      The run reported `ANGLE Metal Renderer: Apple M4`, 45.85 ms/frame wall,
      49.37 ms average engine `lastFrameMs`, zero measured readPixels, and a
      visible shell-map screenshot. Sorted bridge work measured
      8.936 ms/frame across ~63.4 profiled sorted draws/frame, with
      `sortedDrawUniformMs` 7.030 ms/frame. The remaining render-uniform
      breakdown is now specific: `sortedDrawApplyRenderStateMs` 0.199,
      `sortedDrawRenderBuildMs` 0.023, `sortedDrawRenderBaseUniformMs` 0.417,
      `sortedDrawRenderMaterialUniformMs` 0.934,
      `sortedDrawRenderLightUniformMs` 1.596,
      `sortedDrawRenderStageUniformMs` 0.679,
      `sortedDrawRenderAlphaFogUniformMs` 0.401,
      `sortedDrawTransformUniformMs` 0.973, and
      `sortedDrawTextureUniformMs` 1.737 ms/frame.
- [x] Cache repeated sorted fixed-function light uniform uploads in the browser
      D3D8 bridge. The sorted draw path now keys the normalized active
      fixed-function light count/type/color/vector/range/attenuation/spot
      payload and skips the matching WebGL uniform uploads when consecutive
      draws use the same fixed-light state; the cache is invalidated with the
      draw-state cache and on shader program changes. The runtime profile now
      also reports `drawFixedLightUniformCacheHits` and
      `drawFixedLightUniformCacheMisses` so future profiles can prove hit rate.
      Verified with `node --check WebAssembly/harness/bridge.js`, `node
      --check WebAssembly/harness/runtime_frame_profile.mjs`, `git diff
      --check`, `npm --prefix WebAssembly run build:port:release`, and a Mac
      M4 Chrome/Metal runtime profile using `realEngineFrameTick`, 10 warmup
      frames, 60 measured frames, batch 10, and
      `PERF_PROFILE_ENGINE_PROFILE=1`. The run reported a renderer string
      containing `ANGLE Metal Renderer: Apple M4`, 47.69 ms/frame wall,
      49.27 ms average engine `lastFrameMs`, zero measured readPixels, and a
      visible shell-map screenshot. Sorted bridge work measured
      8.650 ms/frame across ~64.7 profiled sorted
      draws/frame; `sortedDrawRenderLightUniformMs` fell from 1.596 to
      0.045 ms/frame, with ~68.8 fixed-light uniform cache hits/frame and
      ~4.5 misses/frame. The remaining measured sorted uniform cost is
      `sortedDrawUniformMs` 6.708 ms/frame, including base uniforms 1.284,
      material 0.998, alpha/fog 0.725, stage 0.631, transform 1.200, and
      texture-layout 1.267 ms/frame.
- [x] Cache repeated sorted base/material/stage/alpha-fog uniform subgroups in
      the browser D3D8 bridge. The sorted draw path now tracks separate exact
      keys for base shader flags/clip planes, material + ambient uniforms,
      texture-stage combiner uniforms, and alpha/fog uniforms; each cache is
      invalidated with the draw-state cache and on shader program changes, and
      the runtime profile reports hit/miss counters for each subgroup. Verified
      with `node --check WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port:release`,
      `npm --prefix WebAssembly run build:port`, and a Mac M4
      Chrome/Metal runtime profile using `realEngineFrameTick`, 10 warmup
      frames, 60 measured frames, batch 10, and
      `PERF_PROFILE_ENGINE_PROFILE=1`. The final run reported a renderer
      string containing `ANGLE Metal Renderer: Apple M4`, 47.00 ms/frame wall,
      47.35 ms average engine `lastFrameMs`, zero measured readPixels, and a
      visible shell-map screenshot. Sorted bridge work measured
      7.521 ms/frame across ~64.8 profiled sorted draws/frame, down from
      8.650 ms/frame after the fixed-light cache. Sorted uniform setup fell
      from 6.708 to 5.295 ms/frame and render-uniform work fell from
      4.192 to 1.993 ms/frame. The new subgroup hit rates were ~58.9
      base hits/frame vs ~13.1 misses, ~43.2 material hits vs ~28.8 misses,
      ~50.5 stage hits vs ~21.6 misses, and ~65.3 alpha/fog hits vs
      ~6.7 misses. Stage and alpha/fog are now effectively drained
      (`sortedDrawRenderStageUniformMs` 0.012,
      `sortedDrawRenderAlphaFogUniformMs` 0.013 ms/frame); remaining measured
      sorted uniform costs are transform uploads 1.701, texture-layout 1.557,
      render-state application 0.950, and material uniforms 0.632 ms/frame.
- [x] Narrow the sorted texture-layout uniform cache key to shader-visible
      texture inputs instead of the broad draw-cache key. The key now covers
      sampling availability, coordinate generation mode, texture-transform
      flags and matrices, LOD-bias bits, semantic mode, and implicit alpha
      cutoff; texture object identity stays on the existing per-draw bind path
      because the uniform block only selects sampler units and texture-layout
      shader state. Verified with `node --check
      WebAssembly/harness/bridge.js`, `git diff --check`,
      `npm --prefix WebAssembly run build:port:release`,
      `npm --prefix WebAssembly run build:port`, and a Mac M4 Chrome/Metal
      runtime profile using `realEngineFrameTick`, 10 warmup frames,
      60 measured frames, batch 10, and `PERF_PROFILE_ENGINE_PROFILE=1`. The
      run reported an Apple M4 Metal renderer string, 46.04 ms/frame wall,
      48.78 ms average engine `lastFrameMs`, zero measured readPixels, and a
      visible shell-map screenshot. Texture-uniform
      cache hit rate rose to ~472.0 hits/frame vs ~15.7 misses, sorted bridge
      work fell from 7.521 to 5.130 ms/frame, sorted uniform setup fell from
      5.295 to 2.728 ms/frame, and `sortedDrawTextureUniformMs` fell from
      1.557 to 0.015 ms/frame. Remaining measured sorted-uniform costs are
      transform uploads 1.371, render-state application 0.551, and material
      uniforms 0.479 ms/frame.
- [x] Remove unrelated state-hash misses from the sorted world/view/projection
      uniform cache. The browser D3D8 bridge now keys transform uniforms only
      by the exact uploaded world/view/projection matrix values and resets the
      transform cache on shader program changes, preserving program-local WebGL
      uniform correctness while avoiding reuploads when material, light, or
      render state changes with the same transforms. Verified with
      `node --check WebAssembly/harness/bridge.js`, `git diff --check`,
      `npm --prefix WebAssembly run build:port:release`,
      `npm --prefix WebAssembly run build:port`, and a Mac M4 Chrome/Metal
      runtime profile using `realEngineFrameTick`, 10 warmup frames,
      60 measured frames, batch 10, and `PERF_PROFILE_ENGINE_PROFILE=1`. The
      run reported an Apple M4 Metal renderer string, 45.66 ms/frame wall,
      48.22 ms average engine `lastFrameMs`, zero measured readPixels, and a
      visible shell-map screenshot. Sorted bridge work fell from 5.130 to
      3.848 ms/frame, sorted uniform setup fell from 2.728 to
      2.076 ms/frame, and transform uploads fell from 1.371 to
      0.852 ms/frame; transform cache rates were ~313.5 hits/frame vs
      ~168.3 misses/frame. Remaining measured sorted-uniform costs are
      material uniforms 0.513, render-state application 0.282, and
      texture-layout uniforms 0.015 ms/frame.
- [x] Replace sorted material uniform string-key generation with exact cached
      material snapshots. The browser D3D8 bridge now compares the same
      material inputs that feed the shader uniforms (scene ambient DWORD,
      diffuse/ambient/specular/emissive arrays, power, and material-source
      selectors) against a copied cache snapshot instead of allocating and
      joining a per-draw string key. Upload behavior is unchanged: misses still
      send the same WebGL uniforms and refresh the snapshot, while hits skip
      the material block. Verified with `node --check
      WebAssembly/harness/bridge.js`, `git diff --check`,
      `npm --prefix WebAssembly run build:port`, a Mac M4 Chrome/Metal runtime
      profile with visible shell-map screenshot, and a second identical Mac
      profile for bucket stability. The second run reported an Apple M4 Metal
      renderer string, 43.66 ms/frame wall, 46.77 ms average engine
      `lastFrameMs`, zero measured readPixels, ~65.3 profiled sorted draws per
      frame, sorted bridge work at 2.996 ms/frame, sorted uniform setup at
      1.419 ms/frame, and material uniforms at 0.214 ms/frame with
      ~44.6 material-cache hits/frame vs ~29.7 misses. Remaining measured
      bridge targets are viewport application 0.798, render-state application
      0.647, and residual transform uploads 0.342 ms/frame.
- [x] Skip redundant sorted D3D viewport application on the browser draw path.
      `syncCanvasSize()` now keeps the full-canvas restore behavior by default
      for clears, snapshots, and diagnostics, while indexed draws can sync size
      without resetting GL viewport/scissor/depth immediately before
      `applyD3D8Viewport("draw")`. The D3D viewport application path now caches
      the resolved GL viewport/scissor/depth-range values keyed by drawing
      buffer size and invalidates conservatively through draw-state resets,
      full-canvas restores, FBO/viewport changes, and canvas resizes. Verified
      with `node --check WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port`, and a Mac M4 Chrome/Metal
      runtime profile with visible shell-map screenshot. The run reported an
      Apple M4 Metal renderer string, 43.34 ms/frame wall, 48.32 ms average
      engine `lastFrameMs`, zero measured readPixels, ~64.3 profiled sorted
      draws/frame, ~484 viewport-cache hits/frame vs ~5.5 misses, sorted
      bridge work at 2.255 ms/frame, and `sortedDrawViewportMs` down from
      0.798 to 0.076 ms/frame. Remaining measured sorted-uniform costs are
      residual transform uploads 0.553, render-state application 0.280, and
      material uniforms 0.190 ms/frame.
- [x] Split sorted transform uniform uploads by world/view/projection matrix.
      The browser D3D8 bridge now keeps separate exact-value snapshots for the
      current program's world, view, and projection uniforms, so a per-object
      world transform change no longer resends unchanged camera/projection
      matrices. Program switches and transform-disabled draws still reset the
      transform cache, preserving WebGL uniform locality and the original D3D
      transform semantics. The runtime frame profile now reports per-matrix
      transform cache counters. Verified with `node --check
      WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port`, and a Mac M4 Chrome/Metal
      runtime profile with visible shell-map screenshot. The run reported an
      Apple M4 Metal renderer string, 41.95 ms/frame wall, 38.45 ms average
      engine `lastFrameMs`, zero measured readPixels, ~66.4 profiled sorted
      draws/frame, sorted bridge work at 2.065 ms/frame, sorted uniform setup
      at 1.035 ms/frame, and `sortedDrawTransformUniformMs` down from 0.553 to
      0.172 ms/frame. Matrix cache rates were world ~318.0 hits/frame vs
      ~168.1 misses, view ~478.4 hits vs ~7.7 misses, and projection
      ~482.6 hits vs ~3.5 misses. Remaining measured sorted-uniform costs are
      render-state application 0.512, material uniforms 0.131, and
      texture-layout uniforms 0.016 ms/frame.
- [x] Cache redundant sorted WebGL render-state setter calls in the browser D3D8
      bridge. `applyD3D8RenderState` now tracks the current GL front-face,
      cull, depth, blend, color-mask, and stencil state and skips repeated
      setter calls while preserving conservative invalidation through the draw
      state reset path. Stencil availability is cached from the immutable
      context attributes, and `runtime_frame_profile.mjs` now reports
      render-state GL cache hit/miss counters. Verified with `node --check
      WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port`, and two Mac M4 Chrome/Metal
      runtime profiles with visible shell-map screenshots. The second stability
      run reported an Apple M4 Metal renderer string, 44.63 ms/frame wall,
      36.72 ms average engine `lastFrameMs`, zero measured readPixels, ~69.2
      profiled sorted draws/frame, sorted bridge work at 2.073 ms/frame, sorted
      uniform setup at 0.897 ms/frame, and `sortedDrawApplyRenderStateMs` down
      to 0.179 ms/frame with ~840.1 render-state GL cache hits/frame vs
      ~121.5 misses. Remaining measured sorted-uniform costs are residual
      transform uploads 0.212, material uniforms 0.157, and texture-layout
      uniforms 0.015 ms/frame.
- [x] Add real menu `Render2DClass::Render()` flush counters to the runtime
      frame profile and make the profile harness reach the same menu-reveal path
      as `play.html`. `render2d.cpp` now reports frame-local Render2D call/draw,
      texture, vertex, index, and triangle counts only while the opt-in engine
      frame profile is enabled. `runtime_frame_profile.mjs` summarizes those
      counters across sampled frames and posts the same synthetic mouse moves as
      the human play page after real engine init, so the main-menu widgets are
      visible before measurement. Verified with `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly run build:port:release`, and Mac M4
      Chrome/Metal profiles with visible main-menu screenshots. The full
      60-frame menu profile reported an Apple M4 Metal renderer string,
      94.43 ms/frame wall, 92.57 ms average engine `lastFrameMs`, zero
      readPixels, exactly 97 Render2D flushes/frame, 488 Render2D vertices /
      244 triangles/frame, and `W3DDisplay.draw.inGameUI.before` at 61.355 ms
      on the sampled frame. This confirms GUI Render2D batching, not sorted
      draw-uniform setup, is the active shell-map performance frontier.
- [x] Batch the real W3DDisplay 2D GUI primitives across the in-game UI draw
      scope while preserving UI z-order. `W3DDisplay` now starts a scoped
      Emscripten-only 2D primitive batch around `TheInGameUI` rendering,
      coalesces adjacent same-state display-owned `drawImage`/line/rect/clock
      primitives into the existing `Render2DClass`, and drains the batch before
      any other `Render2DClass` owner renders so display strings still appear in
      original order. The primitive wrappers preserve their original geometry
      generation and fall back to immediate rendering outside the scoped batch;
      non-wasm builds remain immediate-mode because the drain hook is wasm-only.
      Verified with `git diff --check`, `npm --prefix WebAssembly run
      build:port`, `npm --prefix WebAssembly run build:port:release`, and Mac
      M4 Chrome/Metal runtime profiles plus visible main-menu screenshots. The
      final 60-frame menu profile reported an Apple M4 Metal renderer string,
      54.68 ms/frame wall, 53.21 ms average engine `lastFrameMs`, zero
      measured readPixels, 16 Render2D draws/frame (15 textured + 1 untextured)
      instead of 97, the same 488 Render2D vertices / 244 triangles/frame, and
      `W3DDisplay.draw.inGameUI.before` down to 10.005 ms on the sampled frame.
      The new top sampled bucket is `W3DWater.render.waterTracks.before` at
      21.37 ms.
- [x] Split and batch the real water-track render path. Profile-only markers
      first proved the 21.37 ms `W3DWater.render.waterTracks.before` bucket was
      overwhelmingly per-track draw submission: 190 water-track objects on the
      sampled shell-map frame, `W3DWaterTracks.obj.draw.before` at 19.93 ms,
      and sub-millisecond update, lock, water-height, vertex-write, and cleanup
      buckets. `W3DWaterTracks.cpp` now keeps the original wave math and dynamic
      vertex writes but replaces the per-quad triangle-strip index buffer with
      a per-page quad triangle-list index buffer, batches contiguous same-texture
      tracks, and submits each group through one `DX8Wrapper::Draw_Triangles`
      call. Verified with `git diff --check`, `npm --prefix WebAssembly run
      build:port`, `npm --prefix WebAssembly run build:port:release`, and a
      Mac M4 Chrome/Metal release runtime profile with a visible main-menu /
      shell-map water screenshot. The final 60-frame profile reported an Apple
      M4 Metal renderer string, 39.06 ms/frame wall, 37.66 ms average engine
      `lastFrameMs`, the preserved 16 Render2D draws/frame and 488 Render2D
      vertices / 244 triangles/frame, and `W3DWaterTracks.flush.batchDraw.before`
      at 0.055 ms. The old per-object water draw bucket is gone; the new
      sampled leaders are `RTS3DScene.flush.shadowsStencil.before` at 10.11 ms,
      `W3DDisplay.draw.inGameUI.before` at 9.3 ms,
      `HeightMap.render.tilePasses.before` at 7.495 ms, and
      `RTS3DScene.flush.shadowsDecal.before` at 6.765 ms.
- [x] Split and optimize the real shadow stencil/decal submit path. Added
      opt-in Emscripten profile markers around projected-shadow decal queueing,
      projected mesh flush, volumetric static and dynamic shadow volumes,
      stencil composite fill, and raw D3D8 draw submission. The split showed
      projected decal queueing and dynamic shadow geometry were not the main
      perf cost: the measured hot path was persistent indexed D3D8 submission
      for static volumetric shadow volumes, with native capture/hash/range work
      small compared with the browser bridge. `bridge.js` now caches WebGL2
      vertex array objects for persistent indexed D3D8 draws, keeps generic
      index-buffer updates on the default VAO so cached VAOs cannot be mutated,
      excludes temporary-index/fill-mode fallback draws, and caches fixed
      default vertex attribute constants. `runtime_frame_profile.mjs` now
      reports VAO cache hit/miss counters. Verified with `git diff --check`,
      `node --check WebAssembly/harness/bridge.js`, `node --check
      WebAssembly/harness/runtime_frame_profile.mjs`, `npm --prefix
      WebAssembly run build:port`, `npm --prefix WebAssembly run
      build:port:release`, and Mac M4 Chrome/Metal release profiles with
      visible main-menu / shell-map water screenshots. The final 60-frame
      profile reported an Apple M4 Metal renderer string, 38.06 ms/frame wall,
      36.60 ms average engine `lastFrameMs`, 112.9 VAO-cache hits/frame,
      scoped shadow submit bridge work at 4.140 ms/frame, and
      `sortedDrawVertexAttribMs` down to 0.406 ms/frame. The final sampled frame
      had `WasmD3D8.browserDrawIndexed.before` at 2.23 ms,
      `W3DProjectedShadow.renderShadows.meshFlush.before` at 1.26 ms, and the
      recurring perf frontier moved back to heightmap/terrain rendering. This
      pass did not claim to fix the separate user-reported shadow flicker bug.
- [x] Trim browser D3D8 draw-submit work after the shoreline static-VB pass.
      The shoreline split showed the remaining hot cost had moved back into
      generic `paintD3D8DrawIndexed` submission, so the temporary shoreline
      markers were not kept. In `diag=lite`, the browser bridge now uses a
      minimal solid/non-flat draw descriptor instead of constructing the full
      fill-mode and shade-mode probe objects that are only consumed by full
      diagnostics. The draw path also passes already-normalized render state to
      `applyD3D8RenderState`, removing a duplicate normalization pass while
      keeping the full diagnostic probe path intact. Verified with
      `node --check WebAssembly/harness/bridge.js`,
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly run build:port:release`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and a synced Mac M4
      Chrome/Metal release runtime profile. The Mac run reported
      `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`,
      60 measured frames, 37.22 ms/frame wall, 9.57 ms average engine
      `lastFrameMs`, and a visible shell-map screenshot at
      `WebAssembly/artifacts/screenshots/runtime-frame-profile-draw-submit-lite-fast-mac.png`.
      Scoped sorted draw-submit work fell to 2.703 ms/frame, with
      `sortedDrawApplyRenderStateMs` down to 0.054 ms/frame,
      `sortedDrawUniformMs` to 0.629 ms/frame, and `sortedDrawFillShadeMs` to
      0.063 ms/frame. The full diagnostics smoke confirms detailed
      `browser_d3d8_draw_indexed` probes still work.
- [x] Harden the human play harness against stale frame-344 builds. The Mac
      repro path did not reproduce the old shell-map abort on current bits:
      `harness/play.html?autostart=1&dist=dist-release&shellmap=1&diag=lite`
      crossed frame 344, and a full summary at frame 363 reported
      `loadingMap=false`, `inGame=true`, 350 objects, 352 drawables,
      171 rendered objects, `inputEnabled=true`, `moviePlaying=false`, and no
      abort. The visible recurrence was therefore consistent with a stale
      browser/server asset path. `bridge.js` now HEADs the selected
      `cnc-port.js`/`.wasm` files with `cache:"no-store"` and imports/locates
      them with a metadata cache token, while `static-server.mjs` sends
      `cache-control: no-store` for live `harness/` and `dist*` JS/HTML/CSS/
      wasm assets without disabling archive caching. Restarted the Mac
      harness server, confirmed `__cnc_build_info` and no-store headers, then
      reran the same Mac Chrome/Metal play path through frame 701 with
      `dist-release`, no abort, and frame-363 state still fully loaded.

### Content completeness (Zero Hour)
- [x] Restore original `FXList::doFXPos` playback in the linked `cnc-port`
      runtime and prove visible effect rendering through the browser harness.
      The real INI runtime no longer compiles `GameClient/FXList.cpp` with the
      `WASM_REAL_INI_FXLIST_METADATA_ONLY` no-op path, and the legacy weak
      `FXList` compatibility definitions were removed so the original
      implementation owns playback. `real_fx_render_smoke.mjs` boots the real
      shell map, triggers shipped `WeaponFX_MOAB_Blast` through the real
      `TheFXListStore`, and verifies particle-system creation plus effect
      texture draws (`exwave01.tga`, `exshockwav.tga`, `exexplo03.tga`,
      etc.) with a screenshot at
      `WebAssembly/artifacts/screenshots/real-fx-render-smoke.png`. Verified
      locally with `npm --prefix WebAssembly run test:real-fx-render` and on
      the Mac M4 real-GPU path (`ANGLE Metal Renderer: Apple M4`) with
      `REAL_FX_BROWSER_EXECUTABLE` pointing at Google Chrome,
      `REAL_FX_BROWSER_ARGS="--enable-gpu --use-angle=metal"`, and
      `/opt/homebrew/bin/node harness/real_fx_render_smoke.mjs`.
- [x] Prove original weapon-impact explosions through the restored real FX
      path. Added the `realEngineDetonateWeapon` RPC backed by
      `WeaponStore::handleProjectileDetonation`, plus wasm-only
      WeaponStore/FXList inspection helpers so the browser harness can select
      a real loaded `ProjectileDetonationFX` weapon instead of hard-coding test
      data. `weapon_impact_fx_smoke.mjs` boots the real shell map, chooses a
      shroud-clear original source object, auto-selected `MarauderTankGun`,
      and proved the detonation created particle systems and rendered shipped
      impact textures (`EXScorch01.tga`, `exwave01.tga`, `exexplo03.tga`,
      `excloud01.tga`, `exshockwav.tga`) through the normal draw history, with
      a screenshot at
      `WebAssembly/artifacts/screenshots/weapon-impact-fx-smoke.png`.
      Verified locally with `npm --prefix WebAssembly run test:weapon-impact-fx`
      and on the Mac M4 real-GPU path with Google Chrome reporting
      `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`.
- [x] Prove shipped `W3DLaserDraw` / `LaserUpdate` beam rendering through the
      linked `cnc-port` runtime. Added the `realEngineSpawnLaser` RPC, which
      creates a real shipped `ThingTemplate` drawable through
      `TheThingFactory`, finds its original `LaserUpdate` client module,
      initializes start/end points, and lets `W3DLaserDraw` update its
      `SegmentedLineClass` render objects in the normal scene. The new
      `real_laser_draw_smoke.mjs` harness mounts the real archive set, boots
      the shell map, spawns `LaserBeam`, advances real frames with full draw
      diagnostics, asserts 6 `exlaser.tga` scene draws, captures
      `artifacts/screenshots/real-laser-draw-smoke.png`, and clears the probe
      drawable through the same runtime command. Verified with
      `node --check WebAssembly/harness/bridge.js
      WebAssembly/harness/real_laser_draw_smoke.mjs`, `git diff --check`,
      `npm --prefix WebAssembly run build:port`, and
      `npm --prefix WebAssembly run test:real-laser-draw`.
### Robustness & compatibility
### Base game
---

## Cross-cutting: harness & verification (ongoing, never "done")

- [x] Gate the W3D scene extra-pass weak hooks out of the real `cnc-port`
      runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_SCENE_EXTRA_PASSES`, and
      `wasm_ww3d_scene_probe.cpp` only emits its weak `DoTrees`,
      `DoShadows`, and `DoParticles` counting hooks for probe-only builds.
      This removes three direct-object weak definitions from the real runtime
      link so `BaseHeightMap.cpp`, `W3DShadow.cpp`, and
      `W3DParticleSys.cpp` can satisfy the same extra-pass symbols. The weak
      audit now reports 160 compiled weak definitions, 26 gated-out
      declarations, and 158 strong-provider overlaps. Verified with
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      direct `llvm-nm` checks that the `cnc-port` scene probe object no longer
      defines those three weak symbols, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs` (`ok: true`, W3D scene screenshot set
      refreshed), and `node WebAssembly/harness/startup_vertical_smoke.mjs`
      (`ok: true`, real menu/campaign-start screenshots refreshed).
- [x] Gate W3D scene singleton weak globals out of the real `cnc-port`
      runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_SCENE_SINGLETONS`, so
      `wasm_ww3d_scene_probe.cpp` keeps only extern declarations for
      `TheParticleSystemManager`, `TheW3DShadowManager`,
      `TheWritableGlobalData`, and `TheScriptEngine` while probe-only builds
      still get the weak storage definitions. The direct
      `wasm_gamenetwork_probe.cpp` weak `TheScriptEngine` storage is also
      gated behind `CNC_PORT_LINKS_REAL_SCRIPT_ENGINE_SINGLETON`. The weak
      audit now reports 156 compiled weak definitions, 30 gated-out
      declarations, and 154 strong-provider overlaps; direct `llvm-nm` checks
      show the scene and game-network probe objects no longer define those
      weak globals, while the linked real archives provide the strong
      `TheParticleSystemManager`, `TheW3DShadowManager`,
      `TheWritableGlobalData`, and `TheScriptEngine` owners. Verified with
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and
      `node WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D scene gameplay method weak bodies out of the real
      `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_SCENE_GAMEPLAY_METHODS`, so
      `wasm_ww3d_scene_probe.cpp` no longer emits weak bodies for
      `W3DTreeBuffer::drawTrees`, `Drawable` dirty-lock and color helpers,
      `Thing::isKindOf`, or `Object::getControllingPlayer` in the real link;
      probe-only builds keep those bodies. The weak audit now reports 149
      compiled weak definitions, 37 gated-out declarations, and 147
      strong-provider overlaps, with the scene probe down to one compiled weak
      declaration (`ParticleSystemManager::queueParticleRender`). Direct
      `llvm-nm` checks show only that particle queue stub remains in the
      `cnc-port` scene-probe object, and linked real archives provide the
      gated method owners. Verified with `npm --prefix WebAssembly run
      build:port`, `npm --prefix WebAssembly --silent run
      verify:cnc-port-weak-stubs`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, and `node
      WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D terrain probe weak owner block out of the real
      `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_OWNERS`, so
      `wasm_ww3d_terrain_probe.cpp` keeps extern declarations but no longer
      emits weak definitions for `TheTacticalView`, `TheWaterRenderObj`,
      `TheTerrainTracksRenderObjClassSystem`, `TheSmudgeManager`,
      `TheW3DProjectedShadowManager`, the `RTS3DScene` light-iterator
      helpers, `ScriptList` script chunk helpers, or `PolygonTrigger` chunk
      helpers in the real link. The weak audit now reports 138 compiled weak
      definitions, 48 gated-out declarations, and 136 strong-provider
      overlaps, with the terrain probe at zero compiled explicit weak
      declarations. Direct `llvm-nm` checks show the `cnc-port` terrain-probe
      object no longer defines those weak symbols, while linked real archives
      provide the owner symbols. Verified with `npm --prefix WebAssembly run
      build:port`, `npm --prefix WebAssembly --silent run
      verify:cnc-port-weak-stubs`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, and `node
      WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the top W3D terrain-stub singleton weak globals out of the real
      `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_SINGLETONS`, so
      `wasm_ww3d_terrain_probe_stubs.cpp` keeps extern declarations but no
      longer emits weak storage for `TheGhostObjectManager`, `TheRadar`,
      `ThePlayerList`, `TheCampaignManager`, `TheScriptActions`,
      `TheScriptConditions`, `TheTeamFactory`, `TheVictoryConditions`,
      `TheEva`, or `TheBuildAssistant` in the real link; `RunBenchmark`
      remains the adjacent no-provider weak boundary. The direct
      `wasm_gamenetwork_probe.cpp` weak `TheScriptActions` storage is also
      gated behind `CNC_PORT_LINKS_REAL_SCRIPT_ACTIONS_SINGLETON`. The weak
      audit now reports 128 compiled weak definitions, 58 gated-out
      declarations, and 126 strong-provider overlaps, with
      `wasm_ww3d_terrain_probe_stubs.cpp` down to 120 compiled explicit weak
      declarations. Direct `llvm-nm` checks show the terrain-stub object only
      defines `RunBenchmark` from the top block and the game-network probe
      object no longer defines `TheScriptActions` or `TheScriptEngine`.
      Verified with `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and
      `node WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D terrain-stub team/campaign method weak group out of the
      real `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_TEAM_RUNTIME`, so
      `wasm_ww3d_terrain_probe_stubs.cpp` no longer emits weak declarations or
      fallback bodies for `TeamFactory::findTeamByID`,
      `TeamFactory::findTeamPrototype`, `TeamPrototype::countTeamInstances`,
      `CampaignManager::getCurrentCampaign`, `Team::getTeamAsAIGroup`, or
      `Team::getControllingPlayer` in the real link. The linked strong
      providers come from the real `Team.cpp` terrain/object-INI runtimes and
      `CampaignManager.cpp` lifecycle runtime. The weak audit now reports 122
      compiled weak definitions, 64 gated-out declarations, and 120
      strong-provider overlaps, with `wasm_ww3d_terrain_probe_stubs.cpp` down
      to 114 compiled explicit weak declarations. Direct `llvm-nm` checks show
      the terrain-stub object no longer defines the six team/campaign symbols.
      Verified with `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and
      `node WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D terrain-stub bridge/script helper weak group out of the
      real `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_BRIDGE_SCRIPT_RUNTIME`, so
      `wasm_ww3d_terrain_probe_stubs.cpp` no longer emits weak declarations or
      fallback bodies for the `BridgeInfo` constructors, `ReloadAllTextures`,
      `ScriptEngine::isTimeFrozenDebug`, or
      `ScriptEngine::isTimeFrozenScript` in the real link. The linked strong
      providers come from real `TerrainLogic.cpp`,
      `W3DAssetManagerExposed.cpp`, and `ScriptEngine.cpp` runtime objects.
      The weak audit now reports 117 compiled weak definitions, 69 gated-out
      declarations, and 115 strong-provider overlaps, with
      `wasm_ww3d_terrain_probe_stubs.cpp` down to 109 compiled explicit weak
      declarations. Direct `llvm-nm` checks show the terrain-stub object no
      longer defines the five bridge/script helper symbols. Verified with
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and
      `node WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D terrain-stub AI/pathfinder weak group out of the real
      `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_AI_PATHFIND_RUNTIME`, so
      `wasm_ww3d_terrain_probe_stubs.cpp` no longer emits weak declarations or
      fallback bodies for `Pathfinder::classifyObjectFootprint`,
      `AIPlayer::AIPlayer`, `AISkirmishPlayer::AISkirmishPlayer`,
      `AIPlayer::getAIDifficulty`, or `AIPlayer::aiPreTeamDestroy` in the
      real link. The linked strong providers come from real `AIPathfind.cpp`,
      `AIPlayer.cpp`, and `AISkirmishPlayer.cpp` runtime objects. The weak
      audit now reports 112 compiled weak definitions, 74 gated-out
      declarations, and 110 strong-provider overlaps, with
      `wasm_ww3d_terrain_probe_stubs.cpp` down to 104 compiled explicit weak
      declarations. Direct `llvm-nm` checks show the terrain-stub object no
      longer defines the five AI/pathfinder symbols. Verified with
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and
      `node WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D terrain-stub resource/radar weak group out of the real
      `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_RADAR_RESOURCE_RUNTIME`, so
      `wasm_ww3d_terrain_probe_stubs.cpp` no longer emits weak declarations or
      fallback bodies for `ResourceGatheringManager::ResourceGatheringManager`,
      `Radar::removeObject`, or `Radar::addObject` in the real link. The
      linked strong providers come from real `ResourceGatheringManager.cpp`
      and `Radar.cpp` runtime objects. The weak audit now reports 109 compiled
      weak definitions, 77 gated-out declarations, and 107 strong-provider
      overlaps, with `wasm_ww3d_terrain_probe_stubs.cpp` down to 101 compiled
      explicit weak declarations. Direct `llvm-nm` checks show the
      terrain-stub object no longer defines the three resource/radar symbols.
      Verified with `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and
      `node WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D terrain-stub Object helper weak group out of the real
      `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_OBJECT_HELPERS`, so
      `wasm_ww3d_terrain_probe_stubs.cpp` no longer emits weak declarations or
      fallback bodies for `Object::leaveGroup`, `Object::setDisabled`,
      `Object::clearDisabled`, `Object::updateUpgradeModules`,
      `Object::setTeam`, `Object::setCustomIndicatorColor`,
      `Object::removeCustomIndicatorColor`, `Object::getIndicatorColor`,
      `Object::getCommandSetString`, or `Object::getNightIndicatorColor` in
      the real link. The linked strong providers come from real `Object.cpp`
      lifecycle runtime objects. The weak audit now reports 99 compiled weak
      definitions, 87 gated-out declarations, and 97 strong-provider overlaps,
      with `wasm_ww3d_terrain_probe_stubs.cpp` down to 91 compiled explicit
      weak declarations. Direct `llvm-nm` checks show the terrain-stub object
      no longer defines the ten Object helper symbols. Verified with
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and
      `node WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D terrain-stub AIGroup/Drawable/ThingTemplate/Player helper
      weak group out of the real `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_PLAYER_DRAWABLE_HELPERS`, so
      `wasm_ww3d_terrain_probe_stubs.cpp` no longer emits weak declarations or
      fallback bodies for `AIGroup::add`, `Drawable::setDrawableHidden`,
      `Drawable::setIndicatorColor`, `ThingTemplate::calcCostToBuild`,
      `Player::getCurrentEnemy`, `Player::updateTeamStates`,
      `Player::isSkirmishAIPlayer`, `Player::getPlayerDifficulty`,
      `AIGroup::AIGroup`, `AIGroup::isGroupAiDead`, or `AIGroup::isIdle` in the
      real link. The linked strong providers come from real `AIGroup.cpp`,
      `Drawable.cpp`, `ThingTemplate.cpp`, and `Player.cpp` runtime objects.
      The weak audit now reports 88 compiled weak definitions, 98 gated-out
      declarations, and 86 strong-provider overlaps, with
      `wasm_ww3d_terrain_probe_stubs.cpp` down to 80 compiled explicit weak
      declarations. Direct `llvm-nm` checks show the terrain-stub object no
      longer defines the eleven helper symbols. Verified with
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and
      `node WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D terrain-stub snow/iterator/Object helper weak group out of
      the real `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_SNOW_ITERATOR_OBJECT_HELPERS`, so
      `wasm_ww3d_terrain_probe_stubs.cpp` no longer emits weak declarations or
      fallback bodies for `W3DSnowManager::ReleaseResources`,
      `W3DSnowManager::ReAcquireResources`,
      `SimpleObjectIterator::SimpleObjectIterator`,
      `SimpleObjectIterator::insert`, `SimpleObjectIterator::sort`,
      `Object::onPartitionCellChange`, or `Object::onCollide` in the real
      link. The linked strong providers come from real `W3DSnow.cpp`,
      `SimpleObjectIterator.cpp`, and `Object.cpp` runtime objects. The weak
      audit now reports 81 compiled weak definitions, 105 gated-out
      declarations, and 79 strong-provider overlaps, with
      `wasm_ww3d_terrain_probe_stubs.cpp` down to 73 compiled explicit weak
      declarations. Direct `llvm-nm` checks show the terrain-stub object no
      longer defines the seven helper symbols. Verified with
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and
      `node WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D terrain-stub shadow/projected-shadow weak group out of the
      real `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_SHADOW_RUNTIME`, so
      `wasm_ww3d_terrain_probe_stubs.cpp` no longer emits weak declarations or
      fallback bodies for `W3DShadowManager::ReleaseResources`,
      `W3DShadowManager::ReAcquireResources`, `W3DShadowManager::W3DShadowManager`,
      `W3DShadowManager::~W3DShadowManager`, `W3DShadowManager::init`,
      `W3DShadowManager::Reset`, or the `W3DProjectedShadow` D1/D2 destructor
      aliases in the real link. The linked strong providers come from real
      `W3DShadow.cpp` and `W3DProjectedShadow.cpp` runtime objects. The weak
      audit now reports 73 compiled weak definitions, 113 gated-out
      declarations, and 71 strong-provider overlaps, with
      `wasm_ww3d_terrain_probe_stubs.cpp` down to 65 compiled explicit weak
      declarations. Direct `llvm-nm` checks show the terrain-stub object no
      longer defines the eight shadow symbols. Verified with
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and
      `node WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D terrain-stub water weak group out of the real `cnc-port`
      runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_WATER_RUNTIME`, so
      `wasm_ww3d_terrain_probe_stubs.cpp` no longer emits weak declarations or
      fallback bodies for the 23 `WaterRenderObjClass` helpers: constructors,
      destructors, `init`, `reset`, `load`, `update`, grid enable/update/height,
      resource release/reacquire, grid clamp/velocity/change/attenuation,
      transform, resolution, and skybox texture replacement. The linked strong
      provider comes from real `W3DWater.cpp` runtime objects. The weak audit
      now reports 50 compiled weak definitions, 136 gated-out declarations, and
      48 strong-provider overlaps, with `wasm_ww3d_terrain_probe_stubs.cpp`
      down to 42 compiled explicit weak declarations. Direct `llvm-nm` checks
      show the terrain-stub object no longer defines `WaterRenderObjClass`
      symbols. Verified with `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      direct `llvm-nm --demangle` checks, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, `node
      WebAssembly/harness/startup_vertical_smoke.mjs`, and a focused
      pi-as-mcp micro-review of the guard pairing.
- [x] Gate the W3D terrain-stub projected-shadow manager and terrain-track weak
      group out of the real `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_PROJECTED_SHADOW_TRACKS_RUNTIME`,
      so `wasm_ww3d_terrain_probe_stubs.cpp` no longer emits weak declarations
      or fallback bodies for `W3DProjectedShadowManager::queueDecal`,
      `W3DProjectedShadowManager::flushDecals`,
      `W3DProjectedShadowManager::createDecalShadow`, or the eight
      `TerrainTracksRenderObjClassSystem` constructor/destructor/resource/init/
      reset/detail helpers in the real link. The linked strong providers come
      from real `W3DProjectedShadow.cpp` and `W3DTerrainTracks.cpp` runtime
      objects. The weak audit now reports 39 compiled weak definitions, 147
      gated-out declarations, and 37 strong-provider overlaps, with
      `wasm_ww3d_terrain_probe_stubs.cpp` down to 31 compiled explicit weak
      declarations. Direct `llvm-nm` checks show the terrain-stub object no
      longer defines the projected-shadow manager or terrain-track symbols.
      Verified with `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      direct `llvm-nm --demangle` checks, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, and `node
      WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the remaining W3D terrain-stub gameplay/query helper weak group out
      of the real `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_GAMEPLAY_QUERY_HELPERS`, so
      `wasm_ww3d_terrain_probe_stubs.cpp` no longer emits weak declarations or
      fallback bodies for `GameLogic::isGamePaused`,
      `AIStateMachine::getGoalPathPosition`, the six `PartitionManager`
      query/shroud helpers, `AIUpdateInterface::friend_getWaypointGoalPathSize`,
      `W3DModelDrawModuleData::getBestModelNameForWB`, `Thing::getTemplate`,
      `Thing::setPosition`, `Thing::setOrientation`, `Drawable::getID`, the
      eight `Object` query/damage/boundary helpers, the four `Pathfinder`
      wall/bridge helpers, `BridgeBehavior::getBridgeBehaviorInterfaceFromObject`,
      `BridgeTowerBehavior::getBridgeTowerBehaviorInterfaceFromObject`,
      `GameLogic::destroyObject`, or `GameLogic::getFirstObject` in the real
      link. The weak audit now reports 9 compiled weak definitions, 177
      gated-out declarations, and 7 strong-provider overlaps, with
      `wasm_ww3d_terrain_probe_stubs.cpp` reduced to the single no-provider
      `RunBenchmark` weak boundary. Direct `llvm-nm` checks show the terrain-stub
      object no longer defines any gameplay/query C++ weak aliases. Verified with
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      direct `llvm-nm --demangle` checks, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, and `node
      WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D render-probe menu callback helper weak group out of the real
      `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_RENDER_MENU_CALLBACK_HELPERS`, so
      `wasm_ww3d_render_probe.cpp` no longer emits the weak `DontShowMainMenu`,
      `BattleHonorTooltip`, `ResetBattleHonorInsertion`, `InsertBattleHonor`,
      `playerTemplateComboBoxTooltip`, `playerTemplateListBoxTooltip`, or
      `destroyQuitMenu` fallback definitions in the real link. The real
      providers come from the original menu/lobby callback sources already in
      `zh_gameengine_real_lifecycle_runtime`. The weak audit now reports 2
      compiled weak definitions, 184 gated-out declarations, and zero
      strong-provider overlaps; the only compiled explicit weak definitions
      left in the audit are the no-final `ParticleSystemManager::queueParticleRender`
      and `RunBenchmark` boundaries. Direct `llvm-nm` checks show the render-probe
      object no longer defines the menu callback helper weak symbols. Verified
      with `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      direct `llvm-nm --demangle` checks, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, and `node
      WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the W3D scene-probe pure-virtual particle queue fallback out of the
      real `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_W3D_SCENE_PARTICLE_QUEUE`, so
      `wasm_ww3d_scene_probe.cpp` no longer emits the weak
      `ParticleSystemManager::queueParticleRender` base-class fallback in the
      real link; probe-only builds still keep it. The base method is pure
      virtual in original `ParticleSys.h`, and the real runtime path uses
      `W3DParticleSystemManager::queueParticleRender` from original
      `W3DParticleSys.cpp`. The weak audit now reports 1 compiled weak
      definition, 185 gated-out declarations, and zero strong-provider overlaps,
      with only the no-provider `RunBenchmark` boundary still compiled. Direct
      `llvm-nm` checks show the scene-probe object no longer defines the
      particle queue fallback. Verified with `npm --prefix WebAssembly run
      build:port`, `npm --prefix WebAssembly --silent run
      verify:cnc-port-weak-stubs`, direct `llvm-nm --demangle` checks,
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`, and `node
      WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Replace the final `RunBenchmark` weak boundary in the real `cnc-port`
      runtime with an explicit browser-owned Benchmark shim. The original
      `Benchmark.dsp` lists third-party C sources (`emfloat.c`, `misc.c`,
      `nbench0.c`, `nbench1.c`, `sysspec.c`) that are absent from this source
      release, so `cnc-port` now links `wasm_benchmark_shim.cpp` as the strong
      `RunBenchmark` provider and defines `CNC_PORT_LINKS_BROWSER_BENCHMARK_SHIM`
      to keep the old weak fallback probe-only. The shim preserves the prior
      deterministic "benchmark unavailable" output indices while making the
      platform boundary explicit. The weak audit now reports zero compiled weak
      definitions, 186 gated-out declarations, zero strong-provider overlaps,
      and zero no-final symbols. Direct `llvm-nm` checks show
      `wasm_ww3d_terrain_probe_stubs.cpp.o` no longer defines `RunBenchmark`,
      while `wasm_benchmark_shim.cpp.o` provides the strong symbol. Verified
      with `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      direct `llvm-nm --demangle` checks, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, and `node
      WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Add a `cnc-port` weak-stub audit for the Fable weak-symbol burn-down.
      `WebAssembly/tools/verify_cnc_port_weak_stubs.mjs` parses the explicit
      `__attribute__((weak))` declarations in the W3D render/scene/terrain
      probe files plus `wasm_ww3d_terrain_probe_stubs.cpp`, reads the current
      `cnc-port` link inputs from `ninja -t query`, inspects probe objects and
      linked archives with `llvm-nm`, demangles with `llvm-cxxfilt`, and
      reports compiled weak definitions, source declarations gated out by
      preprocessor guards, and strong-provider overlaps by mangled symbol. It
      deliberately does not claim exact final body provenance because Emscripten
      3.1.6 filters wasm-ld map flags and final wasm symbol visibility is too
      stripped for the C++ probe names. Initial output reported 186 explicit weak
      declarations, 163 compiled weak definitions, 23 gated-out declarations,
      and 161 strong-provider overlaps. Verified with `node --check
      WebAssembly/tools/verify_cnc_port_weak_stubs.mjs`, package JSON parsing,
      `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly --silent run verify:cnc-port-weak-stubs`,
      `git diff --check`, and `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs` (`ok: true`, screenshot set written under
      `WebAssembly/artifacts/screenshots/`).
- [x] Add the human-play issue-dump flight recorder and report flow. The
      playable `harness/play.html` now has record/report/save/upload controls,
      deep/video toggles, a screenshot annotation dialog, comment/title fields,
      and local IndexedDB draft persistence. `issue-recorder.mjs` records
      date/time/timezone, page URL, browser/device/WebGL renderer, build asset
      Last-Modified/size metadata, archive specs, boot/session context, input
      events with engine-space coordinates and replayable Win32 messages, RPC
      summaries, throttled frame summaries, logs, screenshots, annotation
      strokes, optional WebM canvas video, and deep issue snapshots using the
      existing `screenshot`, `state`, `realEngineFrameSummary`,
      `queryDrawables`, `querySelection`, and `d3d8TextureInventory` RPCs. The
      harness server can optionally accept `POST /__cnc_issue_dump` and writes
      dumps under `WebAssembly/artifacts/issue-dumps/`; browser download still
      works without the server endpoint. `replay_issue_dump.mjs` consumes a
      `.cncdump.json`, boots `play.html?replay=1`, replays captured inputs by
      frame, and writes repro screenshot/state artifacts. Verified with
      `node --check` on the new/modified harness modules, `git diff --check`,
      and `npm --prefix WebAssembly run test:issue-recorder`.
- [x] Fix the first human issue-dump report feedback loop. The sample
      `/tmp/cnc-2026-07-05T18-16-00-194Z-manual.cncdump.json.zip` parsed
      cleanly with 1,233 timeline events, 347 frame samples, 109 logs, one
      annotated issue screenshot, and a deep snapshot, but it exposed two
      gaps: the bridge's global keyboard handler prevented typing into the
      report dialog, and issue markers could fall back to the shallow
      `state.frame` value of `0`. `bridge.js` now leaves keyboard events alone
      while DOM UI/overlays own focus, `play.mjs` does the same for the console
      shortcut, `issue-recorder.mjs` keeps a monotonic last engine-frame marker,
      and the recorder now captures harness server build/version metadata from
      `GET /__cnc_build_info` (git commit/branch/dirty plus server runtime) in
      `manifest.build.server`. The UI smoke now uses real Playwright keyboard
      typing and asserts the saved issue comment/title plus marker frame.
      Verified with `npm --prefix WebAssembly run test:issue-recorder`,
      `git diff --check`, `node --check` on the touched harness modules, and a
      replay smoke that consumed the sample dump and wrote screenshot/state
      artifacts under `WebAssembly/artifacts/issue-replays/` (the old dump's
      pre-fix `markerFrame:0` correctly limits that smoke to dump ingestion
      rather than exact scene replay).
- [x] Add repo-local AI skills for issue-dump analysis. Both
      `.claude/skills/issue-dump-analysis` and
      `.codex/skills/issue-dump-analysis` now explain how agents should decode
      `.cncdump.json` / `.cncdump.json.zip` reports, prioritize evidence,
      extract screenshots/annotations/logs/deep snapshots, compare build
      metadata, and run `harness/replay_issue_dump.mjs` when the marker frame is
      useful. Each skill copy includes
      `scripts/decode_issue_dump.py`, a dependency-free decoder that handles raw
      JSON or zip reports, writes `summary.json`, extracts embedded PNG/WebM
      media, redacts base64 data URLs in JSON evidence, and emits timeline/log
      artifacts. Verified with `quick_validate.py` for both skill copies,
      `python3 -m py_compile` for both decoder copies, and a real decode smoke
      against `/tmp/cnc-2026-07-05T18-16-00-194Z-manual.cncdump.json.zip`.
- [x] Fix `mac_verify.mjs --target=player-control` so it actually starts
      MD_USA01 before waiting for player-control predicates. The generated
      Mac-side probe now reuses the real Win32 message path to reveal the real
      shell menu, click `ButtonSinglePlayer` -> `ButtonUSA` -> `ButtonEasy`,
      and wait for the original `doGameStart()` / `MSG_NEW_GAME` debug
      counters to prove the Easy USA campaign was queued before running the
      long player-control frame loop. Verified with `node --check
      WebAssembly/harness/mac_verify.mjs`, `node
      WebAssembly/harness/mac_verify.mjs --no-build --target=title`
      (`ANGLE Metal Renderer: Apple M4`, 43 subsystems, title screenshot), and
      `node WebAssembly/harness/mac_verify.mjs --no-build
      --target=player-control`, which reported Apple M4 Metal,
      `playerControl: YES`, 3,150 frames, and saved
      `/home/agusx1211/cnc-mac-verify/mac-verify-player-control.png` showing
      the rendered MD_USA01 scene with HUD/control bar visible.
- [x] Re-green the `EXPECT_WASM=1` aggregate smoke after the
      `edgeMapperApply` heap-corruption failure. Bisection showed
      `edgeMapperApply` was only the first allocation to trip after earlier
      probe heap corruption; the live corruptors were mixed real/shim header
      probe TUs in `wasm_ww3d_render_probe.cpp` and
      `wasm_gui_mouse_stream_probe.cpp`. Forced `wasm_ww3d_scene_probe.cpp`,
      `wasm_ww3d_render_probe.cpp`, `wasm_edge_mapper_probe.cpp`, and
      `wasm_gui_mouse_stream_probe.cpp` through `wasm_prerts_real.h` plus
      real engine include dirs with `CNC_PORT_REAL_GAMELOGIC_HEADER=1`, and
      switched render-probe `GlobalData` handoffs to the real
      `TheWritableGlobalData` singleton. Verified with `ninja -t deps`
      proving real `Common/INI.h`, real `Common/GlobalData.h`, and real
      `PreRTS.h` for the render/GUI/edge probe objects, `git diff --check`,
      `npm --prefix WebAssembly run build:port`, and
      `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Move the Fable-audited direct real-engine `cnc-port` objects
      (`GameNetwork/Network.cpp`, `GameClient/Input/Keyboard.cpp`, and
      `Win32CDManager.cpp`) into the real-header lifecycle runtime. These
      sources no longer compile as executable-owned shim-layout objects;
      `zh_gameengine_real_lifecycle_runtime` owns them with real
      `Common/GlobalData.h`, and `Network.cpp` also uses real
      `GameLogic/GameLogic.h`, `Common/Xfer.h`, and `Common/GameAudio.h`.
      Verified with `npm --prefix WebAssembly run build:port`,
      `ninja -t cleandead`, targeted `ninja -t deps` checks proving the real
      headers, absence of the old direct `CMakeFiles/cnc-port.dir/...`
      objects, `git diff --check`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, and `node
      WebAssembly/harness/startup_vertical_smoke.mjs`.
- [x] Gate the remaining direct `cnc-port` mixed-ABI shadow-header risk. The
      executable now forces the real PreRTS / original `GlobalData` /
      original `GameLogic` prelude for direct objects, removes the probe-local
      fake `TheGlobalData` provider, adapts the GameNetwork probe to the
      original `GameLogic` frame layout, and uses a browser-owned
      `wasm_webbrowser_boundary.h` instead of the shadow
      `GameNetwork/WOLBrowser/WebBrowser.h` shim. Added
      `verify_cnc_port_real_headers.mjs` plus the package script
      `verify:cnc-port-real-headers`; the audit checks the actual Ninja
      `cnc-port` link inputs and fails direct objects that depend on any of
      the seven Fable-audited shadow headers. Current output: 44 direct
      `cnc-port` objects checked, 0 direct offenders, 167 linked archive
      offenders left as the next open cleanup. Also raised the startup-vertical
      wrapper stdout buffer so the 2 MB browser result parses instead of
      truncating at Node's default 1 MiB `spawnSync` cap. Verified with
      `npm --prefix WebAssembly run build:port`, `npm --prefix WebAssembly run
      build:startup-vertical`, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, `node
      WebAssembly/tools/run_startup_vertical_smoke.mjs`,
      `node --check WebAssembly/tools/verify_cnc_port_real_headers.mjs`,
      `node --check WebAssembly/tools/run_startup_vertical_smoke.mjs`, and
      `git diff --check`.
- [x] Burn down the linked real-header shadow dependency count from 167 to 19.
      Repointed the shared WOL browser compile bridge and
      `zh_gameengine_real_lifecycle_runtime` at the browser-owned
      `wasm_webbrowser_boundary.h` instead of the shadow
      `GameNetwork/WOLBrowser/WebBrowser.h` shim, which removed the large
      lifecycle offender group. Migrated `zh_gameclient_text` and
      `zh_win32_mouse_browser_real` to the real PreRTS / original
      `GlobalData` / original `GameLogic` header prelude with real source and
      library quote include ordering. Current `verify:cnc-port-real-headers`
      output: 44 direct `cnc-port` objects checked, 0 direct offenders, 19
      linked archive offenders left for the broader cleanup. Verified with
      `npm --prefix WebAssembly run build:port`, `npm --prefix WebAssembly run
      build:startup-vertical`, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, `node
      WebAssembly/tools/run_startup_vertical_smoke.mjs`, and
      `git diff --check`.
- [x] Delete the unused Fable-audited WOL WebBrowser shadow header. The
      compile bridge had already moved to the browser-owned
      `WebAssembly/src/wasm_webbrowser_boundary.h`; a fresh tracked-source and
      Ninja dependency audit found no users of
      `WebAssembly/shims/GameNetwork/WOLBrowser/WebBrowser.h`, so the stale
      same-include-path shim class header is gone instead of remaining as a
      future mixed-ABI footgun. The runtime WOL browser behavior remains open
      in TODO as a DOM/iframe/external-link browser contract. Verified with
      `npm --prefix WebAssembly run build:port`, `node --check
      WebAssembly/tools/verify_cnc_port_real_headers.mjs`, `npm --prefix
      WebAssembly run verify:cnc-port-real-headers`, `npm --prefix
      WebAssembly run verify:cnc-port-weak-stubs`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, and `git diff --check`.
- [x] Migrate `zh_w3d_device_utility` to the real-header prelude. The target
      now force-includes `wasm_prerts_real.h`, defines the original
      `GlobalData`/`GameLogic` header switches, and no longer uses the broad
      shim quote directory. Updated `w3d-device-utility-smoke` to link the
      original GlobalData/debug owners and to write user-data fixtures through
      the real `GlobalData::getPath_UserData()` path instead of shim-only
      setters. Current `verify:cnc-port-real-headers` output: 44 direct
      `cnc-port` objects checked, 0 direct offenders, 17 linked archive
      offenders left. Verified with `npm --prefix WebAssembly run build:port`,
      targeted `ninja -t deps` checks for `TileData.cpp` and `W3DFileSystem.cpp`
      proving the real headers, `ninja -C WebAssembly/build/wasm
      w3d-device-utility-smoke`, `node
      WebAssembly/dist/w3d-device-utility-smoke.cjs`, `npm --prefix
      WebAssembly run verify:cnc-port-real-headers`, `npm --prefix WebAssembly
      run verify:cnc-port-weak-stubs`, `npm --prefix WebAssembly run
      build:startup-vertical`, `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`,
      `node WebAssembly/tools/run_startup_vertical_smoke.mjs`, and
      `git diff --check`.
- [x] Burn down the linked real-header shadow dependency count from 17 to 7.
      Moved the INI science compatibility provider from
      `WebAssembly/shims/INICommonCompat.cpp` to
      `WebAssembly/src/wasm_ini_common_compat.cpp` so the provider resolves
      real `PreRTS.h` / `Common/INI.h` while preserving its existing symbols.
      Migrated `zh_winmain_wndproc_browser` to `wasm_prerts_real.h` with
      real `GlobalData` / `GameLogic` header switches and quote dirs that keep
      only the intentional narrow WndProc/Win32GameEngine shims ahead of the
      real engine headers. Migrated `zh_window_layout_script_runtime` to the
      real PreRTS/header prelude. Current `verify:cnc-port-real-headers`
      output: 44 direct `cnc-port` objects checked, 0 direct offenders, 7
      linked archive offenders left, all in `zh_w3d_terrain_probe_runtime`
      through the broad `ZH_GAMELOGIC_PRERTS_FRONTIER_SOURCES` source-file
      `shims/PreRTS.h` override. Verified with `npm --prefix WebAssembly run
      build:port`, focused `zh_gameengine_common_core`,
      `zh_winmain_wndproc_browser`, and `zh_window_layout_script_runtime`
      builds, targeted `ninja -t deps` checks proving the migrated objects use
      real audited headers, `node WebAssembly/dist/winmain-wndproc-mouse-smoke.cjs`,
      `node dist/w3d-window-layout-script-smoke.cjs` from `WebAssembly/`,
      `npm --prefix WebAssembly run verify:cnc-port-real-headers`, `npm
      --prefix WebAssembly run verify:cnc-port-weak-stubs`, `npm --prefix
      WebAssembly run build:startup-vertical`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, `node
      WebAssembly/tools/run_startup_vertical_smoke.mjs`, and `git diff --check`.
- [x] Burn down the linked real-header shadow dependency count from 7 to 0 and
      enforce the linked gate. Migrated `zh_w3d_terrain_probe_runtime` from its
      partial real `GlobalData` force-include to the full
      `wasm_prerts_real.h` / original `GameLogic` prelude, removing the last
      linked archive dependencies on the audited shadow
      `Common/INI.h`/`Common/STLTypedefs.h` headers. The inherited legacy
      source-file `shims/PreRTS.h` override is still visible on non-linked
      frontier/probe paths, but every `cnc-port` direct and linked object now
      resolves the ABI-sensitive engine headers to the real originals. Updated
      `verify:cnc-port-real-headers` to pass `--fail-on-linked` by default.
      Verified with `ninja -C WebAssembly/build/wasm
      zh_w3d_terrain_probe_runtime`, targeted `ninja -t deps` checks for
      `ScriptEngine.cpp`, `WeaponSet.cpp`, and `BridgeBehavior.cpp`, and `npm
      --prefix WebAssembly run verify:cnc-port-real-headers`
      reporting 44 direct objects, 53 linked archive targets, 0 direct
      offenders, and 0 linked offenders.
- [x] Remove the legacy `shims/PreRTS.h` source-file fallback from the real
      compile frontier. Changed `ZH_GAMELOGIC_PRERTS_FRONTIER_SOURCES` and
      `ZH_LEGACY_GAMESPY_PRERTS_FRONTIER_SOURCES` to force-include
      `wasm_prerts_real.h` instead of shim `PreRTS.h`, and moved
      `gamelogic-new-game-dispatch-smoke` from its explicit
      `Common/GlobalData.h` + shim `PreRTS.h` prelude to the same real prelude
      with the original `GameLogic` header switch. `zh_gameengine_real_compile_frontier`
      now has zero audited shadow-header deps, and representative
      `ScriptEngine.cpp`, `GameLogic.cpp`, `WeaponSet.cpp`, `GameSpyGP.cpp`,
      and `zh_w3d_terrain_probe_runtime` objects resolve the ABI-sensitive
      engine headers to the real originals. Verified with focused
      `zh_gameengine_real_compile_frontier`,
      `zh_gameengine_real_object_ini_runtime`, and
      `gamelogic-new-game-dispatch-smoke` builds, targeted `ninja -t deps`
      checks, `npm --prefix WebAssembly run build:port`, `npm --prefix
      WebAssembly run build:startup-vertical`, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`,
      `node WebAssembly/tools/verify_gamelogic_new_game_dispatch_frontier.mjs`,
      `node WebAssembly/tools/run_startup_vertical_smoke.mjs`, and
      `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs`.
- [x] Migrate the GameClient utility and W3D window-manager legacy smokes to
      the real PreRTS/header prelude. `zh_gameclient_utility` now uses
      `src/wasm_ini_mapped_image_compat.cpp` instead of
      `shims/INICompat.cpp`, forces original `GlobalData`/`GameLogic` headers,
      and gives `VideoStream.cpp` the real prelude. `gameclient-utility-smoke`
      now links the original GlobalData/debug owners and a narrow real-layout
      INI parser support file for the utility coverage it exercises.
      `w3d-gamewindow-manager-smoke` now force-includes `wasm_prerts_real.h`,
      links the GUI input runtime instead of the broad utility archive, and
      gets focused real-layout `Display`/`FontLibrary`/`ImageCollection`
      support instead of a local fake `TheGlobalData`. After `ninja -t
      cleandead`, `zh_gameclient_utility`, `gameclient-utility-smoke`, and
      `w3d-gamewindow-manager-smoke` all audit at 0 shadow-header offender
      objects; the remaining non-frontier offenders are
      `w3d-window-layout-script-smoke` and
      `zh_gameclient_gui_input_shim_runtime`. Verified with focused Ninja
      builds for `zh_gameclient_utility`, `gameclient-utility-smoke`,
      `w3d-gamewindow-manager-smoke`, and `w3d-window-layout-script-smoke`;
      `node WebAssembly/dist/gameclient-utility-smoke.cjs`, `node
      WebAssembly/dist/w3d-gamewindow-manager-smoke.cjs`, `node
      dist/w3d-window-layout-script-smoke.cjs` from `WebAssembly/`, `npm
      --prefix WebAssembly run build:port`, `npm --prefix WebAssembly run
      test:startup-vertical`, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`, and `git diff --check`.
- [x] Remove the last named non-frontier mixed-header offender targets.
      Deleted the duplicate `zh_gameclient_gui_input_shim_runtime` archive now
      that the same source set already builds as
      `zh_gameclient_gui_input_runtime` under the real PreRTS/header prelude.
      Migrated `w3d-window-layout-script-smoke` to link that real GUI-input
      archive, force the real prelude/original `GlobalData` and `GameLogic`
      header switches, use the real GlobalData/debug owners, and reuse focused
      real-layout INI support. The smoke's local singleton now writes
      `TheWritableGlobalData` instead of owning shim `TheGlobalData`; its
      focused GameLogic support keeps original object behavior by default and
      enables a no-object path only for this layout smoke. After `ninja -t
      cleandead`, a focused Ninja deps audit across
      `w3d-window-layout-script-smoke`, `zh_gameclient_gui_input_runtime`, and
      the removed shim runtime reports 0 audited shadow-header offender
      objects. Verified with `ninja -C WebAssembly/build/wasm
      w3d-window-layout-script-smoke`, `node
      dist/w3d-window-layout-script-smoke.cjs` from `WebAssembly/`, `npm
      --prefix WebAssembly run build:port`, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`, the focused `ninja -t deps` offender audit,
      and `git diff --check`.
- [x] Migrate the Win32 mouse/input smokes to the real-header mouse runtime.
      `win32-mouse-smoke`, `win32-mouse-cursor-smoke`, and
      `gamewindow-input-smoke` now force `wasm_prerts_real.h`, define the
      original `GlobalData`/`GameLogic` header switches, and link
      `zh_win32_mouse_browser_real` plus the same real GlobalData/debug and
      narrow INI support used by `gameclient-utility-smoke`. The focused smoke
      fixtures now write `TheWritableGlobalData`; the cursor smoke initializes
      the original memory manager before constructing real `GlobalData`.
      `zh_win32_mouse_browser_real` now shares the already-real
      `zh_gameclient_utility` closure instead of the smaller GUI-input archive,
      matching the symbols these smokes already exercised without returning to
      shim `PreRTS.h`. Verified with focused Ninja builds for the three smokes,
      a focused `ninja -t deps` audit across the migrated smoke objects and
      `zh_win32_mouse_browser_real` reporting 0 audited shadow-header offenders,
      `node WebAssembly/dist/win32-mouse-smoke.cjs`, `node
      WebAssembly/dist/win32-mouse-cursor-smoke.cjs`, `node
      WebAssembly/dist/gamewindow-input-smoke.cjs`, `npm --prefix WebAssembly
      run verify:cnc-port-real-headers`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`, and `npm --prefix WebAssembly run
      build:port`.
- [x] Migrate the Win32 keyboard smokes to the real-header keyboard runtime.
      `win32-keyboard-smoke` and `win32-keyboard-focus-repeat-smoke` now force
      `wasm_prerts_real.h`, define the original `GlobalData`/`GameLogic`
      header switches, and link the already-real `zh_gameclient_utility`
      closure plus original GlobalData/debug owners and focused real-layout INI
      support. The keyboard fixtures now write `TheWritableGlobalData` instead
      of owning a shim-layout `TheGlobalData` symbol. Verified with focused
      Ninja builds for both smokes, a focused `ninja -t deps` audit reporting
      0 audited shadow-header offenders, both Node smoke executables, `npm
      --prefix WebAssembly run verify:cnc-port-real-headers`, `npm --prefix
      WebAssembly run verify:cnc-port-weak-stubs`, and `npm --prefix
      WebAssembly run build:port`.
- [x] Retire the obsolete Win32 mouse/WndProc shim target trio and migrate the
      Win32GameEngine message-pump smokes to the real-header prelude. Removed
      unused/superseded `zh_win32_mouse`, `zh_win32_mouse_browser`, and
      `zh_winmain_wndproc` so the old shim-only Win32 mouse/WndProc path is no
      longer a default-build artifact. `zh_win32_gameengine_message_pump` now
      force-includes `wasm_prerts_real.h`, defines the original
      `GlobalData`/`GameLogic` header switches, and keeps only the narrow
      Win32GameEngine shim ahead of the real engine headers. The
      `win32-gameengine-message-pump-smoke`,
      `win32-gameengine-lifetime-smoke`,
      `win32-gameengine-original-lifetime-smoke`, and
      `winmain-wndproc-mouse-smoke` targets now use the same real-header
      prelude; the WndProc smoke links the already-real
      `zh_winmain_wndproc_browser`/`zh_win32_mouse_browser_real` path, original
      GlobalData/debug owners, and focused real-layout INI support. Verified
      with focused Ninja builds for all four smokes, all four Node smoke
      executables, `ninja -t cleandead`, a focused deps audit reporting 0
      audited shadow-header offenders, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`, `npm --prefix WebAssembly run build:port`,
      and `npm --prefix WebAssembly run build:startup-vertical`.
- [x] Remove the final explicit CMake shim `PreRTS.h` source-file overrides
      from the hot runtime set. `Win32CDManager.cpp`,
      `wasm_win32_gameengine_probe.cpp`,
      `wasm_function_lexicon_runtime.cpp`,
      `wasm_module_factory_runtime.cpp`, and
      `wasm_particle_system_runtime.cpp` no longer force-include
      `shims/PreRTS.h` or carry duplicated real-engine quote paths in their
      source-local properties; they inherit the real-header target preludes
      instead. A focused `ninja -t deps` audit across the migrated direct and
      lifecycle objects reports zero hits on the seven Fable-audited shadow
      headers, while representative deps show `wasm_prerts_real.h` and the
      original engine headers. Verified with `npm --prefix WebAssembly run
      build:port`, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`, and `npm --prefix WebAssembly run
      build:startup-vertical`.
- [x] Delete the last unguarded W3D terrain-stub smudge helper bodies from the
      real `cnc-port` direct object. `wasm_ww3d_terrain_probe_stubs.cpp` no
      longer emits the unused `cnc_port_w3d_smudge_*` no-op helpers; `rg`
      found no callers, and the original `Smudge.cpp` / `W3DSmudge.cpp`
      objects provide the real smudge owners. The weak-stub verifier still
      reports 186 tracked weak declarations, zero compiled weak definitions,
      186 gated-out declarations, zero active weak boundaries, and zero
      strong-provider overlaps. Direct `llvm-nm` checks show the
      `wasm_ww3d_terrain_probe_stubs.cpp.o` object no longer defines the
      `cnc_port_w3d_smudge_*` helper symbols. Verified with `npm --prefix
      WebAssembly run build:port`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, `npm --prefix WebAssembly run
      build:startup-vertical`, and `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`.
- [x] Broaden the `cnc-port` weak-stub verifier to the direct GameNetwork,
      WndProc, and startup probe objects, then gate the WndProc/startup
      fallbacks now that the real owners are linked. The tracked explicit weak
      declaration count is now 264; the audit reports 78 compiled weak
      definitions, 192 gated-out declarations, zero active weak boundaries, 76
      strong-provider overlaps, and 2 no-final-visible helpers. WndProc and
      startup now contribute zero compiled tracked weak definitions; the
      remaining compiled tracked weak surface is all in
      `wasm_gamenetwork_probe.cpp`, with `outputCRCDebugLines()` and
      `outputCRCDumpLines()` as the no-final-visible helpers. The archive-owned
      INI compatibility weak shims remain outside this direct-object verifier
      and are recorded as the next archive-aware audit cleanup. Verified with
      `npm --prefix WebAssembly run build:port`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`, direct `llvm-nm` checks for the WndProc and
      startup fallback symbols, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, `npm --prefix WebAssembly run
      build:startup-vertical`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, `node --check
      WebAssembly/tools/verify_cnc_port_weak_stubs.mjs`, and `git diff
      --check`.
- [x] Gate the direct GameNetwork probe weak fallback surface out of the real
      `cnc-port` runtime. `cnc-port` now defines
      `CNC_PORT_LINKS_REAL_GAMENETWORK_OWNERS`, so
      `wasm_gamenetwork_probe.cpp` keeps extern declarations for the real
      GameNetwork/GameClient/Common owners but no longer emits weak storage or
      fallback bodies for the GameNetwork globals, `DisconnectMenu`,
      `GameState`, `MapCache`, LAN menu callbacks/preferences, shell helpers,
      thread string converters, or the debug-only CRC no-op helpers in the real
      link. The weak-stub verifier now reports all 264 tracked explicit weak
      declarations gated out, zero compiled weak definitions, zero
      strong-provider overlaps, and zero no-final-visible helpers. The
      archive-owned INI compatibility weak shims remain outside this
      direct-object verifier and are still tracked as the next archive-aware
      cleanup. Verified with `npm --prefix WebAssembly run build:port`,
      `npm --prefix WebAssembly run verify:cnc-port-weak-stubs`, focused
      `llvm-nm` checks on `wasm_gamenetwork_probe.cpp.o`, `npm --prefix
      WebAssembly run verify:cnc-port-real-headers`, `npm --prefix WebAssembly
      run build:startup-vertical`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, `node
      WebAssembly/tools/run_startup_vertical_smoke.mjs`, and `git diff
      --check`.
- [x] Make the weak-stub verifier archive-aware and gate the archive-owned INI
      compatibility weak fallbacks out of the real `cnc-port` runtime.
      `WebAssembly/tools/verify_cnc_port_weak_stubs.mjs` now tracks linked
      archive members as well as direct `CMakeFiles/cnc-port.dir/src/*.o`
      objects, asserts the tracked archives are current link inputs, and
      filters `llvm-nm --print-file-name` output to the intended member. The
      tracked archive members are
      `libzh_gameengine_real_ini_runtime.a:wasm_real_ini_compat.cpp.o`,
      `libzh_gameengine_real_ini_runtime.a:wasm_real_ini_probe.cpp.o`, and
      `libzh_gameclient_utility.a:wasm_ini_mapped_image_compat.cpp.o`.
      `zh_gameengine_real_ini_runtime` and `zh_gameclient_utility` now define
      `CNC_PORT_LINKS_REAL_INI_COMPAT_OWNERS`, so those files keep extern
      declarations but no longer emit weak INI/global fallback bodies when they
      are linked into `cnc-port`. The weak-stub verifier now reports 285
      tracked explicit weak declarations, zero compiled weak definitions, 285
      gated-out declarations, zero active weak boundaries, zero strong-provider
      overlaps, and zero no-final-visible helpers. Verified with `npm --prefix
      WebAssembly run build:port`, `npm --prefix WebAssembly run
      verify:cnc-port-weak-stubs`, focused archive-member `llvm-nm` checks,
      `npm --prefix WebAssembly run verify:cnc-port-real-headers`, `npm
      --prefix WebAssembly run build:startup-vertical`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, `node
      WebAssembly/tools/run_startup_vertical_smoke.mjs`, `node --check
      WebAssembly/tools/verify_cnc_port_weak_stubs.mjs`, and `git diff
      --check`.
- [x] Move `gameengine-header-case-smoke` off the active Fable shadow-header
      path. The target now force-includes `wasm_prerts_real.h`, defines the
      original `GlobalData` / `GameLogic` header switches, and adds quote
      include dirs so its intentionally odd-case include wrappers still
      resolve into the original engine headers. Verified with
      `cmake --build WebAssembly/build/wasm --target
      gameengine-header-case-smoke`, `node
      WebAssembly/dist/gameengine-header-case-smoke.cjs`, and a focused
      `ninja -t deps` audit proving it no longer depends on
      `shims/Common/{GlobalData,INI,STLTypedefs,GameAudio,Xfer}.h` or
      `shims/GameLogic/GameLogic.h`; the remaining active `Xfer.h` and
      `GameLogic.h` shadow users are down to `gameengine-common-core-smoke`
      only.
- [x] Move `gameengine-common-core-smoke` off the active Fable shadow-header
      path. The target now force-includes `wasm_prerts_real.h`, defines the
      original `GlobalData` / `GameLogic` header switches, links the original
      `GlobalData` and debug owners, and puts the real INI runtime before
      `zh_gameengine_common_core` so original `INI.cpp` satisfies parser
      symbols before the legacy compat archive can be pulled. The smoke now
      writes fixtures through `TheWritableGlobalData` and
      `GlobalData::getPath_UserData()`, exercises the multi-field builder
      directly instead of calling real INI with a null target, and keeps
      CD-manager coverage below the live `GameLogic::getFrame()` boundary
      already covered by the real lifecycle. Verified with
      `cmake --build WebAssembly/build/wasm --target
      gameengine-common-core-smoke`, `node
      WebAssembly/dist/gameengine-common-core-smoke.cjs`, `npm --prefix
      WebAssembly run build:port`, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, and a full focused `ninja -t deps` audit:
      the smoke now uses real `Common/{GlobalData,INI,STLTypedefs,GameAudio,Xfer}.h`
      and real `GameLogic/GameLogic.h`. The remaining active shadow-header
      counts are `GlobalData.h` / `INI.h` / `STLTypedefs.h` at 22 object users,
      `GameAudio.h` at 3, and `Xfer.h` plus `GameLogic/GameLogic.h` at zero
      active build-dep users.
- [x] Delete the retired `Common/Xfer.h` and `GameLogic/GameLogic.h` shadow
      headers. The odd-case `GameLOgic`/`Gamelogic` wrappers now use
      `include_next` to reach the original header, and
      `verify_cnc_port_real_headers.mjs` treats both deleted paths as retired
      stale-dependency failures. Full `build:wasm` exposed one remaining
      shim-era consumer, so `gamenetwork-core-smoke` now force-includes the
      real prelude, uses the original `TheWritableGlobalData` owner, and links
      the real debug runtime; the legacy GameClient/Bink smokes now link a
      real-header INI support archive instead of relying on the retired Xfer
      shadow. Verified with `cmake --build WebAssembly/build/wasm --target
      gamenetwork-core-smoke`, `node WebAssembly/dist/gamenetwork-core-smoke.cjs`,
      `cmake --build WebAssembly/build/wasm --target gameclient-utility-smoke
      bink-videoplayer-runtime-smoke bink-videoplayer-browser-runtime-smoke
      bink-w3d-video-buffer-browser-smoke`, `npm --prefix WebAssembly run
      build:wasm`, `npm --prefix WebAssembly run verify:cnc-port-real-headers`,
      `npm --prefix WebAssembly run verify:cnc-port-weak-stubs`,
      `npm --prefix WebAssembly run verify:gamelogic-new-game-dispatch-frontier`,
      `node WebAssembly/dist/gameclient-utility-smoke.cjs`, `EXPECT_WASM=1 node
      WebAssembly/harness/smoke.mjs`, `git diff --check`, and a fresh
      `ninja -t deps` audit showing `GlobalData.h` / `INI.h` /
      `STLTypedefs.h` at 21 object users, `GameAudio.h` at 3, and no active
      `Common/Xfer.h` or `GameLogic/GameLogic.h` shadow users.
- [x] Delete the retired `Common/GameAudio.h` shadow header after migrating the
      three remaining Bink smoke users to the real PreRTS/header prelude. The
      Bink VideoPlayer Node/browser smokes and Bink W3D video-buffer browser
      smoke now link the original GlobalData/debug owners, write the original
      `TheWritableGlobalData` singleton instead of owning a shim-layout
      `TheGlobalData`, and keep their focused local `AudioManager` stubs.
      `bink_w3d_video_buffer_upload_smoke.cpp` now includes the WWLib
      `Vector.H` dependency that real `render2d.h` requires instead of
      inheriting it from the shadow prelude. The real-header verifier treats
      `Common/GameAudio.h` as a retired stale-dependency failure. Verified with
      `cmake --build WebAssembly/build/wasm --target
      bink-videoplayer-runtime-smoke bink-videoplayer-browser-runtime-smoke
      bink-w3d-video-buffer-browser-smoke`, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, and a fresh `ninja -t deps` audit showing
      `GlobalData.h` / `INI.h` / `STLTypedefs.h` at 18 object users and no
      active `Common/GameAudio.h`, `Common/Xfer.h`, or
      `GameLogic/GameLogic.h` shadow users. The direct Node Bink smoke still
      exits nonzero on its pre-existing asset/copy-hook gate, though it reaches
      the GC/VS frame checks.
- [x] Burn down the remaining Fable shadow-header smoke surface from 18 object
      users to 3 by migrating the WW3D2 / WWShade mapper, texture, light,
      DX8Wrapper, ShatterPlanes, and shipped-mesh smoke batch to the real
      PreRTS/header prelude. A target list now applies
      `wasm_prerts_real.h`, original GlobalData/GameLogic header switches, and
      real quote dirs to the batch. The shipped-mesh smoke no longer owns
      shim-layout `TheGlobalData` or `TheAudio`, links the original
      GlobalData/debug owners, and the asset-manager smokes include WWLib
      `Vector.H` before `assetmgr.h` so the real header contract is explicit.
      Verified with the focused 15-target CMake build, `npm --prefix
      WebAssembly run verify:cnc-port-real-headers`, representative Node
      smokes (`matrixmapper-apply`, `ww3d2-texture-loader`,
      `wwshade-cubemap-apply`, `ww3d2-shatterplanes-loader`), the shipped-mesh
      smoke against `WebAssembly/artifacts/real-assets/W3DZH.big`, and a fresh
      `ninja -t deps` audit showing only `gameengine-real-big-smoke`,
      `gameengine-real-big-browser-smoke`, and
      `gamenetwork-download-manager-smoke` still use
      `shims/Common/{GlobalData,INI,STLTypedefs}.h`.
- [x] Finish and delete the Fable-audited mixed-ABI common shadow-header
      system. `gamenetwork-download-manager-smoke`,
      `gameengine-real-big-smoke`, and `gameengine-real-big-browser-smoke`
      now force the real PreRTS/header prelude, link the original
      GlobalData/debug owners, and no longer define shim-layout
      `TheGlobalData`; `gameengine_real_big_smoke.cpp` also no longer owns a
      fake `TheAudio`. With the final three objects migrated, a fresh deps
      audit reported zero users of `shims/Common/{GlobalData,INI,STLTypedefs}.h`,
      so those headers were deleted and moved into
      `verify_cnc_port_real_headers.mjs`'s retired stale-dependency list. This
      closes the active `shims/Common/{GlobalData,INI,STLTypedefs,GameAudio,Xfer}.h`,
      `shims/GameLogic/GameLogic.h`, and
      `shims/GameNetwork/WOLBrowser/WebBrowser.h` mixed-ABI hazard; the
      remaining TODO is only to keep the verifier gate from regressing.
      Verified with `cmake --build WebAssembly/build/wasm --target
      gamenetwork-download-manager-smoke gameengine-real-big-smoke
      gameengine-real-big-browser-smoke`, `node
      WebAssembly/dist/gamenetwork-download-manager-smoke.cjs`, `node
      WebAssembly/dist/gameengine-real-big-smoke.cjs
      WebAssembly/artifacts/real-assets/INIZH.big`, `npm --prefix
      WebAssembly run build:port`, `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`, and a final `ninja -t deps` audit with no
      hits on the seven retired shadow headers.
- [x] Make the original frame-owner reset RPCs safe as the first
      original-memory-manager users after boot. The keyboard frame owner no
      longer constructs a throwaway original `GlobalData` just to warm an
      empty keyboard stream; it reuses an existing global when one is present
      and otherwise leaves the keyboard/mouse reset path independent of
      original `GlobalData` construction. Verified with a fresh Playwright
      boot followed immediately by `resetOriginalKeyboardFrameInput` and
      `resetOriginalMouseFrameInput`, plus `EXPECT_WASM=1 node
      harness/smoke.mjs`.
- [x] Fix the plain `node harness/smoke.mjs` WW3D statistics teardown crash by
      making focused WW3D probes mirror `W3DDisplay` statistics cleanup before
      `WW3D::Shutdown()`. Verified with `npm run build:wasm`,
      `node harness/smoke.mjs`, and `EXPECT_WASM=1 node harness/smoke.mjs`.
- [x] Re-stabilize the aggregate browser render smoke and vertical umbrella
      after the AABox WebGL2 gate regressed. The focused AABox and
      scene-camera probes now frame their original `AABoxRenderObjClass` with
      an explicit `CameraClass` transform before rendering, the browser D3D8
      bridge now trusts original Render2D identity-clip index winding instead
      of flipping cull face, and the EdgeMapper browser probe seeds a distinct
      texture transform before measuring original `EdgeMapperClass::Apply` so
      the long-lived browser module proves the real `D3DTS_TEXTURE1`
      `SetTransform` emission. Verified with the wasm `cnc-port` build, the
      `EXPECT_WASM=1` aggregate smoke, `test:vertical-integrations`, the
      shroud terrain scene smoke, and the bridge-buffer terrain scene smoke.
- [x] **Reverted the `d3d8DiagLevel="lite"` default flip (26e79bc → revert
      6726096).** The flip had deleted the guard comment ("Never change the
      default: existing gates depend on 'full'") and broke probe assertions
      (`browserProbe`/`centerPixel` null) in `harness/smoke.mjs` and ~21
      display/terrain smokes, while buying the player page nothing — play.mjs
      already forces lite itself. `full` default and guard comment restored;
      the `?diag=` / `__cncSetDiagLevel` opt-in machinery and the play-page
      lite perf win are kept. Found by the 2026-07-04 adversarial audit
      (verified live against the build, both modes).

## Cross-cutting: project hygiene

- [x] Delete the dead alternate `Object` implementation in
      `WebAssembly/src/wasm_terrain_probe_object.cpp`. The 1,289-line file
      defined shadow `Object` behavior (`addThreat`,
      `reactToTransformChange`, etc.) but was referenced by no CMake target,
      generated Ninja rule, or tracked source outside the Fable TODO. Verified
      with `rg -n "wasm_terrain_probe_object"` over tracked source/build files
      and generated `WebAssembly/build/wasm/build.ninja` before removal, plus
      `npm --prefix WebAssembly run build:port` after removal.
- [x] Clean up stale completed entries in `TODO.md`. The resolved MD_USA01
      player-control and black-terrain strategy-pivot entries were already
      fully recorded in `DONE.md`, so `TODO.md` now carries only open work in
      that section. The remaining ControlBar/HUD item was narrowed after the
      LeftHUD radar proof, and the next attack/attack-move interaction proof is
      listed explicitly under M6. Verified with `rg` against `TODO.md` /
      `DONE.md` and `git diff --check`.
