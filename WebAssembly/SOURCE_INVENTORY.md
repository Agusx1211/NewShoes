# Source Inventory

This tracks the current understanding of which `GeneralsMD/Code/Libraries`
components are runtime port targets, compatibility dependencies, or tools-only
inputs. It is based on the checked-in source layout and the original Visual
Studio workspace/project files, especially `GeneralsMD/Code/RTS.dsp` and
`GeneralsMD/Code/RTS.dsw`.

## Runtime Targets

These are part of the real game runtime or are linked by the original `RTS`
target and should be compiled or re-targeted for wasm.

| Component | Current port status | Notes |
|---|---|---|
| `Compression` | Partial | `EAC` BTree, Huff, and RefPack codecs compile and have wasm round-trip smokes. Original `CompressionManager` now compiles and smoke-tests the EAC-backed manager routes; zlib and Nox LZH remain disabled until the missing bundled source bodies are restored or ported. |
| `WWVegas/WWMath` | Complete | All original `WWMath/*.cpp` sources now compile to wasm across `zh_wwmath_core`, `zh_wwmath_curves`, and `zh_wwmath_lookup`. Smokes cover power-of-two helpers, vector math, `Matrix3D` transform/inverse paths, vector processor fallback transforms/min-max/clear, triangle containment, AABox/line/sphere/OBBox collision paths, grid and AAB-tree culling insertion/update/collection/removal, ODE integration, vector randomizers, 1D/3D interpolation, vehicle curves, WWSaveLoad factory registration, default lookup-table sampling, fast trig table initialization, and debug refcount cleanup. |
| `WWVegas/WWLib` | Partial | Original `random.cpp`, Base64, CRC, fixed, hash, MD5, SHA, `StringClass`, file core, RAMFile, utility crypto, command-line parsing, sampling helpers, secure random, palette/RGB/HSV, RLE, tag-block files, pipe/straw stream core, LCW and LZO codec/adapters, `load.cpp` IFF-style uncompression helper, `data.cpp` legacy data helpers, `rcfile.cpp` resource-file wrapper, `registry.cpp` registry wrapper, multiprecision public-key crypto, file/INI helper sources, MIX archive helpers, pooled `SList`/`MultiList` containers, debug `RefCountClass`, `SysTimeClass`/legacy timer wrappers including `_timer.cpp` globals, `ThreadClass`, legacy mono debug output, the Win32 message-loop helper, guarded legacy `Except.cpp`/`point.cpp` translation units, `verchk.cpp` PE-header helpers, in-memory 2D surfaces/blits, PCX image loading, Targa image I/O, and original `win.cpp` globals now compile to wasm as focused `zh_wwlib_*` libraries. Active runtime behavior has Node smoke coverage; the guarded legacy units are compile coverage only, `ThreadClass` currently covers the original `_UNIX` idle-start contract only, mono output remains dormant outside `_WINDOWS`, and the message-loop shim currently exposes an empty browser queue. The non-MSVC LCW compressor currently emits valid literal packets rather than the original x86 optimizer's back-reference search. Current resource/registry shims report unavailable until a browser persistence/resource contract exists. Concrete browser file backends, browser-backed thread start/stop, DOM/input-backed message delivery, DirectDraw-backed `DSurface`/conversion helpers, GNU regex support for `regexpr.cpp`, MPU/RDTSC timing, and broader platform utilities remain open. |
| `WWVegas/WWDebug` | Partial | Original `wwdebug.cpp` core message/assert/trigger/profile handler plumbing compiles to wasm and has a Node smoke. Original `FastAllocator.cpp`, `wwmemlog.cpp`, and `wwprofile.cpp` also compile as `zh_wwdebug_profile`, with smoke coverage for profile tree recording, allocator accounting, and memory-log allocation/free counters. The generic wasm `wwprofile.h` shim still disables scope macros for consumers that do not link the full profile manager, and the `_UNIX` memory-log path keeps category tracking disabled until the browser threading/memory-log contract is decided. |
| `WWVegas/WWSaveLoad` | Complete | Core persistence factory, save/load system, pointer remap, status plumbing, definitions, definition factories/manager, parameters, twiddlers, and WWSaveLoad init/shutdown now compile to wasm. Node smoke coverage verifies factory registration, parameter construction, definition manager lookup, and a chunk-file save/load round trip. |
| `WWVegas/Wwutil` | Complete | Original `mathutil.cpp` and `miscutil.cpp` compile to wasm with WWLib/WWMath dependencies. Node smoke coverage verifies angle/vector math, distance/round/rotation helpers, probability helper bounds, string classification/comparison, file existence/removal, read-only attributes, and PE-header file-id timestamp formatting. |
| `GameEngine/Common` | Partial | Original-source core slice now compiles to wasm across memory, strings, file/BIG archive, compression/data-chunk, language, type masks, geometry, terrain, multiplayer settings, timing, RTS accounting and metadata (`Energy.cpp`, `Handicap.cpp`, `MissionStats.cpp`, `Money.cpp`, `PlayerList.cpp`, `PlayerTemplate.cpp`, `ProductionPrerequisite.cpp`, `Science.cpp`, `SpecialPower.cpp`), message streams, audio request/music/event/manager metadata (`AudioEventRTS.cpp`, `GameAudio.cpp`, `GameMusic.cpp`, `GameSounds.cpp`, dynamic audio), and the first INI leaf/parser wrapper sources (`INIAudioEventInfo.cpp`, `INICommandSet.cpp`, `INIControlBarScheme.cpp`, `INICrate.cpp`, `INIDamageFX.cpp`, `INIDrawGroupInfo.cpp`, `INIMapData.cpp`, `INIModel.cpp`, `INIMiscAudio.cpp`, `INIMultiplayer.cpp`, `INISpecialPower.cpp`, `INITerrain.cpp`, `INITerrainBridge.cpp`, `INITerrainRoad.cpp`, `INIUpgrade.cpp`). A separate real-header compile frontier now also builds all browser-buildable non-device sources from the current `zh_gameengine_common_core` slice, including memory/file/archive system leaves, Bezier helpers, audio metadata/request leaves, and RTS accounting/prerequisite leaves, plus `Common/CommandLine.cpp`, `CRCDebug.cpp`, `DamageFX.cpp`, `GameEngine.cpp`, `GameLOD.cpp`, `GameMain.cpp`, `GlobalData.cpp`, `MiniLog.cpp`, `PerfTimer.cpp`, `Recorder.cpp`, `StateMachine.cpp`, `StatsCollector.cpp`, `UserPreferences.cpp`, `Common/INI/INI.cpp`, the currently browser-buildable `Common/INI` leaf parser sources including `INIWebpageURL.cpp` through the compile-only WOL browser bridge, RTS leaves (`AcademyStats.cpp`, `ActionManager.cpp`, `Player.cpp`, `ResourceGatheringManager.cpp`, `ScoreKeeper.cpp`, `Team.cpp`, `TunnelTracker.cpp`), save/load and system leaves (`BuildAssistant.cpp`, `GameState.cpp`, `GameStateMap.cpp`, `Radar.cpp`, `Upgrade.cpp`, `Xfer.cpp`, `XferCRC.cpp`, `XferLoad.cpp`, `XferSave.cpp`), plus `Common/Thing/DrawModule.cpp`, `Module.cpp`, `Thing.cpp`, `ThingFactory.cpp`, and `ThingTemplate.cpp` without the target-local `Common/INI.h` shim. Node smoke coverage exercises the linked non-rendering Common behavior, `FileSystem` facade local/archive dispatch and music-CD probing, real BIG reads, `DataChunkInput` parsing plus `DataChunkOutput` temp-file serialization, terrain/type/string/file paths, multiplayer setting color/money value paths, and `ScienceStore` metadata registration/name/default-value behavior through the current INI bridge. The audio/INI/RTS/message/recorder/preferences additions, `GameEngine.cpp`, `INIWebpageURL.cpp`, and real-header frontier are compile coverage only until the real INI/Xfer/GlobalData/Thing/GameLogic/GameSpy surfaces replace the current target-local shims in the linked runtime; `parseScience`, `parseScienceVector`, and translated-label parsing are temporary bridge helpers, and `SpecialPower` runtime parsing remains compile-only until the original academy classification table from `AcademyStats.cpp` links into the Common smoke. |
| `GameEngine/GameLogic` | Partial | All 259 original `GameLogic` translation units now compile in the wasm real-header frontier, including AI/pathfinding, object behavior/contain/update leaves, `PartitionManager`, script engine, and `System/GameLogic.cpp`. This is compile coverage only until full object, player, command, runtime singleton, browser device, and networking surfaces link and are harness-driven. |
| `GameEngine/GameClient` | Partial | Utility slice now compiles all 147 original `GameEngine/Source/GameClient` `.cpp` files to wasm, plus the GameClient-facing original INI leaf parser sources (`INIAnimation.cpp`, `INICommandButton.cpp`, `INIMappedImage.cpp`, `INIVideo.cpp`, `INIWater.cpp`). Coverage includes display/text/image/animation/weather/water/video utilities, top-level `GameClient.cpp`, `InGameUI.cpp`, `Input/Mouse.cpp`, `Input/Keyboard.cpp`, `GUI/IMEManager.cpp`, view/camera state, dispatch, drawable/smudge/audio-debug leaves, map/terrain/radius-decal helpers, campaign/hint/ray/particle/drawable-update leaves, message/input translators, EVA/FX/selection info, window/layout/transition managers, `GameWindow`, `LoadScreen`, `Shell`, all core gadgets, control-bar sources, and the full GUI callback/menu set including Main/Options/Download, LAN/skirmish/replay, score, shell, and WOL login/lobby/ladder/game-setup flows. A smaller `GameText.cpp`/`LanguageFilter.cpp` text archive also links independently for DownloadManager coverage. Node smoke coverage verifies the currently linked non-rendering utility behavior and the text manager paths used by DownloadManager; most GameClient files are still compile coverage only until original ControlBar behavior, drawable/display, terrain, real browser input/IME, real Xfer/INI/GameLogic/GlobalData, replay state, GameInfo/LAN/GameSpy/WWDownload, WOL browser panes, and the browser render/video layers link and are harness-driven. |
| `GameEngine/GameNetwork` | Partial | Core command/frame and setup/LAN/download-manager slice now compiles to wasm from original source: `Connection.cpp`, `ConnectionManager.cpp`, `DisconnectManager.cpp`, `DownloadManager.cpp`, `FileTransfer.cpp`, `FirewallHelper.cpp`, `FrameData.cpp`, `FrameDataManager.cpp`, `FrameMetrics.cpp`, `GameInfo.cpp`, `GameMessageParser.cpp`, `GameSpy/GSConfig.cpp`, `GUIUtil.cpp`, `LANAPI.cpp`, `LANAPICallbacks.cpp`, `LANAPIhandlers.cpp`, `LANGameInfo.cpp`, `NetCommandList.cpp`, `NetCommandMsg.cpp`, `NetCommandRef.cpp`, `NetCommandWrapperList.cpp`, `NetMessageStream.cpp`, `NetPacket.cpp`, `NetworkUtil.cpp`, `Transport.cpp`, `udp.cpp`, and `User.cpp`, plus original `Common/MessageStream.cpp` in the Common archive. The real-header compile frontier also covers original legacy `GameSpyChat.cpp` and `GameSpyGP.cpp`, original `GameSpy/Chat.cpp`, `GameSpy/LadderDefs.cpp`, `GameSpy/LobbyUtils.cpp`, `GameSpy/MainMenuUtils.cpp`, `GameSpy/PeerDefs.cpp`, `GameSpy/StagingRoomGameInfo.cpp`, GameSpy thread bodies (`BuddyThread.cpp`, `GameResultsThread.cpp`, `PeerThread.cpp`, `PersistentStorageThread.cpp`, `PingThread.cpp`, and `ThreadUtils.cpp`), `GameSpyOverlay.cpp`, `IPEnumeration.cpp`, `NAT.cpp`, and `Network.cpp`. Node smoke coverage verifies command-id generation, command type policy/name lookups, empty frame readiness through `FrameData`/`FrameDataManager`, direct `Transport::queueSend` rejection/full-queue behavior plus encrypted packet header/payload/CRC preservation, `Connection.cpp` send/ack queue behavior through original packetization and transport buffering, `NetCommandList` sorting/deduplication, `NetPacket` ACK-both/stage1/stage2 plus frame/run-ahead/chat/progress/file-progress and control/disconnect/router/wrapper/file-announce/frame-resend packet round-trips including 16-bit chat text wire serialization, `NetCommandWrapperList` incomplete/duplicate chunk handling and ready-command reassembly/removal, `FileTransfer.cpp` map-path helper behavior, `FrameMetrics.cpp` init/reset/cushion behavior against the current `GlobalData` shim, pooled `User` value behavior, and `DownloadManager` queue/status/error/last-local-file behavior against original `GameText.cpp`/`LanguageFilter.cpp` plus WWDownload. `ConnectionManager.cpp`, `DisconnectManager.cpp`, `Connection.cpp` receive/retry flow, the `FileTransfer.cpp` transfer loop, `FirewallHelper.cpp`, `FrameMetrics.cpp` FPS/latency sampling, `GameInfo.cpp`, `GUIUtil.cpp`, `LANAPI.cpp`, `LANAPICallbacks.cpp`, `LANAPIhandlers.cpp`, `LANGameInfo.cpp`, `NetMessageStream.cpp`, raw UDP flushing, and the real-header GameSpy/NAT/thread/chat/GP additions are compile coverage only until browser transport, `Shell`, `LoadScreen`, `Display`, real `GlobalData`, `GameLogic` progress/game-start state, `MapCache`, multiplayer/player-template/game-text singletons, player/message dependencies, disconnect UI, LAN callback flow, browser Worker/pthread scheduling, GameSpy GP/Peer/QR2/Stats runtime queues, the legacy `TheGameSpyChat` binding, ICMP/socket fallbacks, browser download/update transport, and full game-command/setup serialization smokes are available. LAN UI and runtime packet flow remain open. `GameSpyGameInfo.cpp` remains out of the frontier because the checked-in header marks it obsolete and it conflicts with `GameSpy/StagingRoomGameInfo`. |
| `GameEngineDevice/Win32Device` | Partial | Original `Win32LocalFile.cpp`, `Win32LocalFileSystem.cpp`, `Win32BIGFile.cpp`, and `Win32BIGFileSystem.cpp` compile and have smoke coverage through the Common file/archive tests. The real-header compile frontier also covers original `Win32CDManager.cpp` and `Win32OSDisplay.cpp` with browser no-CD probing and message-box/window-position compatibility. Runtime window/input/timing and browser-native persistence remain open; `Win32OSDisplay` warning prompts currently route through the existing stderr/no-op compatibility surface until a browser/harness dialog contract is implemented. |
| `GameEngineDevice/W3DDevice` | Partial | Original `W3DDevice/Common/W3DConvert.cpp`, `Common/System/W3DFunctionLexicon.cpp`, `Common/System/W3DRadar.cpp`, `Common/Thing/W3DThingFactory.cpp`, `Common/Thing/W3DModuleFactory.cpp`, `GameLogic/W3DGameLogic.cpp`, `GameLogic/W3DGhostObject.cpp`, `GameLogic/W3DTerrainLogic.cpp`, `GameClient/TileData.cpp`, `GameClient/W3DPoly.cpp`, `GameClient/W3DFileSystem.cpp`, the W3D GUI/gadget batch (`W3DCheckBox.cpp`, `W3DComboBox.cpp`, `W3DHorizontalSlider.cpp`, `W3DListBox.cpp`, `W3DProgressBar.cpp`, `W3DPushButton.cpp`, `W3DRadioButton.cpp`, `W3DStaticText.cpp`, `W3DTabControl.cpp`, `W3DTextEntry.cpp`, `W3DVerticalSlider.cpp`, `W3DControlBar.cpp`, `W3DMainMenu.cpp`, `W3DGameFont.cpp`, `W3DGameWindow.cpp`, and `W3DGameWindowManager.cpp`), terrain-support/display-helper leaves (`BaseHeightMap.cpp`, `FlatHeightMap.cpp`, `HeightMap.cpp`, `TerrainTex.cpp`, `WorldHeightMap.cpp`, `W3DDebugIcons.cpp`, `W3DDisplayString.cpp`, `W3DDisplayStringManager.cpp`, `W3DStatusCircle.cpp`, and `camerashakesystem.cpp`), `GameClient/GUI/GUICallbacks/W3DMOTD.cpp`, `GameClient/W3DDebugDisplay.cpp`, `GameClient/W3DDynamicLight.cpp`, the currently inactive `W3DGranny.cpp` translation unit, W3D renderer helpers (`W3DAssetManager.cpp`, `W3DAssetManagerExposed.cpp`, `W3DBibBuffer.cpp`, `W3DBridgeBuffer.cpp`, `W3DCustomEdging.cpp`, `W3DParticleSys.cpp`, `W3DPropBuffer.cpp`, `W3DRoadBuffer.cpp`, `W3DScene.cpp`, `W3DShaderManager.cpp`, `W3DShroud.cpp`, `W3DSmudge.cpp`, `W3DSnow.cpp`, `W3DTerrainBackground.cpp`, `W3DTerrainTracks.cpp`, `W3DTreeBuffer.cpp`, and `W3dWaypointBuffer.cpp`), all original `GameClient/Drawable/Draw/W3D*Draw.cpp` leaves, and all original `GameClient/Shadow` leaves now compile in the real-header frontier as lightweight device/factory, terrain tile-data, polygon clipping, W3D file-factory, UI/window, debug, dynamic-light, terrain-support, renderer-helper, scene, drawable, particle, and shadow coverage. `zh_w3d_device_utility` link-smokes original `TileData.cpp` mip generation and original `W3DPoly.cpp` clipping behavior under wasm. `WorldHeightMap.h` has been made self-contained for its map-object and terrain-texture pointer declarations; the W3D module headers now use fixed-underlying enum forwards where the original game enums already define them; `FunctionLexicon` now stores typed callback entries through an explicit function-pointer-to-`void *` compatibility wrapper; `W3DShaderManager.h` includes the original enum definitions it stores by value; and additional localized clang compatibility covers reached W3D asset, model-draw, scene, shadow, D3DX, DirectInput, Bink-handle, and Win32 heap/timing declarations. The compiled W3D batches remain compile coverage only until browser asset paths, WWLib file-factory singletons, original WW3D2 light/render-object state, browser input, GUI display, Granny/texture bindings, terrain/water/shader state, scene/camera output, and module-draw dependencies can link and be smoked. Display, terrain renderer, water, video buffer, web browser, and broader GUI/render device implementations remain renderer work and are not runtime-complete until Direct3D/WW3D2 surfaces are re-targeted to WebGL2/WebGPU and verified through harness screenshots. |
| `WWVegas/WW3D2` | Partial | `zh_ww3d2_compile_frontier` now builds 114 original WW3D2 sources across hierarchy/animation/LOD, render-object definitions, spatial/collision/visibility, scene helpers, light/projector/decal/particle/snap-point support, asset/status/cache/exclusion helpers, mesh/material metadata, Direct3D-adjacent format/render/texture helpers, GDI sentence/text/frame-grab support, `animatedsoundmgr.cpp`, `dx8wrapper.cpp`, `sr_util.cpp`, and `ww3d.cpp`. This is compile coverage only. The current Direct3D 8, WWAudio/Miles, and Surrender shims are declaration/type surfaces for compiling original code, not renderer, audio, or Surrender object implementations; browser runtime mappings for the compiled Direct3D wrapper, `ww3d.cpp` screen capture/frame-grab paths, GDI text rasterization, Video-for-Windows frame grabbing, WWAudio/Miles playback, Surrender renderer/object behavior, real WWLib MPU timing, and render-object/light runtime linking still need browser ports before WW3D2 can be runtime-complete. |
| `WWVegas/wwshade` | Partial | `zh_wwshade_compile_frontier` now builds all 23 original shader/material sources, including the six DX6/DX7/DX8 bump variants, by generating the legacy `*.vsh_code.h` / `*.psh_code.h` headers at build time from the original checked-in shader text. This is compile coverage only until Direct3D shader assembly, shader creation, shader constants, and material/render-state application are mapped onto the browser renderer and validated through the harness. |
| `WWVegas/WWAudio` | Not started | Runtime audio abstraction used by W3D/audio paths. |
| `WWVegas/Miles6` | Not started | Miles-facing dependency; browser target is Web Audio, not the native Miles backend. |
| `WPAudio` | Not started | Audio helper/backend code; browser target is Web Audio. |
| `GameSpy` | Partial | Declarative Peer/GP/QR2/persistent-storage/SNMP/ghttp compile shims now cover the original GameEngine GameSpy definitions, lobby/main-menu utility compile paths, preference/recorder include path, thread source compile surface, and the legacy `GameNetwork/GameSpy.h` chat/GP callback include surface. Runtime online/networking behavior, legacy `TheGameSpyChat` binding, HTTP/update checks, thread queues, stats APIs, ICMP/socket fallbacks, and browser relay/WebRTC mapping remain open. |
| `WWVegas/WWDownload` | Partial | Original `Download.cpp`, `FTP.CPP`, `registry.cpp`, and `urlBuilder.cpp` compile to wasm as `zh_wwdownload`. Node smoke coverage verifies default registry URL formatting and idle `CDownload` pump/abort behavior without starting sockets. The raw FTP/WinSock transport is compile coverage only and still needs a browser fetch/proxy/update-download contract before runtime patch/download flows are considered functional. |
| `EABrowserDispatch` | Not started | Original runtime/browser-dispatch integration referenced by workspace dependencies; needs audit before browser replacement. |
| `DX90SDK` | Partial | Target-local `D3DX8Math.h` shim covers vector3/vector4/matrix operations, named D3DX matrix fields, and D3DX-style float-pointer conversions used by original `GameEngine/Common` Bezier helpers, original `WWMath/matrix3d.cpp`, and the current WW3D2/wwshade/W3D sorting, point-group, light, shader, drawable, shadow, and particle compile paths; lowercase/case-variant wrappers handle original `D3dx8math.h`, `d3dx8math.h`, `d3dx8.h`, `D3dx8core.h`, `d3dx8core.h`, `D3dx8tex.h`, and `d3dx8tex.h` include spellings on case-sensitive filesystems. Declaration-only `d3d8.h`, `d3d8types.h`, `d3d8caps.h`, `dinput.h`, and `ddraw.h` surfaces now cover Direct3D formats, FVF helpers, DX8 vertex-shader declaration tokens, COM interface declarations plus legacy `LPDIRECT3D*8` pointer aliases, opaque DirectInput handles/device data, DirectDraw DDS caps, D3DX texture creation/load/filter declarations, D3DX shader-buffer/assembly declarations, and constants needed by the current WW3D2, wwshade, and W3D compile frontiers. Broader DirectX 8 runtime compatibility for WW3D and W3D device code remains open and must map to WebGL2/WebGPU plus DOM input rather than native DirectX. |
| `STLport-4.5.3` | Not started | Historical STL dependency; target is libc++ compatibility, not compiling STLport itself. |

