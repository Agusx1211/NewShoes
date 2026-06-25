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
| `WWVegas/WWMath` | Partial | Original `pot.cpp`, `tri.cpp`, `v3_rnd.cpp`, matrix/quaternion/ODE, bounding-volume, collision-math, curve/spline, lookup-table, and `WWMath::Init` slices now compile to wasm, with smokes covering power-of-two helpers, vector math, matrix/quaternion transforms, triangle containment, AABox/line/sphere/OBBox collision paths, ODE integration, vector randomizers, 1D/3D interpolation, WWSaveLoad factory registration, default lookup-table sampling, fast trig table initialization, and debug refcount cleanup. Remaining blockers include `matrix3d.cpp`'s D3DX8 dependency and `vp.cpp` CPU/mutex assembly. |
| `WWVegas/WWLib` | Partial | Original `random.cpp`, Base64, CRC, fixed, hash, MD5, SHA, `StringClass`, file core, RAMFile, utility crypto, pipe/straw stream core, LZO codec/adapters, multiprecision public-key crypto, file/INI helper sources, pooled `SList`/`MultiList` containers, debug `RefCountClass`, `SysTimeClass`, and `verchk.cpp` PE-header helpers now compile to wasm as focused `zh_wwlib_*` libraries with Node smoke coverage. LCW compression still needs a portable original-code compressor path; concrete browser file backends, threading, and broader platform utilities remain open. |
| `WWVegas/WWDebug` | Partial | Original `wwdebug.cpp` core message/assert/trigger/profile handler plumbing compiles to wasm and has a Node smoke. `wwmemlog.cpp`/`wwprofile.cpp` still need broader `WWLib` support and browser routing. |
| `WWVegas/WWSaveLoad` | Complete | Core persistence factory, save/load system, pointer remap, status plumbing, definitions, definition factories/manager, parameters, twiddlers, and WWSaveLoad init/shutdown now compile to wasm. Node smoke coverage verifies factory registration, parameter construction, definition manager lookup, and a chunk-file save/load round trip. |
| `WWVegas/Wwutil` | Complete | Original `mathutil.cpp` and `miscutil.cpp` compile to wasm with WWLib/WWMath dependencies. Node smoke coverage verifies angle/vector math, distance/round/rotation helpers, probability helper bounds, string classification/comparison, file existence/removal, read-only attributes, and PE-header file-id timestamp formatting. |
| `GameEngine/Common` | Partial | Original-source core slice now compiles to wasm: `GameMemory.cpp`, `MemoryInit.cpp`, `CriticalSection.cpp`, `File.cpp`, `LocalFile.cpp`, `LocalFileSystem.cpp`, `FileSystem.cpp`, `RAMFile.cpp`, `StreamingArchiveFile.cpp`, `ArchiveFile.cpp`, `ArchiveFileSystem.cpp`, `Snapshot.cpp`, `Geometry.cpp`, `Compression.cpp`, `DataChunk.cpp`, `AsciiString.cpp`, `UnicodeString.cpp`, legacy `System/String.cpp`, `SubsystemInterface.cpp`, `CDManager.cpp`, `registry.cpp`, `GameType.cpp`, `GameCommon.cpp`, `Trig.cpp`, `QuickTrig.cpp`, `List.cpp`, `DisabledTypes.cpp`, `KindOf.cpp`, `ObjectStatusTypes.cpp`, `BitFlags.cpp`, `MiniLog.cpp`, `Dict.cpp`, `DiscreteCircle.cpp`, Bezier helpers, `System/encrypt.cpp`, `Language.cpp`, `PartitionSolver.cpp`, `NameKeyGenerator.cpp`, `RandomValue.cpp`, and engine `crc.cpp`, plus original `Win32LocalFile.cpp`/`Win32LocalFileSystem.cpp` and `Win32BIGFile.cpp`/`Win32BIGFileSystem.cpp` for the current file/BIG bridge. Node smoke coverage initializes the original memory manager with real DMA/pool sizing, exercises engine strings, legacy WSYS strings, original file and RAM file access/read/scan behavior, original Win32 local-file writes/existence/file-info/listing/dispatch/RAM conversion/whole-file reads, smoke-built BIG archive indexing and archive fallback reads, streaming archive reads, compressed cached-file reads through the original compression manager, `DataChunkInput` table/chunk parsing, local file-system singleton plumbing, CD manager drive bookkeeping, browser registry defaults, language state, name keys, Dict copy-on-write/typed lookups, deterministic RNG/CRC, trig helpers, game constants, type-mask and bit-name table initialization, geometry bounds/footprint calculations, linked-list/circle helpers, Bezier evaluation/splitting, encryption vectors, and partition solving. The full INI, Xfer, GlobalData, GameLogic, real asset-backed browser archive mounting, RTS, Thing, and Audio implementations remain open. |
| `WWVegas/WW3D2` | Not started | Runtime renderer; must be re-targeted from DirectX 8/W3D to WebGL2/WebGPU. |
| `WWVegas/wwshade` | Not started | Shader/material support; needed with WW3D2 renderer port. |
| `WWVegas/WWAudio` | Not started | Runtime audio abstraction used by W3D/audio paths. |
| `WWVegas/Miles6` | Not started | Miles-facing dependency; browser target is Web Audio, not the native Miles backend. |
| `WPAudio` | Not started | Audio helper/backend code; browser target is Web Audio. |
| `GameSpy` | Not started | Runtime online/networking dependency; browser target is WebSocket/WebRTC relay paths. |
| `WWVegas/WWDownload` | Not started | Runtime/profile network patch/download support referenced by GameSpy/profile builds; likely stubbed or redirected for browser. |
| `EABrowserDispatch` | Not started | Original runtime/browser-dispatch integration referenced by workspace dependencies; needs audit before browser replacement. |
| `DX90SDK` | Partial | Minimal target-local `D3DX8Math.h` shim covers vector4/matrix operations used by original `GameEngine/Common` Bezier helpers. Broader DirectX 8/D3DX compatibility for `WWMath`, WW3D, and W3D device code remains open; browser port should provide shims rather than native DirectX. |
| `STLport-4.5.3` | Not started | Historical STL dependency; target is libc++ compatibility, not compiling STLport itself. |

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
- `zh_wwlib_random`: original `WWVegas/WWLib/random.cpp` compiled into a wasm
  static library.
