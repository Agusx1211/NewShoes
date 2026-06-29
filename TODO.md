# TODO.md — Open port checklist

Open, living checklist for porting C&C Generals: Zero Hour to WebAssembly.
Grouped by milestone (see `PROJECT.md`). `[ ]` = not started or still in
progress. Completed checklist history lives in `DONE.md` so agents can load the
active plan cheaply and search the completed history only when needed.
Deferred experiments and longer design notes live in `IDEAS.md`; promote only
the next concrete action here when they become current work.

Keep it honest: nothing rendering-related is "done" until the **harness boots
the build and a screenshot or state check proves it** (see `AGENTS.md` "Don't
work blind").

Primary target is `GeneralsMD/Code` (Zero Hour). `Generals/Code` (base game)
shares structure and follows behind.

---

## M0 — Build skeleton & asset pipeline

### Asset pipeline
- [ ] Resolve the remaining startup-file gaps reported by
      `npm run inventory:startup-archives` before declaring the exact minimum
      original boot archive set. The current extracted Zero Hour runtime
      archive candidates for known startup paths are `INIZH.big`,
      `EnglishZH.big`, `W3DEnglishZH.big`, and `MapsZH.big`, but default INI
      files, `Data\INI\Rank.ini`, and `Data\INI\CommandMap.ini` are still
      absent from the indexed asset set; use the inventory `missingByReason`
      output to separate optional base-archive absence from real archive gaps.

---

## M1 — Compile the platform-independent core

### Compatibility shims
- [ ] DirectX 8 / DX90SDK header shim so engine code that includes it compiles.
- [ ] Win32 type/macro shim (`HWND`, `DWORD`, `__cdecl`, `LARGE_INTEGER`, etc.).
- [ ] STLport → libc++ migration pass (apply/replace `stlport.diff` as needed).
- [ ] Replace/neutralize MSVC-specific pragmas, `__forceinline`, SEH, inline asm.
- [ ] Replace the current browser `FastCriticalSectionClass` spin lock with a
      pthread-aware yield/wait path before enabling shared-memory wasm threads.
- [ ] Continue the legacy enum-forward audit for the remaining original
      GameLogic/Object/Team/Thing headers, using fixed underlying types or
      real definition includes where the original enum contract is known.
- [ ] Audit 32-bit assumptions: struct packing, `int`/`long` sizes, alignment.
- [ ] Define and verify the browser-port `WCHAR`/UTF-16 compatibility contract
      before compiling wide-string serialization and save/load paths.
- [ ] Endianness audit for serialization paths (save game, net, CRC).

### Libraries (compile as-is where possible)
- [ ] Full `Compression` manager (RefPack/zlib/LZH/etc.) compiles and is
      unit-checked against real BIG data.
- [ ] Restore or port the missing bundled `Compression/ZLib` and
      `Compression/LZHCompress/CompLibSource` bodies so the existing
      `CompressionManager` zlib and Nox LZH branches can be enabled under wasm.
- [ ] Decide whether `CPUDetectClass` should expose browser
      `hardwareConcurrency`/device-memory hints later, or keep reporting only
      the conservative wasm capability contract.
- [ ] Retire the target-local `WebAssembly/shims/mutex.h` class definitions
      once the broad focused targets link `zh_wwlib_mutex` wherever they use
      original `MutexClass` / `CriticalSectionClass` out-of-line methods.
- [ ] Re-target original WWLib `ThreadClass::Execute`/`Stop` to the final
      browser pthread/Web Worker contract before enabling GameSpy, audio, or
      file worker threads; the current `_UNIX` wasm build intentionally keeps
      native thread start idle.
- [ ] Retire the browser-only narrow `Win32Mouse`/`Mouse` shim used by the
      `cnc-port` WndProc harness once the main executable can link the full
      original GameClient mouse/control-bar surface without duplicate command
      button runtime symbols.
- [ ] Decide whether original WWLib mono debug output should remain dormant in
      browser builds or route through the harness/browser console before
      relying on it for runtime diagnostics.
- [ ] Port the full optimizing original LCW back-reference compressor if
      compressed-output size parity becomes required; the current non-MSVC
      fallback emits valid LCW literal packets accepted by the original
      decompressor.
- [ ] Replace the current browser no-resource/no-registry WWLib fallbacks with
      a real resource lookup and persistence contract before relying on
      `ResourceFileClass` or `RegistryClass` for runtime settings/data.
- [ ] Replace the current `LaunchWebBrowser` no-native-process fallback with a
      harness-observable `window.open` / external-link browser bridge before
      relying on original URL-launching UI flows.
- [ ] Compile remaining original WWLib DirectDraw-backed 2D conversion helpers
      (`convert.cpp`, `dsurface.cpp`) after the browser `DSurface`/pixel-format
      abstraction is defined, instead of stubbing draw behavior.
- [ ] Add a render-backed `WWFontClass::Print` smoke once the original
      `ConvertClass`/`DSurface` pixel conversion path is available under wasm.
- [ ] Full `WWVegas/WWLib` (containers, string, ini, file abstractions)
      compiles.
- [ ] Full `WWVegas/WWDebug` (`wwmemlog.cpp`, `wwprofile.cpp`) compiles and
      routes asserts/logs to the browser console/harness.
- [ ] Retire or narrow the current generic `wwprofile.h` no-op macro shim once
      all profile consumers link the original profiling manager target.

### GameEngine — Common
- [ ] Replace the target-local `Common/INI.h`, `Common/Xfer.h`,
      `Common/GlobalData.h`, and `GameLogic/GameLogic.h` compile shims with the
      original headers/sources as each real subsystem comes online.
- [ ] Link and smoke-test original `Common/Xfer` and save-game behavior after
      `GameState`, `GameStateMap`, real `GlobalData`, browser persistence, and
      the full snapshot subsystem can link into the runtime.
- [ ] Link and smoke-test the real-header memory/file/archive/system leaves
      after the browser archive/audio/persistence singleton contracts replace
      the current target-local smoke globals.
- [ ] Replace the current `FileSystem` smoke globals with the final browser
      archive/audio singleton contracts, then harness-test music archive
      load/unload and asset lookup through fetched browser archives.
- [ ] Extend the browser MEMFS real-asset smoke from `INIZH.big` to the exact
      minimum boot archive set once engine startup uses fetched archives.
- [ ] Re-run original `DataChunkOutput` write/temp-file coverage after the real
      `GlobalData` user-data directory and browser persistence layer replace
      the current target-local `Common/GlobalData.h` shim.
- [ ] Link and smoke-test original release-crash reporting and function-lexicon
      callback lookup after browser assert/dialog routing, `GameWindowManager`,
      and the real GUI callback runtime are linked without compile-only
      prompt/window shims.
- [ ] Link and smoke-test `DynamicAudioEventInfo` after original
      `INIAudioEventInfo`/`AudioEventInfo` metadata, the original INI parse
      surface, and the real audio manager path are available without
      target-local stubs.
- [ ] Link and smoke-test `MusicTrack` / `MusicManager` behavior after the
      missing original `MusicTrack` constructor path is resolved and the real
      audio manager request path is available.
- [ ] Link and smoke-test the original `GameAudio` / `GameSounds` manager
      paths after the real audio manager, object lookup, INI reader, Xfer, and
      GameLogic singleton surfaces replace the current target-local shims.
- [ ] Link and smoke-test the original audio INI parser routes after the real
      `Common/INI.cpp` reader, audio manager, and full runtime singleton
      surface are available without target-local parser stubs.
- [ ] Replace the focused AIData runtime's metadata-only AI/pathfinder
      compatibility path with full original AI/pathfinder ownership once
      `GameLogic/Pathfinder` can link into runtime startup.
- [ ] Replace the focused browser INI runtime's weak fail-fast unused INI block
      parser definitions with the real parser destinations as each owning
      singleton comes online; they exist only to keep the focused `Armor`,
      `GameData`, `Science`, `SpecialPower`, `Multiplayer`, `Water`, `Weather`,
      `Video`, `Upgrade`, and shipped map-cache preflights on original
      `INI.cpp::load`
      without pulling unrelated UI/terrain/object managers into `cnc-port`.
- [ ] Replace the focused shipped special-power runtime's weak `TheAudio`
      compatibility singleton and Emscripten-only null audio-info guard with the
      real browser audio manager once audio event metadata and playback are
      linked; the current preflight preserves event names but does not populate
      `AudioEventInfo`.
- [ ] Replace the focused shipped special-power runtime's weak `TheControlBar`
      compatibility singleton with original ControlBar/UI ownership once the
      control-bar runtime can link without compile-only UI dependencies.
- [ ] Replace the focused shipped map-cache runtime's local `TheMapCache` and
      `TheKey_InitialCameraPosition` compatibility definitions with the original
      `MapUtil.cpp` / `WorldHeightMap.cpp` ownership once those runtime surfaces
      can link without compile-only UI/map-loader dependencies.
- [ ] Replace the focused shipped water runtime's weak `TheTerrainVisual`
      compatibility definition with original `TerrainVisual.cpp` ownership once
      terrain visual/map-loading runtime surfaces can link without renderer
      dependencies.
- [ ] Replace the focused shipped player-template runtime's weak
      `TheMappedImageCollection` compatibility definition with original mapped
      image collection ownership once mapped image/UI asset loading is linked;
      the current preflight verifies public template metadata but does not
      resolve private image IDs to `Image` instances.
- [ ] Wire DamageFX preflight lookup against the loaded startup `FXListStore`
      and replace the weak `Object::getVeterancyLevel` bridge with original
      object / experience ownership once FX playback and object runtime can
      link without renderer/audio/gameplay stubs.
- [ ] Link and smoke-test the original map-data INI parse route
      after the real `Common/INI.cpp` reader and its destination
      manager/singleton are available without target-local parser stubs.
- [ ] Link and smoke-test the original command-button INI parser route after
      the real `Common/INI.cpp` reader, ControlBar, and SpecialPowerStore
      singleton surfaces are available without target-local parser stubs.
- [ ] Expand command-button parser preflight from the focused shipped
      upgrade/special-power subset to full `CommandButton.ini` coverage after
      real `ThingFactory` / `ThingTemplate` object-template resolution is
      available; the current coverage intentionally avoids `Object =` command
      buttons until that dependency is real.
- [ ] Expand command-set parser preflight from focused
      `AmericaInfantryRangerCommandSet` coverage to full `CommandSet.ini`
      coverage after full command-button and object-template resolution is
      available.
- [ ] Locate or source the original `Run\Data\INI\DrawGroupInfo.ini` asset
      referenced by the project files but absent from the current extracted
      runtime BIG set, then enable the optional draw-group probe as a
      real-data parse smoke.
- [ ] Expand crate parser preflight from the focused shipped `CrateData`
      subset to full `Crate.ini` after real `ThingFactory` / `ThingTemplate`
      object-template parsing can consume the file's `Object` blocks without
      target-local parser stubs.
- [ ] Decide the browser replacement contract for original Windows Media /
      shell URL helpers before compiling `Common/Audio/simpleplayer.cpp` and
      `Common/Audio/urllaunch.cpp`; their case-correct headers now resolve, but
      the bodies still require `wmsdk.h`, `HRESULT`/wide Win32 shell types, and
      browser-safe launch/playback behavior.
- [ ] Compile original `Common/Audio/GameSpeech.cpp` after the WPAudio
      attribute header/backend dependency is replaced with the browser audio
      contract.
- [ ] Restore or locate the original WPAudio public headers and dependent WSys
      / ASIMP3 decoder headers referenced by the checked-in WPAudio project and
      sources (`wpaudio/*.h`, `wsys/File.h`, `asimp3/mss.h`,
      `asimp3/mp3dec.h`) before compiling original WPAudio or the
      WPAudio-backed `GameSpeech` path; do not synthesize replacement structs
      solely for compile coverage.
- [ ] Link and smoke-test original energy and production-prerequisite runtime
      behavior after real `Player`, `ThingFactory`, `ThingTemplate`, object,
      and science ownership paths link without target-local shims.
- [ ] Link and smoke-test `Money` deposit/withdraw runtime side effects after
      the deeper audio, `Player`/`Thing`, academy stats, and
      `StealthUpdate` economy paths can link without target-local GameLogic
      singleton shims.
- [ ] Link and smoke-test original `PlayerList` behavior after real `Player`,
      `Team`, `TunnelTracker`, control-bar, and GameLogic player ownership
      dependencies replace the current compile-only surface.
- [ ] Link and smoke-test original RTS action/team/score/academy behavior after
      the full `Player`, `Thing`, object, `GameLogic`, control-bar, and UI
      surfaces replace the current compile-only frontier.
- [ ] Link and smoke-test original `Common/StateMachine.cpp` save/load behavior
      after `ObjectID` / `Coord3D` xfer routes are verified in the linked
      runtime.
- [ ] Link and smoke-test original message-stream behavior after the real
      `Thing`, player/list, recorder, InGameUI, GameLogic, and network command
      dependencies replace the current compile-only surface.
- [ ] Replace the remaining target-local `Common/GlobalData.h` singleton shim
      in the broader linked runtime after the focused `GlobalData` /
      command-line bootstrap probes are folded into the main engine startup
      path.
- [ ] Replace the focused command-line runtime's local
      `DX8Wrapper_PreserveFPU` compatibility definition with the original W3D
      DX8 wrapper state once the W3D runtime links into `cnc-port`.
- [ ] Replace the focused browser-default `UserPreferences` /
      `OptionPreferences` compatibility definitions used by the original
      `GameData.ini` preflight with the real Options menu/user-preference
      persistence path once browser settings storage and menu ownership are
      linked.
- [ ] Enable and route `MiniLog.cpp`'s `DEBUG_LOGGING` body to the browser log
      or harness once the real `GameLogic` frame counter is available.
- [ ] Decide the browser copy-protection / launcher contract before compiling
      original `Common/System/CopyProtection.cpp`; it currently depends on
      Win32 mutex, message-queue, event, and shared-memory APIs.
- [ ] Re-enable and compile the active `INCLUDE_GRANNY_IN_BUILD` code path in
      original `W3DGranny.cpp` after the Granny SDK surface, WW3D render-object
      dependencies, and browser asset/texture bindings have a real port
      contract.
- [ ] Replace the compile-only `W3DDisplay.cpp` display construction, display
      mode, gamma, window-state, front-buffer screenshot/movie-capture, and
      Direct3D render paths with browser canvas/WebGL2/WebGPU behavior, then
      verify the original display loop through harness screenshots.
- [ ] Replace the remaining browser no-op cursor-file loading and cursor
      presentation policy (`LoadCursorFromFile`, CSS cursor vs engine cursor)
      before relying on original `W3DMouse.cpp` runtime cursor artwork.
- [ ] Replace the compile-only `Water/W3DWater.cpp` D3DX/Direct3D shader,
      render-target, reflection, grid, river-water, and water-track integration
      paths with real WebGL2/WebGPU-backed behavior, then verify the original
      water renderer through harness screenshots.
- [ ] Replace the compile-only WW3D2 `BrowserEngine.h`/`dx8webbrowser.cpp`
      declaration surface with a browser DOM/iframe, external-link, or
      texture-backed embedded-web contract before enabling original embedded
      browser panes at runtime. Runtime browser ports are also still needed
      for the compiled Direct3D wrapper, WWAudio/Miles playback, GDI text
      rasterization, Video-for-Windows frame grabbing, Surrender
      renderer/object behavior, and `ww3d.cpp`
      screen-capture/render-device paths instead of substituting renderer
      behavior.
- [ ] Replace the compile-only `Mss.H` Miles surface, dummy Win32 event
      handles, and `_beginthread` delayed-release-thread trap used by
      `WWVegas/WWAudio` with browser Web Audio scheduling/decoding and a real
      wasm-safe release/timer contract before linking WWAudio into runtime
      audio paths.
- [ ] Map original `WWVegas/wwshade` D3DX shader assembly, Direct3D shader
      creation, shader constants, and material/render-state application to the
      browser renderer pipeline, using the generated headers from original
      shader text without inventing shader data.
- [ ] Replace `Win32OSDisplay.cpp`'s current browser stderr/no-op message-box
      compatibility with a real browser/harness OS-display dialog/error
      reporting contract before relying on runtime warning prompts.
- [ ] Remaining `Common/RTS`, `Thing`, and `Audio` interfaces compile without
      target-local parser/Xfer/GameLogic shims.

### GameEngine — GameClient / GameLogic / GameNetwork (headers + logic)
- [ ] `GameLogic` (AI, Object, ScriptEngine, Map, System) compiles.
- [ ] Replace the declarative wasm GameSpy GP / Peer / gpersist compile-surface
      headers with real browser networking bindings when enabling runtime
      GameSpy matchmaking, chat, presence, and persistent stats.
- [ ] `GameClient` (Display, Drawable, GUI, Input, InGameUI, Terrain) compiles.
- [ ] Verify `GlobalLanguage::init`, the CSF/string-file path, and local-font
      loading against real fetched assets after original `Common/INI` and
      browser `FontFace`/fetch loading replace the current compatibility
      no-ops.
- [ ] Replace the current temporary `Common/INI.h` GameClient bridge helpers
      (`LookupListRec`, lookup-list parsing, coordinate parsing,
      `parseMappedImage`, credits and shell scheme declarations) with the
      original INI parser surface once `Common/INI` can compile and link.
- [ ] Link and smoke-test original campaign progression/save-load behavior
      after the real campaign INI reader, `Xfer::xferSnapshot`, and full
      GameClient singleton surface are available without target-local stubs.
- [ ] Link and smoke-test original radius-decal behavior after the deeper
      Player/Team/Module/Object/GameLogic contracts are available through
      original headers and rendering can be harness-driven.
- [ ] Link and smoke-test original hint/ray-effect behavior after the real
      InGameUI, GameClient, drawable/display, object, and browser render/input
      paths are available and harness-driven.
- [ ] Link and smoke-test the original GameClient message translators,
      selection info, EVA/FX list, control-bar scheme/core/commands/leaves,
      in-game chat, `GameClient`/`InGameUI`/mouse/IME entry points,
      load/shell/keyboard/skirmish/LAN/game-info/map/quit/popup/replay/WOL
      menu behavior, particle/terrain/drawable/update/smudge behavior, audio
      debug display behavior, and GameClient dispatch after real `GameLogic`,
      `MessageStream`, input, FX/display, GameInfo/LAN, and original
      INI/GlobalData/Xfer runtime paths replace the current target-local
      compile bridges.
- [ ] Replace the compile-only `GameNetwork/WOLBrowser/WebBrowser.h` bridge
      with a browser DOM/iframe or external-link contract before running the
      original WOL ladder/login/welcome browser panes or URL definitions at
      runtime.
- [ ] Replace the compile-only `_spawnl` no-spawn process fallback with an
      explicit browser policy for the Main Menu WorldBuilder button before
      driving that menu at runtime.
- [ ] Replace the current keyboard `GetKeyboardLayout` fallback and static
      layout table assumptions with a browser `KeyboardEvent.code` /
      locale-aware translation surface before considering keyboard behavior
      runtime-complete.
- [ ] Replace the current compile-only Win32 IMM/replay file-copy shims with
      browser DOM composition events and browser save/export flows before
      considering IME or replay export behavior runtime-complete.
- [ ] Link and smoke-test original window animation behavior through real or
      shimmed `GameWindow` instances once the browser input/render path can
      drive and observe them; current coverage is compile-only for the window,
      manager, transition, and processor sources.
- [ ] Exercise/link original `GameClient/Display.cpp` display methods against
      the browser display device layer; the current utility target has compile
      coverage only and no rendering is considered complete without harness
      screenshots/state checks.
- [ ] Link and smoke-test original `GameNetwork/FrameMetrics.cpp` FPS sampling
      and latency response after the browser display/FPS surface and real
      `GlobalData` singleton are available.
- [ ] Link and smoke-test original `GameNetwork/Connection.cpp` receive
      behavior after browser transport receive dependencies are available.
- [ ] Link and smoke-test original `GameNetwork/FileTransfer.cpp` transfer flow
      after `GameInfo`, `Shell`, `LoadScreen`, and the browser
      network/file-transfer path are available.
- [ ] Replace original WWDownload raw FTP/WinSock transport with a browser
      fetch/proxy/update-download contract before patch/download runtime flows
      are considered functional.
- [ ] Harness-test original `GameNetwork/DownloadManager.cpp` through the
      browser download transport and update UI callback surfaces once the
      fetch/proxy/update-download contract exists.
- [ ] Link and smoke-test the broader GameNetwork command-message and
      connection-manager slice after the real player/message game-command
      reconstruction, ack packet paths, game-start progress, and browser
      transport dependencies are available beyond the currently smoke-tested
      control packet surface.
- [ ] Link and smoke-test original GameNetwork setup/LAN/config behavior after
      the real `GlobalData`, `MapCache`, `MultiplayerSettings`,
      `PlayerTemplateStore`, `GameText`, `LANAPI`, `NetworkInterface`,
      disconnect UI, and GameLogic frame state surfaces replace the current
      compile-only singleton surface.
- [ ] Link and smoke-test original `GameNetwork/LANAPICallbacks.cpp` after the
      real `GameLogic::isInGame`, LAN UI, game setup, and transport callback
      surfaces are available; current coverage is compile-only.
- [ ] Replace the declarative legacy `GameNetwork/GameSpy.h` /
      `TheGameSpyChat` compile bridge with the real browser GameSpy chat/GP
      runtime binding before running the original legacy chat callbacks or GP
      error/status callbacks.
- [ ] Audit original `GameNetwork/GameSpyGameInfo.cpp` before runtime GameSpy
      integration; it is explicitly obsolete in the current source tree and
      conflicts with the newer `GameSpy/StagingRoomGameInfo` path.
- [ ] Link and smoke-test original GameSpy thread queue behavior after browser
      Worker/pthread scheduling, GP/Peer/QR2/Stats runtime bindings,
      ICMP/socket fallbacks, and harness state probes are available; current
      coverage is compile-only.
- [ ] Replace the temporary no-op GameSpy `ghttp` compile shim with a browser
      fetch/proxy/update-check contract before running original Main Menu or
      Options Menu online/update flows.
- [ ] Resolve link order; produce a wasm archive of the core (no devices yet).

---

## M2 — Boot to a black window

- [ ] Replace the skeleton wasm boot module with original engine Emscripten
      initialization.
- [ ] Emscripten entry point replacing `Main/WinMain.cpp` (`main()` + main loop).
- [ ] `emscripten_set_main_loop` driving the engine tick at fixed timestep.
- [ ] Canvas + GL context creation (no draw yet); resize handling.
- [ ] Engine `init()` runs to completion without crashing.
- [ ] Graceful handling of missing assets (clear error, not a hang).
- [ ] Harness: boot → confirm engine reached init → screenshot (black is fine).

---

## M3 — File / data subsystem (real data)

### File system device (Win32Device/Common → browser)
- [ ] Re-target `Win32LocalFileSystem`/`Win32LocalFile` onto MEMFS/IDBFS.
- [ ] Re-target `Win32BIGFileSystem`/`Win32BIGFile` to read fetched BIG archives.
- [ ] Resolve the original `Data\INI\Rank.ini` startup dependency referenced by
      `GameEngine.cpp` / `RankInfoStore`: source the real asset, confirm an
      alternate shipped filename, or add the correct browser archive mapping,
      because the current extracted Zero Hour runtime BIG/CAB inventory does
      not contain that path.
- [ ] Resolve the remaining original `GameEngine.cpp` default/startup INI
      dependencies now reported by `originalEngineStartup`: the current runtime
      BIG set also lacks `Data\INI\Default\GameData.ini`,
      `Data\INI\Default\Water.ini`, `Data\INI\Default\Science.ini`,
      `Data\INI\Default\Multiplayer.ini`, `Data\INI\Default\Terrain.ini`,
      `Data\INI\Default\Roads.ini`, `Data\INI\Default\PlayerTemplate.ini`,
      `Data\INI\Default\FXList.ini`,
      `Data\INI\Default\ObjectCreationList.ini`,
      `Data\INI\Default\SpecialPower.ini`,
      `Data\INI\Default\Upgrade.ini`, `Data\INI\Default\Crate.ini`,
      `Data\INI\CommandMap.ini`, and `Data\INI\Default\Video.ini`.
- [ ] Async asset loading (fetch BIGs) without blocking the main loop (Asyncify
      or preload into FS before boot).
- [ ] Stub/neutralize `Win32CDManager` (no CD in browser; satisfy CD check).
- [ ] Persistence: user prefs / saves to IDBFS.

### Data load with original code
- [ ] Load real `INIZH.big`; original INI parser reads it (objects, weapons,
      locomotors, armor, FX, command sets/buttons, control bars, science, etc.).
- [ ] Replace the wasm OCL metadata-only creation guards with full runtime object
      creation once `ThingFactory`, `GameLogic`, `PartitionManager`, terrain,
      Drawable/FX/audio ownership, and object template loading are linked through
      the real startup path.
- [ ] Locate and include the archive source for
      `Data\INI\Default\SpecialPower.ini`, then load the original default +
      shipped special-power sequence through `SpecialPowerStore::init` / full
      `GameEngine.cpp` startup once the minimum boot archive set is defined.
- [ ] Locate and include the archive source for
      `Data\INI\Default\PlayerTemplate.ini`, then load the original default +
      shipped player-template sequence through `PlayerTemplateStore::init` /
      full `GameEngine.cpp` startup once the minimum boot archive set is
      defined.
- [ ] `GameText`/string tables load (CSF/GameText) for the chosen language.
- [ ] Load the original default + shipped water sequence
      (`Data\INI\Default\Water.ini` then `Data\INI\Water.ini`) through the full
      `GameEngine.cpp` startup path with xfer CRC once engine init consumes the
      mounted archive set.
- [ ] Load the original default + shipped weather sequence
      (`Data\INI\Default\Weather.ini` then `Data\INI\Weather.ini`) through the
      full `GameEngine.cpp` startup path with xfer CRC once engine init consumes
      the mounted archive set.
- [ ] Locate and include the archive source for
      `Data\INI\Default\Video.ini`, then load the original default + shipped
      video sequence through `VideoPlayer::init` / full `GameEngine.cpp`
      startup once the minimum boot archive set is defined.
- [ ] Map cache rebuilds/scans live system and user map directories through
      original `MapCache::updateCache`, including `.map` parsing, CRC/file-info
      checks, user-data persistence, and browser MEMFS/IDBFS behavior.

---

## M4 — First pixels (W3D → WebGL2)

### WW3D2 device bring-up
- [ ] Map W3D render device init onto the WebGL2 context.
- [ ] Texture upload: DDS/DXT decode (or transcode) → GL textures; mipmaps.
- [ ] Extend browser D3D8 volume texture support to compressed DDS volume
      uploads and shader sampling if original W3D assets exercise
      `VolumeTextureClass` beyond the verified uncompressed
      `D3DXCreateVolumeTexture` / `LockBox` / `SetTexture` path.
- [ ] Remaining D3D8 render-state mapping beyond the current
      cull/depth/blend/alpha-test/color-write/texture-factor/stencil/fog/
      fill-mode/z-bias/shade-mode, lighting/ambient capture, and
      `D3DMATERIAL8` material capture/material-source descriptor coverage,
      including fixed-function lighting beyond enabled directional
      diffuse+ambient lights (broader spot-light variants beyond the verified
      hard-cone and quadratic mid-penumbra falloff proofs, broader original
      W3D point-light attenuation variants beyond the verified linear and
      pure quadratic point-light proofs plus the verified finite-range clip
      and mixed coefficient proofs, lit material-source variants beyond the
      verified diffuse/ambient `COLOR1` path and the specular-source D3D8
      parity proof, especially original-runtime emissive/`COLOR2` paths, and
      other fixed-function lighting/render-state variants) and other W3D draw
      states → GL/shader state.
- [ ] Refine browser D3D8 wireframe emulation to match D3D culling and
      depth-bias behavior before relying on W3D extra-pass selection/outline
      rendering in real scenes; the first bridge expands indexed triangle
      edges directly and verifies line rendering, but still does not cull
      hidden triangle edges.
- [ ] Fixed-function pipeline emulation via generated GLSL ES shaders.
- [ ] Port/translate `wwshade` shaders + `W3DShaderManager` to GLSL ES.
- [ ] Matrix/transform stack and viewport/camera setup.

### Increasing fidelity (each step verified by screenshot)
- [ ] Generalize the browser range-backed BIG archive reader into the
      original file/archive registration path so normal engine startup
      can stream user-supplied runtime archives without focused harness
      mounts or whole-archive MEMFS copies.
- [ ] Hand runtime `W3DFileSystem` ownership over to the real
      `W3DDisplay` / browser display startup path once full display
      construction owns WW3D lifetime. The current smoke proves the
      shared browser runtime archive owner can expose W3D and texture
      assets through the normal file/archive system, but final startup
      still needs display-owned WW3D file-factory lifetime and the open
      range-backed archive streaming path above.
- [ ] 2D blits / `Image`/`DisplayString` text rendering.
- [ ] Terrain heightmap (`BaseHeightMap`/`HeightMap`/`FlatHeightMap`) renders.
- [ ] Scene/camera (`W3DScene`, `W3DDisplay`) renders the shell/menu background.
- [ ] Add a vtable-safe original `W3DDisplay::setWidth` / `setHeight`
      or `setDisplayMode()` proof. Raw storage is not enough because the
      original setters call virtual `getWidth()` / `getHeight()`;
      placement-new construction currently retains the full `W3DDisplay`
      vtable/link surface (`TheDisplayStringManager`, `TheInGameUI`,
      `TheNetwork`, etc.). `setDisplayMode()` also needs a real
      `TheTacticalView` resize path. Keep this as a focused probe once
      those dependencies are owned, not weak-faked.
- [ ] Replace the focused terrain/water projection generated-coordinate state
      mirrors with direct `W3DShaderManager::setShader` and
      `WaterRenderObjClass` call-path probes once those renderer surfaces are
      linked into the browser runtime without broad compile-frontier-only
      dependencies.
- [ ] Particles (`W3DParticleSys`), shadows, water, shroud, decals (later).
- [ ] Replace the focused particle-template metadata path's weak Object/Drawable
      compatibility bridges with the full original `ParticleSystem` /
      `ParticleSystemManager` runtime once object, drawable, game-client, and
      renderer ownership are linked; verify weapon projectile-exhaust particles
      through harness screenshots/state.
- [ ] Snow/weather rendering through original `SnowManager` / W3D weather
      paths, including map weather overrides, verified by harness screenshots.
- [ ] Reach the **main menu rendering** end-to-end; screenshot it.

---

## M5 — Input & UI

- [ ] Mouse: Pointer events → engine `Mouse`/`W3DMouse` (move, buttons, wheel).
- [ ] Promote the browser-backed frame-owned `Mouse` path from
      disabled-by-default harness opt-in to the final default gameplay
      input owner once the real engine `MessageStream` / `CommandList`
      lifecycle is no longer probe-owned.
- [ ] Keyboard: DOM keyboard events → engine `Keyboard` (mapping, repeat, focus).
- [ ] Promote the browser-backed frame-owned `Keyboard` path from
      disabled-by-default harness opt-in to the final default
      gameplay input owner once the real engine `MessageStream` /
      `CommandList` lifecycle is no longer probe-owned.
- [ ] Pointer lock / capture behavior where needed.
- [ ] Cursor rendering (engine-drawn cursor vs CSS cursor).
- [ ] Extend cursor rendering verification for future engine-drawn
      `RM_W3D` cursor pixels once W3D cursor textures are rendered by the
      normal display path.
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
- [ ] Replace the focused `Weapon.cpp` metadata-only browser build with the
      full original `Weapon` / `WeaponStore` fire, delayed-damage, projectile,
      laser, FX, and OCL runtime linked through real `Object`,
      `PartitionManager`, `ThingFactory`, `ObjectCreationList`, `Drawable`,
      `Player`, `WeaponSet`, and update-module ownership; harness-test real
      attack orders and resulting damage/state changes.
- [ ] Production: build structures/units, resources (supplies) flow.
- [ ] `ScriptEngine` runs map scripts.
- [ ] Fixed-timestep simulation is **deterministic** (same seed → same result).
- [ ] AI opponent plays a skirmish.
- [ ] Win/lose conditions trigger.
- [ ] Harness: start match, step N frames, move/attack, assert state changes.
- [ ] Replay/recorder (`Recorder.cpp`) records and plays back deterministically.

---

## M7 — Audio (Miles → Web Audio)

- [ ] Source `Data\INI\AudioSettings.ini` from a complete base/Zero Hour
      runtime archive set or define the browser-loaded audio settings contract
      before treating audio payload path resolution as runtime-ready. The
      current Zero Hour-only archive set resolves many payload candidates, but
      `AudioEventRTS::generateFilenamePrefix` still depends on parsed
      `AudioSettings` folders at runtime; the browser harness now exposes
      `audioPayloadInventory.audioStartupArchiveContract` so the four current
      missing audio startup INIs are classified as absent optional base
      `INI.big` files instead of anonymous payload gaps.
- [ ] Re-target `MilesAudioManager` (and `WWVegas/Miles6`/`WPAudio`) to Web Audio.
      The `Mss.H` startup/provider/listener/sample/stream-handle boundaries are
      now stateful and harness-probed by the MSS lifecycle RPCs, but the next
      required work is a real Web Audio playback backend owned by the original
      manager.
- [ ] Replace remaining `Mss.H`/`dsound.h` compatibility paths used by
      `MilesAudioManager.cpp` with a browser-backed audio device that owns real
      sample data, streams, provider/listener state, mixer state, and
      Bink-sharing handles. The startup boundary is no longer compile-only, but
      playback scheduling, decoded stream data, and DirectSound speaker/device
      replacement remain open. The 2D sample handle lifecycle is now stateful and
      harness-probed by `mssSampleLifecycleProbe`, covering sample init, file
      assignment, callbacks, volume/pan/rate/loop settings, start/stop/resume,
      status, and release without claiming Web Audio playback. The HSTREAM
      lifecycle is now stateful and harness-probed by
      `mssStreamLifecycleProbe`, covering open/open-by-sample, callback
      registration, volume/pan/rate/loop/position state, start/pause/resume,
      status, and close while still leaving real Web Audio stream scheduling
      open. The 3D sample/listener/provider lifecycle is now stateful and
      harness-probed by `mss3DSampleLifecycleProbe`, covering provider open and
      speaker type, listener position/orientation/velocity, 3D sample
      allocation/user data/file/callback/distance/position/volume/rate/loop/
      offset/occlusion/effects state, start/stop/resume/end callback, and
      release while still leaving real Web Audio panning and scheduling open.
- [ ] Harness-drive `MilesAudioManager` through the engine audio event path and
      assert observable playback state, mixer volume changes, completion
      callbacks, and 2D/3D sample lifecycle once the Web Audio backend exists;
      `verify:audio-sound-manager-counters-frontier` now pins the source-only
      `SoundManager` counter contract that runtime playback must satisfy.
- [ ] Decode original audio formats (MP3, PCM WAV, and the current 2,572
      IMA ADPCM WAV payloads) before Web Audio playback; the current
      `verify:audio-format-frontier` / harness `payloadFormats` checks prove
      the ADPCM majority must be decoded or transcoded before
      `decodeAudioData`, and `audioPayloadInventory.decodeProofs` /
      `webAudioBufferProofs` currently cover only representative PCM and IMA
      ADPCM WAV payloads. `requestedPayloadCachePlan` is metadata-only, and
      `requestedPayloadDecodeCacheProof` now creates representative decoded
      MP3/WAV Web Audio buffer cache entries, an OfflineAudioContext preview
      schedule render, a browser lifecycle proof, and a Web Audio mixer-bus
      proof for requested music/SFX/3D SFX/voice/speech keys. The harness also
      retains that representative decoded cache for one live requested
      `AudioBufferSourceNode` lifecycle proof through the runtime mixer. Expand
      that proof into full resolved requested-payload decode/cache storage and
      real engine-driven Web Audio scheduling/lifecycle.
- [ ] 2D SFX playback with the engine's audio event system (INIAudioEventInfo);
      `verify:audio-playing-event-state-frontier` now pins the original
      `PlayingAudio` active-event record, list insertion, completion marker,
      and release/erase drainage that engine-driven Web Audio playback must
      preserve.
- [ ] 3D positional audio (panning/attenuation) tied to camera/world;
      `verify:audio-3d-position-frontier` now pins the source listener/sample
      position contract that the browser Web Audio backend must satisfy, and
      `requestedPayloadDecodeCacheProof.browserAudio3DPositioningProof` now
      proves one real requested world SFX can render through a browser
      `PannerNode`. `verify:audio-3d-zoom-volume-frontier` pins the source
      zoom-volume recompute and already-playing 3D volume re-push path.
      Engine-driven 3D playback and zoom-volume binding are still open.
- [ ] Music playback + transitions; `verify:audio-music-manager-frontier` now
      pins the source-only `MusicTrack` / `MusicManager` / Miles stream route,
      volume bus, Music.ini parse path, and next/previous/completion state
      contracts that the Web Audio stream backend must satisfy. Engine-driven
      music playback and transitions are still open.
- [ ] EVA voice / unit voices.
- [ ] Volume/mixer controls wired to options UI; `verify:audio-options-volume-frontier`
      now pins the original Zero Hour OptionsMenu slider-to-`TheAudio->setVolume`
      write path, `verify:audio-options-volume-readback-frontier` pins the
      persisted-preference slider initialization path, and the representative
      `requestedPayloadDecodeCacheProof.browserAudioMixerBusProof` proves
      source-default music/sound/3D/speech Web Audio `GainNode` buses against
      real requested payloads; `browserAudioMixerRuntime` also proves live
      runtime `GainNode` bus updates from source-shaped script/system volume
      values, but the engine/options UI still does not drive that browser
      mixer.
- [ ] Harness: assert engine-driven audio events fire (state/log), not just
      sound; the current browser live-event proof logs request/start/ended/
      completion/release for one real requested decoded payload, and
      `browserAudioRequestPathRuntime` now proves the ordered
      `AudioManager::addAudioEvent` / `SoundManager::addAudioEvent` /
      `MilesAudioManager::processRequest` source contract around live
      playback for representative 2D sample, 3D sample, and stream playing
      types. It is still harness-driven rather than executed by the original
      `MilesAudioManager` runtime.

---

## M8 — Video (Bink → WebCodecs)

- [ ] Re-target `VideoDevice/Bink` (`BinkVideoPlayer`/`VideoStream`) to WebCodecs
      or `<video>`.
- [ ] Extend the current browser Bink provider from real-file open/header parsing
      and frame-cursor lifecycle to actual decoded frame copy/upload through
      WebCodecs or a deliberate decoder path; `test:bink-video-provider` now
      proves `BinkOpen` can resolve the shipped loose payloads and fill the
      original `HBINK` fields, but `BinkCopyToBuffer` still does not decode.
- [ ] Wire the browser Bink runtime to the offline-transcoded WebM sidecar
      manifest generated by `transcode:bink-video`, then harness-test an
      original `BinkVideoPlayer`-owned open/play/seek path without claiming
      `BinkCopyToBuffer` pixel-copy support until frame upload is real. The
      current `test:bink-browser-video` smoke proves the generated sidecars
      are browser-decodable outside the original runtime path.
      `verify:bink-browser-sidecar-contract` now pins the contract the next
      provider change must satisfy: the sidecar manifest schema/path
      (`artifacts/browser-video/bink/bink-browser-video-manifest.json`,
      `cnc-zh-bink-browser-video-manifest/v1`), the BIK source -> WebM sidecar
      metadata association, the original-style path aliases
      (`Data\Movies\<name>.bik` and `Data/<lang>/Movies/<name>.bik` resolving
      to `<name>.webm`), and the invariant that
      `WasmBinkProviderCanDecodeFrames` stays false until `BinkCopyToBuffer`
      actually copies pixels. The provider does not yet reference the manifest;
      that gap is reported by the verifier as a forward-looking fact.
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

- [ ] Keep `PROJECT.md`, `TODO.md`, and `DONE.md` updated as milestones move.
- [ ] Track which original files are compiled, shimmed, or re-targeted (avoid
      accidental rewrites of platform-independent logic — see the hard rules).
- [ ] Record every browser-API bridge so the original-vs-port boundary stays clear.
