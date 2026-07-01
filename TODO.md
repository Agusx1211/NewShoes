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
      Once base Generals `INI.big`/`English.big` are supplied, rerun
      `npm run test:startup-range-backed-archives-browser` to verify the
      optional range-backed base archive branch advances original startup to
      the post-`CreateGameEngine` original init ownership frontier. The
      inventory now also reports `Window\Menus\BlankWindow.wnd` readiness
      separately as an optional base `Window.big` layout gap; when base
      `Window.big` is supplied, run
      `node WebAssembly/tools/inventory_startup_archives.mjs WebAssembly/artifacts/real-assets --require-blank-window-layout`
      before replacing the runtime BlankWindow adapter.
- [ ] Make `extract_zh_runtime_archives.sh` safe for parallel smoke-test
      invocations, or serialize the npm scripts that call it. Concurrent
      terrain smokes can race while extracting the shared loose `Data1.cab`
      payload and fail with `errno=17` even when the renderer path itself is
      healthy.

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
      before compiling wide-string serialization and save/load paths. The
      original chunky-map `UnicodeString` path now reads/writes explicit
      16-bit little-endian code units for wasm, but the broader contract still
      needs coverage for every save/load and network structure that embeds wide
      strings. The
      focused LANAPI join/options and game-start verticals currently use an
      Emscripten active-message-prefix send path because 4-byte wasm
      `WideChar` makes `sizeof(LANMessage)` exceed the original 476-byte UDP
      packet cap.
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
- [ ] Drive original URL-launching UI flows through the browser
      `LaunchWebBrowser` bridge once the relevant shell/WOL/embedded-browser
      menu callbacks are runtime-owned; current coverage proves the direct
      WWLib call crosses to `window.open`.
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
      original headers/sources as each real subsystem comes online. The runtime
      now links original `Common/System/XferCRC.cpp` for the pre-audio
      `XferCRC("lightCRC")` startup proof, but the full original `Common/Xfer`
      base and save/load transfer stack still remain behind the current
      focused shim.
- [ ] Link and smoke-test original `Common/Xfer` and save-game behavior after
      `GameState`, `GameStateMap`, real `GlobalData`, browser persistence, and
      the full snapshot subsystem can link into the runtime.
- [ ] Link and smoke-test the remaining real-header memory/archive/system
      leaves after the browser audio and persistence singleton contracts replace
      the current target-local smoke globals.
- [ ] Finish replacing temporary probe-local `FileSystem` consumers with the
      browser-owned archive/audio singleton contracts. The browser runtime now
      harness-proves persistent `TheFileSystem`/`TheLocalFileSystem`/
      `TheArchiveFileSystem`/`TheNameKeyGenerator` ownership over registered
      fetched archives; music archive load/unload, persistence, and full
      original engine startup consumption remain open.
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
- [ ] Decide the browser replacement contract for original Windows Media
      playback before compiling `Common/Audio/simpleplayer.cpp`; the shell URL
      helper now compiles and browser-smokes through `window.open`, but
      `simpleplayer.cpp` still requires `wmsdk.h`, wave-output types, and
      browser-safe media playback behavior.
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
- [ ] Replace the focused MainMenu/GameText `g_csfFile` lowercase path override
      once browser archive/file lookup fully preserves the original Windows
      case-insensitive CSF path contract (`data\%s\Generals.csf` versus the
      indexed `data\english\generals.csf` entry).
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
- [ ] Promote the `CreateGameEngine` frontier from probe-only to real browser
      startup ownership: link original `Win32GameEngine` construction with
      owned original `GameEngine.cpp` singleton/destructor lifetime, then
      advance `GameEngine::init()` only as far as the first real browser-owned
      device factory (`createAudioManager` / `TheAudio`) instead of adding more
      source-only Win32 probes. The focused lifetime smoke still proves original
      `Win32GameEngine` construction/destruction over a minimal browser-owned
      `GameEngine` surface, and `win32-gameengine-original-lifetime-smoke` now
      links full original `GameEngine.cpp`, original `Win32GameEngine.cpp`,
      original `SubsystemInterface.cpp`, and original
      `Drawable::killStaticImages()` (plus original `Science.cpp` /
      `RankInfo.cpp` vtable owners) to prove constructor/destructor teardown
      calls `TheGameResultsQueue->endThreads()` without entering `init()`.
      The browser `win32GameEngineProbe` now constructs the original
      `Win32GameEngine` in Chromium over the focused browser `GameEngine`
      lifetime, assigns the instance to `TheGameEngine`, dispatches
      `Win32GameEngine::serviceWindowsOS`, deletes it, and clears the singleton;
      the startup frontier marks `CreateGameEngine` ready while still requiring
      full original `GameEngine.cpp` init consumption and startup singleton
      teardown contracts before `createAudioManager`. `test:startup-vertical`
      now also boots the wasm
      harness in Chromium and asserts the browser-visible original
      `GameEngine.cpp` startup frontier still stops at
      `createAudioManager` line 434 with no runtime archives mounted, so the
      focused C++ smokes cannot drift away from the actual browser boot state.
      The original lifetime smoke now assigns the constructed original
      `Win32GameEngine` to the global `TheGameEngine`, proves the owned pointer
      before `init()`, tears down through the original destructor, and clears the
      singleton afterward; `test:startup-vertical` gates that ownership/release
      contract. The browser-visible `deviceFactoryFrontier` now also exposes
      the original pre-audio ownership sequence for `GameEngine.cpp` lines 314,
      327, 338, and 381 through `preAudioInitOwnership`, so
      `TheNameKeyGenerator`, `TheCommandList`, `XferCRC("lightCRC")`, and
      `parseCommandLine` readiness are checked before the still-unowned
      `createAudioManager` call. `test:vertical-integrations` now runs that
      startup vertical as an aggregate gate before the archive, audio,
      networking, rendering, and video verticals, so original
      `GameEngine.cpp`/`Win32GameEngine` lifetime drift is visible in the
      default cross-subsystem run.
