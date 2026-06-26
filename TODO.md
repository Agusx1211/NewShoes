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
- [ ] Consolidate the `mmsystem.h`/`timeGetTime` shim with the final browser
      engine timing layer before replacing `Main/WinMain.cpp`.
- [ ] Replace the current browser `FastCriticalSectionClass` spin lock with a
      pthread-aware yield/wait path before enabling shared-memory wasm threads.
- [ ] Continue the legacy enum-forward audit for the remaining original
      GameLogic/Object/Team/Thing headers, using fixed underlying types or
      real definition includes where the original enum contract is known.
- [ ] Audit 32-bit assumptions: struct packing, `int`/`long` sizes, alignment.
- [ ] Define and verify the browser-port `WCHAR`/UTF-16 compatibility contract
      before compiling wide-string serialization and save/load paths.
- [x] Compile original `Common/System/QuotedPrintable.cpp` after making its
      original UTF-16LE quoted-printable wire format explicit for the wasm
      `WideChar`/`wchar_t` width, with ASCII, Unicode ASCII, and BMP
      round-trip smoke coverage.
- [x] Make original `UnicodeString::nextToken` copy token bytes using
      `sizeof(WideChar)` so tokenization remains valid under wasm's non-MSVC
      wide-character width.
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
- [x] `WWVegas/WWLib` MIX archive helpers (`mixfile.cpp`) compile and
      smoke-test archive creation, filename listing, offset-ordered listing,
      biased subfile reads, and missing-file lookups under wasm.
- [x] `WWVegas/WWLib` pooled container helpers (`slnode.cpp`,
      `multilist.cpp`) compile and smoke-test `SimpleDynVecClass`, `SList`,
      `MultiListClass`, and `PriorityMultiListIterator` behavior under wasm.
- [x] `WWVegas/WWLib` debug `RefCountClass` tracking (`refcount.cpp`) compiles
      under wasm and is exercised through lookup-table lifetime cleanup.
- [x] `WWVegas/WWLib` system timer wrappers (`_timer.cpp`, `systimer.cpp`,
      `stimer.cpp`) compile against browser WinMM timing shims and
      smoke-test the legacy `FrameTimer`/`TickCount` globals.
- [x] `WWVegas/WWLib` thread wrapper (`thread.cpp`) compiles under wasm and
      smoke-tests the current original `_UNIX` fallback contract for
      construction, idle `Execute`/`Stop`, yielding, and thread-id queries.
- [ ] Re-target original WWLib `ThreadClass::Execute`/`Stop` to the final
      browser pthread/Web Worker contract before enabling GameSpy, audio, or
      file worker threads; the current `_UNIX` wasm build intentionally keeps
      native thread start idle.
- [x] `WWVegas/WWLib` legacy mono debug-output and message-loop helpers
      (`mono.cpp`, `_mono.cpp`, `msgloop.cpp`) compile under wasm and
      smoke-test mono enable/disable/no-op output plus modeless-dialog,
      accelerator, and empty message-pump bookkeeping.
- [ ] Replace the current empty Win32 message queue compatibility shim with the
      browser DOM/input event bridge before compiling original WWLib
      `keyboard.cpp` or the Win32 engine message loop against it.
- [ ] Decide whether original WWLib mono debug output should remain dormant in
      browser builds or route through the harness/browser console before
      relying on it for runtime diagnostics.
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
- [ ] Restore or replace the missing WWLib GNU regex dependency before
      compiling original `regexpr.cpp`; do not stub `RegularExpressionClass`
      users.
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
      original file-system local/archive dispatch path, facade existence cache,
      file-info and directory-list delegation, music-CD presence probe,
      model-condition and armor-set bit-name tables, and geometry bounds /
      footprint calculations.
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
- [ ] Replace the target-local `Common/INI.h`, `Common/Xfer.h`,
      `Common/GlobalData.h`, and `GameLogic/GameLogic.h` compile shims with the
      original headers/sources as each real subsystem comes online.
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
- [ ] Link and smoke-test original `Common/Xfer` and save-game behavior after
      `GameState`, `GameStateMap`, real `GlobalData`, browser persistence, and
      the full snapshot subsystem can link into the runtime.