Case-variant wrappers now cover the original headers reached by broader
Common/GameClient probes (`Common/OVERRIDE.h`, `Common/SimplePlayer.h`,
`Common/URLLaunch.h`, `GameClient/GadgetCheckbox.h`,
`GameClient/GadgetListbox.h`, `GameClient/Hotkey.h`,
`GameClient/keyboard.h`, `GameClient/mouse.h`, `GameClient/view.h`,
`Common/Scorekeeper.h`, `GameNetwork/Udp.h`, `Lib/Basetype.h`,
`lib/BaseType.h`, `lib/baseType.h`, `common/AsciiString.h`,
`common/Debug.h`, `common/GameLOD.h`, `common/gamelod.h`,
`common/GlobalData.h`, `common/MapObject.h`, `common/PerfTimer.h`,
`common/RandomValue.h`, `common/UnicodeString.h`, `convert.h`, `d3d8.h`,
`d3d8caps.h`, `d3d8types.h`, `d3dx8.h`, `D3dx8core.h`,
`d3dx8core.h`, `D3dx8tex.h`, `d3dx8tex.h`, `ddraw.h`, `D3DXMath.h`,
`Dx8Wrapper.h`, `Benchmark.h`, `bink.h`, `font.h`,
`GameClient/display.h`, `GameClient/drawable.h`,
`LightEnvironment.h`, `hmdldef.h`, `snappts.h`, `streakrender.h`,
`vector3i.h`, the W3D device WW3D2 bridge batch
(`WW3D2/AnimObj.h`, `WW3D2/AssetMgr.h`, `WW3D2/Camera.h`,
`WW3D2/ColTest.h`, `WW3D2/ColType.h`, `WW3D2/Coltest.h`,
`WW3D2/Coltype.h`, `WW3D2/DX8Caps.h`, `WW3D2/DX8IndexBuffer.h`,
`WW3D2/DX8Renderer.h`, `WW3D2/DX8VertexBuffer.h`,
`WW3D2/DX8WebBrowser.h`, `WW3D2/DX8Wrapper.h`, `WW3D2/HAnim.h`,
`WW3D2/HLOD.h`, `WW3D2/HLod.h`, `WW3D2/HTree.h`, `WW3D2/Light.h`,
`WW3D2/Line3D.h`, `WW3D2/Matinfo.h`, `WW3D2/Mesh.h`,
`WW3D2/MeshMdl.h`, `WW3D2/Meshmatdesc.h`, `WW3D2/Meshmdl.h`,
`WW3D2/Part_Emt.h`, `WW3D2/Part_Ldr.h`, `WW3D2/Part_emt.h`,
`WW3D2/PointGr.h`, `WW3D2/PredLod.h`, `WW3D2/RInfo.h`,
`WW3D2/RendObj.h`, `WW3D2/Render2D.h`,
`WW3D2/Render2DSentence.h`, `WW3D2/Scene.h`, `WW3D2/Segline.h`,
`WW3D2/Shader.h`, `WW3D2/SortingRenderer.h`,
`WW3D2/SurfaceClass.h`, `WW3D2/Texture.h`, `WW3D2/TextureLoader.h`,
`WW3D2/Textureloader.h`, `WW3D2/VertMaterial.h`, `WW3D2/WW3D.h`,
`WW3D2/WW3DFormat.h`, and `WW3D2/dx8WebBrowser.h`),
`WWMath/Matrix3D.h`,
`WWLIB/ffactory.h`, `WWLib/BitType.h`, `WWLib/RefCount.h`, `Texture.h`,
`common/drawmodule.h`, `W3DDevice/GameClient/heightmap.h`,
`W3DDevice/GameClient/Heightmap.h`, `WWMATH/Matrix3d.h`,
`WWMATH/Vector2.h`, `WWMATH/Vector3.h`, and `WWMATH/Vector4.h`). The
`gameengine-header-case-smoke` target compile-checks the currently
browser-usable wrappers against original OVERRIDE, BaseType, lowercase Common
headers, Benchmark/Bink/DirectInput declaration wrappers, D3D/D3DX
format/FVF/texture/matrix helpers, W3D collision type, W3D light enum,
representative W3D2 asset/render/texture bridge headers, WWLib
font/convert/BitType declarations, W3D display/drawable/draw-module/height-map
bridge headers, W3D streak-render declarations, Vector3i, and Matrix3D inline
behavior; the full W3D bridge batch
is exercised by `zh_gameengine_real_compile_frontier`, and Windows Media /
shell URL bodies still need a real browser-device contract before they can
compile.