- [ ] Advance beyond `createAudioManager` through a real W3D GUI/display
      ownership slice before marking `createFunctionLexicon` or
      `createModuleFactory` runtime-ready. The current focused
      `w3d-gamewindow-manager-smoke` owns `GlobalData`,
      `SubsystemInterfaceList`, a focused `Display`, `FontLibrary`, and the
      original `W3DGameWindowManager`, then proves original `winCreate` allocates
      `W3DGameWindow` and original `gogoGadgetPushButton` installs the W3D draw
      callback. `test:startup-vertical` now gates the focused
      `Win32GameEngine` lifetime, full original `GameEngine.cpp`
      constructor/destructor lifetime, original `MilesAudioManager::openDevice`,
      and W3D game-window ownership smokes together so cross-subsystem startup
      drift is visible. The focused `w3d-window-layout-script-smoke` now runs
      original `WindowLayout::load("Menus/BlankWindow.wnd")`, original
      `GameWindowManager::winCreateFromScript`, original `.wnd` layout-block /
      window parsing, and original `W3DFunctionLexicon::init()` lookup for
      `W3DMainMenuInit`; it also mounts real `WindowZH.big` with original
      `Win32BIGFileSystem`, loads `Menus/MessageBox.wnd` and
      `Menus/QuitMessageBox.wnd`, links original `MessageBox.cpp`, and proves
      parsed `MessageBoxSystem`, `QuitMessageBoxSystem`, and
      `PassMessagesToParentSystem` ownership through original window callback
      pointers. It now also constructs original `Shell`, drives
      `Shell::showShell -> Shell::push`, loads real `Menus/MainMenu.wnd` from
      `WindowZH.big`, verifies `MainMenu.wnd:MainMenuParent` creation and
      `MainMenuSystem` binding, runs the W3D layout-init callback name, and
      pops the shell stack cleanly through original `Shell::popImmediate`.
      It now links original `W3DMainMenu.cpp`, original `MainMenu.cpp`, and
      original `Mouse.cpp`, then proves the original `W3DMainMenuInit` layout
      callback executes original `MainMenuInit` first-run state mutation
      (`m_breakTheMovie`, mouse visibility, `FadeWholeScreen`, focus, and
      dropdown hides), original `MainMenuSystem(GWM_INPUT_FOCUS)`, and the
      first original `MainMenuUpdate` idle frame under focused shell
      `GameLogic` state while counting the message-box/HTTP/GameSpy tick
      boundaries and avoiding download, transition, and game-start branches. It
      still uses focused display/font/text shims and no-op branch boundaries for
      undriven campaign/GameSpy/download/options paths, so full production
      `W3DDisplay` construction and `W3DModuleFactory` module-template lookup
      still need original public-API runtime proof.
      `verify:w3d-module-factory-frontier`
      now pins the original
      `Win32GameEngine::createModuleFactory -> W3DModuleFactory` mapping,
      `GameEngine.cpp` call site, and all 19 original W3D draw-module
      registrations through the public `ModuleFactory` lookup internals; the
      attempted standalone runtime lookup pulled the base ModuleFactory / INI /
      game-client global graph, so the full `W3DModuleFactory::init()` runtime
      proof should follow original `GameEngine.cpp` ownership of the
      pre-`createAudioManager` file/INI/CD frontier. Advance the next vertical
      slice outside the already-proven shell menu path unless a new menu flow
      is driven through real original input/navigation and asset loading.
      `test:vertical-integrations` now gates runtime archive preload/startup
      asset consumption, range-backed startup archive delivery, WindowZH-backed
      MainMenu dropdown/back and CreditsMenu layout callbacks, mapped-image
      W3DDisplay rendering, composed W3DDisplay scene + real shell UI art + GameText
      rendering, and shipped W3D mesh rendering together so cross-subsystem
      regressions are visible; the browser-pixel repaint path now also includes
      archive-loaded shell `WindowLayout` coverage via
      `test:ww3d-window-layout-repaint`, so the next rendering slice should move
      to terrain first pixels or fuller main-menu composition instead of another
      focused shell-layout smoke. The
      focused `w3d-window-layout-script-smoke` now also sends a real
      `ButtonSinglePlayer` `GWM_LEFT_DOWN`/`GWM_LEFT_UP` pair through original
      `GameWindowManager::winSendInputMsg` and `GadgetPushButton`, then proves
      original `MainMenuSystem(GBM_SELECTED)` unhides the single-player
      dropdown and stops at the transition boundary without pushing campaign or
      skirmish screens. It then runs one original `MainMenuUpdate` to clear the
      transition lock and drives `ButtonSingleBack` through the same input path
      to prove return navigation to the main dropdown. It now also drives
      `ButtonLoadReplay` and `ButtonLoadReplayBack` through the same original
      input path, proving the load-replay dropdown transition and return stay
      inside the `MainMenu.wnd` shell layout. It now also drives `ButtonUSA`
      into the original `MainMenuDifficultyMenuUS` transition and drives
      `ButtonDiffBack` through `MainMenuSinglePlayerUSAMenuFromDiff` while
      recording the local `CampaignManager` boundary. It now also mounts real
      `INIZH.big`, loads `Menus/CreditsMenu.wnd` and `Data\INI\Credits.ini`,
      drives `ButtonCredits` through the original input path, lets
      `MainMenuUpdate` complete the pending `Shell::push`, and verifies
      original `CreditsMenuInit`, `CreditsMenuUpdate`, CreditsManager
      creation/loading, the local `AudioManager` device boundary, and clean
      `CreditsMenuShutdown` teardown.
- [ ] Advance the startup singleton frontier from browser-owned residency to
      original startup consumption: after the base `GameLODPresets.ini` source
      is mounted, load `GameLODManager` through the durable startup owner and
      only then exercise the original `SubsystemInterfaceList::initSubsystem`
      mutation path and verify the next blocker is `createAudioManager`. Keep
      `Maps\MapCache.ini` loading deferred to its original post-audio
      `GameEngine.cpp` point (`MapCache::updateCache` at line 607).
      `test:vertical-integrations` now asserts the runtime and range-backed
      startup archive paths keep `SubsystemInterfaceList` ready, make
      `GameLODManager` readiness depend on mounted base `INI.big`
      (`GameLODPresets.ini`), keep `MapCache` deferred, and preserve
      `createAudioManager` as the first unowned factory. The same mounted
      archive gates now require durable `TheCommandList` ownership and an
      original `XferCRC("lightCRC")` open with initial CRC zero before marking
      startup singleton residency ready.
- [ ] Prove the startup singleton shutdown/destructor path through the original
      `GameEngine.cpp` allocator/free lifetime after archive preflight is safe.
      A direct `MSGNEW`/`delete` probe for durable `GlobalData`,
      `SubsystemInterfaceList`, `GameLODManager`, and `MapCache` currently
      corrupts the wasm memory pool after the mounted-archive boot logs the
      singleton state, so the bootstrap keeps heap-backed residency, defers
      subsystem-list shutdown proof until base startup files exist, and does not
      yet free those owner blocks.
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
      mounts or whole-archive MEMFS copies. Current coverage:
      `npm run test:startup-range-backed-archives-browser` range-fetches
      a startup-shaped `INIZH.big`/`EnglishZH.big`/`MapsZH.big` subset,
      registers synthesized BIG archives before boot, proves the startup
      asset/data preflight is ready, and confirms the next frontier is the
      absent base Generals startup INI files. The same smoke now also mounts
      optional base Generals startup/audio entries from `INI.big`/`English.big`
      when present and expects the post-`CreateGameEngine` original
      `GameEngine.cpp` init-ownership frontier. The remaining work is the normal
      on-demand full-archive streamer without a curated entry list.
- [ ] Hand runtime `W3DFileSystem` ownership over to the real
      `W3DDisplay` / browser display startup path once full display
      construction owns WW3D lifetime. The current smoke proves the
      shared browser runtime archive owner can expose W3D and texture
      assets through the normal file/archive system, but final startup
      still needs display-owned WW3D file-factory lifetime and the open
      range-backed archive streaming path above.