- [x] Promote the remaining browser-buildable non-device `Common` core sources
      from `zh_gameengine_common_core` into the real-header compile frontier,
      including original memory/file/archive/system leaves, Bezier helpers,
      audio metadata/request leaves, and RTS accounting/prerequisite leaves.
- [ ] Link and smoke-test the real-header memory/file/archive/system leaves
      after the browser archive/audio/persistence singleton contracts replace
      the current target-local smoke globals.
- [x] Exercise original `Common/System/FileSystem.cpp` facade dispatch for
      archive lookup, `doesFileExist` true/false cache entries, directory
      listing, file-info, and `areMusicFilesOnCD` against the linked local/BIG
      smoke backends and CD manager.
- [ ] Replace the current `FileSystem` smoke globals with the final browser
      archive/audio singleton contracts, then harness-test music archive
      load/unload and asset lookup through fetched browser archives.
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
- [ ] Extend the browser MEMFS real-asset smoke from `INIZH.big` to the exact
      minimum boot archive set once engine startup uses fetched archives.
- [x] Exercise original `DataChunkOutput` write/temp-file path in the linked
      Common smoke through the current `GlobalData` user-data path shim,
      round-tripping the generated table/chunk stream through original
      `DataChunkInput`.
- [ ] Re-run original `DataChunkOutput` write/temp-file coverage after the real
      `GlobalData` user-data directory and browser persistence layer replace
      the current target-local `Common/GlobalData.h` shim.
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
- [ ] Compile original `Common/System/Debug.cpp` and
      `Common/System/FunctionLexicon.cpp` after the browser input layer
      replaces the DirectInput (`dinput.h`) dependency pulled through
      `GameClient/KeyDefs.h` and the legacy function-pointer table has a typed
      browser-safe representation instead of `void *` function casts.
- [x] Compile original `Common/Audio/DynamicAudioEventInfo.cpp` against the
      current temporary `Common/Xfer.h` shim, including unsigned-byte and
      unsigned-int transfer signatures.
- [ ] Link and smoke-test `DynamicAudioEventInfo` after original
      `INIAudioEventInfo`/`AudioEventInfo` metadata, the original INI parse
      surface, and the real audio manager path are available without
      target-local stubs.
- [x] Compile original `Common/Audio/GameMusic.cpp` into the wasm Common core
      as compile coverage for music-track parse metadata and music-manager
      request plumbing.
- [ ] Link and smoke-test `MusicTrack` / `MusicManager` behavior after the
      missing original `MusicTrack` constructor path is resolved and the real
      audio manager request path is available.
- [x] Compile original `Common/Audio/AudioEventRTS.cpp`,
      `Common/Audio/GameAudio.cpp`, and `Common/Audio/GameSounds.cpp` into the
      wasm Common core with the current audio, INI, Xfer, GameLogic, and
      object-lookup compatibility surface.
- [ ] Link and smoke-test the original `GameAudio` / `GameSounds` manager
      paths after the real audio manager, object lookup, INI reader, Xfer, and
      GameLogic singleton surfaces replace the current target-local shims.
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
- [ ] Link and smoke-test the original audio and multiplayer INI parser routes
      after the real `Common/INI.cpp` reader, audio manager, and full runtime
      singleton surface are available without target-local parser stubs.
- [ ] Link and smoke-test the original command-set, control-bar scheme,
      DamageFX, and map-data INI parse routes after the real `Common/INI.cpp`
      reader and their destination managers/singletons are available without
      target-local parser stubs.
- [ ] Link and smoke-test original player-template, special-power, and
      command-button INI parser routes after the real `Common/INI.cpp` reader,
      ScienceStore validation, ControlBar, PlayerTemplateStore, and
      SpecialPowerStore singleton surfaces are available without target-local
      parser stubs.