## Tooling Or Editor Targets

These are not part of the browser runtime target. They can be useful references,
but should not drive the initial wasm runtime build unless a specific runtime
dependency is proven.

| Component | Notes |
|---|---|
| `max4sdk` | 3ds Max/exporter SDK inputs for tools. |
| `Benchmark` | Benchmark support linked by some original configs; not required for first runtime boot unless profiling config needs it. |
| `debug/` test projects | Local debug/test utilities, including test and netserv samples. |
| `profile/` test projects | Profiling support and sample/test programs. |
| `GeneralsMD/Code/Tools/**` | Editors/build utilities such as WorldBuilder, GUIEdit, ImagePacker, MapCacheBuilder, asset culling, patch tools, and launchers. They are out of scope for the browser runtime. |

## Current Build Targets

The wasm CMake skeleton currently builds:

- `cnc-port`: a minimal browser module boundary used by the harness.
- `zh_compression_eac`: original `Compression/EAC` BTree, Huff, and RefPack source compiled into a
  wasm static library.
- `zh_compression_manager`: original `CompressionManager.cpp` compiled into a
  wasm static library for the EAC-backed RefPack/BTree/Huff routes, with the
  absent bundled zlib and Nox LZH codec bodies feature-gated until restored.
- `zh_wwdebug_core`: original `WWVegas/WWDebug/wwdebug.cpp` compiled into a
  wasm static library with targeted Win32/exception shims.