- [ ] Expand the archive-backed `WindowLayout` repaint path from the current
      real `WindowZH.big` `Menus/Defeat.wnd` and `Menus/MainMenu.wnd`
      `MapBorder4` rectangle repaint smokes into production shell/menu
      composition: cover text and image children that are hidden/pruned for the
      focused repaint proofs, and normal display-owned font/image lifetime. The
      current direct display slices prove `MainMenu.wnd:Logo` and the
      `MainMenuRuler` HandCreated mapped image / `TexturesZH.big`
      `MainMenuRuleruserinterface.tga` texture path, and the WND image repaint
      smoke now carries the full-screen ruler, logo overlay, and the visible
      main button stack (`ButtonSinglePlayer`, `ButtonMultiplayer`,
      `ButtonLoadReplay`, `ButtonOptions`, `ButtonCredits`, and `ButtonExit`)
      through enabled three-piece button images plus real CSF labels through
      `GameText::fetch` and `W3DDisplayString::draw`; its static-text-focused
      mode also unhides the shipped
      `MainMenu.wnd:StaticTextSelectDifficulty` child and renders
      `GUI:SelectDifficulty` through original `W3DGadgetStaticTextDraw` /
      `GadgetStaticTextSystem` / `W3DDisplayString`, and its Load Replay
      focused mode unhides the shipped `MainMenu.wnd:MapBorder3`,
      `ButtonLoadGame`, `ButtonReplay`, and `ButtonLoadReplayBack` controls
      with real button images and CSF labels. Its Single Player focused mode
      now also unhides `MainMenu.wnd:MapBorder`, `EarthMap`, `ButtonUSA`,
      `ButtonGLA`, `ButtonChina`, `ButtonChallenge`, `ButtonSkirmish`, and
      `ButtonSingleBack`, including real button images, CSF labels, and
      browser pixel proofs. Its Difficulty focused mode now also unhides
      `MainMenu.wnd:MapBorder4`, `EarthMap4`, `StaticTextSelectDifficulty`,
      `ButtonEasy`, `ButtonMedium`, `ButtonHard`, and `ButtonDiffBack`,
      including real button images, CSF labels, title text, and browser pixel
      proofs. Its faction-logo focused mode now also mounts the shipped
      `INIZH.big` `SCLogosUserInterface512.INI` mapped images and
      `TexturesZH.big` `sclogosuserinterface512_001.tga`, unhides
      `WinFactionUS`, `WinFactionGLA`, `WinFactionChina`,
      `WinFactionTraining`, and `WinFactionSkirmish`, and proves their
      `W3DGameWinDefaultDraw` browser pixels in
      `harness-smoke-ww3d-main-menu-layout-faction-logo-repaint-canvas.png`.
      Current archive inspection
      shows `MainMenuBackdrop` is parent `ENABLEDDRAWDATA` behind a shipped
      `W3DNoDraw` callback, and the `MainMenuBackdropuserinterface.tga` /
      `MainMenuBackdrop.tga` texture is absent from the current ZH-only runtime
      archive set, so backdrop proof needs the real source archive/path instead
      of a forced synthetic parent draw.
      Remaining work is broader unpruned shell composition (for example
      `MainMenuBackdrop`, additional image states, and text under normal
      display-owned font/archive lifetime) instead of curated target
      visibility.
- [ ] Locate a real shipped shell layout or state that exercises
      `W3DMainMenuRandomTextDraw` / `StaticTextRandom1` / `StaticTextRandom2`
      before claiming random-text coverage. The current Zero Hour
      `Menus/MainMenu.wnd` asset does not contain those windows, and
      `W3DMainMenuInit` leaves the random-text setup commented out, so the next
      proof must be asset-backed rather than synthesized solely for completion.
- [ ] Terrain heightmap (`BaseHeightMap`/`HeightMap`/`FlatHeightMap`) renders.
      Current focused coverage includes the synthetic terrain tile proof plus
      `test:ww3d-terrain-tile-archive`, which mounts real `TerrainZH.big`,
      decodes `Art\Terrain\PTBlossom01.tga` through original
      `WorldHeightMap::countTiles` / `readTiles`, and verifies the original
      `W3DTerrainBackground` stage-1 texture bind/sample reaches WebGL pixels.
      `test:vertical-integrations` now gates that real archive-backed tile
      render beside the other rendering verticals; it also gates the same real
      tile data through `RTS3DScene::Customized_Render` `CLASSID_TILEMAP`
      dispatch. `test:ww3d-terrain-map-patch-scene` now mounts `INIZH.big`,
      `MapsZH.big`, and `TerrainZH.big`, parses real
      `Data\INI\Terrain.ini` through original `INI::load` /
      `INITerrain.cpp`, parses `Maps\MD_GLA03\MD_GLA03.map` through original
      `WorldHeightMap`, selects a patch with loaded shipped terrain source
      tiles, initializes the original `HeightMapRenderObjClass`, and verifies
      its two-pass `DX8Wrapper::Draw_Triangles` submission produces
      WebGL-visible terrain pixels. `test:ww3d-terrain-visual-scene` now links
      original `TerrainVisual.cpp` / `W3DTerrainVisual.cpp`, calls
      `W3DTerrainVisual::load` against the same real map/archive set, proves the
      visual-owned `HeightMapRenderObjClass` is attached by
      `W3DDisplay::m_3DScene`, captures browser WebGL2 terrain pixels, and now
      also renders the original 129x129 `W3DTerrainVisual::load` draw window
      without post-load patch `initHeightData` reinitialization. It also runs a
      camera-pan render mode over the same visual-owned source-backed 32x32
      patch: the probe moves a real `CameraClass` target/eye, renders two
      `WW3D::Render(W3DDisplay::m_3DScene, camera)` frames, gates two
      base/blend terrain pass pairs, and captures
      `harness-smoke-ww3d-terrain-visual-camera-pan-scene-canvas.png`.
      The same visual-scene smoke now also proves original
      `W3DTerrainLogic::loadMap(query=true)` against the same shipped map,
      including logic-only `WorldHeightMap` parser sections, map-object
      presence, extents, height range, source filename, and time-of-day
      notification agreement with the visual load.
      The selected 32x32 patch remains source-backed. The terrain visual
      harness can now
      mount optional base Generals `Terrain.big` alongside `TerrainZH.big`
      through the same `Terrain*.big` archive mask, while the current ZH-only
      archive set honestly records the load window as 0/16,384 source-backed
      terrain cells.
      `test:vertical-integrations` now includes that visual-owned terrain scene
      plus the no-reinit load-window proof and camera-pan proof beside the
      lower-level tile, scene-dispatch, and map-patch terrain proofs.
      `test:ww3d-terrain-road-buffer-scene` now also proves a focused original
      `W3DRoadBuffer::drawRoads` pass over the original heightmap render object
      on a real source-backed `Maps\MD_CHI01\MD_CHI01.map` patch, with
      `Roads.ini` parsed by original `INI::load` / terrain-road parsers, the
      road buffer fed from the full original logical map-object list created by
      `W3DTerrainLogic::loadMap(query=true)`, and a real road texture sampled
      in the browser. `test:ww3d-terrain-bridge-buffer-scene` now does the same
      full logical map-object handoff for `W3DBridgeBuffer::loadBridges` while
      retaining the current in-list bridge-template substitution needed by the
      ZH-only archive set. The
      remaining terrain vertical work is production/full-map display ownership
      with source-backed coverage across the load window, then broadening water,
      shroud, objects, and continuous gameplay-owned camera flow on top of the
      same original heightmap path.
- [ ] Replace the probe-only
      `CNC_PORT_TERRAIN_PROBE_MINIMAL_HEIGHTMAP_SYSTEMS` guard and
      `wasm_ww3d_terrain_probe_stubs.cpp` weak adjacent-system symbols with
      the real tree, prop, bib, bridge, waypoint, shroud, water, and road
      runtime systems as those subsystems become browser-ready. The original
      `W3DBibBuffer` constructor/add/remove/clear/free lifecycle is now
      browser-harness verified through browser-backed D3D8 buffers/textures,
      and the original `W3DPropBuffer` add/update/doFullUpdate/cull/remove/clear
      path is now browser-harness verified for a range-backed shipped
      `CINE_MOON` model/texture via the prop buffer's cloned `MeshClass`
      rendered through `WW3D::Render` and WebGL2. The production-shaped
      `HeightMapRenderObjClass::Render` -> `W3DPropBuffer::drawProps` ->
      `RTS3DScene::Flush` -> `TheDX8MeshRenderer.Flush` path is now
      browser-harness verified against the same shipped prop model/texture on a
      real source-backed map patch. The original `W3DTreeBuffer::drawTrees`
      path is now browser-harness verified through
      `HeightMapRenderObjClass::Render` -> `RTS3DScene::Flush` -> `DoTrees`
      using shipped `PTDogwod01_S` W3D and terrain/tree textures on the same
      real source-backed map patch. The original `W3DRoadBuffer::drawRoads`
      path is now browser-harness verified through
      `HeightMapRenderObjClass::Render` on a real MD_CHI01 source-backed patch:
      the probe calls original `W3DTerrainLogic::loadMap(query=true)`, keeps
      the resulting full `MapObject` list live, collects road candidate pairs
      from that list, feeds the list to original `W3DRoadBuffer::loadRoads`,
      samples the shipped `TRThickLine` road texture from `TexturesZH.big`, and
      proves the road draw follows the terrain base/blend passes. The original
      `W3DBridgeBuffer::loadBridges` / `updateCenter` plus
      `W3DBridge::renderBridge` geometry path is now browser-harness verified
      from the same full logical map-object list on a real
      `Maps\MD_CHI01\MD_CHI01.map` bridge pair; the current ZH-only asset set
      still substitutes an available bridge template in-place on the selected
      logical list entries. Production map/object tree placement, production
      `query=false` / `W3DTerrainLogic::newMap` ownership through the normal
      `DO_ROADS` terrain path, TerrainLogic-owned bridge damage states through
      real AI/pathfinder ownership, and shroud-aware tree behavior remain open. A
      direct broad removal of the
      minimal heightmap/road bypass still times out and crashes Chromium after
      archive mounting, so full adjacent heightmap ownership remains open. The
      `W3DTerrainVisual::load` smoke currently also keeps cold
      water/tracks/shadow/smudge methods weakly stubbed because the focused
      proof keeps water null and does not call full `W3DTerrainVisual::init`.
      Its logical terrain load proof also uses probe-local `GameClient`,
      `ThingFactory`, and `ScriptEngine` ownership plus weak adjacent-script
      symbols only to reach query-mode map load; replace those with full
      original runtime ownership before treating the path as gameplay-owned.