- [ ] Link and smoke-test original crate, draw-group, terrain, terrain-road /
      bridge, and upgrade INI parser routes after the real `Common/INI.cpp`
      reader, `CrateSystem`, `DrawGroupInfo`, `TerrainTypes`, `TerrainRoads`,
      and `UpgradeCenter` singleton surfaces are available without target-local
      parser stubs.
- [ ] Decide the browser replacement contract for original Windows Media /
      shell URL helpers before compiling `Common/Audio/simpleplayer.cpp` and
      `Common/Audio/urllaunch.cpp`; their case-correct headers now resolve, but
      the bodies still require `wmsdk.h`, `HRESULT`/wide Win32 shell types, and
      browser-safe launch/playback behavior.
- [ ] Compile original `Common/Audio/GameSpeech.cpp` after the WPAudio
      attribute header/backend dependency is replaced with the browser audio
      contract.
- [x] Compile original RTS accounting sources `Common/RTS/Handicap.cpp`,
      `MissionStats.cpp`, and `Money.cpp` after fixing the original
      `Team` DLINK clang contract and adding the production map typedefs
      needed by `Player`/`Thing` headers.
- [x] Compile original `Common/RTS/Energy.cpp` and
      `Common/RTS/ProductionPrerequisite.cpp` into the wasm Common core as
      compile coverage for player power accounting and build prerequisite
      logic.
- [ ] Link and smoke-test original energy and production-prerequisite runtime
      behavior after real `Player`, `ThingFactory`, `ThingTemplate`, object,
      and science ownership paths link without target-local shims.
- [x] Compile original `Common/RTS/Science.cpp` against the current temporary
      `Common/INI.h` parser bridge for science definitions and translated
      labels.
- [x] Link and smoke-test original `ScienceStore` metadata behavior through the
      current `Common/INI` bridge, including parsed science registration,
      internal-name round trips, WorldBuilder name enumeration, default purchase
      cost, grantability, and empty translated name/description storage without
      invoking player-owned prerequisite checks.
- [ ] Replace the temporary `parseScience`, `parseScienceVector`, and
      `parseAndTranslateLabel` bridge helpers with the real `Common/INI.cpp` /
      `GameText` parse path, then smoke-test science-definition and
      special-power parsing against real INI data. Special-power runtime
      parsing also needs the original academy classification table from
      `AcademyStats.cpp` to link in the runtime smoke instead of remaining
      compile-only.
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
- [ ] Link and smoke-test `Money` deposit/withdraw runtime side effects after
      the deeper audio, `Player`/`Thing`, academy stats, and
      `StealthUpdate` economy paths can link without target-local GameLogic
      singleton shims.
- [ ] Link and smoke-test original `PlayerList` behavior after real `Player`,
      `Team`, `TunnelTracker`, control-bar, and GameLogic player ownership
      dependencies replace the current compile-only surface.
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
- [ ] Link and smoke-test original RTS action/team/score/academy behavior after
      the full `Player`, `Thing`, object, `GameLogic`, control-bar, and UI
      surfaces replace the current compile-only frontier.
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
- [ ] Link and smoke-test original `Common/StateMachine.cpp` save/load behavior
      after `ObjectID` / `Coord3D` xfer routes are verified in the linked
      runtime.
- [x] Compile original `Common/MessageStream.cpp` in the real-header compile
      frontier after resolving its clang loop-scope issue while preserving the
      original argument traversal logic.
- [ ] Link and smoke-test original message-stream behavior after the real
      `Thing`, player/list, recorder, InGameUI, GameLogic, and network command
      dependencies replace the current compile-only surface.
- [x] Compile original `Common/StatsCollector.cpp` in the real-header compile
      frontier after making `StatsCollector.h` self-contained for
      `AsciiString` and engine basic types.
- [x] Compile original `Common/GlobalData.cpp` in the real-header compile
      frontier after making the real `GlobalData` include explicit and mapping
      the user-data folder lookup to the browser/POSIX platform shim.
- [ ] Link and smoke-test original `GlobalData` defaults, user-data path setup,
      and command-line mutation after the linked runtime replaces the
      target-local `Common/GlobalData.h` shim.
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
- [ ] Enable and route `MiniLog.cpp`'s `DEBUG_LOGGING` body to the browser log
      or harness once the real `GameLogic` frame counter is available.