- `zh_wwlib_base64`: original `WWVegas/WWLib/base64.cpp` compiled into a wasm
  static library.
- `zh_wwlib_crc`: original `WWVegas/WWLib/crc.cpp` and `realcrc.cpp` compiled
  into a wasm static library with lowercase include and rotate shims.
- `zh_wwlib_file_core`: original `WWVegas/WWLib/buff.cpp` and `wwfile.cpp`
  compiled into a wasm static library with lowercase include shims.
- `zh_wwlib_file_ini`: original `WWVegas/WWLib` raw/buffered file helpers,
  `ffactory.cpp`, `readline.cpp`, `chunkio.cpp`, `ini.cpp`, `widestring.cpp`,
  `xpipe.cpp`, `xstraw.cpp`, and `nstrdup.cpp` compiled into a wasm static
  library with POSIX/Emscripten file compatibility.
- `zh_wwlib_containers`: original `WWVegas/WWLib/multilist.cpp` and
  `slnode.cpp` compiled into a wasm static library with pooled-node allocator
  compatibility.
- `zh_wwlib_fixed`: original `WWVegas/WWLib/fixed.cpp` compiled into a wasm
  static library.
- `zh_wwlib_hash`: original `WWVegas/WWLib/hash.cpp` compiled into a wasm
  static library with WWDebug and CRC dependencies.
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
  for Base64, Blowfish, CRC, SHA, random, cache, and bit-vector support compiled
  into a wasm static library.
- `zh_wwlib_systimer`: original `WWVegas/WWLib/systimer.cpp` compiled into a
  wasm static library against the browser WinMM timing shim.
- `zh_wwlib_utility_core`: original `WWVegas/WWLib/blowfish.cpp`,
  `gcd_lcm.cpp`, `obscure.cpp`, `rc4.cpp`, and `rndstrng.cpp` compiled into a
  wasm static library with CRC, random, and StringClass dependencies.
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
  randomizer, matrix/quaternion, ODE, bounding-volume, and collision-math
  slices compiled into a wasm static library with minimal WWVegas compiler
  shims.
- `zh_wwmath_curves`: original `WWVegas/WWMath` curve and Hermite/Cardinal/
  Catmull-Rom/TCB spline sources compiled into a wasm static library with
  WWSaveLoad factory dependencies.
- `zh_wwmath_lookup`: original `WWVegas/WWMath/lookuptable.cpp` and
  `wwmath.cpp` compiled into a wasm static library with lookup-table manager,
  fast trig initialization, and debug refcount dependencies.
- `zh_wwutil`: original `WWVegas/Wwutil/mathutil.cpp` and `miscutil.cpp`
  compiled into a wasm static library with WWLib version/file helpers and
  WWMath dependencies.