- [ ] Promote the browser-proven terrain shroud path from focused
      source-backed map-patch ownership into full `W3DTerrainVisual::init` /
      partition gameplay ownership. The current
      `test:ww3d-terrain-shroud-scene` harness mounts real `INIZH.big`,
      `MapsZH.big`, and `TerrainZH.big`, initializes a `BaseHeightMap`-owned
      `W3DShroud` in shroud mode, and verifies the original
      `HeightMapRenderObjClass::Render` extra-pass dispatch submits a
      browser-visible `W3DShroudMaterialPassClass` terrain draw without the old
      probe direct-D3D fallback. Remaining work is to wire the full terrain
      visual, partition, and shroud owners, then let gameplay fog updates come
      from `PartitionManager::refreshShroudForLocalPlayer`.
- [ ] Promote bridge-buffer drawing from the focused
      `drawBridges(FALSE, nullptr)` proof into production TerrainLogic-owned
      damage-state behavior. The focused browser scene now verifies the
      textured bridge base pass and bridge shroud overlay from the full logical
      map-object list, but still clears `TheTerrainLogic` for drawing and passes
      `nullptr` into `W3DBridgeBuffer::loadBridges` so it does not exercise
      damaged/repaired bridge state lookup or `TheAI->pathfinder()->addBridge`
      ownership from real gameplay objects.
- [ ] Promote the combined terrain-full-scene missing-water-assets frontier
      into actual original water rendering and gameplay-owned shroud updates.
      The current `test:ww3d-terrain-full-scene` harness mounts the real map,
      terrain, `Terrain.ini`, and `Water.ini`, then renders the source-backed
      `W3DTerrainVisual::load` scene while reporting a typed
      `full-init-missing-water-assets-frontier` when the mounted archive subset
      lacks the original Water.ini texture set. Remaining work is to supply and
      mount the correct base/Zero Hour water texture archive set, let full
      `W3DTerrainVisual::init` create the original `WaterRenderObjClass`, and
      verify water draw submission, shroud overlay/gameplay ownership, and a
      browser screenshot before adding the path to `test:vertical-integrations`.
- [ ] Once a base Generals `Terrain.big` artifact is available in this
      workspace, rerun `test:ww3d-terrain-visual-scene` with the optional base
      archive mounted and tighten the load-window gate to require nonzero
      source-backed terrain cells.
- [ ] Once optional base Generals runtime archives are available in this
      workspace, rerun `test:ww3d-terrain-bridge-buffer-scene` without Zero
      Hour bridge-template substitution and tighten it to require source-backed
      selected terrain cells for the bridge scene patch.
- [ ] Remove the `volatile getSeps()` "warm-up read" workaround in the terrain
      INI probe and fix the real root cause of the browser `INI::load` trap.
      The terrain smokes now report and gate a direct `INI` layout comparison
      between the terrain probe TU and the real INI runtime: `sizeof(INI)`,
      `m_seps` / `m_sepsPercent` / `m_sepsColon` / `m_sepsQuote` offsets, and
      separator literals all match under the current wasm build. That rules out
      the original suspected header/ODR member-offset mismatch for this target,
      but removing the separator touch still makes the map-patch browser RPC
      time out and crash after archive mounting. Keep the workaround until the
      remaining browser/runtime root cause is isolated with a stronger
      constructor/lifetime or optimizer proof, then drop it and keep
      `test:ww3d-terrain-map-patch-scene`,
      `test:ww3d-terrain-visual-scene`, and `test:vertical-integrations`
      gating the layout parity.
- [ ] Scene/camera (`W3DScene`, `W3DDisplay`) renders the shell/menu background.
      Current coverage: `test:ww3d-display-shell-composite` layers a focused
      `W3DDisplay::m_3DScene` render, real `WatermarkChina` mapped shell UI art,
      and `GameText`-backed `W3DDisplayString` text in one browser screenshot.
      A follow-up `test:ww3d-window-repaint` now proves a synthetic original
      `W3DGameWindowManager` push-button repaints through
      `GameWindowManager::winRepaint` and real `W3DDisplay`/WebGL2 pixels, and
      `test:ww3d-window-layout-repaint` now proves an archive-loaded
      `WindowZH.big` `WindowLayout` can repaint through the same browser W3D
      path; `test:ww3d-main-menu-layout-repaint` now extends that to the real
      `Menus/MainMenu.wnd` `MapBorder4` rectangle. Keep the next scene/camera
      work focused on either fuller shell composition or terrain first pixels.
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
      Current original-input coverage includes Single Player dropdown/back,
      USA faction selection into Difficulty/back, Load Replay dropdown/back,
      MainMenu-to-CreditsMenu, and `ButtonSkirmish` through original
      `MainMenuSystem` into real `SkirmishGameOptionsMenuInit` /
      `SkirmishGameOptionsMenuShutdown` ownership, including focused
      `SkirmishGameInfo`, `MultiplayerSettings`, `PlayerTemplateStore`, and
      `MapCache` dependencies for option gadget population. The real
      `ButtonBack` path is now driven through
      `SkirmishGameOptionsMenuSystem`, including Skirmish preferences write,
      `Shell::pop`, `TheSkirmishGameInfo` deletion, and
      `SkirmishGameOptionsMenuUpdate` completing the pending pop. The real
      `ButtonStart` path is now driven through `SkirmishGameOptionsMenuSystem`,
      `CheckForCDAtGameStart`, `SkirmishGameInfo::startGame`, selected-map
      `GlobalData` write, and `MessageStream` `MSG_NEW_GAME` argument
      queueing, followed by original `MessageStream::propagateMessages`
      handoff to `TheCommandList` and `CommandList::reset` cleanup. The
      `verify:gamelogic-new-game-dispatch-frontier` gate now pins that original
      source path, and `gamelogic-new-game-dispatch-smoke` links original
      `GameLogic.cpp`, `GameLogicDispatch.cpp`, `GameState.cpp`,
      `PlayerList.cpp`, `Player.cpp`, `ScriptEngine.cpp`, and `Scripts.cpp`
      to drive
      `GameLogic::processCommandList` on a real `MSG_NEW_GAME` through
      original `GlobalData.cpp` / `TheWritableGlobalData`, original
      `PlayerList::getNthPlayer` neutral-player ownership, original
      `ScriptEngine::setGlobalDifficulty`, original `Shell::hideShell`, and
      the first-call `startNewGame(FALSE)` deferral before terrain load. That
      runtime still uses a focused in-memory BlankWindow adapter; replace that
      with a real owner before continuing the deferred update into
      terrain/player/script map-load ownership. A
      current inventory of the extracted Zero Hour runtime `.big` archives
      finds no `Window\Menus\BlankWindow.wnd` and classifies the path as an
      absent optional base `Window.big` layout, matching the original
      `Win32BIGFileSystem::init` behavior that also mounts base Generals
      `*.big` archives. Supply or preserve base `Window.big`, prove
      `blankWindowLayout.ready` with
      `--require-blank-window-layout`, then replace the in-memory BlankWindow
      adapter through the archive-backed `WindowLayout::load` path before
      continuing the deferred update into terrain/player/script map-load
      ownership.
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
      The `Mss.H` startup/provider/listener/filter/sample/stream-handle
      boundaries are now stateful and harness-probed by the MSS lifecycle RPCs,
      and `node WebAssembly/dist/miles-audio-open-device-smoke.cjs` now
      instantiates the original `MilesAudioManager` and drives its real
      `openDevice()` path through shared browser MSS runtime state. Full
      `AudioManager::init` INI-driven startup plus Web Audio playback owned by
      the original manager's event/sample/stream paths remain open.