- [x] Compile original `Common/System/Radar.cpp` in the real-header compile
      frontier after preserving the original radar-color lookup loop state
      across clang's standard for-loop scope rules.
- [x] Compile original `Common/System/Upgrade.cpp` in the real-header compile
      frontier with the real INI and upgrade-mask headers.
- [ ] Decide the browser copy-protection / launcher contract before compiling
      original `Common/System/CopyProtection.cpp`; it currently depends on
      Win32 mutex, message-queue, event, and shared-memory APIs.
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
- [ ] Link and smoke-test original `W3DFileSystem.cpp` filename/path dispatch
      after the final browser asset `FileSystem`, `GlobalData` user-data path,
      and WWLib file-factory singleton contract are available without
      compile-only globals.
- [ ] Link and smoke-test original WW3D2 light/render-object behavior after
      `rendobj.cpp`, browser-safe Win32 string aliases, scene/camera defaults,
      and asset/render-object singleton dependencies can build without renderer
      stubs.
- [ ] Re-enable and compile the active `INCLUDE_GRANNY_IN_BUILD` code path in
      original `W3DGranny.cpp` after the Granny SDK surface, WW3D render-object
      dependencies, and browser asset/texture bindings have a real port
      contract.
- [ ] Compile the remaining original W3D renderer-adjacent leaves, including
      display, scene, terrain renderer, drawable modules, shader, water, and
      shadow sources, after the remaining WW3D2/Direct3D browser compatibility
      surface is available as part of the renderer port.
- [ ] Continue the original WW3D2 compile frontier by resolving the remaining
      source blocker: the legacy BrowserEngine DLL import in
      `dx8webbrowser.cpp`. Runtime browser ports are still needed for the
      compiled Direct3D wrapper, WWAudio/Miles playback, GDI text
      rasterization, Video-for-Windows frame grabbing, MPU/timing reads,
      Surrender renderer/object behavior, and `ww3d.cpp`
      screen-capture/render-device paths instead of substituting renderer
      behavior.
- [ ] Map original `WWVegas/wwshade` D3DX shader assembly, Direct3D shader
      creation, shader constants, and material/render-state application to the
      browser renderer pipeline, using the generated headers from original
      shader text without inventing shader data.
- [ ] Replace `Win32OSDisplay.cpp`'s current browser stderr/no-op message-box
      compatibility with a real browser/harness OS-display dialog/error
      reporting contract before relying on runtime warning prompts.
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
- [ ] Remaining `Common/RTS`, `Thing`, and `Audio` interfaces compile without
      target-local parser/Xfer/GameLogic shims.
- [x] `GameMain.cpp`, `GlobalData.cpp`, `NameKeyGenerator`, `RandomValue`, and
      `crc` compile as part of the real-header compile frontier.
- [x] `GameEngine.cpp` compiles as part of a broader engine archive after its
      WOL browser / ATL dependency is replaced with a browser compile bridge.

### GameEngine — GameClient / GameLogic / GameNetwork (headers + logic)
- [ ] `GameLogic` (AI, Object, ScriptEngine, Map, System) compiles.
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
- [ ] Replace the declarative wasm GameSpy GP / Peer / gpersist compile-surface
      headers with real browser networking bindings when enabling runtime
      GameSpy matchmaking, chat, presence, and persistent stats.
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
- [ ] `GameClient` (Display, Drawable, GUI, Input, InGameUI, Terrain) compiles.
- [x] Add lowercase `Common/Filesystem.h` compatibility, `PreRTS.h`
      include-contract parity for `Common/INI.h`/`Common/GlobalData.h`, and
      browser Win32 version/font-resource fallbacks needed to compile original
      `GameClient/GlobalLanguage.cpp` against the current temporary INI and
      GlobalData surfaces.
- [ ] Verify `GlobalLanguage::init`, the CSF/string-file path, and local-font
      loading against real fetched assets after original `Common/INI` and
      browser `FontFace`/fetch loading replace the current compatibility
      no-ops.