- `zh_wwdebug_profile`: original `WWVegas/WWLib/FastAllocator.cpp` plus
  `WWVegas/WWDebug/wwmemlog.cpp` and `wwprofile.cpp` compiled into a wasm
  static library with the original profile tree and memory allocation helpers.
- `zh_wwlib_random`: original `WWVegas/WWLib/random.cpp` compiled into a wasm
  static library.
- `zh_wwlib_base64`: original `WWVegas/WWLib/base64.cpp` compiled into a wasm
  static library.
- `zh_wwlib_crc`: original `WWVegas/WWLib/crc.cpp` and `realcrc.cpp` compiled
  into a wasm static library with lowercase include and rotate shims.
- `zh_wwlib_file_core`: original `WWVegas/WWLib/buff.cpp` and `wwfile.cpp`
  compiled into a wasm static library with lowercase include shims.
- `zh_wwlib_file_ini`: original `WWVegas/WWLib` raw/buffered file helpers,
  `ffactory.cpp`, `readline.cpp`, `chunkio.cpp`, `ini.cpp`, `tagblock.cpp`,
  `widestring.cpp`, `xpipe.cpp`, `xstraw.cpp`, and `nstrdup.cpp` compiled into
  a wasm static library with POSIX/Emscripten file compatibility.
- `zh_wwlib_mixfile`: original `WWVegas/WWLib/mixfile.cpp` compiled into a
  wasm static library with the existing WWLib file/INI and mutex portability
  layer.
- `zh_wwlib_platform_compat`: original `WWVegas/WWLib/data.cpp`,
  `rcfile.cpp`, and `registry.cpp` compiled into a wasm static library for
  legacy data/resource/registry compatibility with current browser fallbacks
  for unavailable native resources and registry keys.
- `zh_wwlib_containers`: original `WWVegas/WWLib/multilist.cpp` and
  `slnode.cpp` compiled into a wasm static library with pooled-node allocator
  compatibility.
- `zh_wwlib_fixed`: original `WWVegas/WWLib/fixed.cpp` compiled into a wasm
  static library.
- `zh_wwlib_hash`: original `WWVegas/WWLib/hash.cpp` compiled into a wasm
  static library with WWDebug and CRC dependencies.
- `zh_wwlib_surface_core`: original `WWVegas/WWLib/blit.cpp`, `pcx.cpp`,
  `surface.cpp`, and `xsurface.cpp` compiled into a wasm static library for
  in-memory 2D surfaces, software blits, buffer copies, and PCX image loading.
- `zh_wwlib_targa`: original `WWVegas/WWLib/TARGA.CPP` compiled into a wasm
  static library with FileFactory-backed image file I/O and a non-MSVC
  scanline-swap fallback for `YFlip`.
- `zh_wwlib_win_globals`: original `WWVegas/WWLib/win.cpp` compiled into a wasm
  static library for the legacy `ProgramInstance`, `MainWindow`, and
  `GameInFocus` globals.
- `zh_wwlib_lzo`: original `WWVegas/WWLib/lzo.cpp`, `lzo1x_c.cpp`,
  `lzo1x_d.cpp`, `lzopipe.cpp`, and `lzostraw.cpp` compiled into a wasm static
  library with stream-core dependencies.
- `zh_wwlib_md5`: original `WWVegas/WWLib/md5.cpp` compiled into a wasm static
  library.
- `zh_wwlib_public_key`: original `WWVegas/WWLib/mpmath.cpp`, `int.cpp`,
  `pk.cpp`, `pkpipe.cpp`, and `pkstraw.cpp` compiled into a wasm static library
  with stream-core dependencies.
- `zh_wwlib_ramfile`: original `WWVegas/WWLib/ramfile.cpp` compiled into a wasm
  static library with the WWLib file-core dependency.
- `zh_wwlib_refcount`: original `WWVegas/WWLib/refcount.cpp` compiled into a
  wasm static library with debug refcount tracking and browser `DebugBreak`
  compatibility.
- `zh_wwlib_sha`: original `WWVegas/WWLib/sha.cpp` compiled into a wasm static
  library with legacy header compatibility shims.
- `zh_wwlib_string`: original `WWVegas/WWLib/wwstring.cpp` and `trim.cpp`
  compiled into a wasm static library with TCHAR, Windows conversion, and
  critical-section shims.
- `zh_wwlib_stream_core`: original `WWVegas/WWLib` pipe/straw stream sources
  for Base64, Blowfish, CRC, SHA, random, cache, LCW, IFF-style
  uncompression, and bit-vector support compiled into a wasm static library.
- `zh_wwlib_systimer`: original `WWVegas/WWLib/_timer.cpp`,
  `systimer.cpp`, and `stimer.cpp` compiled into a wasm static library against
  the browser WinMM timing shim.
- `zh_wwlib_thread`: original `WWVegas/WWLib/thread.cpp` compiled into a wasm
  static library against the current `_UNIX` idle-thread fallback and Win32
  sleep/process compatibility shims.
