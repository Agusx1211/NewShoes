# WebAssembly Port

Working area for the browser/WebAssembly port. See the repo-root `AGENTS.md`
for the goal and strategy.

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
- `harness/` — a minimal browser harness with a black canvas and JS RPC stub for
  boot/log/state/screenshot commands. This is port infrastructure only; it does
  not implement or simulate game behavior.

Extracted archives land under ignored `artifacts/real-assets/`.
See `ASSETS.md` for the asset ownership rules and browser delivery plan.
See `SOURCE_INVENTORY.md` for the current runtime-vs-tools library inventory.

Verify the local real-asset sample pipeline:

```sh
npm run verify:assets
```

This requires the user-supplied Zero Hour disc images in `../assets` and `7z`.
Set `VERIFY_ASSETS_FORCE_CONVERT=1` to force both `.bin` images through
`mode1_2352_to_iso.mjs` instead of accepting up-to-date ISO outputs.

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
It currently builds only the port boundary skeleton, not the original engine.
The selected baseline flags are:

- ES module output with `MODULARIZE=1` / `EXPORT_ES6=1`.
- Browser/worker environment.
- Memory growth enabled, 64 MiB initial memory, 2 GiB maximum memory.
- 1 MiB stack via `TOTAL_STACK=1048576`.
- Debug assertions enabled for the bootstrap build.
- Exported C symbols: `cnc_port_boot`, `cnc_port_frame`, `cnc_port_state`.

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
`window.CnCPort.rpc("boot")`, verifies the canvas/RPC state, and writes
screenshots to `artifacts/screenshots/`.

Run the wasm-backed smoke test:

```sh
npm run test:wasm
```

Run all current wasm checks, including the original EAC compression codec,
WWDebug core, WWLib CRC/SHA, and WWMath core smokes:

```sh
npm run test:all
```

Run only the original WWDebug core smoke:

```sh
npm run test:wwdebug-core
```

Run only the original WWLib CRC smoke:

```sh
npm run test:wwlib-crc
```

Run only the original WWLib SHA smoke:

```sh
npm run test:wwlib-sha
```

Run only the original WWMath core smoke:

```sh
npm run test:wwmath-core
```