- [ ] Replace remaining `Mss.H`/`dsound.h` compatibility paths used by
      `MilesAudioManager.cpp` with a browser-backed audio device that owns real
      sample data, streams, provider/listener state, mixer state, and
      Bink-sharing handles. The startup boundary is no longer compile-only, but
      playback scheduling, decoded stream data, and DirectSound speaker/device
      replacement remain open. The 2D sample handle lifecycle is now stateful and
      harness-probed by `mssSampleLifecycleProbe`, covering sample init, file
      assignment, callbacks, volume/pan/rate/loop settings, start/stop/resume,
      status, and release. The focused `mssSamplePlaybackProbe` now drives a
      valid in-memory PCM WAV from `AIL_start_sample` into the browser
      `AudioBufferSourceNode -> GainNode -> StereoPannerNode -> soundGainNode`
      graph after the Web Audio gesture, then asserts Web Audio completion,
      MSS end, EOS callback, and release; folding that backend into the real
      `MilesAudioManager::playAudioEvent` 2D `playSample` request path now has
      a focused original-manager smoke that drives
      `processRequest -> playAudioEvent -> playSample` through
      `AudioFileCache`, `AIL_WAV_info`, `AIL_set_sample_file`,
      `AIL_start_sample`, MSS completion callback, and sample release in the
      manager-owned 2D pool. The HSTREAM
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
      The startup probe now also resolves the original `initDelayFilter`
      `AIL_enumerate_filters` lookup to a browser-owned `Mono Delay Filter`
      handle, and the focused original-manager `openDevice()` smoke verifies
      the same provider/listener/sample/filter state from `MilesAudioManager`
      itself, without implementing the filter DSP path.
- [ ] Harness-drive `MilesAudioManager` through the engine audio event path and
      assert observable playback state, mixer volume changes, completion
      callbacks, and 2D/3D sample lifecycle once the original manager 2D
      sample leg is merged with the browser Web Audio completion harness and
      the stream/3D playback backends exist; `verify:audio-sound-manager-
      counters-frontier` now pins the source-only `SoundManager` counter
      contract that runtime playback must satisfy.
- [ ] Move original `MilesAudioManager` 2D sample playback into the same
      browser `cnc-port` runtime/Web Audio backend. The paired
      `test:browser-audio-miles-webaudio-vertical` gate now runs the original
      `processRequest -> playAudioEvent -> playSample` smoke beside a browser
      MSS `AudioBufferSourceNode` completion/release proof in one Playwright
      harness, but the original manager still runs as a standalone node smoke.
      Next, link that manager-owned 2D sample leg into the browser runtime so
      its `AudioFileCache` bytes call `AIL_start_sample`, schedule Web Audio,
      observe `onended`, drive the MSS EOS callback, and release
      `PlayingAudio` without the paired standalone/browser split.
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
      `AudioBufferSourceNode` lifecycle proof through the runtime mixer, and
      the MSS sample playback probe now schedules a valid synthetic PCM WAV
      through the browser mixer from `AIL_start_sample`. Expand those proofs
      into full resolved requested-payload decode/cache storage and real
      engine-driven Web Audio scheduling/lifecycle.
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
      types. `test:browser-audio-request-path` now isolates that proof as a
      focused browser smoke and `test:vertical-integrations` includes it as an
      independent audio vertical. It is still harness-driven rather than
      executed by the original `MilesAudioManager` runtime.

---

## M8 — Video (Bink → WebCodecs)

- [ ] Re-target `VideoDevice/Bink` (`BinkVideoPlayer`/`VideoStream`) to WebCodecs
      or `<video>`.
- [ ] Extend the current browser Bink provider from real-file open/header parsing
      and frame-cursor lifecycle to actual decoded frame copy/upload through
      WebCodecs or a deliberate decoder path; `test:bink-video-provider` now
      proves `BinkOpen` can resolve the shipped loose payloads and fill the
      original `HBINK` fields, and `test:bink-provider-sidecar-browser` now
      proves a browser hook can synchronously copy decoded WebM sidecar pixels
      into `BinkCopyToBuffer`'s wasm destination buffer. The browser
      `test:bink-videoplayer-sidecar-browser` smoke now proves an original
      `BinkVideoPlayer` / `BinkVideoStream::frameRender` flow can own that
      sidecar copy into a `VideoBuffer`, and
      `test:bink-w3d-video-buffer-browser` now proves that same original-player
      flow can copy decoded sidecar pixels into a real `W3DVideoBuffer` and
      emit browser D3D8 texture updates. `test:ww3d-display-video-buffer` now
      proves a synthetic real `W3DVideoBuffer` can be presented by original
      `W3DDisplay::drawVideoBuffer` through display-owned `Render2DClass` to
      the browser D3D8/WebGL2 canvas with a screenshot and pixel checks.
      `test:bink-w3d-video-presentation-browser` now joins those paths for the
      shipped sidecars: original `BinkVideoPlayer` streams copy decoded WebM
      sidecar pixels into real `W3DVideoBuffer` textures and present them
      through original `W3DDisplay::drawVideoBuffer` with browser draw/pixel
      checks, and `test:vertical-integrations` now includes that Bink/W3D
      presentation path as an independent video vertical gate. That smoke now
      also exercises a focused original
      `Display::playMovie/update/stopMovie` path and a focused original
      `WindowVideoManager::playMovie/update` path that attaches a real
      `W3DVideoBuffer` to a `GameWindow`, plus a focused blank-window
      `WindowLayout::load("Menus/BlankWindow.wnd")` /
      first-window `WinInstanceData::setVideoBuffer` path shaped like
      `ScoreScreen::PlayMovieAndBlock`. It now also links original
      `ScoreScreen.cpp` in a focused runtime target and drives original
      `PlayMovieAndBlock("VS_small")` for 70 decoded frames through
      `TheDisplay->draw()`, using a gated blank-layout hook only for harness
      setup. It now also drives the extracted original ScoreScreen
      final-campaign movie helper through a real `CampaignManager` /
      `Campaign` / final-`Mission` transition and verifies another 70
      `VS_small` decoded frame presentations plus blank-layout cleanup. It now
      also hook-counts the final-campaign stats/LOD gates: the high-detail `USA`
      path records normal difficulty and `BATTLE_HONOR_CAMPAIGN_USA` while
      playing 70 frames, and the low-res `CHALLENGE_3` path records hard
      difficulty, `BATTLE_HONOR_CHALLENGE_MODE`, challenge index 3, executes all
      three LOD checks, opens no Bink stream, and leaves texture/draw counts
      unchanged. It now also drives the full `finishSinglePlayerInit` non-final
      victorious branch through a real `CampaignManager` / two-mission campaign
      in the focused ScoreScreen hook build, verifying `SaveAndContinue`,
      next-map selection,
      saved-text visibility, and hook-counted mission-save, message-resource
      cleanup, and `ScoreScreenShow` transition edges without adding Bink
      frames. It now also drives the non-challenge defeat/retry branch through
      the same focused hook build, verifying `Retry`, no mission advancement,
      no mission save, hidden saved-text, message-resource cleanup, and
      `ScoreScreenShow` transition edges without adding Bink frames. It now
      also drives the challenge win/loss branches through the same focused
      hook build, verifying challenge persona text, portrait, backdrop
      visibility, transition suppression, mission save/retry behavior, and
      win/loss audio events without adding Bink frames. It now
      also drives original `SinglePlayerLoadScreen::init`
      through a gated harness-only movie/campaign hook and a synthetic
      `Menus/SinglePlayerLoadScreen.wnd` hierarchy for 70 `VS_small`
      frame presentations. It now also drives original
      `ChallengeLoadScreen::init` through a focused real `CampaignManager` /
      `ChallengeGenerals` setup: the selected challenge campaign supplies the
      player persona, the selected mission supplies the opponent persona and
      `GC_Background` movie label, the synthetic static-text layout verifies
      teletype-rendered bio text, and the smoke verifies player/opponent
      name/taunt plus ambient audio events while still presenting
      `GC_Background` plus `VS_small`/`VSSmall` child-window portrait and
      VS-overlay movies. This item remains open until the final
      decoder/format policy is locked down and the full original InGameUI,
      campaign-owned load-screen setup, full production Challenge persona setup
      from the normal shell/INI path, full non-test `finishSinglePlayerInit`
      subsystem coverage
      (including original `GameState::missionSave`,
      `InGameUI::freeMessageResources`, transition-handler calls, production
      `SkirmishBattleHonors` persistence, and real `GameLODManager` singleton
      ownership), and Bink/audio sync drive the same video surface.