- `zh_wwlib_mono`: original `WWVegas/WWLib/mono.cpp` and `_mono.cpp` compiled
  into a wasm static library against lowercase include wrappers and current
  non-Windows dormant mono-output behavior.
- `zh_wwlib_msgloop`: original `WWVegas/WWLib/msgloop.cpp` compiled into a
  wasm static library against the current empty browser message-queue shim.
- `zh_wwlib_guarded_legacy`: original `WWVegas/WWLib/Except.cpp` and
  `point.cpp` compiled into a wasm static library under their original source
  guards for compile coverage only.
- `zh_wwlib_utility_core`: original `WWVegas/WWLib/blowfish.cpp`,
  `argv.cpp`, `gcd_lcm.cpp`, `hsv.cpp`, `obscure.cpp`, `palette.cpp`,
  `rc4.cpp`, `rgb.cpp`, `rndstrng.cpp`, `rle.cpp`, `sampler.cpp`,
  `srandom.cpp`, and `strtok_r.cpp` compiled into a wasm static library with
  CRC, random, SHA, and StringClass dependencies.
- `zh_wwlib_version`: original `WWVegas/WWLib/verchk.cpp` compiled into a wasm
  static library for PE image-header timestamp reads, with browser fallbacks for
  unavailable Windows version-resource APIs.
- `zh_wwsaveload_core`: original `WWVegas/WWSaveLoad` persistence factory,
  save/load system, pointer remap, status, and subsystem sources compiled into
  a wasm static library for current runtime library users.
- `zh_wwsaveload_full`: remaining original `WWVegas/WWSaveLoad` definition,
  definition-factory, definition-manager, parameter, twiddler, and
  WWSaveLoad entry sources compiled into a wasm static library with WWLib and
  WWMath dependencies.
- `zh_wwmath_core`: original `WWVegas/WWMath` power-of-two, triangle, vector
  randomizer, matrix/quaternion/`Matrix3D`, vector processor, grid and
  AAB-tree culling, ODE, bounding-volume, and collision-math sources compiled
  into a wasm static library with minimal WWVegas compiler shims.
- `zh_wwmath_curves`: original `WWVegas/WWMath` curve and Hermite/Cardinal/
  Catmull-Rom/TCB spline sources plus `vehiclecurve.cpp` compiled into a wasm
  static library with WWSaveLoad factory dependencies.
- `zh_wwmath_lookup`: original `WWVegas/WWMath/lookuptable.cpp` and
  `wwmath.cpp` compiled into a wasm static library with lookup-table manager,
  fast trig initialization, and debug refcount dependencies.
- `zh_wwutil`: original `WWVegas/Wwutil/mathutil.cpp` and `miscutil.cpp`
  compiled into a wasm static library with WWLib version/file helpers and
  WWMath dependencies.
- `zh_wwdownload`: original `WWVegas/WWDownload/Download.cpp`, `FTP.CPP`,
  `registry.cpp`, and `urlBuilder.cpp` compiled into a wasm static library
  with browser compiler/WinSock compatibility shims for current compile
  coverage.
- `zh_gameengine_common_core`: original `GameEngine/Common` core slice
  compiled into a wasm static library, covering the memory allocator and
  original pool sizing, critical-section wrapper, `AsciiString`,
  `UnicodeString`, legacy `WSYS_String`, original file interface base class,
  RAM file interface, local and facade file-system interfaces,
  disabled original directory and stack-dump translation units,
  quoted-printable ASCII and UTF-16LE Unicode wire-format helpers,
  `SubsystemInterface`, CD manager interface, browser registry defaults,
  original audio-request object plumbing, audio event/manager/sound metadata
  compile coverage, dynamic audio event state compile coverage,
  game-type/common tables, trig/quick-trig helpers, legacy `LList`,
  disabled/kind/object-status/model-condition/armor-set bit masks, snapshot
  base construction, geometry extents, `FileSystem` facade local/archive
  dispatch plus music-CD probing, GameEngine compression/data-chunk facades
  backed by the original compression manager including `DataChunkOutput`
  serialization round trips, `Dict`, discrete circle
  scanlines, Bezier helpers, disabled `MiniLog` compile coverage, language
  state, original message-stream compile coverage, original INI leaf/parser
  wrapper definitions for audio, command-set/control-bar scheme, crate,
  DamageFX, draw-group, map-data/model, misc-audio, multiplayer settings,
  terrain, terrain bridge/road, and upgrade definitions, password obfuscation,
  terrain type tables, partition solving,
  `PerfTimer` compile coverage through the browser high-resolution timer shim,
  RTS accounting/prerequisite compile coverage (`Energy`, `Handicap`,
  `MissionStats`, `Money`, `PlayerList`, `ProductionPrerequisite`, `Science`),
  `NameKeyGenerator`, `RandomValue`, and engine CRC.
- `zh_w3d_device_utility`: original `W3DDevice/GameClient/TileData.cpp` and
  `W3DPoly.cpp` compiled into a wasm static library, with Node smoke coverage
  for terrain tile mip generation and polygon clipping.
- `zh_ww3d2_compile_frontier`: 114 original `WWVegas/WW3D2`
  hierarchy/animation/LOD, render-object definition, spatial/collision,
  visibility, scene, light/projector/decal/particle, snap-point, asset/cache,
  texture-file metadata/loading, material metadata, primitive animation,
  text-texture, GDI sentence, frame-grab, projected-texture, DDS, D3D
  caps/buffer/renderer/wrapper, shader/material/texture/surface bodies,
  render-info, animated sound manager, Surrender conversion utility, WW3D entry,
  debug, and utility leaves compiled into a wasm static library as the current
  renderer-library compile frontier.
- `zh_wwshade_compile_frontier`: all 23 original `WWVegas/wwshade`
  shader/material definition, factory, manager, interface, loader,
  mesh/submesh, renderer, simple/gloss/cubemap/legacy W3D, hardware-shader
  helper, and DX6/DX7/DX8 bump sources compiled into a wasm static library.
  Legacy shader-code headers are generated at build time from the original
  `.vsh` / `.psh` shader text; shader translation and renderer runtime mapping
  remain open.
