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
| `Compression` | Partial | `EAC` BTree, Huff, and RefPack codecs compile and have a wasm round-trip smoke. Full `CompressionManager` still needs zlib and LZH dependency shims. |
| `WWVegas/WWMath` | Partial | Original `pot.cpp`, `tri.cpp`, and `v3_rnd.cpp` compile to wasm, with a smoke covering power-of-two helpers, vector math from original headers, triangle containment, and vector randomizers. Broader math still needs `always.h`/`osdep.h`, save/load, D3DX, and x86 assembly portability work. |
| `WWVegas/WWLib` | Partial | Original `random.cpp` compiles to wasm as `zh_wwlib_random` for WWMath vector randomizers, original `crc.cpp`/`realcrc.cpp` compile to wasm as `zh_wwlib_crc`, and original `sha.cpp` compiles to wasm as `zh_wwlib_sha` with known-answer digest coverage. Containers, strings, file abstractions, threading, and platform utilities remain open. |
| `WWVegas/WWDebug` | Partial | Original `wwdebug.cpp` core message/assert/trigger/profile handler plumbing compiles to wasm and has a Node smoke. `wwmemlog.cpp`/`wwprofile.cpp` still need broader `WWLib` support and browser routing. |
| `WWVegas/WWSaveLoad` | Not started | Runtime save/load serialization support. |
| `WWVegas/Wwutil` | Not started | Utility library linked by the original runtime. |
| `WWVegas/WW3D2` | Not started | Runtime renderer; must be re-targeted from DirectX 8/W3D to WebGL2/WebGPU. |
| `WWVegas/wwshade` | Not started | Shader/material support; needed with WW3D2 renderer port. |
| `WWVegas/WWAudio` | Not started | Runtime audio abstraction used by W3D/audio paths. |
| `WWVegas/Miles6` | Not started | Miles-facing dependency; browser target is Web Audio, not the native Miles backend. |
| `WPAudio` | Not started | Audio helper/backend code; browser target is Web Audio. |
| `GameSpy` | Not started | Runtime online/networking dependency; browser target is WebSocket/WebRTC relay paths. |
| `WWVegas/WWDownload` | Not started | Runtime/profile network patch/download support referenced by GameSpy/profile builds; likely stubbed or redirected for browser. |
| `EABrowserDispatch` | Not started | Original runtime/browser-dispatch integration referenced by workspace dependencies; needs audit before browser replacement. |
| `DX90SDK` | Not started | Header/API compatibility source for DirectX types; browser port should provide shims rather than native DirectX. |
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
- `zh_wwdebug_core`: original `WWVegas/WWDebug/wwdebug.cpp` compiled into a
  wasm static library with targeted Win32/exception shims.
- `zh_wwlib_random`: original `WWVegas/WWLib/random.cpp` compiled into a wasm
  static library.
- `zh_wwlib_crc`: original `WWVegas/WWLib/crc.cpp` and `realcrc.cpp` compiled
  into a wasm static library with lowercase include and rotate shims.
- `zh_wwlib_sha`: original `WWVegas/WWLib/sha.cpp` compiled into a wasm static
  library with legacy header compatibility shims.
- `zh_wwmath_core`: original `WWVegas/WWMath/pot.cpp`, `tri.cpp`, and
  `v3_rnd.cpp` compiled into a wasm static library with minimal WWVegas
  compiler shims.
- `compression-eac-smoke`: a Node-executed wasm smoke test that round-trips data
  through original `BTREE_encode`/`BTREE_decode`, `HUFF_encode`/`HUFF_decode`,
  and `REF_encode`/`REF_decode`.
- `wwdebug-core-smoke`: a Node-executed wasm smoke test that verifies original
  WWDebug message, assert, trigger, and profile handlers.
- `wwlib-crc-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib CRC32 helpers against the standard vector and checks `CRCEngine` update
  consistency.
- `wwlib-sha-smoke`: a Node-executed wasm smoke test that verifies original
  WWLib SHA against known digest vectors and split-update hashing.
- `wwmath-core-smoke`: a Node-executed wasm smoke test that verifies original
  WWMath power-of-two helpers, vector operations, triangle containment, vector
  randomizers, and the original WWLib random generator.

## Next Compile Order

1. Finish the full `CompressionManager` path by replacing missing zlib/LZH
   dependencies with toolchain/browser-compatible shims.
2. Add minimal `always.h`/`osdep.h` compatibility so `WWMath` can use the
   compiled WWDebug core without changing math logic.
3. Compile `WWMath` in slices, excluding or replacing x86 assembly paths such as
   `vp.cpp` and assembly blocks in `matrix3d.cpp` with portable original-code
   fallbacks where available.
4. Finish the remaining `WWDebug` memory/profile sources once `WWLib` string,
   file, timer, allocator, and container dependencies are available.
5. Move to `WWLib`, `WWSaveLoad`, and `Wwutil`, then begin `GameEngine/Common`.