- [ ] Promote the provider-owned WebM sidecar manifest metadata into the
      original `BinkVideoPlayer` runtime path: connect a browser video
      presentation handle to `BinkVideoStream` open/play/seek/frame progression
      and harness-test an original `BinkVideoPlayer`-owned flow. The provider
      now attaches `bink-browser-video-manifest.json` metadata to `HBINK`
      handles and the browser smoke proves the sidecars are playable through
      `<video>`. The provider also emits browser-observable sidecar lifecycle
      hooks for open/decompress/pending-copy/copy-complete/advance/seek/close,
      and its browser-only copy hook can fill wasm memory from decoded WebM
      sidecar pixels. The browser `BinkVideoPlayer` sidecar smoke now mounts
      the real BIK payloads and sidecar manifest, installs the copy hook, and
      verifies original player-owned open/decompress/render/advance/seek/close
      copies decoded sidecar pixels into `SmokeVideoBuffer` memory. The browser
      `Bink W3DVideoBuffer` upload smoke now initializes WW3D, renders those
      original streams into real `W3DVideoBuffer` textures, and verifies
      nonzero browser texture updates for the validated power-of-two texture
      sizes. The `W3DDisplay` video-buffer smoke now verifies synthetic
      `TYPE_X8R8G8B8` `W3DVideoBuffer` presentation through original
      `W3DDisplay::drawVideoBuffer` and browser canvas readback.
      `test:bink-w3d-video-presentation-browser` now verifies original-player
      Bink sidecar frames through real `W3DVideoBuffer` upload and original
      `W3DDisplay::drawVideoBuffer` presentation with a harness screenshot.
      The same smoke now also proves focused original
      `Display::playMovie/update/stopMovie` ownership and focused original
      `WindowVideoManager::playMovie/update` ownership of a window-attached
      real `W3DVideoBuffer`, plus a focused blank-window
      `WindowLayout::load("Menus/BlankWindow.wnd")` /
      first-window `WinInstanceData::setVideoBuffer` path shaped like
      `ScoreScreen::PlayMovieAndBlock`. It now also proves focused original
      `ScoreScreen::PlayMovieAndBlock("VS_small")` ownership end-to-end
      through 70 Bink sidecar frame copies, real `W3DVideoBuffer` uploads,
      original `TheDisplay->draw()` calls, and harness screenshot/pixel
      checks. It now also proves focused original
      `SinglePlayerLoadScreen::init("VS_small")` ownership end-to-end
      through 70 decoded frame presentations and destructor cleanup. It now
      also proves focused original `ChallengeLoadScreen::init` ownership
      end-to-end through a real `CampaignManager` / `ChallengeGenerals`
      campaign/persona lookup for `GC_Background` plus `VS_small`/`VSSmall`
      child-window movies, including teletype bio text, persona audio events,
      179 background frames, 372 managed child-window copies, and 551
      Challenge presentations. It now also proves the extracted
      ScoreScreen final-campaign movie helper through a real
      `CampaignManager` / `Campaign` / final-`Mission` transition, including
      the original `PlayMovieAndBlock("VS_small")` call, 70 decoded frame
      presentations, finish-campaign button state, and blank-layout cleanup.
      It now also hook-counts the final-campaign stats/LOD gates for the
      high-detail `USA` movie path and the low-res `CHALLENGE_3` skip path,
      verifying difficulty/honor/challenge-index recording, all three LOD
      checks, no Bink stream open on skip, and unchanged texture/draw counts.
      It now also drives the full non-final victorious `finishSinglePlayerInit`
      branch in the focused ScoreScreen hook build, verifying mission
      advancement, `SaveAndContinue`, saved-text visibility, and hook-counted
      mission-save/message-cleanup/transition edges without adding Bink frames.
      It now also drives the non-challenge defeat/retry branch in the focused
      hook build, verifying `Retry`, no mission advancement, no mission save,
      hidden saved-text, message-cleanup, and transition edges without adding
      Bink frames. It now also drives the challenge win/loss branches in the
      focused hook build, verifying challenge UI text/portrait/backdrop
      updates, mission save/retry behavior, transition suppression, and
      win/loss audio events without adding Bink frames.
      Full original InGameUI, campaign-owned load-screen setup,
      full production Challenge persona setup from the normal shell/INI path,
      full non-test
      `finishSinglePlayerInit` subsystem edges, production
      `SkirmishBattleHonors` persistence / real `GameLODManager` singleton
      ownership, and Bink/audio sync remain open.
      `test:bink-videoplayer-runtime` now
      proves an original `BinkVideoPlayer`-owned wasm flow can `init`, register
      the shipped videos, open/load `BinkVideoStream`s, and exercise
      ready/decompress/render/advance/seek/close against the real BIK payloads
      with the sidecar manifest present while keeping decode readiness false
      in the no-browser-hook node path.
      `verify:bink-runtime-callsite-frontier` now pins the source-only
      original Bink runtime *callsite* frontier that this runtime-wiring work
      must preserve (the `W3DGameClient::createVideoPlayer` `NEW BinkVideoPlayer`
      factory, `GameClient::init` `TheVideoPlayer` ownership path,
      `BinkVideoPlayer::open/createStream/load` `m_handle`/`BinkSetVolume`
      contract, the representative `Display`/`InGameUI`/`WindowVideoManager`/
      `LoadScreen`/`ScoreScreen` frame loops, the `LoadScreen` min-spec
      `frameGoto(frameCount())` skip path, the `VideoBuffer`/`W3DVideoBuffer`
      lock/unlock/format/pitch contract, and the existing CMake compile
      frontier target); it keeps runtime playback and open-frame upload open
      and does not claim them complete.
      `verify:bink-ingameui-movie-frontier` now pins the source-only
      InGameUI movie ownership contract specifically: the header method/field
      surface, constructor initialization, `InGameUI::update` main and cameo
      frame-loop order, `playMovie`/`stopMovie` buffer and stream ownership,
      `playCameoMovie`/`stopCameoMovie` `RightHUD` buffer attachment, and the
      original CommandXlat / ScriptActions entry points. It is source-only:
      a focused runtime `InGameUI` instantiation currently pulls the broad
      ControlBar/GameLogic/ScriptEngine link surface, so runtime InGameUI
      movie playback remains open.
      `verify:bink-loadscore-movie-frontier` now pins the source-only original
      load-screen and score-screen movie ownership contract: `LoadScreen.h`
      video buffer/stream fields, `SinglePlayerLoadScreen::init` and
      `ChallengeLoadScreen::init` mission-movie open/buffer/frame/draw loops,
      challenge portrait/VS overlay `WindowVideoManager` movie calls, and the
      `ScoreScreen` final-victory `PlayMovieAndBlock` blank-window playback
      path. It now also pins the focused runtime proof that installs the gated
      ScoreScreen blank-layout hook, links `zh_score_screen_movie_runtime`,
      calls original `PlayMovieAndBlock("VS_small")`, drives the extracted
      ScoreScreen final-campaign movie helper through a real
      `CampaignManager` / `Campaign` / final-`Mission` transition, calls original
      `finishSinglePlayerInit` through a focused non-final victorious
      two-mission campaign with hook-counted mission-save/message-cleanup/
      transition edges, calls original `finishSinglePlayerInit` through a
      focused non-challenge defeat/retry campaign with hook-counted no-save/
      message-cleanup/transition edges, calls original `finishSinglePlayerInit`
      through focused challenge win/loss branches with challenge UI/audio and
      transition-suppression assertions, calls original
      `SinglePlayerLoadScreen::init` through a gated movie/campaign hook, and
      calls original `ChallengeLoadScreen::init` through a focused
      `CampaignManager` / `ChallengeGenerals` campaign/persona setup. The
      browser harness now expects 12 open/close lifecycles, 766 total copies,
      766 draw-buffer indexed draws, 13 texture creates, 779 texture updates,
      and 12 texture releases. It
      does not claim runtime InGameUI, full campaign-owned load-screen setup,
      full production Challenge persona setup from the normal shell/INI path,
      full non-test
      `finishSinglePlayerInit` subsystem edges, production
      `SkirmishBattleHonors` persistence / real `GameLODManager` singleton
      ownership, or Bink/audio sync complete; the
      broader CampaignManager/GameInfo/GameWindow layout/LOD/shell/GUI
      singleton path still needs to link and be harness-driven.
      `verify:bink-browser-sidecar-contract` also pins the sidecar manifest
      schema/path, BIK source-to-WebM metadata association, original-style path
      aliases (`Data\Movies\<name>.bik` and
      `Data/<lang>/Movies/<name>.bik` resolving to `<name>.webm`), and the
      invariant that `WasmBinkProviderCanDecodeFrames` is false without the
      browser copy hook and hook-gated when `BinkCopyToBuffer` delegates a
      decoded sidecar pixel copy into wasm memory.
      `verify:bink-w3d-video-buffer-upload-frontier` now pins the next
      source-only upload/presentation frontier from original
      `BinkVideoStream::frameRender` through the abstract `VideoBuffer`
      contract, original `W3DVideoBuffer` surface/texture ownership, and the
      browser D3D8 texture update hook. It also pins the new
      `test:bink-w3d-video-buffer-browser` runtime proof; the same smoke now
      has the `test:bink-w3d-video-presentation-browser` alias for the joined
      display presentation proof and pins the focused original
      `Display::playMovie/update/stopMovie` path plus the focused original
      `WindowVideoManager::playMovie/update/reset` path that owns a
      `GameWindow` video buffer, and now also pins the focused
      blank-window `WindowLayout::load("Menus/BlankWindow.wnd")` /
      first-window `WinInstanceData::setVideoBuffer` path shaped like
      `ScoreScreen::PlayMovieAndBlock`, plus the original
      `ScoreScreen::PlayMovieAndBlock("VS_small")` runtime loop, focused
      original `SinglePlayerLoadScreen::init("VS_small")` runtime loop, and
      focused original `ChallengeLoadScreen::init` runtime loop through a real
      `CampaignManager` / `ChallengeGenerals` campaign/persona lookup for
      `GC_Background` plus `VS_small`/`VSSmall` child movies, plus the
      extracted ScoreScreen final-campaign movie helper with hook-counted
      stats/LOD gates and low-res skip, plus the hook-counted non-final
      victorious and defeat/retry `finishSinglePlayerInit` branches.
      Full original
      InGameUI, campaign-owned load-screen setup, full production Challenge
      persona setup from the normal shell/INI path, full non-test
      `finishSinglePlayerInit` subsystem edges, and Bink/audio sync ownership
      remain open.
      `verify:bink-w3d-video-presentation-frontier` now pins the source-only
      *presentation* contract from the original Bink/W3D video-buffer upload
      to final `W3DDisplay::drawVideoBuffer` presentation: it asserts
      `drawVideoBuffer` casts to `W3DVideoBuffer*` and drives the
      display-owned `Render2DClass`
      (`Reset` -> `Enable_Texturing(TRUE)` -> `Set_Texture(vbuffer->texture())`
      -> `Add_Quad(RectClass(startX,startY,endX,endY), Rect(0,0,1,1))` ->
      `Render`) in order, and that `createVideoBuffer` creates the
      `W3DVideoBuffer` through the original
      `DX8Wrapper::Get_Current_Caps()` / `D3DFMT` format-selection path. It
      is honest that the same `Render2DClass` textured-quad primitive has
      browser-backed coverage via `test:ww3d-display-drawimage-file`, and
      `test:bink-w3d-video-presentation-browser` now provides the runtime
      decoded-Bink-frame screenshot proof for this focused path, including
      focused original `Display::playMovie/update/stopMovie` ownership and
      focused original `WindowVideoManager::playMovie/update` ownership of
      the attached `GameWindow` video buffer, plus a focused blank-window
      `WindowLayout::load("Menus/BlankWindow.wnd")` /
      first-window `WinInstanceData::setVideoBuffer` path shaped like
      `ScoreScreen::PlayMovieAndBlock`, and now the focused original
      `ScoreScreen::PlayMovieAndBlock("VS_small")` loop itself, plus focused
      final-campaign stats/LOD and low-res skip coverage, plus focused
      original `SinglePlayerLoadScreen::init("VS_small")` and
      `ChallengeLoadScreen::init` runtime loops, with the Challenge path now
      covering focused campaign/persona lookup, plus the extracted
      ScoreScreen final-campaign movie helper, plus the hook-counted non-final
      victorious, defeat/retry, and challenge win/loss `finishSinglePlayerInit`
      branches. The full
      original InGameUI,
      campaign-owned load-screen setup, full production Challenge persona setup
      from the normal shell/INI path, full non-test `finishSinglePlayerInit`
      subsystem edges, and Bink/audio sync flows still need runtime ownership of that path, though the
      load/score source contract and focused ScoreScreen/SinglePlayer/Challenge
      runtime proofs are pinned by `verify:bink-loadscore-movie-frontier`.
      `verify:bink-audio-sync-frontier` now pins the source-only Bink
      *audio-sync* handoff frontier that future browser Bink playback must
      preserve: `BinkVideoPlayer::init` calling `VideoPlayer::init()` then
      `initializeBinkWithMiles()`, `deinit` releasing the Bink handle before
      the base deinit, `initializeBinkWithMiles` feeding `TheAudio->
      getHandleForBink()` to `BinkSoundUseDirectSound()` with a
      `BinkSetSoundTrack(0,0)` muted-video fallback, `createStream` deriving
      the per-stream volume from `TheAudio->getVolume(AudioAffect_Speech)` and
      calling `BinkSetVolume`, `notifyVideoPlayerOfNewProvider` tearing the
      handoff down on provider loss and re-establishing it on provider gain,
      the abstract `AudioManager` / `VideoPlayer` Bink handle boundary, and
      `MilesAudioManager` ownership of the `m_binkHandle` `PlayingAudio`
      member (destructor leak-assert + release, `getHandleForBink` 2D-sample
      + `AIL_get_DirectSound_info` handoff, `releaseHandleForBink` release,
      and `selectProvider`/`unselectProvider` driving the gain/loss notify).
      It is source-only and does NOT complete runtime Bink audio playback,
      per-frame audio-clock frame progression (`BinkWait`), or a Web Audio /
      DirectSound handoff; those remain open.