- `zh_gameengine_common_core`: original `GameEngine/Common` core slice
  compiled into a wasm static library, covering the memory allocator and
  original pool sizing, critical-section wrapper, `AsciiString`,
  `UnicodeString`, legacy `WSYS_String`, original file interface base class,
  RAM file interface, local and facade file-system interfaces,
  `SubsystemInterface`, CD manager interface, browser registry defaults,
  game-type/common tables, trig/quick-trig helpers, legacy `LList`,
  disabled/kind/object-status/model-condition/armor-set bit masks, snapshot
  base construction, geometry extents, GameEngine compression/data-chunk
  facades backed by the original compression manager, `Dict`, discrete circle
  scanlines, Bezier helpers, disabled `MiniLog` compile coverage, language
  state, password obfuscation, partition solving, `NameKeyGenerator`,
  `RandomValue`, and engine CRC.
- `compression-eac-smoke`: a Node-executed wasm smoke test that round-trips data
  through original `BTREE_encode`/`BTREE_decode`, `HUFF_encode`/`HUFF_decode`,
  and `REF_encode`/`REF_decode`.
- `compression-manager-smoke`: a Node-executed wasm smoke test that verifies
  original `CompressionManager` header detection, preferred compression,
  uncompressed-size metadata, EAC-backed BTree/Huff/RefPack round trips, and
  explicit disabled behavior for the missing zlib/Nox LZH codec bodies.
- `wwdebug-core-smoke`: a Node-executed wasm smoke test that verifies original
  WWDebug message, assert, trigger, and profile handlers.
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
  and rects.
- `wwlib-containers-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib `SimpleDynVecClass`, pooled `SList`, pooled `MultiListClass`,
  and `PriorityMultiListIterator` behavior.
- `wwlib-fixed-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib fixed-point parsing, formatting, constants, arithmetic, conversion, and
  saturation behavior.
- `wwlib-hash-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib hash-table add/find/remove/reset/iteration behavior.
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
  adapters, CacheStraw, RandomStraw deterministic seeding, and BooleanVector
  behavior.
- `wwlib-string-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib StringClass construction, mutation, formatting, comparison, trimming,
  buffer growth, copy, temporary-buffer, and wide-copy behavior.
- `wwlib-utility-core-smoke`: a Node-executed wasm smoke test that verifies
  original WWLib Blowfish and RC4 known vectors, GCD/LCM helpers, Obfuscate case
  normalization, and RandomString selection behavior.
- `wwmath-core-smoke`: a Node-executed wasm smoke test that verifies original
  WWMath power-of-two helpers, vector operations, matrix/quaternion
  transforms, triangle containment, AABox/line/sphere/OBBox collision paths,
  ODE integration, vector randomizers, and the original WWLib random generator.
- `wwmath-curves-smoke`: a Node-executed wasm smoke test that verifies original
  WWMath curve/spline interpolation and WWSaveLoad factory registration.
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
- `gameengine-common-core-smoke`: a Node-executed wasm smoke test that verifies
  the original `GameEngine/Common` core slice, including memory-manager
  initialization with original DMA/pool sizing, engine string
  mutation/translation, legacy WSYS string formatting/casing, original file
  interface access defaults/readback, original `FileSystem` local dispatch,
  RAM file reads/scans/read-entire behavior, local file-system singleton
  plumbing, CD manager drive bookkeeping, browser registry defaults, language
  state, password-obfuscation vectors, pooled name-key buckets,
  disabled/kind/object-status/model-condition/armor-set type masks and name
  tables, geometry bounds/footprint calculations, compressed cached-file reads,
  `DataChunkInput` table/chunk parsing, Dict copy-on-write and typed lookups,
  deterministic RNG/CRC behavior, trig/quick-trig helpers, game common tables,
  list/circle helpers, Bezier evaluation/splitting, and partition solving.

## Next Compile Order

1. Restore or port the missing bundled `Compression/ZLib` and
   `Compression/LZHCompress/CompLibSource` bodies so the existing
   `CompressionManager` zlib and Nox LZH branches can be enabled and checked
   against real BIG data.
2. Unblock the remaining `WWMath` sources by extending D3DX8/matrix
   compatibility beyond the current Bezier-only shim for `matrix3d.cpp` and
   porting the `vp.cpp` CPU/mutex assembly dependencies.
3. Finish the remaining `WWLib` gaps needed by runtime libraries: LCW
   compression, remaining allocator/mempool helpers, remaining containers, the
   final browser timing/threading contract, and platform utilities.
4. Finish the remaining `WWDebug` memory/profile sources once `WWLib` timer,
   allocator, and container dependencies are available.
5. Continue `GameEngine/Common`: replace the target-local INI/Xfer/GlobalData/
   GameLogic compile shims with original sources, then expand into
   `Common/System` archive/BIG streams, the real INI parser, and the
   DataChunkOutput write path once browser user-data persistence exists.