- [x] Compile original `GameClient/LanguageFilter.cpp` after resolving its
      16-bit word-list buffer contract under wasm `WideChar`/`wchar_t`.
- [x] Compile original `GameClient/GameText.cpp` and smoke-test the string-file
      path through the original `GameTextInterface`, including label fetch,
      escaped text, map string files, prefix lookup, and missing-label fallback.
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
- [ ] Replace the current temporary `Common/INI.h` GameClient bridge helpers
      (`LookupListRec`, lookup-list parsing, coordinate parsing,
      `parseMappedImage`, credits and shell scheme declarations) with the
      original INI parser surface once `Common/INI` can compile and link.
- [x] Compile original `GameClient/System/CampaignManager.cpp` after extending
      the temporary INI/Xfer/GameClient-facing bridge with the campaign parse
      entry point and snapshot transfer surface.
- [ ] Link and smoke-test original campaign progression/save-load behavior
      after the real campaign INI reader, `Xfer::xferSnapshot`, and full
      GameClient singleton surface are available without target-local stubs.
- [x] Compile original `GameClient/MapUtil.cpp` after adding Win32
      `SYSTEMTIME` compatibility and the original `GlobalData::m_buildMapCache`
      field/default to the temporary wasm shim.
- [x] Compile original `GameClient/RadiusDecal.cpp` after adding the current
      `Xfer::xferColor`, `GameLogic::getDrawIconUI`, and object-lookup compile
      bridge needed by the original source.
- [ ] Link and smoke-test original radius-decal behavior after the deeper
      Player/Team/Module/Object/GameLogic contracts are available through
      original headers and rendering can be harness-driven.
- [x] Compile original `GameClient/MessageStream/HintSpy.cpp` and
      `GameClient/System/RayEffect.cpp` in the GameClient utility target as
      compile coverage for UI hint translation and client ray-effect state.
- [ ] Link and smoke-test original hint/ray-effect behavior after the real
      InGameUI, GameClient, drawable/display, object, and browser render/input
      paths are available and harness-driven.
- [x] Compile original `GameClient/Terrain/TerrainRoads.cpp` in the GameClient
      utility target; current coverage is compile-only until terrain and
      rendering can be harness-driven.
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
- [x] Compile original `GameClient/Input/Mouse.cpp` after adding temporary
      `InGameUI`, mouse INI parse, `GlobalData` cursor/debug, and object lookup
      compile bridges; runtime pointer behavior still waits for the browser
      input/device layer and harness checks.
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
- [x] Compile original `GameNetwork/FrameMetrics.cpp` after extending the
      temporary wasm `Common/GlobalData.h` surface with original network
      history fields/defaults and fixing its legacy MSVC loop-scope assumption.
- [x] Link and smoke-test original `GameNetwork/FrameMetrics.cpp`
      init/reset/cushion history behavior against the current wasm
      `GlobalData` shim.
- [ ] Link and smoke-test original `GameNetwork/FrameMetrics.cpp` FPS sampling
      and latency response after the browser display/FPS surface and real
      `GlobalData` singleton are available.
- [x] Link and smoke-test original `GameNetwork/Connection.cpp` send/ack queue
      behavior through original packetization and `Transport::queueSend`
      buffering without binding UDP sockets.
- [ ] Link and smoke-test original `GameNetwork/Connection.cpp` receive/retry
      behavior after browser transport send/receive dependencies are available.
- [x] Link and smoke-test original `GameNetwork/FileTransfer.cpp` map-path
      helper behavior.
- [ ] Link and smoke-test original `GameNetwork/FileTransfer.cpp` transfer flow
      after `GameInfo`, `Shell`, `LoadScreen`, and the browser
      network/file-transfer path are available.
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
- [ ] Replace original WWDownload raw FTP/WinSock transport with a browser
      fetch/proxy/update-download contract before patch/download runtime flows
      are considered functional.
- [ ] Harness-test original `GameNetwork/DownloadManager.cpp` through the
      browser download transport and update UI callback surfaces once the
      fetch/proxy/update-download contract exists.
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
