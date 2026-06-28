# DONE.md — Completed port checklist history

Completed checklist entries moved out of `TODO.md` so agents can load the open
plan cheaply. Search this file before redoing historical work, and add newly
completed work here when an item leaves `TODO.md`.

Grouped by the same milestones as `PROJECT.md` / `TODO.md`.

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
- [x] Define how assets reach the browser (fetch from a path / drag-drop /
      file picker) — assets are **user-supplied**, never committed.
- [x] Document the legal stance: code is open; game data is the user's own.

### Harness (bootstrap)
- [x] Stand up Playwright/Puppeteer headless harness that loads the page.
- [x] Screenshot capture utility writing to `artifacts/screenshots/`.
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
- [x] Audit original WWLib `Buffer` ownership/deallocation semantics under
      libc++/wasm with focused runtime smoke coverage for borrowed stack
      buffers, shallow-copy borrowing, assignment release/borrow transfer, and
      idempotent owned-buffer reset before relying on it for asset and file
      buffers.
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
      optional probe and verifies the current shipped runtime archives do not
      contain `Data\INI\DrawGroupInfo.ini`.
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
- [x] Apply captured stage-0 `D3DTSS_TEXCOORDINDEX` passthrough UV selection
      in the current WebGL2 textured draw bridge for `VertexFormatXYZNDUV1/2`
      layouts, choosing UV0 or UV1 attribute offsets from the D3D8 stage state
      instead of always sampling UV0. A new browser-driven D3D8 texcoord probe
      renders the same quad through UV0 and UV1 against a red/blue texture and
      verifies distinct center pixels plus selected offsets through Playwright.
      Camera-space generated coordinates, projected coordinates, texture
      transform matrices, non-stage-0 texture coordinates, and generalized FVF
      declaration decoding remain open.
- [x] Apply captured stage-0 `D3DTS_TEXTURE0` transform matrices for the
      current WebGL2 textured draw bridge when `D3DTSS_TEXTURETRANSFORMFLAGS`
      is exactly `D3DTTFF_COUNT2` and the texture coordinates are passthrough
      XYZNDUV UVs. A new browser-driven D3D8 texture-transform probe renders
      disabled and translated-U cases against a red/blue texture, verifying
      distinct center pixels, transform metadata, and `D3DTTFF_COUNT2` coverage
      through Playwright. COUNT1/3/4, projected coordinates, camera-space
      generated coordinates, non-stage-0 transforms, and generalized FVF
      declaration decoding remain open.
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
- [x] Original `ImageCollection::load(512)` mapped-image parsing now hands a
      real INI-defined `Image` to `W3DDisplay::drawImage`: the dedicated
      browser smoke range-fetches the 14 `MappedImages` INI files from
      user-supplied `INIZH.big`, range-fetches
      `Data\English\Art\Textures\SCShellUserInterface512_001.tga` from
      user-supplied `EnglishZH.big`, verifies the original
      `WatermarkChina` mapped image (`Status = ROTATED_90_CLOCKWISE`, 160x96
      from a 512x512 atlas), resolves the atlas through
      `WW3DAssetManager`/`TextureClass::Init`/runtime `W3DFileSystem`, and
      screenshots the real TGA-backed blit at
      `harness-smoke-ww3d-display-mapped-image-canvas.png`.
- [x] Original `W3DDisplay::drawImage` clipping is now covered on the same real
      mapped-image path: the browser smoke applies `W3DDisplay::setClipRegion`
      to the parsed `WatermarkChina` image, verifies the original
      rotated-image clipped UV slice, disables clipping after the draw, samples
      a colored center pixel plus black outside-clip pixels, and screenshots
      `harness-smoke-ww3d-display-mapped-image-clip-canvas.png`.
- [x] Original `W3DDisplay::drawImage` non-rotated mapped-image UVs are now
      covered through the same real `ImageCollection::load(512)` path: the
      browser smoke range-fetches `SAUserInterface512.INI` and
      `SAUserInterface512_001.tga`, verifies `SAChinook_L`
      (`IMAGE_STATUS_NONE`, 120x96, UVs 367/512..487/512 and 393/512..489/512),
      pins the exact INI/TGA source offsets, draws the atlas slice through
      `W3DDisplay::drawImage`, and screenshots
      `harness-smoke-ww3d-display-mapped-image-unrotated-canvas.png`.
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
---

## M6 — Playable skirmish (no audio/video)

---

## M7 — Audio (Miles → Web Audio)

---

## M8 — Video (Bink → WebCodecs)

---

## M9 — Networking (GameSpy / LAN → WS/WebRTC)

---

## M10 — Hardening, content, polish

### Performance & memory
### Content completeness (Zero Hour)
### Robustness & compatibility
### Base game
---

## Cross-cutting: harness & verification (ongoing, never "done")

- [x] Make the original frame-owner reset RPCs safe as the first
      original-memory-manager users after boot; minimal scripts that call
      `resetOriginalKeyboardFrameInput` or `resetOriginalMouseFrameInput`
      immediately after `boot` currently trip a wasm memory-pool free during
      the bridge's full-state refresh, while the full `EXPECT_WASM=1`
      smoke passes because earlier original probes initialize that state.
- [x] Fix the plain `node harness/smoke.mjs` WW3D statistics teardown crash by
      making focused WW3D probes mirror `W3DDisplay` statistics cleanup before
      `WW3D::Shutdown()`. Verified with `npm run build:wasm`,
      `node harness/smoke.mjs`, and `EXPECT_WASM=1 node harness/smoke.mjs`.

## Cross-cutting: project hygiene