- `zh_gameengine_real_compile_frontier`: compile-only original
  GameEngine/GameEngineDevice frontier with real headers first, covering the real
  browser-buildable non-device sources from the current
  `zh_gameengine_common_core` slice, including memory/file/archive system
  leaves, Bezier helpers, audio metadata/request leaves, and RTS
  accounting/prerequisite leaves, plus `Common/CommandLine.cpp`,
  `CRCDebug.cpp`, `DamageFX.cpp`, `GameLOD.cpp`, `GameMain.cpp`,
  `GlobalData.cpp`, `MiniLog.cpp`, `PerfTimer.cpp`, `Recorder.cpp`,
  `StateMachine.cpp`, `StatsCollector.cpp`, `UserPreferences.cpp`,
  `Common/INI/INI.cpp` reader, the currently browser-buildable `Common/INI`
  leaf/parser sources including `INIWebpageURL.cpp`, RTS compile leaves
  (`AcademyStats.cpp`, `ActionManager.cpp`, `Player.cpp`,
  `ResourceGatheringManager.cpp`, `ScoreKeeper.cpp`, `Team.cpp`,
  `TunnelTracker.cpp`), `SkirmishBattleHonors.cpp`, save/load leaves and
  system compile leaves (`BuildAssistant.cpp`, `GameState.cpp`,
  `GameStateMap.cpp`, `Radar.cpp`, `Upgrade.cpp`, `Xfer.cpp`, `XferCRC.cpp`,
  `XferLoad.cpp`, `XferSave.cpp`),
  initial Thing/model-definition sources (`DrawModule.cpp`, `Module.cpp`,
  `ModuleFactory.cpp`, `Thing.cpp`, `ThingFactory.cpp`, `ThingTemplate.cpp`),
  lightweight W3D/device leaves (`W3DDevice/Common/W3DConvert.cpp`,
  `W3DDevice/Common/System/W3DFunctionLexicon.cpp`,
  `W3DDevice/Common/Thing/W3DModuleFactory.cpp`,
  `W3DDevice/Common/Thing/W3DThingFactory.cpp`,
  `W3DDevice/Common/System/W3DRadar.cpp`,
  `W3DDevice/GameClient/GUI/Gadget/W3DCheckBox.cpp`,
  `W3DDevice/GameClient/GUI/Gadget/W3DComboBox.cpp`,
  `W3DDevice/GameClient/GUI/Gadget/W3DHorizontalSlider.cpp`,
  `W3DDevice/GameClient/GUI/Gadget/W3DListBox.cpp`,
  `W3DDevice/GameClient/GUI/Gadget/W3DProgressBar.cpp`,
  `W3DDevice/GameClient/GUI/Gadget/W3DPushButton.cpp`,
  `W3DDevice/GameClient/GUI/Gadget/W3DRadioButton.cpp`,
  `W3DDevice/GameClient/GUI/Gadget/W3DStaticText.cpp`,
  `W3DDevice/GameClient/GUI/Gadget/W3DTabControl.cpp`,
  `W3DDevice/GameClient/GUI/Gadget/W3DTextEntry.cpp`,
  `W3DDevice/GameClient/GUI/Gadget/W3DVerticalSlider.cpp`,
  `W3DDevice/GameClient/GUI/GUICallbacks/W3DControlBar.cpp`,
  `W3DDevice/GameClient/GUI/GUICallbacks/W3DMainMenu.cpp`,
  `W3DDevice/GameClient/GUI/GUICallbacks/W3DMOTD.cpp`,
  `W3DDevice/GameClient/GUI/W3DGameFont.cpp`,
  `W3DDevice/GameClient/GUI/W3DGameWindow.cpp`,
  `W3DDevice/GameClient/GUI/W3DGameWindowManager.cpp`,
  `W3DDevice/GameClient/BaseHeightMap.cpp`,
  `W3DDevice/GameClient/FlatHeightMap.cpp`,
  `W3DDevice/GameClient/HeightMap.cpp`,
  `W3DDevice/GameClient/TerrainTex.cpp`,
  `W3DDevice/GameClient/W3DDebugDisplay.cpp`,
  `W3DDevice/GameClient/W3DDebugIcons.cpp`,
  `W3DDevice/GameClient/W3DDynamicLight.cpp`,
  `W3DDevice/GameClient/W3DDisplayString.cpp`,
  `W3DDevice/GameClient/W3DDisplayStringManager.cpp`,
  `W3DDevice/GameClient/W3DFileSystem.cpp`,
  `W3DDevice/GameClient/W3DGranny.cpp`,
  `W3DDevice/GameClient/W3DAssetManager.cpp`,
  `W3DDevice/GameClient/W3DAssetManagerExposed.cpp`,
  `W3DDevice/GameClient/W3DBibBuffer.cpp`,
  `W3DDevice/GameClient/W3DBridgeBuffer.cpp`,
  `W3DDevice/GameClient/W3DCustomEdging.cpp`,
  `W3DDevice/GameClient/W3DParticleSys.cpp`,
  `W3DDevice/GameClient/W3DPoly.cpp`,
  `W3DDevice/GameClient/W3DPropBuffer.cpp`,
  `W3DDevice/GameClient/W3DRoadBuffer.cpp`,
  `W3DDevice/GameClient/W3DScene.cpp`,
  `W3DDevice/GameClient/W3DShaderManager.cpp`,
  `W3DDevice/GameClient/W3DShroud.cpp`,
  `W3DDevice/GameClient/W3DSmudge.cpp`,
  `W3DDevice/GameClient/W3DSnow.cpp`,
  `W3DDevice/GameClient/W3DStatusCircle.cpp`,
  `W3DDevice/GameClient/W3DTerrainBackground.cpp`,
  `W3DDevice/GameClient/W3DTerrainTracks.cpp`,
  `W3DDevice/GameClient/W3DTreeBuffer.cpp`,
  `W3DDevice/GameClient/TileData.cpp`,
  `W3DDevice/GameClient/WorldHeightMap.cpp`,
  `W3DDevice/GameClient/camerashakesystem.cpp`,
  `W3DDevice/GameClient/W3dWaypointBuffer.cpp`,
  all `W3DDevice/GameClient/Drawable/Draw/W3D*Draw.cpp` leaves,
  all `W3DDevice/GameClient/Shadow/W3D*Shadow.cpp` leaves plus
  `W3DDevice/GameClient/Shadow/W3DBufferManager.cpp`,
  `W3DDevice/GameLogic/W3DGameLogic.cpp`,
  `W3DDevice/GameLogic/W3DGhostObject.cpp`,
  `W3DDevice/GameLogic/W3DTerrainLogic.cpp`,
  `Win32Device/Common/Win32CDManager.cpp`, and
  `Win32Device/Common/Win32OSDisplay.cpp`),
  original GameNetwork/GameSpy compile leaves (`GameSpy/Chat.cpp`,
  legacy `GameSpyChat.cpp`, legacy `GameSpyGP.cpp`,
  `GameSpy/LadderDefs.cpp`, `GameSpy/LobbyUtils.cpp`,
  `GameSpy/MainMenuUtils.cpp`, `GameSpy/PeerDefs.cpp`,
  `GameSpy/StagingRoomGameInfo.cpp`, `GameSpy/Thread/BuddyThread.cpp`,
  `GameSpy/Thread/GameResultsThread.cpp`, `GameSpy/Thread/PeerThread.cpp`,
  `GameSpy/Thread/PersistentStorageThread.cpp`,
  `GameSpy/Thread/PingThread.cpp`, `GameSpy/Thread/ThreadUtils.cpp`,
  `GameSpyOverlay.cpp`, `IPEnumeration.cpp`, `NAT.cpp`, `Network.cpp`,
  `Transport.cpp`, and `udp.cpp`), and all 259 original `GameLogic`
  translation units: map/system leaves
  (`PolygonTrigger.cpp`, `SidesList.cpp`, `TerrainLogic.cpp`,
  `CaveSystem.cpp`, `CrateSystem.cpp`, `Damage.cpp`,
  `GameLogic.cpp`, `GameLogicDispatch.cpp`, `RankInfo.cpp`), `AI/AI.cpp`,
  `AI/AIDock.cpp`, `AI/AIPathfind.cpp`,
  `AI/AIGroup.cpp`, `AI/AIGuard.cpp`, `AI/AIGuardRetaliate.cpp`,
  `AI/AIPlayer.cpp`, `AI/AISkirmishPlayer.cpp`, `AI/AIStates.cpp`,
  `AI/AITNGuard.cpp`, `AI/Squad.cpp`, `AI/TurretAI.cpp`,
  `Object/Armor.cpp`, body/create/die/collide/contain/damage/destroy/helper/
  behavior/special-power/upgrade module bases and leaves including
  bridge/countermeasure/minefield/tech/auto-heal/flight-deck/slow-death/
  dumb-projectile behavior leaves and
  `Object/Damage/TransitionDamageFX.cpp`, object utility leaves
  (`ExperienceTracker.cpp`, `FiringTracker.cpp`, `Locomotor.cpp`,
  `GhostObject.cpp`, `Object.cpp`, `ObjectCreationList.cpp`,
  `ObjectTypes.cpp`, `PartitionManager.cpp`, `SimpleObjectIterator.cpp`),
  the full current update leaf set including `JetAIUpdate.cpp`,
  `MissileAIUpdate.cpp`, `RailroadGuideAIUpdate.cpp`,
  `AssistedTargetingUpdate.cpp`, `NeutronMissileUpdate.cpp`,
  `SpecialAbilityUpdate.cpp`, and `WeaponBonusUpdate.cpp`, `Weapon.cpp`,
  `WeaponSet.cpp`, and script leaves through `ScriptActions.cpp`,
  `ScriptConditions.cpp`, `Scripts.cpp`, `ScriptEngine.cpp`, and
  `ScriptEngine/VictoryConditions.cpp`. The GameLogic additions are compile
  coverage only until full object, player, AI pathfinding, command, and runtime
  singleton surfaces link without target-local bridges.
