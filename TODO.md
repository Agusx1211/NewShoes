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
- [x] Add lowercase include wrappers for original WWLib surface and PCX headers
      (`surface.h`, `pcx.h`) under the case-sensitive wasm build.
- [x] Add portable `strupr`/`strrev` compatibility for original WWLib utility
      sources under clang/Emscripten.
- [x] Add portable `_snprintf`, `_wcsicmp`, `MultiByteToWideChar`, and
      `OutputDebugString` compatibility for original WWLib INI/wide-string
      sources under clang/Emscripten.
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
- [x] Add browser/compiler shims for original Win32 `_MAX_PATH` and
      `GetModuleFileName` users needed by `GameEngine/Common` memory-pool
      initialization under Emscripten.
- [x] Add a minimal `D3DX8Math.h` vector/matrix shim for original
      `GameEngine/Common` Bezier helpers under Emscripten.
- [x] Add lowercase include wrappers for original GameEngine `Common/File.h`
      and `lib/basetype.h` users under the case-sensitive wasm build.
- [x] Add browser registry API fallbacks, a legacy `<io.h>` POSIX alias shim,
      and a lowercase `Common/SubSystemInterface.h` wrapper for additional
      original `GameEngine/Common` sources under Emscripten.
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
- [ ] Consolidate the `mmsystem.h`/`timeGetTime` shim with the final browser
      engine timing layer before replacing `Main/WinMain.cpp`.
- [ ] Replace the current browser `FastCriticalSectionClass` spin lock with a
      pthread-aware yield/wait path before enabling shared-memory wasm threads.
- [ ] Audit 32-bit assumptions: struct packing, `int`/`long` sizes, alignment.
- [ ] Define and verify the browser-port `WCHAR`/UTF-16 compatibility contract
      before compiling wide-string serialization and save/load paths.
- [ ] Compile original `Common/System/QuotedPrintable.cpp` after the
      browser-port `WCHAR`/UTF-16 contract is defined; its Unicode path assumes
      original 16-bit wide storage.
- [ ] Audit original WWLib `Buffer` ownership/deallocation semantics under
      libc++/wasm before relying on it for asset and file buffers.
- [ ] Endianness audit for serialization paths (save game, net, CRC).

### Libraries (compile as-is where possible)
- [x] `Compression/EAC` BTree, Huff, and RefPack codecs compile from original
      source and round-trip smoke runs under wasm.
- [x] Original `CompressionManager` compiles for RefPack/BTree/Huff manager
      routes and smoke-tests header detection, uncompressed-size metadata, and
      round trips over the original EAC codecs under wasm.
- [ ] Full `Compression` manager (RefPack/zlib/LZH/etc.) compiles and is
      unit-checked against real BIG data.
- [ ] Restore or port the missing bundled `Compression/ZLib` and
      `Compression/LZHCompress/CompLibSource` bodies so the existing
      `CompressionManager` zlib and Nox LZH branches can be enabled under wasm.
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
- [x] `WWVegas/WWLib` pooled container helpers (`slnode.cpp`,
      `multilist.cpp`) compile and smoke-test `SimpleDynVecClass`, `SList`,
      `MultiListClass`, and `PriorityMultiListIterator` behavior under wasm.
- [x] `WWVegas/WWLib` debug `RefCountClass` tracking (`refcount.cpp`) compiles
      under wasm and is exercised through lookup-table lifetime cleanup.
- [x] `WWVegas/WWLib` system timer wrappers (`_timer.cpp`, `systimer.cpp`,
      `stimer.cpp`) compile against browser WinMM timing shims and
      smoke-test the legacy `FrameTimer`/`TickCount` globals.
- [x] `WWVegas/WWLib` guarded legacy translation units (`Except.cpp`,
      `point.cpp`) compile under their original source guards; this is compile
      coverage only, not a browser exception dialog or enabled Point body.
- [x] `WWVegas/WWLib` version/PE-header helper (`verchk.cpp`) compiles and is
      exercised through Wwutil file-id timestamp coverage under wasm.