- [ ] Logo / intro movie plays.
- [ ] Mission briefing / cutscene playback with audio sync.
- [ ] In-engine video surfaces (e.g. comms video) render to a texture.
- [ ] Skippable; integrates with game flow/state machine.

---

## M9 — Networking (GameSpy / LAN → WS/WebRTC)

- [ ] Re-target UDP transport (`udp.cpp`, `Transport`) onto WebRTC DataChannel
      or a WebSocket relay. The browser harness now has a first relay-shaped
      byte-path proof: `browserNetworkRelayProbe` asks wasm to serialize a
      real original `NetPacket` frame-info command with `NetPacket::addCommand`,
      carries the packet hex between two logical browser clients through a
      harness relay queue, then asks wasm to parse it with
      `NetPacket::ConstructNetCommandMsgFromRawData`. This proves the original
      packet codec can cross the wasm/browser boundary. `browserNetworkTransportRelayProbe`
      now carries a two-command original packet through the same relay queue,
      injects a frame-info packet into `Transport::m_inBuffer`, runs
      `ConnectionManager::doRelay` to seed the original frame command count,
      then parses the delivered two-command packet and feeds its synchronized
      `NETCOMMANDTYPE_RUNAHEAD` through `FrameDataManager::addNetCommandMsg` /
      `allCommandsReady`. `network_two_contexts_smoke.mjs` now boots two
      isolated Playwright browser contexts / wasm instances, relays only the
      packet hex through Node, and proves the destination context reaches the
      same original `Transport` / `ConnectionManager` / `FrameDataManager`
      readiness path. `network_websocket_transport_smoke.mjs` now initializes
      original `Transport`, calls `Transport::queueSend` and
      `Transport::doSend` so the wasm browser UDP adapter captures one
      encrypted `TransportMessageHeader` + payload datagram, carries that
      datagram as a browser-native `WebSocket` binary frame through the relay,
      pushes it into the destination adapter, calls original
      `Transport::doRecv`, and hands that populated transport to
      `ConnectionManager::doRelay` / `FrameDataManager::allCommandsReady`.
      `npm run verify:websocket-transport-frontier` now pins the wasm UDP
      adapter behind the original concrete non-virtual `UDP` API. The live
      endpoint follow-on now uses `EM_JS` hooks in `UDP::Write` / `UDP::Read`
      (`Module.cncPortBrowserUdpSend` / `Module.cncPortBrowserUdpRecv`) plus
      a JS-owned WebSocket endpoint queue in `bridge.js`; the new
      `network_websocket_live_transport_smoke.mjs` proves two isolated browser
      contexts can move the encrypted original Transport datagram through that
      live endpoint into destination `Transport::doRecv`,
      `ConnectionManager::doRelay`, and `FrameDataManager::allCommandsReady`.
      The LANAPI follow-on now uses the same live endpoint for original
      `LANAPI::RequestGameStart`: `lanapi_live_game_start_smoke.mjs` boots two
      isolated browser contexts, lets the host's original LANAPI transport send
      a broadcast `MSG_GAME_START` datagram through
      `Module.cncPortBrowserUdpSend`, lets the joiner receive it through
      `Module.cncPortBrowserUdpRecv` during `LANAPI::update`, and verifies
      `handleGameStart` / `OnGameStart` create the original
      `Network::initTransport` / `parseUserList` state. The remaining
      production step is to extend this live endpoint into the
      `Network::update` frame-sync loop and validate a two-client match-sync
      harness.