- `zh_gameclient_utility`: original `GameEngine/GameClient` utility sources
  `Color.cpp`, `System/DebugDisplay.cpp`,
  `System/Debug Displayers/AudioDebugDisplay.cpp`, `DisplayString.cpp`,
  `DisplayStringManager.cpp`, `DrawGroupInfo.cpp`, `Drawable.cpp`,
  `Drawable/DrawableManager.cpp`, `DrawableManager.cpp`, `GUI/GameFont.cpp`,
  `GUI/GameWindow.cpp`, `GUI/HeaderTemplate.cpp`, `GUI/WinInstanceData.cpp`,
  GUI/window manager and all gadget/callback/control-bar/menu/replay/
  transition sources, `GUI/LoadScreen.cpp`, `GUI/Shell/Shell.cpp`,
  Main/Options/Download, disconnect/connection menu containers, diplomacy,
  network direct-connect, host/join/player-info/ladder popups, score screen,
  WOL buddy/lobby/login/welcome/ladder/game-setup/locale/map/quick-match
  leaves, in-game popup, game-info, map-select, quit, challenge/difficulty,
  replay save/load/export, control-bar core/command sources, and control-bar
  callback leaves, drawable animated-particle/beacon/sway client updates,
  `GameClient.cpp`, `InGameUI.cpp`, `Input/Keyboard.cpp`, `Input/Mouse.cpp`,
  `GUI/IMEManager.cpp`,
  `GameClientDispatch.cpp`,
  `Eva.cpp`, `FXList.cpp`,
  `GlobalLanguage.cpp`, `GameText.cpp`, `SelectionInfo.cpp`, `System/Image.cpp`,
  `System/CampaignManager.cpp`, message-stream translator sources
  (`CommandXlat.cpp`, `GUICommandTranslator.cpp`, `HintSpy.cpp`,
  `HotKey.cpp`, `LookAtXlat.cpp`, `MetaEvent.cpp`,
  `PlaceEventTranslator.cpp`, `SelectionXlat.cpp`,
  `WindowXlat.cpp`), the first
  GameClient-facing original INI leaf parser definitions, additional
  ControlBar sources (`ControlBar.cpp`, `ControlBarCommand.cpp`,
  `ControlBarCommandProcessing.cpp`, `ControlBarBeacon.cpp`,
  `ControlBarMultiSelect.cpp`, `ControlBarOCLTimer.cpp`, `ControlBarObserver.cpp`,
  `ControlBarStructureInventory.cpp`, and `ControlBarUnderConstruction.cpp`),
  menu/callback leaves (`DisconnectWindow.cpp`,
  `EstablishConnectionsWindow.cpp`, `GeneralsExpPoints.cpp`,
  `LanGameOptionsMenu.cpp`, `LanLobbyMenu.cpp`, `LanMapSelectMenu.cpp`, and
  `SkirmishGameOptionsMenu.cpp`), `LanguageFilter.cpp`,
  `Line2D.cpp`, `MapUtil.cpp`, `ParabolicEase.cpp`, `RadiusDecal.cpp`,
  `System/RayEffect.cpp`, `System/Smudge.cpp`, `Snow.cpp`, `Statistics.cpp`,
  `System/ParticleSys.cpp`, `Terrain/TerrainRoads.cpp`,
  `Terrain/TerrainVisual.cpp`, `View.cpp`, `VideoPlayer.cpp`,
  `VideoStream.cpp`, and `Water.cpp`
  compiled into a wasm static library, linked against the
  current original `GameEngine/Common` core slice.
- `zh_gameclient_text`: original `GameEngine/GameClient/GameText.cpp` and
  `LanguageFilter.cpp` compiled into a focused wasm static library so
  networking/download tests can use the real text manager without linking the
  full GameClient utility archive.
- `zh_gamenetwork_core`: original `GameEngine/GameNetwork` command/frame,
  setup, LAN, and leaf utility sources `Connection.cpp`,
  `ConnectionManager.cpp`, `DisconnectManager.cpp`, `DownloadManager.cpp`,
  `FileTransfer.cpp`, `FirewallHelper.cpp`,
  `FrameData.cpp`, `FrameDataManager.cpp`, `FrameMetrics.cpp`,
  `GameInfo.cpp`, `GameMessageParser.cpp`, `GameSpy/GSConfig.cpp`,
  `GUIUtil.cpp`, `LANAPI.cpp`, `LANAPICallbacks.cpp`, `LANAPIhandlers.cpp`,
  `LANGameInfo.cpp`,
  `NetCommandList.cpp`, `NetCommandMsg.cpp`, `NetCommandRef.cpp`,
  `NetCommandWrapperList.cpp`, `NetMessageStream.cpp`, `NetPacket.cpp`,
  `NetworkUtil.cpp`, `Transport.cpp`, `udp.cpp`, and `User.cpp` compiled into a wasm static library,
  linked against the current original `WWDownload` archive.
- `compression-eac-smoke`: a Node-executed wasm smoke test that round-trips data
  through original `BTREE_encode`/`BTREE_decode`, `HUFF_encode`/`HUFF_decode`,
  and `REF_encode`/`REF_decode`.
- `compression-manager-smoke`: a Node-executed wasm smoke test that verifies
  original `CompressionManager` header detection, preferred compression,
  uncompressed-size metadata, EAC-backed BTree/Huff/RefPack round trips, and
  explicit disabled behavior for the missing zlib/Nox LZH codec bodies.
- `wwdebug-core-smoke`: a Node-executed wasm smoke test that verifies original
  WWDebug message, assert, trigger, and profile handlers.
- `wwdebug-profile-smoke`: a Node-executed wasm smoke test that verifies the
  original WWDebug profile tree, `FastAllocatorGeneral` accounting, and
  `WWMemoryLogClass` allocation/free counters.
- `wwlib-base64-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib Base64 known encodings, ignored whitespace, padding, binary round-trip,
  and short-buffer behavior.
- `wwlib-crc-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib CRC32 helpers against the standard vector and checks `CRCEngine` update
  consistency.
- `wwlib-file-core-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib `Buffer` allocation/reference/reset behavior and `FileClass`
  formatted write helpers through a harness-side memory file.
- `wwlib-file-ini-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib raw-file I/O plus `INIClass` load/save, scalar values, points,
  rects, and `TagBlockFile` persistence.
- `wwlib-mixfile-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib MIX archive creation, filename listing, offset-ordered
  listing, biased subfile reads, and missing-file lookups.
- `wwlib-thread-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib `ThreadClass` construction and the current `_UNIX` idle `Execute` /
  `Stop` / yield / thread-id behavior.
- `wwlib-legacy-platform-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib mono enable/disable/no-op output plus modeless-dialog,
  accelerator, and empty message-pump bookkeeping.
- `wwlib-containers-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib `SimpleDynVecClass`, pooled `SList`, pooled `MultiListClass`,
  and `PriorityMultiListIterator` behavior.
- `wwlib-fixed-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib fixed-point parsing, formatting, constants, arithmetic, conversion, and
  saturation behavior.
- `wwlib-hash-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib hash-table add/find/remove/reset/iteration behavior.
- `wwlib-image-misc-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib Targa truecolor save/load and image flips plus original
  `win.cpp` window/focus globals.
- `wwlib-platform-compat-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib `data.cpp` allocation/load helpers, raw CPS-style
  `Load_Uncompress`, and current browser no-resource/no-registry fallbacks for
  `ResourceFileClass` and `RegistryClass`.
- `wwlib-surface-core-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib BSurface/XSurface fills, pixels, line/rectangle drawing,
  transparent/plain blits, buffer copy helpers, and PCX image decoding.
- `wwlib-lzo-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib LZO direct compression plus LZO pipe/straw round trips.
- `wwlib-md5-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib MD5 against standard digest vectors and split-update hashing.
- `wwlib-public-key-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib multiprecision public-key encryption/decryption and DER key
  encode/decode behavior.
- `wwlib-ramfile-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib RAMFile open/close, read, write, seek, implicit access, bias,
  inherited formatted writes, allocated buffers, capacity clamping, and delete
  behavior.
- `wwlib-sha-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib SHA against known digest vectors and split-update hashing.
- `wwlib-stream-core-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib Pipe/Straw chaining, Base64/CRC/SHA/Blowfish pipe and straw
  adapters, LCW direct and pipe round trips, `Uncompress_Data` raw/LCW block
  handling, CacheStraw, RandomStraw deterministic seeding, and BooleanVector
  behavior.
- `wwlib-string-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib StringClass construction, mutation, formatting, comparison, trimming,
  buffer growth, copy, temporary-buffer, and wide-copy behavior.