- [x] Compile LCW compression stream adapters (`lcw.cpp`, `lcwpipe.cpp`) after
      adding a portable LCW literal-packet `LCW_Comp` path for non-MSVC builds,
      and smoke-test direct LCW plus `LCWPipe` round trips under wasm.
- [ ] Port the full optimizing original LCW back-reference compressor if
      compressed-output size parity becomes required; the current non-MSVC
      fallback emits valid LCW literal packets accepted by the original
      decompressor.
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
- [x] `WWVegas/WWLib` platform compatibility helpers (`data.cpp`,
      `rcfile.cpp`, `registry.cpp`) compile and smoke-test legacy data loading,
      raw CPS-style uncompression, and current browser no-resource/no-registry
      fallbacks under wasm.
- [ ] Replace the current browser no-resource/no-registry WWLib fallbacks with
      a real resource lookup and persistence contract before relying on
      `ResourceFileClass` or `RegistryClass` for runtime settings/data.
- [ ] Compile remaining original WWLib DirectDraw-backed 2D conversion helpers
      (`convert.cpp`, `_convert.cpp`, `dsurface.cpp`) after the browser
      `DSurface`/pixel-format abstraction is defined, instead of stubbing draw
      behavior.
- [ ] Port original WWLib MPU/RDTSC timing helpers (`mpu.cpp`) to the final
      browser timing/CPU-detection contract without preserving x86 inline
      assembly.
- [ ] Full `WWVegas/WWLib` (containers, string, ini, file abstractions)
      compiles.
- [x] `WWVegas/WWDebug` core `wwdebug.cpp` compiles and smoke-tests message,
      assert, trigger, and profile handlers under wasm.
- [x] `WWVegas/WWDebug` profile/memory slice (`FastAllocator.cpp`,
      `wwmemlog.cpp`, `wwprofile.cpp`) compiles and smoke-tests profile tree
      recording, allocator accounting, and memory-log allocation/free counters
      under wasm.
- [ ] Full `WWVegas/WWDebug` (`wwmemlog.cpp`, `wwprofile.cpp`) compiles and
      routes asserts/logs to the browser console/harness.
- [x] Port original `WWVegas/WWDebug/wwprofile.cpp` for wasm or restore its
      missing `fastallocator.h` dependency; the current wasm `wwprofile.h`
      shim disables `WWPROFILE` scope timers so culling can compile without
      pulling unresolved profiling manager state.
- [ ] Retire or narrow the current generic `wwprofile.h` no-op macro shim once
      all profile consumers link the original profiling manager target.
- [ ] Decide whether the browser `_UNIX` build should keep original
      `wwmemlog.cpp` category tracking disabled or introduce a wasm-safe
      thread-local memory-log mode.
- [x] `WWVegas/WWSaveLoad` core persistence plumbing (`persistfactory.cpp`,
      `saveload.cpp`, `saveloadsubsystem.cpp`, `pointerremap.cpp`,
      `saveloadstatus.cpp`) compiles as a wasm static library for WWMath curve
      and lookup-table users.
- [x] Full `WWVegas/WWSaveLoad` compiles, including definitions, parameters,
      twiddlers, and save/load round-trip coverage.
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
      original file-system local dispatch path, model-condition and armor-set
      bit-name tables, and geometry bounds/footprint calculations.
- [x] Expanded `GameEngine/Common` compression/data-chunk slice compiles from
      original sources: `Compression.cpp` and `DataChunk.cpp`, linked against
      the existing original `CompressionManager` slice, with wasm smoke
      coverage for compressed cached-file reads and `DataChunkInput` table /
      chunk parsing.
- [ ] Replace the target-local `Common/INI.h`, `Common/Xfer.h`,
      `Common/GlobalData.h`, and `GameLogic/GameLogic.h` compile shims with the
      original headers/sources as each real subsystem comes online.
- [ ] Unblock original `Common/Xfer` by bringing up original `Common/INI`,
      `Common/BitFlagsIO`, `Common/GameState`, and `Common/Upgrade` dependencies
      instead of expanding the temporary `Common/Xfer.h` shim.