- [ ] Lockstep frame sync (`FrameData`/`FrameDataManager`/`ConnectionManager`)
      works across browser clients. The LAN game-start vertical now reaches
      original `NetworkInterface::createNetwork`, `Network::init`,
      `Network::initTransport`, and `ConnectionManager::parseUserList` for
      both host and joiner, and the single-context follow-on now drives
      `Network::update` through `GetCommandsFromCommandList`,
      `processCommand`, `ConnectionManager::allCommandsReady`,
      `FrameDataManager::allCommandsReady`, `timeForNewFrame`, and
      `RelayCommandsToCommandList` far enough to prove the first
      `frameDataReady` transition. The multi-frame follow-on now drives three
      `Network::update` calls after LAN game-start, resets `TheCommandList`
      between calls to model command consumption, hard-asserts the first-frame
      readiness transition, observes later calls preserving the in-game
      connection state, and also proves the original
      `FrameData::allCommandsReady` not-ready/resend states used at the desync
      frontier. The live endpoint now carries LANAPI game-start into
      `OnGameStart` and original network setup across two browser contexts.
      Deferred next networking slice: route `Network::update` frame commands
      over the live shared WebSocket/WebRTC endpoint and extend coverage from
      single-context frame readiness to a two-client match-sync harness after
      the rendering/input/gameplay verticals are further along.
      The current WebSocket binary vertical now proves the production encrypted
      `Transport::queueSend` / `Transport::doSend` and
      `Transport::doRecv` path over browser binary frames through the wasm UDP
      adapter and live JS endpoint.
- [ ] LAN API (`LANAPI`) over a browser-discoverable transport / relay. The
      first announce/discovery slice now reaches `LANAPI::update`,
      `handleGameAnnounce`, `ParseGameOptionsString`, and `OnGameList`; the
      join/options slice now drives `RequestGameJoin`, `handleRequestJoin`,
      `handleJoinAccept`, and `handleGameOptions` across two isolated browser
      contexts via queued `Transport` bytes; the game-start slice now drives
      `RequestGameStart`, `handleGameStart`, and `OnGameStart` into original
      `NetworkInterface` setup plus `MSG_NEW_GAME`/seed/map side effects; the
      update slice now advances that setup through original `Network::update`
      into first-frame readiness. The WebSocket binary transport smoke removes
      the Node-mediated packet-hex handoff for the GameNetwork packet vertical,
      and `lanapi_websocket_flow_smoke.mjs` now carries LAN announce,
      join/options, and game-start messages through browser `WebSocket` binary
      frames before handing them to the original LANAPI accept paths. The live
      endpoint follow-on now wires original LANAPI game-start send/receive
      through `Transport::update` and `LANAPI::update`; LANAPI still needs that
      live endpoint carried forward into the running `Network::update`
      frame-sync loop.
- [ ] GameSpy matchmaking/chat (`GameSpy*`) → modern relay or stub gracefully.
- [ ] NAT/firewall helpers replaced by WebRTC ICE.
- [ ] Cross-client **determinism** validated (no desync) over many frames.
      The current multi-frame update/desync smoke is still single-context: it
      proves original `Network::update` progression, first-frame readiness,
      and `FrameData` not-ready/resend states, not two browser clients using
      the live endpoint to stay synchronized in a running match.
- [ ] File transfer / map transfer path.
- [ ] Harness: drive a 2-client match in two headless contexts; assert in sync.
      The current browser network relay proofs now include two isolated
      Playwright contexts, a live WebSocket-backed UDP endpoint for original
      `Transport::doSend`/`doRecv`, live LANAPI game-start into
      `Network::initTransport` / `parseUserList`, and original
      `ConnectionManager` frame-info relay plus `FrameDataManager` readiness,
      but they are still setup/packet/frame readiness proofs rather than a
      match-sync test.

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