- `wwlib-utility-core-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib command-line parsing, Blowfish and RC4 known vectors, GCD/LCM
  helpers, secure random generation, RGB/HSV conversion, palette lookup, RLE
  round trips including trailing zero runs, sampling sequences, reentrant
  tokenization, legacy timer ticks, `FrameTimer`/`TickCount` globals,
  Obfuscate case normalization, and RandomString selection behavior.
- `wwmath-core-smoke`: a Node-executed wasm smoke test that verifies original
  WWMath power-of-two helpers, vector operations, matrix/quaternion
  transforms, `Matrix3D` inverse round trips, vector processor fallback paths,
  triangle containment, AABox/line/sphere/OBBox collision paths, grid and
  AAB-tree culling, ODE integration, vector randomizers, and the original
  WWLib random generator.
- `wwmath-curves-smoke`: a Node-executed wasm smoke test that verifies original
  WWMath curve/spline interpolation, vehicle-curve evaluation, and WWSaveLoad
  factory registration.
- `wwmath-lookup-smoke`: a Node-executed wasm smoke test that verifies original
  WWMath lookup-table manager initialization, default table sampling, fast trig
  tables, shutdown, and debug refcount cleanup.
- `wwsaveload-full-smoke`: a Node-executed wasm smoke test that verifies
  original WWSaveLoad definition factories, persist factory registration,
  parameter construction/mutation, definition manager lookup, and chunk-file
  save/load round-trip behavior.
- `wwutil-smoke`: a Node-executed wasm smoke test that verifies original Wwutil
  math helpers, string and character helpers, file existence/removal,
  read-only attribute mapping, and PE-header file-id timestamp formatting.
- `gameengine-header-case-smoke`: a Node-executed wasm smoke test that verifies
  case-variant wrappers for original GameEngine/WWVegas headers compile under
  the case-sensitive wasm build and resolve to original OVERRIDE, BaseType,
  W3D collision type, representative W3D2 asset/render/texture bridge headers,
  DieModule, and Matrix3D inline behavior.
- `gameengine-common-core-smoke`: a Node-executed wasm smoke test that verifies
  the original `GameEngine/Common` core slice, including memory-manager
  initialization with original DMA/pool sizing, engine string
  mutation/translation, legacy WSYS string formatting/casing, original file
  interface access defaults/readback, original `FileSystem` local dispatch,
  RAM file reads/scans/read-entire behavior, local file-system singleton
  plumbing, CD manager drive bookkeeping, browser registry defaults,
  version formatting, audio-request allocation/release, language state,
  password-obfuscation vectors, pooled name-key buckets,
  disabled/kind/object-status/model-condition/armor-set type masks and name
  tables, geometry bounds/footprint calculations, compressed cached-file reads,
  `DataChunkInput` table/chunk parsing, Dict copy-on-write and typed lookups,
  deterministic RNG/CRC behavior, trig/quick-trig helpers, game common tables,
  quoted-printable ASCII and UTF-16LE Unicode wire-format helpers,
  list/circle helpers, Bezier evaluation/splitting, partition solving, terrain
  type basics, multiplayer color/default/starting-money value behavior, and
  compile coverage for the current dormant `PerfTimer`,
  `AudioEventRTS`, `GameAudio`, `GameSounds`, `Energy`, `MessageStream`,
  `ProductionPrerequisite`, `Science`, and additional INI wrapper paths.
- `gamenetwork-core-smoke`: a Node-executed wasm smoke test that verifies
  original GameNetwork command-id generation, command type policy/name lookups,
  empty frame readiness through `FrameData`/`FrameDataManager`, `NetCommandList`
  sorting/deduplication, `NetPacket` ACK-both raw/default parser behavior plus
  stage1/stage2,
  frame/run-ahead/chat/progress/file-progress plus
  control/disconnect/router/wrapper/file-announce/frame-resend packet
  round-trips, `NetCommandWrapperList` incomplete/duplicate chunk handling and
  ready-command reassembly/removal, direct `Transport::queueSend`
  empty/oversize rejection, encrypted packet header/payload/CRC preservation,
  full-queue behavior, `Connection.cpp` send/ack queues through original
  transport buffering, `FileTransfer.cpp` map-path helpers, `FrameMetrics.cpp`
  init/reset/cushion behavior, and pooled `User` value semantics.
  `Connection.cpp` receive/retry flow, raw UDP
  flushing, the `FileTransfer.cpp` transfer loop, `FrameMetrics.cpp`
  FPS/latency sampling, and `NetMessageStream.cpp` are currently compile
  coverage only.
- `gamenetwork-download-manager-smoke`: a Node-executed wasm smoke test that
  verifies original `DownloadManager.cpp` queue, status, error, and
  last-local-file behavior against original `GameText.cpp`,
  `LanguageFilter.cpp`, and WWDownload while keeping raw FTP/browser download
  runtime out of scope.
- `wwdownload-smoke`: a Node-executed wasm smoke test that verifies original
  WWDownload registry URL defaults and idle `CDownload` pump/abort behavior
  while keeping the raw FTP socket path compile-only for now.
- `gameclient-utility-smoke`: a Node-executed wasm smoke test that verifies
  original GameClient color packing/darkening, draw-group defaults, original
  display-string text mutation/font storage/manager linking, original
  `FontLibrary` font reuse/reset, `WinInstanceData` text/tooltip
  display-string allocation, `GlobalLanguage` constructor/font defaults and
  resolution font-size scaling, original `GameTextInterface` string-file
  parsing/fetch/prefix/map/missing label paths, encrypted `LanguageFilter`
  UTF-16 word loading/filtering, debug-display formatting/cursor state, 2D
  line/area/rect helpers, parabolic easing, snow/weather defaults, statistics
  normalization/mu-law helpers, video-buffer rect scaling, and video-list
  bookkeeping. `System/CampaignManager.cpp`, `RadiusDecal.cpp`,
  `MessageStream/HintSpy.cpp`, `System/RayEffect.cpp`, `Drawable.cpp`,
  `Drawable/DrawableManager.cpp`, `System/Smudge.cpp`,
  `System/Debug Displayers/AudioDebugDisplay.cpp`, `GUI/GameWindow.cpp`, and
  `View.cpp` currently add compile/link coverage only; `ControlBar.cpp`,
  `ControlBarCommand.cpp`, and `ControlBarCommandProcessing.cpp` also remain
  compile coverage only. Their runtime behavior
  remains gated on browser display/input device work, real INI/Xfer/GameLogic
  surfaces, and harness screenshots/state checks.
- `gameengine-real-big-smoke`: an opt-in Node-executed wasm smoke test
  (`npm run test:real-big`) that depends on user-supplied extracted assets and
  verifies the original `Win32BIGFileSystem` indexes `INIZH.big`, finds real
  INI entries, and reads `Armor.ini`, `CommandButton.ini`, and `Weapon.ini`
  through the original `FileSystem` archive fallback path.
- `gameengine-real-big-browser-smoke`: an opt-in browser wasm smoke test
  (`npm run test:real-big-browser`) that depends on user-supplied extracted
  assets, fetches `INIZH.big` through the Playwright harness, writes it into
  Emscripten MEMFS, and verifies the same original `Win32BIGFileSystem` archive
  fallback reads.
- `runtime_archives_smoke.mjs`: an opt-in browser harness smoke
  (`npm run test:runtime-archives-browser`) that depends on user-supplied
  extracted assets, fetches the inventoried runtime BIG archives one at a time,
  writes each archive into Emscripten MEMFS, and verifies the original
  `Win32BIGFileSystem` can index and read a sample file from every archive.

## Next Compile Order

1. Restore or port the missing bundled `Compression/ZLib` and
   `Compression/LZHCompress/CompLibSource` bodies so the existing
   `CompressionManager` zlib and Nox LZH branches can be enabled and checked
   against real BIG data.
2. Finish `WWDebug` integration by deciding when consumers should link the
   original profile manager instead of the current macro-only `wwprofile.h`
   shim, and whether browser builds should enable category tracking in
   `wwmemlog.cpp`.
3. Finish the remaining `WWLib` gaps needed by runtime libraries: full
   optimized LCW back-reference compression if output-size parity matters,
   remaining allocator/mempool helpers, remaining containers,
   DirectDraw-backed `DSurface`/2D conversion helpers, GNU regex support for
   `regexpr.cpp`, browser-backed `ThreadClass` start/stop, DOM/input-backed
   message queue delivery for `msgloop.cpp`/`keyboard.cpp`, MPU/RDTSC timing,
   full browser resource/registry persistence beyond the current unavailable
   fallbacks, and the final browser timing/threading contract.
4. Continue `GameEngine/Common`: move the real-header INI/Thing compile
   frontier into the linked runtime by replacing the target-local INI/Xfer/
   GlobalData/GameLogic compile shims with original sources, then use the
   browser MEMFS runtime-archive smoke as the base for proving the exact boot
   archive set and wiring real INI loading plus the DataChunkOutput write path
   once browser user-data persistence exists.
5. Continue `GameEngine/GameClient` upward from the current utility slice into
   keyboard, remaining shell/menu/GameSpy-facing callbacks, drawable/display
   surfaces, and real video playback only as the corresponding original
   INI/Xfer/GlobalData/GameLogic/network and browser device contracts are
   available.