- [ ] Exercise original `Common/System/FileSystem.cpp` archive lookup,
      `doesFileExist`, directory listing, file-info, and music-CD paths after a
      concrete browser `ArchiveFileSystem` / audio layer replaces the current
      smoke globals.
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
- [ ] Validate the original BIG reader against extracted real archives
      (`INIZH.big` first) once browser asset fetch/MEMFS mounting is wired into
      the harness.
- [ ] Exercise original `DataChunkOutput` write/temp-file path after the real
      `GlobalData` user-data directory and browser persistence layer replace
      the current target-local `Common/GlobalData.h` shim.
- [x] Compile original `Common/version.cpp` after adding a lowercase
      `Common/Version.h` wrapper and bringing up the `GameClient/GameText`
      interface used by its Unicode formatting path.
- [x] Compile original `Common/System/Directory.cpp`,
      `Common/System/StackDump.cpp`, and `Common/Audio/AudioRequest.cpp` into
      the wasm Common core; smoke-test `AudioRequest` memory-pool
      allocation/release.
- [ ] Compile original `Common/CRCDebug.cpp` after the `GameClient/InGameUI`
      and W3D collision/render include dependencies are available.
- [ ] Compile original `Common/System/Debug.cpp` and
      `Common/System/FunctionLexicon.cpp` after the browser input layer
      replaces the DirectInput (`dinput.h`) dependency pulled through
      `GameClient/KeyDefs.h`.
- [x] Compile original `Common/Audio/DynamicAudioEventInfo.cpp` against the
      current temporary `Common/Xfer.h` shim, including unsigned-byte and
      unsigned-int transfer signatures.
- [ ] Link and smoke-test `DynamicAudioEventInfo` after original
      `INIAudioEventInfo`/`AudioEventInfo` metadata, the original INI parse
      surface, and the real audio manager path are available without
      target-local stubs.
- [ ] Compile original RTS accounting/player-adjacent sources
      (`MissionStats.cpp`, `Money.cpp`, `Handicap.cpp`, `Science.cpp`, etc.)
      after `Player`/`Thing`/`Object` module headers, `MultiIniFieldParse`,
      `StaticGameLODLevel`, `EvaMessage`, and related GameLogic/GameClient enum
      dependencies are available.
- [ ] Compile original `Common/MultiplayerSettings.cpp` and
      `Common/TerrainTypes.cpp` after the real `Common/INI` `FieldParse` table
      and scalar/color parse helpers replace the temporary INI shim.
- [ ] Compile original `Common/DamageFX.cpp` after `Common/Thing` /
      `Common/OVERRIDE.h`, `GameClient/FXList` / `InGameUI`, and
      `GameLogic/Damage` / `Object` dependencies are available.
- [ ] Compile original `Common/MessageStream.cpp` after `Common/Thing` /
      `Common/OVERRIDE.h`, player/list, recorder, InGameUI, and GameLogic
      dependencies are available.
- [ ] Compile original `Common/GlobalData.cpp` after GameLogic AI command,
      science, weapon, guard-mode, damage/player-mask, and related enum/header
      dependencies are available.
- [ ] Compile original `Common/UserPreferences.cpp` and
      `Common/SkirmishBattleHonors.cpp` after `Common/Thing` /
      `Common/OVERRIDE.h`, player/game-difficulty declarations, and related
      GameLogic headers are available.
- [ ] Compile original `Common/GameLOD.cpp` after the particle-priority,
      TerrainVisual/GameClient, and W3D collision include dependencies are
      available.
- [ ] Enable and route `MiniLog.cpp`'s `DEBUG_LOGGING` body to the browser log
      or harness once the real `GameLogic` frame counter is available.
- [ ] Decide the browser copy-protection / launcher contract before compiling
      original `Common/System/CopyProtection.cpp`; it currently depends on
      Win32 mutex, message-queue, event, and shared-memory APIs.
- [x] Compile original `Common/System/MemoryInit.cpp` pool sizing for the wasm
      engine path instead of relying on smoke-local memory hook defaults.
- [x] Audit original Bezier helper warnings under clang/Emscripten:
      `BezierSegment` array-constructor bound mismatch and
      `BezFwdIterator` conservative pointer-initialization diagnostics.
- [x] `Common/System` (file system iface, BIG archive, streams, memory) compiles.
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
